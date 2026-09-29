/**
 * Auth schema — this system's own email registration/verification/login.
 *
 * Per the revised system boundary (docs/02 §1.2 v3): CommunityOS owns email
 * registration and verification itself; CAS is the extension layer for on-chain
 * account mapping, points authority, check-in tokens and NFT records.
 */
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { idPk, oneOf, tsAt, tsNow, tsOpt } from '../../lib/db/sqlite';

export const authTokenPurpose = ['verify_email', 'login'] as const;
export type AuthTokenPurpose = (typeof authTokenPurpose)[number];

export const authTokens = sqliteTable('auth_tokens', {
  id: idPk(),
  email: text('email').notNull(),
  purpose: text('purpose').$type<AuthTokenPurpose>().notNull(),
  /** SHA-256 of the opaque token; the raw token only ever exists in the email. */
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: tsAt('expires_at'),
  consumedAt: tsOpt('consumed_at'),
  createdAt: tsNow('created_at'),
}, (t) => [check('auth_tokens_purpose_check', oneOf(t.purpose, authTokenPurpose))]);

export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
