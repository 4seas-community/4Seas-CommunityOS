/**
 * Program (theme) schema. Referenced by events.program_id (docs/03 §1 domain map).
 */
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Program = typeof programs.$inferSelect;
