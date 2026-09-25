/**
 * Event service — lifecycle, quick/full creation, publish/cancel, registrations,
 * rotating check-in QR + one-time claim (docs/02 §5.2, docs/03 §2.2/§3.1/§4.4).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, txDb } from '../../lib/db';
import { config } from '../../lib/config';
import { events, registrations, checkinTokens, type Event, type Registration } from './schema';
import { venues, venueRules, buildings, floors, communities } from '../place/schema';
import { members } from '../people/schema';
import { bookings, ACTIVE_BOOKING_STATUSES } from '../booking/schema';
import { assertEventTransition, type EventStatus } from './state-machine';
import * as bookingService from '../booking/service';
import * as notify from '../notify/service';
import * as integration from '../integration/service';
import { casClient, CasError } from '../cas';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { hasRole } from '../../lib/auth/roles';
import type { SessionPayload } from '../../lib/auth/session';
import { writeAudit } from '../../lib/audit';

// ---------------------------------------------------------------- validation

const iso = z.string().datetime();

export const eventCreateSchema = z
  .object({
    // quick creation: title + start + venue (docs/02 §5.2)
    title: z.string().min(1).max(300),
    startAt: iso,
    endAt: iso,
    // full creation extras
    description: z.string().default(''),
    timezone: z.string().default(config.defaultTimezone),
    eventType: z.enum(['in_person', 'online', 'hybrid']).default('in_person'),
    venueId: z.string().uuid().nullable().optional(),
    externalLocation: z.string().nullable().optional(),
    transportInfo: z.string().default(''),
    meetingUrl: z.string().nullable().optional(),
    bannerUrl: z.string().nullable().optional(),
    suggestedAttendees: z.number().int().positive().nullable().optional(),
    maxCapacity: z.number().int().positive().nullable().optional(),
    isPaid: z.enum(['free', 'fixed', 'pwyf']).default('free'),
    priceInfo: z.record(z.string(), z.unknown()).nullable().optional(),
    entryRequirements: z.string().default(''),
    registrationQuestions: z.array(z.unknown()).default([]),
    approvalRequired: z.boolean().default(false),
    waitlistEnabled: z.boolean().default(false),
    visibility: z.enum(['public', 'members', 'private']).default('public'),
    tags: z.array(z.string()).default([]),
    programId: z.string().uuid().nullable().optional(),
    checkinMode: z.enum(['qr_rotating', 'qr_static', 'none']).default('qr_rotating'),
    checkinClaimCap: z.number().int().positive().nullable().optional(),
    coHostIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), { message: 'end_at must be after start_at' });

/** Input type: schema defaults make everything except title/start/end optional (quick create). */
export type EventCreateInput = z.input<typeof eventCreateSchema>;

// ---------------------------------------------------------------- create

