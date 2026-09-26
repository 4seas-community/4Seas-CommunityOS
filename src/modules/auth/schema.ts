/**
 * Auth schema — this system's own email registration/verification/login.
 *
 * Per the revised system boundary (docs/02 §1.2 v3): CommunityOS owns email
 * registration and verification itself; CAS is the extension layer for on-chain
 * account mapping, points authority, check-in tokens and NFT records.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const authTokenPurpose = ['verify_email', 'login'] as const;

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  purpose: text('purpose').$type<(typeof authTokenPurpose)[number]>().notNull(),
  /** SHA-256 of the opaque token; the raw token only ever exists in the email. */
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
