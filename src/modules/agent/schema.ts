/**
 * Agent module schema — API keys with scopes and the draft store that backs the
 * draft+confirm write flow (docs/04 §5.1, modelled on luma-mcp safety patterns).
 */
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';

export const agentDraftStatus = pgEnum('agent_draft_status', ['open', 'confirmed', 'canceled', 'expired']);

export const agentKeys = pgTable(
  'agent_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** SHA-256 of the secret; the secret itself is shown once on creation. */
    keyHash: text('key_hash').notNull().unique(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    /** Optional member binding: writes are attributed to this member. */
    memberId: uuid('member_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_keys_hash_idx').on(t.keyHash)],
);

export const agentDrafts = pgTable(
  'agent_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keyId: uuid('key_id')
      .notNull()
      .references(() => agentKeys.id, { onDelete: 'cascade' }),
    /** create_event | cancel_event | create_booking */
    action: text('action').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Human-readable preview returned to the agent before confirmation. */
    preview: jsonb('preview').$type<Record<string, unknown>>().notNull().default({}),
    status: agentDraftStatus('status').notNull().default('open'),
    /** Set when confirmed: the created entity id. */
    resultEntityId: text('result_entity_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_drafts_key_idx').on(t.keyId, t.status)],
);

export type AgentKey = typeof agentKeys.$inferSelect;
export type AgentDraft = typeof agentDrafts.$inferSelect;