export async function createEvent(input: EventCreateInput, actor: SessionPayload) {
  const [member] = await db.select().from(members).where(eq(members.id, actor.sub)).limit(1);
  if (!member) throw notFound('Member not found');
  if (!member.emailVerifiedAt) {
    throw forbidden('CAS email verification required to create events (docs/03 invariant #3)');
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);

  // Build event + optional venue booking atomically.
  // txDb is the WebSocket-pooled handle: interactive transactions need it
  // (the stateless HTTP driver used for plain queries has no transactions).
  const created = await txDb.transaction(async (tx) => {
    // Community comes from the venue's building (single-community deployment).
    let communityId: string | null = null;
    if (input.venueId) {
      const [v] = await tx.select().from(venues).where(eq(venues.id, input.venueId)).limit(1);
      if (v) {
        const [b] = await tx.select().from(buildings).where(eq(buildings.id, v.buildingId)).limit(1);
        communityId = b?.communityId ?? null;
      }
    }
    if (!communityId) {
      const [c] = await tx.select().from(communities).limit(1);
      communityId = c?.id ?? null;
    }
    if (!communityId) throw unprocessable('No community configured; run the seed script first');

    const [event] = await tx
      .insert(events)
      .values({
        communityId,
        programId: input.programId ?? null,
        title: input.title,
        description: input.description,
        startAt,
        endAt,
        timezone: input.timezone,
        eventType: input.eventType,
        venueId: input.venueId ?? null,
        externalLocation: input.externalLocation ?? null,
        transportInfo: input.transportInfo,
        meetingUrl: input.meetingUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        suggestedAttendees: input.suggestedAttendees ?? null,
        maxCapacity: input.maxCapacity ?? null,
        isPaid: input.isPaid,
        priceInfo: input.priceInfo ?? null,
        entryRequirements: input.entryRequirements,
        registrationQuestions: input.registrationQuestions,
        approvalRequired: input.approvalRequired,
        waitlistEnabled: input.waitlistEnabled,
        visibility: input.visibility,
        tags: input.tags,
        status: 'draft',
        hostId: member.id,
        coHostIds: input.coHostIds,
        createdVia: 'web',
        checkinMode: input.checkinMode,
        checkinClaimCap: input.checkinClaimCap ?? null,
      })
      .returning();

    if (input.venueId) {
      // Same rule engine as standalone bookings (docs/02 §5.3 "两个入口,一个引擎").
      const validation = await bookingService.validateBookingRequest(
        {
          venueId: input.venueId,
          startAt,
          endAt,
          attendeesCount: input.suggestedAttendees ?? input.maxCapacity ?? 1,
          eventId: event.id,
          // Creating an event at a venue implies accepting that venue's rules
          // (docs/02 §5.1 prohibited behaviors are surfaced on the create form).
          acceptedProhibited: true,
        },
        { id: member.id, emailVerified: Boolean(member.emailVerifiedAt) },
        tx as unknown as typeof db,
      );
      const approvalMode = validation.rule?.approvalMode ?? 'auto';
      const durationHours = (validation.buffered.end.getTime() - validation.buffered.start.getTime()) / 3600_000;
      try {
        await tx.insert(bookings).values({
          venueId: input.venueId,
          eventId: event.id,
          memberId: member.id,
          purpose: 'event:' + event.title,
          startAt: validation.buffered.start,
          endAt: validation.buffered.end,
          attendeesCount: input.suggestedAttendees ?? input.maxCapacity ?? 1,
          status: approvalMode === 'auto' ? 'approved' : 'pending',
          ruleVersion: validation.rule?.version ?? 1,
          pointsCharged: bookingService.computePointsCharged(validation.rule, durationHours),
          depositPoints: validation.rule?.depositPoints ?? 0,
        });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw conflict('Venue already booked in this time range (incl. buffer)', {});
        }
        throw err;
      }
    }
    return event;
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/events',
    entityType: 'event',
    entityId: created.id,
    after: { event: created },
  });
  return { event: created, warnings: [] as string[] };
}

// ---------------------------------------------------------------- read

export async function listEvents(query: {
  view?: 'day' | 'week' | 'list';
  venue?: string;
  program?: string;
  tag?: string;
  from?: Date;
  to?: Date;
}) {
  const rows = await db.select().from(events).orderBy(events.startAt);
  const from = query.from;
  const to = query.to;
  return rows.filter((e) => {
    if (query.venue && e.venueId !== query.venue) return false;
    if (query.program && e.programId !== query.program) return false;
    if (query.tag && !e.tags.includes(query.tag)) return false;
    if (from && e.endAt < from) return false;
    if (to && e.startAt > to) return false;
    // list view shows everything incl. drafts of the caller? public listing only
    if (query.view !== 'list' && e.status === 'draft') return false;
    if (query.view !== 'list' && e.status === 'pending_review') return false;
    return true;
  });
}

export async function getEvent(eventId: string) {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw notFound('Event not found');
  const venue = event.venueId ? await loadVenueSummary(event.venueId) : null;
  const regs = await db.select().from(registrations).where(eq(registrations.eventId, eventId));
  const [host] = await db.select().from(members).where(eq(members.id, event.hostId)).limit(1);
  return {
    event,
    venue,
    host: host ? { id: host.id, displayName: host.displayName ?? host.email } : null,
    registrationCount: regs.filter((r) => ['pending', 'approved', 'waitlist'].includes(r.status)).length,
    checkedInCount: regs.filter((r) => r.checkedInAt !== null).length,
  };
}

async function loadVenueSummary(venueId: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) return null;
  const [building] = await db.select().from(buildings).where(eq(buildings.id, venue.buildingId)).limit(1);
  const [floor] = venue.floorId ? await db.select().from(floors).where(eq(floors.id, venue.floorId)).limit(1) : [null];
  return { ...venue, buildingName: building?.name ?? null, floorName: floor?.name ?? null };
}

// ---------------------------------------------------------------- publish / cancel

