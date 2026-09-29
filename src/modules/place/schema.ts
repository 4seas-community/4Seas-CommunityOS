/**
 * Place module schema — buildings / floors / venues / venue_rules.
 * Source of truth: docs/03-domain-model.md §2.1 (Space domain).
 */
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { boolCol, enumOf, idPk, jsonCol, jsonList, jsonOpt, nonNegative, oneOf, tsNow } from '../../lib/db/sqlite';

export const communities = sqliteTable('communities', {
  id: idPk(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
});

export const buildingStatusValues = ['active', 'maintenance', 'closed'] as const;
export const buildingStatus = enumOf(buildingStatusValues);
export type BuildingStatus = (typeof buildingStatus.enumValues)[number];

export const venueStatusValues = ['open', 'maintenance', 'closed'] as const;
export const venueStatus = enumOf(venueStatusValues);
export type VenueStatus = (typeof venueStatus.enumValues)[number];

export const approvalModeValues = ['auto', 'venue_manager', 'community_admin'] as const;
export const approvalMode = enumOf(approvalModeValues);
export type ApprovalMode = (typeof approvalMode.enumValues)[number];

export const accessRequirementValues = ['verified_members', 'roles', 'public'] as const;
export const accessRequirement = enumOf(accessRequirementValues);
export type AccessRequirement = (typeof accessRequirement.enumValues)[number];

/** Weekly opening hours: keys are ISO weekdays "1".."7" (Mon..Sun), values are [start, end] "HH:MM" pairs. */
export type OpeningHours = Record<string, Array<[string, string]>>;

export const buildings = sqliteTable('buildings', {
  id: idPk(),
  communityId: text('community_id').notNull(),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  // geo stored as {lat, lng} JSON (docs/03 §2.1 specifies a point; JSON keeps migrations simple).
  geo: jsonOpt<{ lat: number; lng: number } | null>('geo'),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  status: text('status').$type<BuildingStatus>().notNull().default('active'),
  coverImage: text('cover_image'),
  description: text('description'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [check('buildings_status_check', oneOf(t.status, buildingStatusValues))]);

export const floors = sqliteTable('floors', {
  id: idPk(),
  buildingId: text('building_id')
    .notNull()
    .references(() => buildings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  mapAsset: text('map_asset'),
  createdAt: tsNow('created_at'),
});

export const venues = sqliteTable(
  'venues',
  {
    id: idPk(),
    buildingId: text('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    floorId: text('floor_id').references(() => floors.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    areaSqm: real('area_sqm'),
    capacitySeated: integer('capacity_seated'),
    capacityStanding: integer('capacity_standing'),
    amenities: jsonList('amenities'),
    services: jsonList('services'),
    openingHours: jsonCol<OpeningHours>('opening_hours'),
    blackoutDates: jsonList('blackout_dates'),
    photos: jsonList('photos'),
    status: text('status').$type<VenueStatus>().notNull().default('open'),
    defaultBufferMin: integer('default_buffer_min').notNull().default(0),
    solDayVenueId: text('sol_day_venue_id'),
    createdAt: tsNow('created_at'),
    updatedAt: tsNow('updated_at'),
  },
  (t) => [uniqueIndex('venues_code_unique').on(t.code), check('venues_status_check', oneOf(t.status, venueStatusValues))],
);

export const venueRules = sqliteTable(
  'venue_rules',
  {
    id: idPk(),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    allowedEventTypes: jsonList('allowed_event_types'),
    approvalMode: text('approval_mode').$type<ApprovalMode>().notNull().default('auto'),
    pointsPerHour: integer('points_per_hour').notNull().default(0),
    memberTierDiscount: jsonCol<Record<string, number>>('member_tier_discount'),
    freeQuotaApplies: boolCol('free_quota_applies').notNull().default(false),
    depositPoints: integer('deposit_points').notNull().default(0),
    maxAdvanceDays: integer('max_advance_days'),
    minAdvanceHours: integer('min_advance_hours'),
    maxDurationHours: integer('max_duration_hours'),
    maxHoursPerMonth: integer('max_hours_per_month'),
    cancellationPolicy: jsonCol<Record<string, unknown>>('cancellation_policy'),
    prohibitedBehaviors: jsonList('prohibited_behaviors'),
    accessRequirement: text('access_requirement').$type<AccessRequirement>().notNull().default('verified_members'),
    createdBy: text('created_by'),
    createdAt: tsNow('created_at'),
  },
  (t) => [
    uniqueIndex('venue_rules_venue_version_unique').on(t.venueId, t.version),
    check('venue_rules_approval_mode_check', oneOf(t.approvalMode, approvalModeValues)),
    check('venue_rules_access_check', oneOf(t.accessRequirement, accessRequirementValues)),
    check('venue_rules_points_check', nonNegative(t.pointsPerHour)),
    check('venue_rules_deposit_check', nonNegative(t.depositPoints)),
  ],
);

export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Floor = typeof floors.$inferSelect;
export type NewFloor = typeof floors.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type VenueRule = typeof venueRules.$inferSelect;
export type NewVenueRule = typeof venueRules.$inferInsert;
