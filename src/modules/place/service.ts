/**
 * Place service — buildings / floors / venues / venue rules (docs/03 §2.1, §4.1).
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../lib/db';
import { buildings, floors, venueRules, venues, type Venue } from './schema';
import { computeAvailableSlots, isWithinOpeningHours } from '../../lib/time';
import { bookings, ACTIVE_BOOKING_STATUSES } from '../booking/schema';
import { notFound, unprocessable } from '../../lib/errors';
import type { SessionPayload } from '../../lib/auth/session';
import { requireRole } from '../../lib/auth/roles';
import { writeAudit } from '../../lib/audit';

// ---------------------------------------------------------------- validation

export const openingHoursSchema = z.record(
  z.string(),
  z.array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)])),
);

export const venueCreateSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  buildingId: z.string().uuid(),
  floorId: z.string().uuid().nullable().optional(),
  areaSqm: z.number().positive().optional(),
  capacitySeated: z.number().int().positive().optional(),
  capacityStanding: z.number().int().positive().optional(),
  amenities: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  openingHours: openingHoursSchema.default({}),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  photos: z.array(z.string()).default([]),
  status: z.enum(['open', 'maintenance', 'closed']).default('open'),
  defaultBufferMin: z.number().int().min(0).max(240).default(0),
  solDayVenueId: z.string().nullable().optional(),
});

export const venueUpdateSchema = venueCreateSchema.partial();

export const venueRulesSchema = z.object({
  allowedEventTypes: z.array(z.string()).default([]),
  approvalMode: z.enum(['auto', 'venue_manager', 'community_admin']).default('auto'),
  pointsPerHour: z.number().int().min(0).default(0),
  memberTierDiscount: z.record(z.string(), z.number()).default({}),
  freeQuotaApplies: z.boolean().default(false),
  depositPoints: z.number().int().min(0).default(0),
  maxAdvanceDays: z.number().int().positive().nullable().default(null),
  minAdvanceHours: z.number().int().min(0).nullable().default(null),
  maxDurationHours: z.number().int().positive().nullable().default(null),
  maxHoursPerMonth: z.number().int().positive().nullable().default(null),
  cancellationPolicy: z.record(z.string(), z.unknown()).default({}),
  prohibitedBehaviors: z.array(z.string()).default([]),
  accessRequirement: z.enum(['verified_members', 'roles', 'public']).default('verified_members'),
});

export type VenueCreateInput = z.infer<typeof venueCreateSchema>;
export type VenueRulesInput = z.infer<typeof venueRulesSchema>;

// ---------------------------------------------------------------- venues

export async function listVenues(filters: { buildingId?: string; floorId?: string; amenity?: string }) {
  const rows = await db.select().from(venues);
  return rows.filter((v) => {
    if (filters.buildingId && v.buildingId !== filters.buildingId) return false;
    if (filters.floorId && v.floorId !== filters.floorId) return false;
    if (filters.amenity && !v.amenities.includes(filters.amenity)) return false;
    return true;
  });
}

export async function getVenueWithRules(venueId: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) throw notFound('Venue not found');
  const [building] = await db.select().from(buildings).where(eq(buildings.id, venue.buildingId)).limit(1);
  const [floor] = venue.floorId
    ? await db.select().from(floors).where(eq(floors.id, venue.floorId)).limit(1)
    : [null];
  const rules = await listVenueRules(venueId);
  return { venue, building, floor, rules, currentRule: rules[0] ?? null };
}

export async function listVenueRules(venueId: string) {
  return db.select().from(venueRules).where(eq(venueRules.venueId, venueId)).orderBy(desc(venueRules.version));
}

export async function createVenue(input: VenueCreateInput, actor: SessionPayload) {
  // Creating a venue is a community-level privilege, not "manager of one venue".
  requireRole(actor, 'admin');
  const [created] = await db
    .insert(venues)
    .values({ ...input, areaSqm: input.areaSqm == null ? null : String(input.areaSqm) })
    .returning();
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/venues',
    entityType: 'venue',
    entityId: created.id,
    after: { venue: created },
  });
  return created;
}

export async function updateVenue(venueId: string, input: Partial<VenueCreateInput>, actor: SessionPayload) {
  requireRole(actor, 'venue_manager', 'venue:' + venueId);
  const existing = await getVenueWithRules(venueId);
  const { areaSqm, ...rest } = input;
  const [updated] = await db
    .update(venues)
    .set({
      ...rest,
      ...(areaSqm === undefined ? {} : { areaSqm: areaSqm == null ? null : String(areaSqm) }),
      updatedAt: new Date(),
    })
    .where(eq(venues.id, venueId))
    .returning();
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'PATCH /api/venues/' + venueId,
    entityType: 'venue',
    entityId: venueId,
    before: { venue: existing.venue },
    after: { venue: updated },
  });
  return updated;
}

/** PUT /api/venues/{id}/rules — append a new rule version (old bookings keep their version). */
export async function putVenueRules(venueId: string, input: VenueRulesInput, actor: SessionPayload) {
  requireRole(actor, 'venue_manager', 'venue:' + venueId);
  await getVenueWithRules(venueId); // 404 when missing
  const rules = await listVenueRules(venueId);
  const version = rules.reduce((max, r) => Math.max(max, r.version), 0) + 1;
  const [created] = await db
    .insert(venueRules)
    .values({ ...input, venueId, version, createdBy: actor.sub })
    .returning();
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'PUT /api/venues/' + venueId + '/rules',
    entityType: 'venue',
    entityId: venueId,
    after: { rule: created },
  });
  return created;
}

// ---------------------------------------------------------------- availability

export async function getVenueAvailability(venueId: string, from: Date, to: Date) {
  const { venue, building } = await getVenueWithRules(venueId);
  const timezone = building?.timezone ?? 'Asia/Bangkok';
  const busyRows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.venueId, venueId), inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES])));
  const busy = busyRows.map((b) => ({ start: b.startAt, end: b.endAt }));
  const slots = computeAvailableSlots({
    openingHours: venue.openingHours,
    blackoutDates: venue.blackoutDates,
    busy,
    from,
    to,
    timezone,
  });
  return { venue, timezone, slots, open: venue.status === 'open' };
}

export { isWithinOpeningHours, computeAvailableSlots };
export type { Venue };
