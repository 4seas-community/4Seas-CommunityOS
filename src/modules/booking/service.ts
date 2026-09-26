/**
 * Booking service — one rule engine for both entry points (docs/02 §5.3):
 *   1. event-linked bookings (created automatically with an event)
 *   2. standalone bookings
 * Conflict detection includes the venue buffer (docs/03 §4.2); the database
 * exclusion constraint is the atomic guard, this is the friendly pre-check.
 * Points are reserved in the schema but default to 0 (docs/02 D6, docs/03 §4.3).
 */
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../lib/db';
import { config } from '../../lib/config';
import { bookings, ACTIVE_BOOKING_STATUSES, type Booking } from './schema';
import { venues, venueRules, buildings, type Venue, type VenueRule } from '../place/schema';
import { members } from '../people/schema';
import { events } from '../event/schema';
import { isWithinOpeningHours, dateKeyInZone, withBuffer, overlaps } from '../../lib/time';
import { notFound, conflict, unprocessable, forbidden } from '../../lib/errors';
import { hasRole } from '../../lib/auth/roles';
import type { SessionPayload } from '../../lib/auth/session';
import { writeAudit } from '../../lib/audit';
import { chargeBooking, refundBooking } from './points';

export const bookingCreateSchema = z.object({
  venueId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  purpose: z.string().max(500).default(''),
  attendeesCount: z.number().int().min(1).default(1),
  eventId: z.string().uuid().nullable().optional(),
  /** Must be true when the venue rule lists prohibited behaviors (docs/02 §5.1). */
  acceptedProhibited: z.boolean().default(false),
});

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export interface ValidationResult {
  venue: Venue;
  rule: VenueRule | null;
  bufferMin: number;
  timezone: string;
  buffered: { start: Date; end: Date };
  warnings: string[];
}

