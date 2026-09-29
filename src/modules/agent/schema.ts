/**
 * Agent module schema — API keys with scopes and the draft store that backs the
 * draft+confirm write flow (docs/04 §5.1, modelled on luma-mcp safety patterns).
 */
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { enumOf, idPk, jsonCol, oneOf, tsAt, tsNow, tsOpt } from '../../lib/db/sqlite';

export const agentDraftStatusValues = ['open', 'confirmed', 'canceled', 'expired'] as const;
export const agentDraftStatus = enumOf(agentDraftStatusValues);
export type AgentDraftStatus = (typeof agentDraftStatus.enumValues)[number];

export const agentKeys = sqliteTable(
  'agent_keys',
  {
    id: idPk(),
    name: text('name').notNull(),
    /** SHA-256 of the secret; the secret itself is shown once on creation. */
    keyHash: text('key_hash').notNull().unique(),
    scopes: jsonCol<string[]>('scopes', '[]'),
    /** Optional member binding: writes are attributed to this member. */
    memberId: text('member_id'),
    lastUsedAt: tsOpt('last_used_at'),
    revokedAt: tsOpt('revoked_at'),
    createdAt: tsNow('created_at'),
  },
  (t) => [index('agent_keys_hash_idx').on(t.keyHash)],
);

export const agentDrafts = sqliteTable(
  'agent_drafts',
  {
    id: idPk(),
    keyId: text('key_id')
      .notNull()
      .references(() => agentKeys.id, { onDelete: 'cascade' }),
    /** create_event | cancel_event | create_booking */
    action: text('action').notNull(),
    payload: jsonCol<Record<string, unknown>>('payload'),
    /** Human-readable preview returned to the agent before confirmation. */
    preview: jsonCol<Record<string, unknown>>('preview'),
    status: text('status').$type<AgentDraftStatus>().notNull().default('open'),
    /** Set when confirmed: the created entity id. */
    resultEntityId: text('result_entity_id'),
    expiresAt: tsAt('expires_at'),
    confirmedAt: tsOpt('confirmed_at'),
    createdAt: tsNow('created_at'),
  },
  (t) => [index('agent_drafts_key_idx').on(t.keyId, t.status), check('agent_drafts_status_check', oneOf(t.status, agentDraftStatusValues))],
);

export type AgentKey = typeof agentKeys.$inferSelect;
export type AgentDraft = typeof agentDrafts.$inferSelect;