async function loadEventForWrite(eventId: string, actor: SessionPayload): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw notFound('Event not found');
  const isHost = event.hostId === actor.sub || event.coHostIds.includes(actor.sub);
  const isManager = event.venueId ? hasRole(actor.roles, 'venue_manager', 'venue:' + event.venueId) : false;
  if (!isHost && !isManager && !hasRole(actor.roles, 'admin')) throw forbidden('Only the host or a venue manager can do this');
  return event;
}

export async function publishEvent(eventId: string, actor: SessionPayload) {
  const event = await loadEventForWrite(eventId, actor);
  const venue = event.venueId ? await loadVenueSummary(event.venueId) : null;
  const [rule] = event.venueId
    ? await db.select().from(venueRules).where(eq(venueRules.venueId, event.venueId)).orderBy(sql<number>`${venueRules.version} desc`).limit(1)
    : [null];

  const needsApproval = Boolean(rule && rule.approvalMode !== 'auto');

  if (event.status === 'pending_review') {
    // manager approval path
    if (!hasRole(actor.roles, 'venue_manager', 'venue:' + (event.venueId ?? '')) && !hasRole(actor.roles, 'admin')) {
      throw forbidden('Only a venue manager or admin can approve a pending event');
    }
  }

  if (event.status === 'draft' && needsApproval) {
    assertEventTransition(event.status, 'pending_review');
    const [updated] = await db.update(events).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(events.id, eventId)).returning();
    await notify.enqueue({
      target: 'broadcast',
      channel: 'telegram',
      template: 'event_pending_review',
      payload: { eventId, title: event.title, venueName: venue?.name ?? null },
    });
    await writeAudit({
      actorType: 'user',
      actorId: actor.sub,
      action: 'POST /api/events/' + eventId + '/publish',
      entityType: 'event',
      entityId: eventId,
      before: { status: event.status },
      after: { status: updated.status },
    });
    return { event: updated, reviewRequired: true };
  }

  assertEventTransition(event.status, 'published');

  const [published] = await db
    .update(events)
    .set({
      status: 'published',
      venueSnapshot: venue ? { id: venue.id, name: venue.name, buildingName: venue.buildingName, floorName: venue.floorName, capacity: Math.max(venue.capacitySeated ?? 0, venue.capacityStanding ?? 0) } : null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId))
    .returning();

  // Approve the linked booking when publishing acts as the approval.
  if (event.venueId) {
    const [linked] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.eventId, eventId), inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES])))
      .limit(1);
    if (linked && linked.status === 'pending') {
      await db.update(bookings).set({ status: 'approved', updatedAt: new Date() }).where(eq(bookings.id, linked.id));
    }
  }

  // Outbound one-way publish records (docs/04 §2.3) + notification outbox (docs/03 §3.1).
  await integration.markSyncPending('event', eventId, ['luma', 'social_layer']);
  await notify.enqueue({
    target: 'broadcast',
    channel: 'telegram',
    template: 'event_published',
    payload: {
      eventId,
      title: published.title,
      startAt: published.startAt.toISOString(),
      endAt: published.endAt.toISOString(),
      venueName: venue?.name ?? null,
      url: config.appUrl + '/events/' + eventId,
    },
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/events/' + eventId + '/publish',
    entityType: 'event',
    entityId: eventId,
    before: { status: event.status },
    after: { status: published.status, venueSnapshot: published.venueSnapshot },
  });
  return { event: published, reviewRequired: false };
}

export async function cancelEvent(eventId: string, actor: SessionPayload, reason?: string) {
  const event = await loadEventForWrite(eventId, actor);
  assertEventTransition(event.status, 'canceled');
  const [canceled] = await db.update(events).set({ status: 'canceled', updatedAt: new Date() }).where(eq(events.id, eventId)).returning();

  // Release the venue: cancel the linked booking.
  if (event.venueId) {
    const linked = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.eventId, eventId), inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES])));
    for (const b of linked) {
      await db.update(bookings).set({ status: 'canceled', decisionNote: reason ?? null, updatedAt: new Date() }).where(eq(bookings.id, b.id));
    }
  }
  // Mark sync records canceled (docs/03 §3.1 取消).
  await integration.markSyncCanceled('event', eventId);
  await notify.enqueue({
    target: 'broadcast',
    channel: 'telegram',
    template: 'event_canceled',
    payload: { eventId, title: event.title, reason: reason ?? null },
  });
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/events/' + eventId + '/cancel',
    entityType: 'event',
    entityId: eventId,
    before: { status: event.status },
    after: { status: canceled.status },
  });
  return canceled;
}

