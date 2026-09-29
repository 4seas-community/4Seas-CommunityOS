/**
 * Admin audit query service (docs/10 §3 batch 2.6).
 * Gated strictly to community admins (contains IP, UA, and PII in before/after).
 * Uses stable (created_at, id) cursor pagination.
 */
import { and, desc, eq, gte, inArray, like, lt, lte, or } from 'drizzle-orm';
import { db } from '../../lib/db';
import { auditLogs, type AuditActorType, type AuditLog } from '../../lib/db/audit-schema';
import { members } from '../people/schema';
import { agentKeys } from '../agent/schema';
import type { SessionPayload } from '../../lib/auth/session';
import { requireRole } from '../../lib/auth/roles';

export interface AuditQueryFilter {
  actorType?: AuditActorType;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}

export interface AuditLogRow extends AuditLog {
  actorDisplay: string | null;
}

export interface AuditQueryResult {
  logs: AuditLogRow[];
  nextCursor: string | null;
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.getTime()}_${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const [timeStr, id] = raw.split('_');
    const time = parseInt(timeStr, 10);
    if (isNaN(time) || !id) return null;
    return { createdAt: new Date(time), id };
  } catch {
    return null;
  }
}

export async function listAuditLogs(
  filter: AuditQueryFilter,
  session: SessionPayload,
): Promise<AuditQueryResult> {
  requireRole(session, 'admin');

  const conditions = [];

  if (filter.actorType) {
    conditions.push(eq(auditLogs.actorType, filter.actorType));
  }
  if (filter.actorId) {
    conditions.push(eq(auditLogs.actorId, filter.actorId));
  }
  if (filter.action) {
    conditions.push(like(auditLogs.action, `%${filter.action}%`));
  }
  if (filter.entityType) {
    conditions.push(eq(auditLogs.entityType, filter.entityType));
  }
  if (filter.entityId) {
    conditions.push(eq(auditLogs.entityId, filter.entityId));
  }
  if (filter.from) {
    conditions.push(gte(auditLogs.createdAt, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(auditLogs.createdAt, filter.to));
  }

  if (filter.cursor) {
    const decoded = decodeCursor(filter.cursor);
    if (decoded) {
      conditions.push(
        or(
          lt(auditLogs.createdAt, decoded.createdAt),
          and(eq(auditLogs.createdAt, decoded.createdAt), lt(auditLogs.id, decoded.id)),
        ),
      );
    }
  }

  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Resolve actor labels for UI readability
  const userIds = [...new Set(pageRows.filter((r) => r.actorType === 'user' && r.actorId).map((r) => r.actorId!))];
  const agentKeyIds = [...new Set(pageRows.filter((r) => r.actorType === 'agent' && r.actorId).map((r) => r.actorId!))];

  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const userRows = await db.select().from(members).where(inArray(members.id, userIds));
    for (const u of userRows) {
      userMap.set(u.id, u.displayName ? `${u.displayName} (${u.email})` : u.email);
    }
  }

  const agentMap = new Map<string, string>();
  if (agentKeyIds.length > 0) {
    const keyRows = await db.select().from(agentKeys).where(inArray(agentKeys.id, agentKeyIds));
    for (const k of keyRows) {
      agentMap.set(k.id, `${k.name} (agent key)`);
    }
  }

  const logs: AuditLogRow[] = pageRows.map((r) => {
    let actorDisplay: string | null = null;
    if (r.actorType === 'user' && r.actorId) {
      actorDisplay = userMap.get(r.actorId) ?? r.actorId;
    } else if (r.actorType === 'agent' && r.actorId) {
      actorDisplay = agentMap.get(r.actorId) ?? r.actorId;
    } else if (r.actorType === 'system' || r.actorType === 'service' || r.actorType === 'anonymous') {
      actorDisplay = r.actorType;
    }
    return {
      ...r,
      actorDisplay,
    };
  });

  const nextCursor = hasMore && pageRows.length > 0 ? encodeCursor(pageRows[pageRows.length - 1]) : null;

  return { logs, nextCursor };
}
