/**
 * Notify module schema — notification outbox consumed by 4seasbot (pull-based).
 * Source of truth: docs/03-domain-model.md §2.5 + docs/04-integrations.md §4.
 */
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { enumOf, idPk, jsonCol, nonNegative, oneOf, tsNow } from '../../lib/db/sqlite';
import { members } from '../people/schema';

export const notificationChannelValues = ['telegram', 'email'] as const;
export const notificationChannel = enumOf(notificationChannelValues);
export type NotificationChannel = (typeof notificationChannel.enumValues)[number];

export const outboxStatusValues = ['scheduled', 'pending', 'delivered', 'failed'] as const;
export const outboxStatus = enumOf(outboxStatusValues);
export type OutboxStatus = (typeof outboxStatus.enumValues)[number];

export const notificationOutbox = sqliteTable(
  'notification_outbox',
  {
    id: idPk(),
    /** Null = broadcast to the community channel. */
    memberId: text('member_id').references(() => members.id, { onDelete: 'cascade' }),
    /** chat_id / telegram_id / email, or "broadcast" for community-wide pushes. */
    target: text('target').notNull().default('broadcast'),
    channel: text('channel').$type<NotificationChannel>().notNull().default('telegram'),
    template: text('template').notNull(),
    payload: jsonCol<Record<string, unknown>>('payload'),
    scheduledAt: tsNow('scheduled_at'),
    status: text('status').$type<OutboxStatus>().notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: tsNow('created_at'),
    updatedAt: tsNow('updated_at'),
  },
  (t) => [
    index('notification_outbox_status_idx').on(t.status, t.scheduledAt),
    check('notification_outbox_channel_check', oneOf(t.channel, notificationChannelValues)),
    check('notification_outbox_status_check', oneOf(t.status, outboxStatusValues)),
    check('notification_outbox_retry_check', nonNegative(t.retryCount)),
  ],
);

export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutbox = typeof notificationOutbox.$inferInsert;