// ---------------------------------------------------------------- registrations

export async function registerForEvent(eventId: string, memberId: string, answers: Record<string, unknown> = {}, source: 'web' | 'agent' | 'telegram' = 'web') {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw notFound('Event not found');
  if (!['published', 'ongoing'].includes(event.status)) {
    throw conflict('Event is not open for registration (status: ' + event.status + ')');
  }

  const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!member) throw notFound('Member not found');
  if (!member.emailVerifiedAt) throw forbidden('email verification required to register');

  // Capacity = min(event.max_capacity, venue capacity) (docs/03 §4.4)
  let capacity = event.maxCapacity ?? Infinity;
  if (event.venueId) {
    const [venue] = await db.select().from(venues).where(eq(venues.id, event.venueId)).limit(1);
    if (venue) {
      const venueCap = Math.max(venue.capacitySeated ?? 0, venue.capacityStanding ?? 0);
      if (venueCap > 0) capacity = Math.min(capacity, venueCap);
    }
  }
  const regs = await db.select().from(registrations).where(eq(registrations.eventId, eventId));
  const taken = regs.filter((r) => ['approved', 'pending'].includes(r.status)).length;

  let status: Registration['status'];
  if (taken >= capacity) {
    if (event.waitlistEnabled) status = 'waitlist';
    else throw conflict('Event is full', { capacity, taken });
  } else {
    status = event.approvalRequired ? 'pending' : 'approved';
  }

  let created: Registration;
  try {
    [created] = await db
      .insert(registrations)
      .values({ eventId, memberId, status, answers, source })
      .returning();
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('Already registered for this event');
    throw err;
  }

  await notify.enqueue({
    memberId,
    channel: 'telegram',
    template: status === 'waitlist' ? 'registration_waitlisted' : status === 'pending' ? 'registration_pending' : 'registration_confirmed',
    payload: { eventId, title: event.title, startAt: event.startAt.toISOString(), status },
  });
  return created;
}

export async function listRegistrations(eventId: string, actor: SessionPayload) {
  const event = await loadEventForWrite(eventId, actor);
  const rows = await db.select().from(registrations).where(eq(registrations.eventId, eventId));
  const memberMap = new Map<string, { displayName: string | null; email: string }>();
  for (const m of await db.select().from(members)) memberMap.set(m.id, { displayName: m.displayName, email: m.email });
  return rows.map((r) => ({ ...r, member: memberMap.get(r.memberId) ?? null }));
}

// ---------------------------------------------------------------- check-in

/** Host rotates the QR: old tokens are voided, a fresh one-time claim URL is issued (docs/03 §2.2). */
export async function rotateCheckin(eventId: string, actor: SessionPayload) {
  const event = await loadEventForWrite(eventId, actor);
  if (!['published', 'ongoing'].includes(event.status)) {
    throw conflict('Check-in is only available for published/ongoing events');
  }
  // Void previous unconsumed tokens for this event.
  const previous = await db
    .select()
    .from(checkinTokens)
    .where(and(eq(checkinTokens.eventId, eventId), sql<boolean>`${checkinTokens.consumedAt} is null`));
  for (const t of previous) {
    await db.update(checkinTokens).set({ consumedAt: new Date() }).where(eq(checkinTokens.id, t.id));
  }

  const cas = casClient();
  const issued = await cas.issueCheckinToken({
    eventId,
    registrationId: null,
    eventUrl: config.appUrl + '/events/' + eventId + '/checkin',
    ttlSeconds: config.checkinTokenTtlSeconds,
    maxUses: 1,
  });
  const [row] = await db
    .insert(checkinTokens)
    .values({
      eventId,
      registrationId: null,
      claimUrl: issued.claimUrl,
      tokenHash: issued.tokenId,
      expiresAt: new Date(issued.expiresAt),
    })
    .returning();

  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/events/' + eventId + '/check-in/rotate',
    entityType: 'event',
    entityId: eventId,
    after: { tokenId: row.id, expiresAt: row.expiresAt },
  });
  return { token: row, rotation: previous.length + 1 };
}

