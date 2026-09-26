/**
 * Audit log table — every write operation (human / agent / service) is recorded.
 * Source of truth: docs/03-domain-model.md §2.5 (AuditLog) + §4.5.
 */
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';

export const auditActorType = pgEnum('audit_actor_type', ['user', 'agent', 'service', 'system', 'anonymous']);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: auditActorType('actor_type').notNull().default('anonymous'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    /** Agent draft id when the write came from a draft+confirm flow (docs/03 §4.5). */
    draftId: text('draft_id'),
    ip: text('ip'),
    ua: text('ua'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_created_at_idx').on(t.createdAt), index('audit_logs_entity_idx').on(t.entityType, t.entityId)],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