/** Pure-ish validation pipeline; throws friendly ApiErrors (docs/03 §4.1/§4.2). */
export async function validateBookingRequest(
  input: { venueId: string; startAt: Date; endAt: Date; attendeesCount: number; acceptedProhibited?: boolean; eventId?: string | null },
  actor: { id: string; emailVerified: boolean },
  exec: typeof db = db,
): Promise<ValidationResult> {
  const [venue] = await exec.select().from(venues).where(eq(venues.id, input.venueId)).limit(1);
  if (!venue) throw notFound('Venue not found');
  if (venue.status !== 'open') throw conflict('Venue is not open (status: ' + venue.status + ')');

  const [building] = await exec.select().from(buildings).where(eq(buildings.id, venue.buildingId)).limit(1);
  const timezone = building?.timezone ?? config.defaultTimezone;

  const [rule] = await exec
    .select()
    .from(venueRules)
    .where(eq(venueRules.venueId, venue.id))
    .orderBy(sql<number>`${venueRules.version} desc`)
    .limit(1);

  const start = input.startAt;
  const end = input.endAt;
  if (end <= start) throw unprocessable('end_at must be after start_at');

  // Access requirement (docs/03 §2.1 access_requirement)
  if (rule && rule.accessRequirement === 'verified_members' && !actor.emailVerified) {
    throw forbidden('email verification required to book this venue');
  }

  // Event type whitelist (docs/02 §5.1) — categories live on event tags.
  if (rule && rule.allowedEventTypes.length > 0 && input.eventId) {
    const [event] = await exec.select().from(events).where(eq(events.id, input.eventId)).limit(1);
    const tags = event?.tags ?? [];
    if (!tags.some((t) => rule.allowedEventTypes.includes(t))) {
      throw unprocessable('Event type not allowed at this venue', {
        allowed: rule.allowedEventTypes,
        tags,
      });
    }
  }

  // Opening hours + blackout dates (docs/03 §4.1)
  if (!isWithinOpeningHours(venue.openingHours, timezone, start, end)) {
    throw unprocessable('Requested time is outside venue opening hours', { timezone });
  }
  const dayKey = dateKeyInZone(start, timezone);
  if (venue.blackoutDates.includes(dayKey)) {
    throw conflict('Venue is closed on ' + dayKey + ' (blackout date)');
  }

  const durationHours = (end.getTime() - start.getTime()) / 3600_000;

  if (rule) {
    // Advance window
    if (rule.maxAdvanceDays != null) {
      const maxStart = new Date(Date.now() + rule.maxAdvanceDays * 86400_000);
      if (start > maxStart) throw unprocessable('Booking window exceeded: max ' + rule.maxAdvanceDays + ' days in advance');
    }
    if (rule.minAdvanceHours != null) {
      const minStart = new Date(Date.now() + rule.minAdvanceHours * 3600_000);
      if (start < minStart) throw unprocessable('Booking must be made at least ' + rule.minAdvanceHours + ' hours in advance');
    }
    // Duration caps
    if (rule.maxDurationHours != null && durationHours > rule.maxDurationHours) {
      throw unprocessable('Duration exceeds venue limit of ' + rule.maxDurationHours + 'h');
    }
    // Monthly hours cap (anti-hoarding)
    if (rule.maxHoursPerMonth != null) {
      const used = await monthlyHours(venue.id, actor.id, start);
      if (used + durationHours > rule.maxHoursPerMonth) {
        throw unprocessable('Monthly booking quota exceeded', {
          maxHoursPerMonth: rule.maxHoursPerMonth,
          usedHours: used,
        });
      }
    }
    // Prohibited behaviors must be acknowledged
    if (rule.prohibitedBehaviors.length > 0 && !input.acceptedProhibited) {
      throw unprocessable('Prohibited behaviors must be accepted', { prohibitedBehaviors: rule.prohibitedBehaviors });
    }
  }

  // Capacity
  const capacity = Math.max(venue.capacitySeated ?? 0, venue.capacityStanding ?? 0);
  if (capacity > 0 && input.attendeesCount > capacity) {
    throw unprocessable('Attendees exceed venue capacity', { capacity, requested: input.attendeesCount });
  }

  // Conflict pre-check with buffer on the new request (stored ranges already include buffer)
  const buffered = withBuffer({ start, end }, venue.defaultBufferMin);
  const conflicts = await findConflictingBookings(venue.id, buffered);
  if (conflicts.length > 0) {
    throw conflict('Venue already booked in this time range (incl. ' + venue.defaultBufferMin + 'min buffer)', {
      conflictingBookings: conflicts.map((b) => ({ id: b.id, startAt: b.startAt, endAt: b.endAt, status: b.status })),
    });
  }

  // Soft warning: member holds another overlapping booking (docs/03 §4.2)
  const warnings: string[] = [];
  const others = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.memberId, actor.id),
        inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        lt(bookings.startAt, buffered.end),
        gte(bookings.endAt, buffered.start),
      ),
    );
  if (others.length > 0) {
    warnings.push('You have ' + others.length + ' other booking(s) overlapping this time');
  }

  return { venue, rule: rule ?? null, bufferMin: venue.defaultBufferMin, timezone, buffered, warnings };
}

async function monthlyHours(venueId: string, memberId: string, around: Date): Promise<number> {
  const monthStart = new Date(Date.UTC(around.getUTCFullYear(), around.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(around.getUTCFullYear(), around.getUTCMonth() + 1, 1));
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.venueId, venueId),
        eq(bookings.memberId, memberId),
        inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        gte(bookings.startAt, monthStart),
        lt(bookings.startAt, monthEnd),
      ),
    );
  return rows.reduce((sum, b) => sum + (b.endAt.getTime() - b.startAt.getTime()) / 3600_000, 0);
}

