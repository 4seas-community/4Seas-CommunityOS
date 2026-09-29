/**
 * Integration module schema — outbound one-way publish records (Luma / Social Layer).
 * Source of truth: docs/03-domain-model.md §2.5 (SyncRecord) + docs/04-integrations.md.
 * External platform ids only ever live here — never on core entities (invariant #4).
 */
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { enumOf, idPk, oneOf, tsNow, tsOpt } from '../../lib/db/sqlite';

export const syncPlatformValues = ['luma', 'social_layer'] as const;
export const syncPlatform = enumOf(syncPlatformValues);
export type SyncPlatform = (typeof syncPlatform.enumValues)[number];

export const syncStatusValues = ['pending', 'syncing', 'synced', 'failed', 'dead_letter', 'canceled', 'outdated'] as const;
export const syncStatus = enumOf(syncStatusValues);
export type SyncStatus = (typeof syncStatus.enumValues)[number];

export const syncRecords = sqliteTable(
  'sync_records',
  {
    id: idPk(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    platform: text('platform').$type<SyncPlatform>().notNull(),
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    status: text('status').$type<SyncStatus>().notNull().default('pending'),
    lastError: text('last_error'),
    syncedAt: tsOpt('synced_at'),
    createdAt: tsNow('created_at'),
    updatedAt: tsNow('updated_at'),
  },
  (t) => [
    uniqueIndex('sync_records_entity_platform_unique').on(t.entityType, t.entityId, t.platform),
    index('sync_records_status_idx').on(t.status),
    check('sync_records_platform_check', oneOf(t.platform, syncPlatformValues)),
    check('sync_records_status_check', oneOf(t.status, syncStatusValues)),
  ],
);

export type SyncRecord = typeof syncRecords.$inferSelect;
export type NewSyncRecord = typeof syncRecords.$inferInsert;
