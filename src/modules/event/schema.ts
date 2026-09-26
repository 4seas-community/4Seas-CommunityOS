/**
 * Event module schema — events / registrations / checkin_tokens.
 * Source of truth: docs/03-domain-model.md §2.2 (Event domain).
 */
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { venues } from '../place/schema';
import { members } from '../people/schema';

export const eventStatus = pgEnum('event_status', [
  'draft',
  'pending_review',
  'published',
  'ongoing',
  'ended',
  'archived',
  'canceled',
]);
export const eventType = pgEnum('event_type', ['in_person', 'online', 'hybrid']);
export const eventVisibility = pgEnum('event_visibility', ['public', 'members', 'private']);
export const paymentType = pgEnum('payment_type', ['free', 'fixed', 'pwyf']);
export const createdVia = pgEnum('created_via', ['web', 'agent', 'telegram']);
export const checkinMode = pgEnum('checkin_mode', ['qr_rotating', 'qr_static', 'none']);
export const registrationStatus = pgEnum('registration_status', [
  'pending',
  'approved',
  'waitlist',
  'declined',
  'canceled',
]);
export const registrationSource = pgEnum('registration_source', ['web', 'agent', 'telegram']);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id').notNull(),
    programId: uuid('program_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('Asia/Bangkok'),
    eventType: eventType('event_type').notNull().default('in_person'),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    venueSnapshot: jsonb('venue_snapshot').$type<Record<string, unknown> | null>(),
    externalLocation: text('external_location'),
    geo: jsonb('geo').$type<{ lat: number; lng: number } | null>(),
    transportInfo: text('transport_info').notNull().default(''),
    meetingUrl: text('meeting_url'),
    bannerUrl: text('banner_url'),
    suggestedAttendees: integer('suggested_attendees'),
    maxCapacity: integer('max_capacity'),
    isPaid: paymentType('is_paid').notNull().default('free'),
    priceInfo: jsonb('price_info').$type<Record<string, unknown> | null>(),
    entryRequirements: text('entry_requirements').notNull().default(''),
    registrationQuestions: jsonb('registration_questions').$type<unknown[]>().notNull().default([]),
    approvalRequired: boolean('approval_required').notNull().default(false),
    waitlistEnabled: boolean('waitlist_enabled').notNull().default(false),
    visibility: eventVisibility('visibility').notNull().default('public'),
    tags: text('tags').array().notNull().default([]),
    status: eventStatus('status').notNull().default('draft'),
    hostId: uuid('host_id')
      .notNull()
      .references(() => members.id),
    coHostIds: uuid('co_host_ids').array().notNull().default([]),
    createdVia: createdVia('created_via').notNull().default('web'),
    checkinMode: checkinMode('checkin_mode').notNull().default('qr_rotating'),
    checkinClaimCap: integer('checkin_claim_cap'),
    syncState: jsonb('sync_state').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_start_at_idx').on(t.startAt), index('events_status_idx').on(t.status)],
);

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    status: registrationStatus('status').notNull().default('pending'),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    source: registrationSource('source').notNull().default('web'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('registrations_event_member_unique').on(t.eventId, t.memberId)],
);

export const checkinTokens = pgTable(
  'checkin_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
    claimUrl: text('claim_url').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    nftClaimId: text('nft_claim_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('checkin_tokens_event_idx').on(t.eventId)],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
export type CheckinToken = typeof checkinTokens.$inferSelect;
export type NewCheckinToken = typeof checkinTokens.$inferInsert;