/** Active bookings overlapping the given (already buffered) interval. */
export async function findConflictingBookings(venueId: string, interval: { start: Date; end: Date }): Promise<Booking[]> {
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.venueId, venueId),
        inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        lt(bookings.startAt, interval.end),
        gte(bookings.endAt, interval.start),
      ),
    );
  return rows.filter((b) => overlaps({ start: b.startAt, end: b.endAt }, interval));
}

/** Points charged for a booking — 0 unless the V2 flag is enabled (docs/03 §4.3). */
export function computePointsCharged(rule: VenueRule | null, durationHours: number): number {
  if (!config.pointsEnabled || !rule) return 0;
  return rule.pointsPerHour * durationHours;
}

export async function createBooking(input: BookingCreateInput, actor: SessionPayload) {
  const member = await loadMember(actor.sub);
  const result = await validateBookingRequest(
    {
      venueId: input.venueId,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      attendeesCount: input.attendeesCount,
      acceptedProhibited: input.acceptedProhibited,
      eventId: input.eventId ?? null,
    },
    { id: member.id, emailVerified: Boolean(member.emailVerifiedAt) },
  );

  const approvalMode = result.rule?.approvalMode ?? 'auto';
  const status = approvalMode === 'auto' ? 'approved' : 'pending';
  const durationHours = (result.buffered.end.getTime() - result.buffered.start.getTime()) / 3600_000;

  let created: Booking;
  try {
    [created] = await db
      .insert(bookings)
      .values({
        venueId: input.venueId,
        eventId: input.eventId ?? null,
        memberId: member.id,
        purpose: input.purpose,
        startAt: result.buffered.start,
        endAt: result.buffered.end,
        attendeesCount: input.attendeesCount,
        status,
        ruleVersion: result.rule?.version ?? 1,
        pointsCharged: computePointsCharged(result.rule, durationHours),
        depositPoints: result.rule?.depositPoints ?? 0,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('Venue already booked in this time range (incl. buffer)', {});
    }
    throw err;
  }

  if (status === 'approved') await chargeBooking(created, member);
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/bookings',
    entityType: 'booking',
    entityId: created.id,
    after: { booking: created },
    draftId: null,
  });
  return { booking: created, warnings: result.warnings, approvalMode };
}

async function loadMember(memberId: string) {
  const [m] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!m) throw notFound('Member not found');
  return m;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

async function loadBooking(bookingId: string): Promise<Booking> {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b) throw notFound('Booking not found');
  return b;
}

async function transition(bookingId: string, to: Booking['status'], actor: SessionPayload, note?: string): Promise<Booking> {
  const before = await loadBooking(bookingId);
  assertBookingTransition(before.status, to);
  const [updated] = await db
    .update(bookings)
    .set({
      status: to,
      decisionNote: note ?? before.decisionNote,
      approvedBy: to === 'approved' ? actor.sub : before.approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning();
  return updated;
}

/** Booking state machine (docs/03 §3.2). */
export function assertBookingTransition(from: Booking['status'], to: Booking['status']): void {
  const allowed: Record<string, string[]> = {
    pending: ['approved', 'rejected', 'canceled'],
    approved: ['checked_in', 'canceled', 'no_show', 'completed'],
    checked_in: ['completed'],
    rejected: [],
    canceled: [],
    completed: [],
    no_show: [],
  };
  if (!(allowed[from] ?? []).includes(to)) {
    throw conflict('Invalid booking transition ' + from + ' -> ' + to);
  }
}

export async function approveBooking(bookingId: string, actor: SessionPayload, note?: string) {
  const booking = await loadBooking(bookingId);
  await requireVenueManager(actor, booking.venueId);
  // Re-validate conflicts at decision time (the exclusion constraint is the atomic guard).
  const conflicts = await findConflictingBookings(booking.venueId, { start: booking.startAt, end: booking.endAt });
  const otherConflicts = conflicts.filter((c) => c.id !== booking.id);
  if (otherConflicts.length > 0) throw conflict('Venue was booked by someone else in the meantime');
  const updated = await transition(bookingId, 'approved', actor, note);
  await chargeBooking(updated, await loadMember(booking.memberId));
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/bookings/' + bookingId + '/approve',
    entityType: 'booking',
    entityId: bookingId,
    before: { status: booking.status },
    after: { status: updated.status },
  });
  return updated;
}

