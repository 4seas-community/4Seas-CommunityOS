/**
 * Agent service — key auth, scopes, and the draft+confirm write flow.
 *
 * Safety baseline (docs/04 §5.1): reads execute directly; every write goes
 * through a draft that expires (1h) and can only be confirmed once. All agent
 * actions are audited with the draft id.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db';
import { writeAudit } from '../../lib/audit';
import { agentDrafts, agentKeys, type AgentDraft, type AgentKey } from './schema';

export const DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour

export const AGENT_SCOPES = ['venues:read', 'events:read', 'events:write', 'bookings:write'] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Create a key; the secret is returned once and never stored in clear. */
export async function createKey(input: { name: string; scopes: AgentScope[]; memberId?: string | null }) {
  const secret = 'cos_ak_' + randomBytes(24).toString('base64url');
  const [row] = await db
    .insert(agentKeys)
    .values({ name: input.name, keyHash: hashSecret(secret), scopes: input.scopes, memberId: input.memberId ?? null })
    .returning();
  await writeAudit({ actorType: 'system', action: 'agent_key.create', entityType: 'agent_key', entityId: row.id, after: { name: input.name, scopes: input.scopes } });
  return { keyId: row.id, secret };
}

export async function revokeKey(id: string): Promise<void> {
  await db.update(agentKeys).set({ revokedAt: new Date() }).where(eq(agentKeys.id, id));
  await writeAudit({ actorType: 'system', action: 'agent_key.revoke', entityType: 'agent_key', entityId: id });
}

/** Resolve a bearer secret to its key row (or null when invalid/revoked). */
export async function authenticate(secret: string): Promise<AgentKey | null> {
  if (!secret) return null;
  const [row] = await db.select().from(agentKeys).where(eq(agentKeys.keyHash, hashSecret(secret))).limit(1);
  if (!row || row.revokedAt) return null;
  await db.update(agentKeys).set({ lastUsedAt: new Date() }).where(eq(agentKeys.id, row.id));
  return row;
}

export function hasScope(key: AgentKey, scope: AgentScope): boolean {
  return key.scopes.includes(scope);
}

/** Open a draft. Nothing is written to the domain tables until confirm. */
export async function openDraft(input: {
  key: AgentKey;
  action: 'create_event' | 'cancel_event' | 'create_booking';
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
}): Promise<AgentDraft> {
  const [row] = await db
    .insert(agentDrafts)
    .values({
      keyId: input.key.id,
      action: input.action,
      payload: input.payload,
      preview: input.preview,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    })
    .returning();
  await writeAudit({
    actorType: 'agent',
    actorId: input.key.id,
    action: 'agent_draft.open:' + input.action,
    entityType: 'agent_draft',
    entityId: row.id,
    after: { preview: input.preview },
    draftId: row.id,
  });
  return row;
}

export type DraftState = 'open' | 'expired' | 'confirmed' | 'canceled';

export function draftState(draft: AgentDraft): DraftState {
  if (draft.status !== 'open') return draft.status as DraftState;
  return draft.expiresAt.getTime() < Date.now() ? 'expired' : 'open';
}

/** Load a draft for confirmation, enforcing ownership + single use + expiry. */
export async function takeDraftForConfirm(draftId: string, key: AgentKey): Promise<AgentDraft> {
  const [draft] = await db.select().from(agentDrafts).where(eq(agentDrafts.id, draftId)).limit(1);
  if (!draft || draft.keyId !== key.id) throw new Error('draft not found');
  const state = draftState(draft);
  if (state === 'confirmed') throw new Error('draft already confirmed');
  if (state === 'canceled') throw new Error('draft was canceled');
  if (state === 'expired') {
    await db.update(agentDrafts).set({ status: 'expired' }).where(eq(agentDrafts.id, draft.id));
    throw new Error('draft expired');
  }
  return draft;
}

export async function markConfirmed(draftId: string, entityId: string): Promise<AgentDraft> {
  const [row] = await db
    .update(agentDrafts)
    .set({ status: 'confirmed', confirmedAt: new Date(), resultEntityId: entityId })
    .where(eq(agentDrafts.id, draftId))
    .returning();
  await writeAudit({
    actorType: 'agent',
    actorId: row.keyId,
    action: 'agent_draft.confirm:' + row.action,
    entityType: 'agent_draft',
    entityId: draftId,
    after: { resultEntityId: entityId },
    draftId,
  });
  return row;
}

/** Idempotent cancel: canceling an already-canceled draft is a no-op. */
export async function cancelDraft(draftId: string, key: AgentKey): Promise<AgentDraft> {
  const [draft] = await db.select().from(agentDrafts).where(eq(agentDrafts.id, draftId)).limit(1);
  if (!draft || draft.keyId !== key.id) throw new Error('draft not found');
  if (draft.status === 'confirmed') throw new Error('draft already confirmed');
  if (draft.status === 'canceled') return draft;
  const [row] = await db
    .update(agentDrafts)
    .set({ status: 'canceled' })
    .where(and(eq(agentDrafts.id, draftId), eq(agentDrafts.status, 'open')))
    .returning();
  return row ?? draft;
}
