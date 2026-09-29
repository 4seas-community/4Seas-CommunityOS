/**
 * Event module schema — events / registrations / checkin_tokens.
 * Source of truth: docs/03-domain-model.md §2.2 (Event domain).
 */
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { boolCol, enumOf, idPk, intervalOrder, jsonCol, jsonList, jsonOpt, oneOf, tsAt, tsNow, tsOpt } from '../../lib/db/sqlite';
import { venues } from '../place/schema';
import { members } from '../people/schema';

export const eventStatusValues = [
  'draft',
  'pending_review',
  'published',
  'ongoing',
  'ended',
  'archived',
  'canceled',
] as const;
export const eventStatus = enumOf(eventStatusValues);
export type EventStatus = (typeof eventStatus.enumValues)[number];

export const eventTypeValues = ['in_person', 'online', 'hybrid'] as const;
export const eventType = enumOf(eventTypeValues);
export type EventType = (typeof eventType.enumValues)[number];

export const eventVisibilityValues = ['public', 'members', 'private'] as const;
export const eventVisibility = enumOf(eventVisibilityValues);
export type EventVisibility = (typeof eventVisibility.enumValues)[number];

export const paymentTypeValues = ['free', 'fixed', 'pwyf'] as const;
export const paymentType = enumOf(paymentTypeValues);
export type PaymentType = (typeof paymentType.enumValues)[number];

export const createdViaValues = ['web', 'agent', 'telegram'] as const;
export const createdVia = enumOf(createdViaValues);
export type CreatedVia = (typeof createdVia.enumValues)[number];

export const checkinModeValues = ['qr_rotating', 'qr_static', 'none'] as const;
export const checkinMode = enumOf(checkinModeValues);
export type CheckinMode = (typeof checkinMode.enumValues)[number];

export const registrationStatusValues = ['pending', 'approved', 'waitlist', 'declined', 'canceled'] as const;
export const registrationStatus = enumOf(registrationStatusValues);
export type RegistrationStatus = (typeof registrationStatus.enumValues)[number];

export const registrationSourceValues = ['web', 'agent', 'telegram'] as const;
export const registrationSource = enumOf(registrationSourceValues);
export type RegistrationSource = (typeof registrationSource.enumValues)[number];

export const events = sqliteTable(
  'events',
  {
    id: idPk(),
    communityId: text('community_id').notNull(),
    programId: text('program_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startAt: tsAt('start_at'),
    endAt: tsAt('end_at'),
    timezone: text('timezone').notNull().default('Asia/Bangkok'),
    eventType: text('event_type').$type<EventType>().notNull().default('in_person'),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    venueSnapshot: jsonOpt<Record<string, unknown> | null>('venue_snapshot'),
    externalLocation: text('external_location'),
    geo: jsonOpt<{ lat: number; lng: number } | null>('geo'),
    transportInfo: text('transport_info').notNull().default(''),
    meetingUrl: text('meeting_url'),
    bannerUrl: text('banner_url'),
    suggestedAttendees: integer('suggested_attendees'),
    maxCapacity: integer('max_capacity'),
    isPaid: text('is_paid').$type<PaymentType>().notNull().default('free'),
    priceInfo: jsonOpt<Record<string, unknown> | null>('price_info'),
    entryRequirements: text('entry_requirements').notNull().default(''),
    registrationQuestions: jsonCol<unknown[]>('registration_questions', '[]'),
    approvalRequired: boolCol('approval_required').notNull().default(false),
    waitlistEnabled: boolCol('waitlist_enabled').notNull().default(false),
    visibility: text('visibility').$type<EventVisibility>().notNull().default('public'),
    tags: jsonList('tags'),
    status: text('status').$type<EventStatus>().notNull().default('draft'),
    hostId: text('host_id')
      .notNull()
      .references(() => members.id),
    coHostIds: jsonList('co_host_ids'),
    createdVia: text('created_via').$type<CreatedVia>().notNull().default('web'),
    checkinMode: text('checkin_mode').$type<CheckinMode>().notNull().default('qr_rotating'),
    checkinClaimCap: integer('checkin_claim_cap'),
    syncState: jsonCol<Record<string, unknown>>('sync_state'),
    createdAt: tsNow('created_at'),
    updatedAt: tsNow('updated_at'),
  },
  (t) => [
    index('events_start_at_idx').on(t.startAt),
    index('events_status_idx').on(t.status),
    check('events_status_check', oneOf(t.status, eventStatusValues)),
    check('events_type_check', oneOf(t.eventType, eventTypeValues)),
    check('events_visibility_check', oneOf(t.visibility, eventVisibilityValues)),
    check('events_payment_check', oneOf(t.isPaid, paymentTypeValues)),
    check('events_created_via_check', oneOf(t.createdVia, createdViaValues)),
    check('events_checkin_mode_check', oneOf(t.checkinMode, checkinModeValues)),
    check('events_time_order_check', intervalOrder(t.startAt, t.endAt)),
  ],
);

export const registrations = sqliteTable(
  'registrations',
  {
    id: idPk(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    status: text('status').$type<RegistrationStatus>().notNull().default('pending'),
    answers: jsonCol<Record<string, unknown>>('answers'),
    checkedInAt: tsOpt('checked_in_at'),
    source: text('source').$type<RegistrationSource>().notNull().default('web'),
    createdAt: tsNow('created_at'),
    updatedAt: tsNow('updated_at'),
  },
  (t) => [
    uniqueIndex('registrations_event_member_unique').on(t.eventId, t.memberId),
    check('registrations_status_check', oneOf(t.status, registrationStatusValues)),
    check('registrations_source_check', oneOf(t.source, registrationSourceValues)),
  ],
);

export const checkinTokens = sqliteTable(
  'checkin_tokens',
  {
    id: idPk(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    registrationId: text('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
    claimUrl: text('claim_url').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: tsAt('expires_at'),
    consumedAt: tsOpt('consumed_at'),
    nftClaimId: text('nft_claim_id'),
    createdAt: tsNow('created_at'),
  },
  (t) => [index('checkin_tokens_event_idx').on(t.eventId)],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
export type CheckinToken = typeof checkinTokens.$inferSelect;
export type NewCheckinToken = typeof checkinTokens.$inferInsert;
