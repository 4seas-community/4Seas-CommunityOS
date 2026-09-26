/**
 * Audit logging — every write operation (human / agent / service) is recorded
 * (docs/03 §4.5). The router middleware writes a row for every mutating request;
 * services write richer before/after rows for state transitions and set the
 * `x-audit-logged` response header so the generic row is skipped.
 */
import { db } from './db';
import { auditLogs } from './db/audit-schema';
import type { auditActorType } from './db/audit-schema';

export interface AuditEntry {
  actorType: (typeof auditActorType.enumValues)[number];
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  draftId?: string | null;
  ip?: string | null;
  ua?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    draftId: entry.draftId ?? null,
    ip: entry.ip ?? null,
    ua: entry.ua ?? null,
  });
}
