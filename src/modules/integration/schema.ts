/**
 * Integration module schema — outbound one-way publish records (Luma / Social Layer).
 * Source of truth: docs/03-domain-model.md §2.5 (SyncRecord) + docs/04-integrations.md.
 * External platform ids only ever live here — never on core entities (invariant #4).
 */
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const syncPlatform = pgEnum('sync_platform', ['luma', 'social_layer']);
export const syncStatus = pgEnum('sync_status', [
  'pending',
  'syncing',
  'synced',
  'failed',
  'dead_letter',
  'canceled',
  'outdated',
]);

export const syncRecords = pgTable(
  'sync_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    platform: syncPlatform('platform').notNull(),
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    status: syncStatus('status').notNull().default('pending'),
    lastError: text('last_error'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sync_records_entity_platform_unique').on(t.entityType, t.entityId, t.platform),
    index('sync_records_status_idx').on(t.status),
  ],
);

export type SyncRecord = typeof syncRecords.$inferSelect;
export type NewSyncRecord = typeof syncRecords.$inferInsert;
