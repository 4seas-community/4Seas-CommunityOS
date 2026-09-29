/**
 * Booking module schema.
 * Source of truth: docs/03-domain-model.md §2.3 (Booking domain).
 *
 * The Postgres no-overlap exclusion constraint (tstzrange + btree_gist) is
 * replaced by SQLite BEFORE INSERT/UPDATE triggers that RAISE(ABORT) on overlap
 * for active statuses — see drizzle/0003_booking_overlap_triggers.sql. Same
 * guarantee, expressed in the dialect D1 actually supports.
 */
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { enumOf, idPk, intervalOrder, nonNegative, oneOf, tsAt, tsNow } from '../../lib/db/sqlite';
import { venues } from '../place/schema';
import { events } from '../event/schema';
import { members } from '../people/schema';

export const bookingStatusValues = [
  'pending',
  'approved',
  'rejected',
  'canceled',
  'checked_in',
  'completed',
  'no_show',
] as const;
export const bookingStatus = enumOf(bookingStatusValues);
export type BookingStatus = (typeof bookingStatus.enumValues)[number];

/** Statuses that occupy a venue slot and participate in conflict detection. */
export const ACTIVE_BOOKING_STATUSES = ['pending', 'approved', 'checked_in'] as const;

export const bookings = sqliteTable(
  'bookings',
  {
    id: idPk(),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id),
    purpose: text('purpose').notNull().default(''),
    // Occupancy interval INCLUDES the buffer minutes (docs/03 §4.2).
    startAt: tsAt('start_at'),
    endAt: tsAt('end_at'),
    attendeesCount: integer('attendees_count').notNull().default(1),
    status: text('status').$type<BookingStatus>().notNull().default('pending'),
    ruleVersion: integer('rule_version').notNull().default(1),
    pointsCharged: integer('points_charged').notNull().default(0),
    depositPoints: integer('deposit_points').notNull().default(0),
    approvedBy: text('approved_by'),
    decisionNote: text('decision_note'),
    createdAt: tsNow('created_at'),
    updatedAt: tsNow('updated_at'),
  },
  (t) => [
    index('bookings_venue_start_idx').on(t.venueId, t.startAt),
    check('bookings_status_check', oneOf(t.status, bookingStatusValues)),
    check('bookings_time_order_check', intervalOrder(t.startAt, t.endAt)),
    check('bookings_attendees_check', nonNegative(t.attendeesCount)),
    check('bookings_points_check', nonNegative(t.pointsCharged)),
    check('bookings_deposit_check', nonNegative(t.depositPoints)),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
