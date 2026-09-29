/**
 * Audit log table — every write operation (human / agent / service) is recorded.
 * Source of truth: docs/03-domain-model.md §2.5 (AuditLog) + §4.5.
 */
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { enumOf, idPk, jsonOpt, oneOf, tsNow } from './sqlite';

export const auditActorTypeValues = ['user', 'agent', 'service', 'system', 'anonymous'] as const;
export const auditActorType = enumOf(auditActorTypeValues);
export type AuditActorType = (typeof auditActorType.enumValues)[number];

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: idPk(),
    actorType: text('actor_type').$type<AuditActorType>().notNull().default('anonymous'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    before: jsonOpt<Record<string, unknown> | null>('before'),
    after: jsonOpt<Record<string, unknown> | null>('after'),
    /** Agent draft id when the write came from a draft+confirm flow (docs/03 §4.5). */
    draftId: text('draft_id'),
    ip: text('ip'),
    ua: text('ua'),
    createdAt: tsNow('created_at'),
  },
  (t) => [
    index('audit_logs_created_at_idx').on(t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    check('audit_logs_actor_type_check', oneOf(t.actorType, auditActorTypeValues)),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
