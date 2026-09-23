/**
 * Booking module schema.
 * Source of truth: docs/03-domain-model.md §2.3 (Booking domain).
 * Note: the no-overlap exclusion constraint (tstzrange + btree_gist) is added by
 * drizzle/0001_booking_exclusion_constraint.sql because drizzle-kit cannot express it.
 */
import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { venues } from '../place/schema';
import { events } from '../event/schema';
import { members } from '../people/schema';

export const bookingStatus = pgEnum('booking_status', [
  'pending',
  'approved',
  'rejected',
  'canceled',
  'checked_in',
  'completed',
  'no_show',
]);

/** Statuses that occupy a venue slot and participate in conflict detection. */
export const ACTIVE_BOOKING_STATUSES = ['pending', 'approved', 'checked_in'] as const;

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    purpose: text('purpose').notNull().default(''),
    // Occupancy interval INCLUDES the buffer minutes (docs/03 §4.2).
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    attendeesCount: integer('attendees_count').notNull().default(1),
    status: bookingStatus('status').notNull().default('pending'),
    ruleVersion: integer('rule_version').notNull().default(1),
    pointsCharged: integer('points_charged').notNull().default(0),
    depositPoints: integer('deposit_points').notNull().default(0),
    approvedBy: uuid('approved_by'),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bookings_venue_start_idx').on(t.venueId, t.startAt)],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
