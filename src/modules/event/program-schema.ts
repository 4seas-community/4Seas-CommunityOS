/**
 * Program (theme) schema. Referenced by events.program_id (docs/03 §1 domain map).
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { idPk, tsNow } from '../../lib/db/sqlite';

export const programs = sqliteTable('programs', {
  id: idPk(),
  communityId: text('community_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: tsNow('created_at'),
});

export type Program = typeof programs.$inferSelect;
