/**
 * Admin service — the operations console backend (docs/02 §3 运营后台).
 *
 * Covers the capabilities that were missing at audit time (docs/10):
 *   - member directory (mirror of CAS identity + local roles)
 *   - role grant/revoke  (without this nobody could ever become an admin)
 *   - points adjustment  (executed in CAS, mirrored locally)
 *
 * Every function is admin-gated at the service layer, not only the route.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { members, pointsLedgerLocal, pointsMirror, type Member } from '../people/schema';
import { requireRole } from '../../lib/auth/roles';
import type { SessionPayload } from '../../lib/auth/session';
import { writeAudit } from '../../lib/audit';
import { badRequest, notFound, unprocessable } from '../../lib/errors';
import { casClient } from '../cas';

export const ASSIGNABLE_ROLES = ['admin', 'venue_manager', 'host', 'member'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface RoleEntry {
  scope: string;
  role: string;
}

function requireAdmin(actor: SessionPayload): void {
  requireRole(actor, 'admin');
}

/** Member directory with roles, verification state and points balance. */
export async function listMembers(actor: SessionPayload) {
  requireAdmin(actor);
  const rows = await db.select().from(members);
  const mirrors = await db.select().from(pointsMirror);
  const mirrorByMember = new Map(mirrors.map((m) => [m.memberId, m.balance]));
  return rows
    .map((m) => ({
      id: m.id,
      email: m.email,
      displayName: m.displayName,
      emailVerified: Boolean(m.emailVerifiedAt),
      tier: m.tier,
      status: m.status,
      roles: m.roles as RoleEntry[],
      telegram: m.telegramId ? { id: m.telegramId, username: m.telegramUsername } : null,
      walletAddress: m.walletAddress,
      pointsBalance: mirrorByMember.get(m.id) ?? 0,
      createdAt: m.createdAt,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Grant a role on a scope.
 *
 * Scopes: "community:*" (global) or "venue:<uuid>" (single venue). Roles are
 * stored on the member row (docs/03 §2.4) and are additive/idempotent.
 */
export async function grantRole(memberId: string, entry: RoleEntry, actor: SessionPayload): Promise<Member> {
  requireAdmin(actor);
  validateRole(entry);
  const member = await loadMember(memberId);
  const roles = member.roles as RoleEntry[];
  if (roles.some((r) => r.role === entry.role && r.scope === entry.scope)) return member;
  const next = [...roles, entry];
  const updated = await updateRoles(member, next);
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/admin/members/' + memberId + '/roles',
    entityType: 'member',
    entityId: memberId,
    before: { roles },
    after: { roles: next },
  });
  return updated;
}

export async function revokeRole(memberId: string, entry: RoleEntry, actor: SessionPayload): Promise<Member> {
  requireAdmin(actor);
  validateRole(entry);
  const member = await loadMember(memberId);
  const roles = member.roles as RoleEntry[];
  const next = roles.filter((r) => !(r.role === entry.role && r.scope === entry.scope));
  if (next.length === roles.length) return member;
  // Never allow removing the last admin — the console would become unreachable.
  if (entry.role === 'admin' && !next.some((r) => r.role === 'admin')) {
    throw unprocessable('cannot revoke the last admin role');
  }
  const updated = await updateRoles(member, next);
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'DELETE /api/admin/members/' + memberId + '/roles',
    entityType: 'member',
    entityId: memberId,
    before: { roles },
    after: { roles: next },
  });
  return updated;
}

/**
 * Adjust a member's points. CAS is the authority (docs/03 §5): the change is
 * executed there first, then mirrored locally so the console reflects it.
 */
export async function adjustPoints(
  memberId: string,
  input: { delta: number; reason: string; refType?: string | null; refId?: string | null },
  actor: SessionPayload,
) {
  requireAdmin(actor);
  if (!Number.isInteger(input.delta) || input.delta === 0) throw badRequest('delta must be a non-zero integer');
  const member = await loadMember(memberId);
  const key = member.casUserId ?? member.id;
  const result = await casClient().adjustPoints(key, {
    delta: input.delta,
    reason: input.reason,
    refType: input.refType ?? 'admin_adjust',
    refId: input.refId ?? actor.sub,
  });
  await db.insert(pointsLedgerLocal).values({
    memberId: member.id,
    delta: input.delta,
    reason: input.reason,
    refType: input.refType ?? 'admin_adjust',
    refId: input.refId ?? actor.sub,
  });
  const [existing] = await db.select().from(pointsMirror).where(eq(pointsMirror.memberId, member.id)).limit(1);
  if (existing) {
    await db
      .update(pointsMirror)
      .set({ balance: result.balance, updatedAt: new Date() })
      .where(eq(pointsMirror.memberId, member.id));
  } else {
    await db.insert(pointsMirror).values({ memberId: member.id, balance: result.balance });
  }
  await writeAudit({
    actorType: 'user',
    actorId: actor.sub,
    action: 'POST /api/admin/members/' + memberId + '/points',
    entityType: 'member',
    entityId: memberId,
    after: { delta: input.delta, reason: input.reason, balance: result.balance },
  });
  return { memberId, balance: result.balance, delta: input.delta };
}

/** Counters shown on the console dashboard. */
export async function overview(actor: SessionPayload) {
  requireAdmin(actor);
  const rows = await db.select().from(members);
  const mirrors = await db.select().from(pointsMirror);
  return {
    members: {
      total: rows.length,
      verified: rows.filter((m) => m.emailVerifiedAt).length,
      admins: rows.filter((m) => (m.roles as RoleEntry[]).some((r) => r.role === 'admin')).length,
      venueManagers: rows.filter((m) => (m.roles as RoleEntry[]).some((r) => r.role === 'venue_manager')).length,
    },
    points: {
      accounts: mirrors.length,
      totalBalance: mirrors.reduce((sum, m) => sum + m.balance, 0),
    },
  };
}

// ---------------------------------------------------------------- helpers

function validateRole(entry: RoleEntry): void {
  if (!ASSIGNABLE_ROLES.includes(entry.role as AssignableRole)) {
    throw unprocessable('unknown role: ' + entry.role + ' (allowed: ' + ASSIGNABLE_ROLES.join(', ') + ')');
  }
  if (!/^[a-z_]+:(\*|[0-9a-fA-F-]{36})$/.test(entry.scope)) {
    throw unprocessable('scope must look like "community:*" or "venue:<uuid>"');
  }
}

async function loadMember(memberId: string): Promise<Member> {
  const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!member) throw notFound('Member not found');
  return member;
}

async function updateRoles(member: Member, roles: RoleEntry[]): Promise<Member> {
  const [updated] = await db
    .update(members)
    .set({ roles, updatedAt: new Date() })
    .where(eq(members.id, member.id))
    .returning();
  return updated;
}
