/**
 * Notify module schema — notification outbox consumed by 4seasbot (pull-based).
 * Source of truth: docs/03-domain-model.md §2.5 + docs/04-integrations.md §4.
 */
import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { members } from '../people/schema';

export const notificationChannel = pgEnum('notification_channel', ['telegram', 'email']);
export const outboxStatus = pgEnum('outbox_status', ['scheduled', 'pending', 'delivered', 'failed']);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null = broadcast to the community channel. */
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'cascade' }),
    /** chat_id / telegram_id / email, or "broadcast" for community-wide pushes. */
    target: text('target').notNull().default('broadcast'),
    channel: notificationChannel('channel').notNull().default('telegram'),
    template: text('template').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    status: outboxStatus('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notification_outbox_status_idx').on(t.status, t.scheduledAt)],
);

export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutbox = typeof notificationOutbox.$inferInsert;