export async function getActiveCheckinToken(eventId: string) {
  const rows = await db
    .select()
    .from(checkinTokens)
    .where(and(eq(checkinTokens.eventId, eventId), sql<boolean>`${checkinTokens.consumedAt} is null`))
    .orderBy(sql<number>`${checkinTokens.createdAt} desc`);
  const now = Date.now();
  const active = rows.find((r) => r.expiresAt.getTime() > now);
  return active ?? null;
}

/** Participant consumes a one-time claim URL (docs/03 §4.4, docs/06 §3.5). */
export async function claimCheckin(eventId: string, input: { tokenId: string; sig: string }, actor: SessionPayload) {
  // The claim URL carries the CAS token id; we store it as tokenHash locally.
  const [token] = await db
    .select()
    .from(checkinTokens)
    .where(and(eq(checkinTokens.eventId, eventId), eq(checkinTokens.tokenHash, input.tokenId)))
    .limit(1);
  if (!token) throw notFound('Check-in token not found');
  if (token.consumedAt) throw conflict('This check-in link was already used');
  if (token.expiresAt.getTime() < Date.now()) throw conflict('This check-in link has expired');

  // The claimer must be a registered attendee.
  const regs = await db.select().from(registrations).where(and(eq(registrations.eventId, eventId), eq(registrations.memberId, actor.sub)));
  const registration = regs.find((r) => ['approved', 'pending'].includes(r.status)) ?? regs[0];
  if (!registration) throw forbidden('You are not registered for this event');

  // Claim cap: checkin_claim_cap ?? venue capacity ?? event capacity (docs/03 §4.4).
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  let cap: number | null = event?.checkinClaimCap ?? null;
  if (cap == null && event?.venueId) {
    const [venue] = await db.select().from(venues).where(eq(venues.id, event.venueId)).limit(1);
    if (venue) {
      const venueCap = Math.max(venue.capacitySeated ?? 0, venue.capacityStanding ?? 0);
      cap = venueCap > 0 ? venueCap : null;
    }
  }
  if (cap == null) cap = event?.maxCapacity ?? null;
  if (cap != null) {
    const claimed = await db
      .select()
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), sql<boolean>`${registrations.checkedInAt} is not null`));
    if (claimed.length >= cap) throw conflict('Check-in claim limit reached', { cap });
  }

  // CAS validates the signature and consumes the one-time token.
  const cas = casClient();
  let claim;
  try {
    claim = await cas.claimCheckinToken({ tokenId: input.tokenId, sig: input.sig });
  } catch (err) {
    if (err instanceof CasError) {
      if (err.code === 'already_claimed') {
        await db.update(checkinTokens).set({ consumedAt: new Date() }).where(eq(checkinTokens.id, token.id));
        throw conflict('This check-in link was already used');
      }
      if (err.code === 'expired') throw conflict('This check-in link has expired');
      throw err;
    }
    throw err;
  }

  await db.update(checkinTokens).set({ consumedAt: new Date(claim.claimedAt), registrationId: registration.id }).where(eq(checkinTokens.id, token.id));
  const [updatedReg] = await db
    .update(registrations)
    .set({ checkedInAt: new Date(claim.claimedAt), status: 'approved' })
    .where(eq(registrations.id, registration.id))
    .returning();

  await notify.enqueue({
    memberId: actor.sub,
    channel: 'telegram',
    template: 'checkin_success',
    payload: { eventId, title: event?.title ?? '', checkedInAt: claim.claimedAt },
  });
  return { registration: updatedReg, claimedAt: claim.claimedAt };
}

/** Advance lifecycle by time (published -> ongoing -> ended); used by a cron in production. */
export async function advanceLifecycle(now: Date = new Date()): Promise<number> {
  let changed = 0;
  const published = await db.select().from(events).where(eq(events.status, 'published'));
  for (const e of published) {
    if (e.startAt <= now && e.endAt > now) {
      await db.update(events).set({ status: 'ongoing', updatedAt: now }).where(eq(events.id, e.id));
      changed++;
    } else if (e.endAt <= now) {
      await db.update(events).set({ status: 'ended', updatedAt: now }).where(eq(events.id, e.id));
      changed++;
    }
  }
  const ongoing = await db.select().from(events).where(eq(events.status, 'ongoing'));
  for (const e of ongoing) {
    if (e.endAt <= now) {
      await db.update(events).set({ status: 'ended', updatedAt: now }).where(eq(events.id, e.id));
      changed++;
    }
  }
  return changed;
}

export type { Event, Registration, EventStatus };
export { assertEventTransition };