export async function rejectBooking(bookingId: string, actor: SessionPayload, note?: string) {
  const booking = await loadBooking(bookingId);
  await requireVenueManager(actor, booking.venueId);
  const updated = await transition(bookingId, 'rejected', actor, note);
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/bookings/' + bookingId + '/reject',
    entityType: 'booking',
    entityId: bookingId,
    before: { status: booking.status },
    after: { status: updated.status },
  });
  return updated;
}

export async function cancelBooking(bookingId: string, actor: SessionPayload, reason?: string) {
  const booking = await loadBooking(bookingId);
  const isOwner = booking.memberId === actor.sub;
  const isManager = hasRole(actor.roles, 'venue_manager', 'venue:' + booking.venueId);
  if (!isOwner && !isManager && !hasRole(actor.roles, 'admin')) throw forbidden('Only the owner or a venue manager can cancel');
  const updated = await transition(bookingId, 'canceled', actor, reason);
  // Refund only bookings that were actually charged (approved state, points > 0).
  if (booking.status === 'approved' && booking.pointsCharged > 0) {
    await refundBooking(booking, await loadMember(booking.memberId));
  }
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/bookings/' + bookingId + '/cancel',
    entityType: 'booking',
    entityId: bookingId,
    before: { status: booking.status },
    after: { status: updated.status },
  });
  return updated;
}

/** Mark the booking as used on site (host/manager scans or confirms). */
export async function checkInBooking(bookingId: string, actor: SessionPayload): Promise<Booking> {
  const booking = await loadBooking(bookingId);
  const isOwner = booking.memberId === actor.sub;
  const isManager = hasRole(actor.roles, 'venue_manager', 'venue:' + booking.venueId) || hasRole(actor.roles, 'admin');
  if (!isOwner && !isManager) throw forbidden('Only the owner or a venue manager can check in');
  const updated = await transition(bookingId, 'checked_in', actor);
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/bookings/' + bookingId + '/check-in',
    entityType: 'booking',
    entityId: bookingId,
    before: { status: booking.status },
    after: { status: updated.status },
  });
  return updated;
}

/** Complete the booking after use (releases the slot; points stay charged). */
export async function completeBooking(bookingId: string, actor: SessionPayload): Promise<Booking> {
  const booking = await loadBooking(bookingId);
  const isOwner = booking.memberId === actor.sub;
  const isManager = hasRole(actor.roles, 'venue_manager', 'venue:' + booking.venueId) || hasRole(actor.roles, 'admin');
  if (!isOwner && !isManager) throw forbidden('Only the owner or a venue manager can complete');
  const updated = await transition(bookingId, 'completed', actor);
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/bookings/' + bookingId + '/complete',
    entityType: 'booking',
    entityId: bookingId,
    before: { status: booking.status },
    after: { status: updated.status },
  });
  return updated;
}

async function requireVenueManager(actor: SessionPayload, venueId: string): Promise<void> {
  if (!hasRole(actor.roles, 'venue_manager', 'venue:' + venueId) && !hasRole(actor.roles, 'admin')) {
    throw forbidden('Venue manager or admin role required');
  }
}

export async function listBookings(filters: { venueId?: string; memberId?: string; from?: Date; to?: Date; status?: string }) {
  const rows = await db.select().from(bookings);
  return rows
    .filter((b) => {
      if (filters.venueId && b.venueId !== filters.venueId) return false;
      if (filters.memberId && b.memberId !== filters.memberId) return false;
      if (filters.status && b.status !== filters.status) return false;
      if (filters.from && b.endAt <= filters.from) return false;
      if (filters.to && b.startAt >= filters.to) return false;
      return true;
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
