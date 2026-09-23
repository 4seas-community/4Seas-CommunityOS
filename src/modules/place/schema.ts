/**
 * Place module schema — buildings / floors / venues / venue_rules.
 * Source of truth: docs/03-domain-model.md §2.1 (Space domain).
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  date,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const communities = pgTable('communities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const buildingStatus = pgEnum('building_status', ['active', 'maintenance', 'closed']);
export const venueStatus = pgEnum('venue_status', ['open', 'maintenance', 'closed']);
export const approvalMode = pgEnum('approval_mode', ['auto', 'venue_manager', 'community_admin']);
export const accessRequirement = pgEnum('access_requirement', ['verified_members', 'roles', 'public']);

/** Weekly opening hours: keys are ISO weekdays "1".."7" (Mon..Sun), values are [start, end] "HH:MM" pairs. */
export type OpeningHours = Record<string, Array<[string, string]>>;

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').notNull(),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  // geo stored as {lat, lng} JSON (docs/03 §2.1 specifies a point; JSON keeps migrations simple).
  geo: jsonb('geo').$type<{ lat: number; lng: number } | null>(),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  status: buildingStatus('status').notNull().default('active'),
  coverImage: text('cover_image'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const floors = pgTable('floors', {
  id: uuid('id').primaryKey().defaultRandom(),
  buildingId: uuid('building_id')
    .notNull()
    .references(() => buildings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  mapAsset: text('map_asset'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    floorId: uuid('floor_id').references(() => floors.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    areaSqm: numeric('area_sqm', { precision: 10, scale: 2 }),
    capacitySeated: integer('capacity_seated'),
    capacityStanding: integer('capacity_standing'),
    amenities: text('amenities').array().notNull().default([]),
    services: text('services').array().notNull().default([]),
    openingHours: jsonb('opening_hours').$type<OpeningHours>().notNull().default({}),
    blackoutDates: date('blackout_dates', { mode: 'string' }).array().notNull().default([]),
    photos: text('photos').array().notNull().default([]),
    status: venueStatus('status').notNull().default('open'),
    defaultBufferMin: integer('default_buffer_min').notNull().default(0),
    solDayVenueId: text('sol_day_venue_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('venues_code_unique').on(t.code)],
);

export const venueRules = pgTable(
  'venue_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    allowedEventTypes: text('allowed_event_types').array().notNull().default([]),
    approvalMode: approvalMode('approval_mode').notNull().default('auto'),
    pointsPerHour: integer('points_per_hour').notNull().default(0),
    memberTierDiscount: jsonb('member_tier_discount').$type<Record<string, number>>().notNull().default({}),
    freeQuotaApplies: boolean('free_quota_applies').notNull().default(false),
    depositPoints: integer('deposit_points').notNull().default(0),
    maxAdvanceDays: integer('max_advance_days'),
    minAdvanceHours: integer('min_advance_hours'),
    maxDurationHours: integer('max_duration_hours'),
    maxHoursPerMonth: integer('max_hours_per_month'),
    cancellationPolicy: jsonb('cancellation_policy').$type<Record<string, unknown>>().notNull().default({}),
    prohibitedBehaviors: text('prohibited_behaviors').array().notNull().default([]),
    accessRequirement: accessRequirement('access_requirement').notNull().default('verified_members'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('venue_rules_venue_version_unique').on(t.venueId, t.version)],
);

export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Floor = typeof floors.$inferSelect;
export type NewFloor = typeof floors.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type VenueRule = typeof venueRules.$inferSelect;
export type NewVenueRule = typeof venueRules.$inferInsert;
