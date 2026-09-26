/**
 * People module schema — members with locally-owned email identity plus the
 * CAS extension layer (on-chain account mapping, points mirror).
 *
 * Revised boundary (docs/02 §1.2 v3): this system owns email
 * registration/verification (emailVerifiedAt). CAS is the extension account:
 * casUserId + walletAddress are the mapping to blockchain accounts; points
 * mirror is read-only with CAS/on-chain as the authority (docs/03 §5).
 */
import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const memberStatus = pgEnum('member_status', ['active', 'suspended']);

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** CAS account id — set once the member links their on-chain account (extension layer). */
  casUserId: text('cas_user_id').unique(),
  email: text('email').notNull().unique(),
  /** Local email verification (this system is the email identity authority). */
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  telegramId: text('telegram_id').unique(),
  telegramUsername: text('telegram_username'),
  /** On-chain account mapping (mirror; CAS/chain is the authority, V2). */
  walletAddress: text('wallet_address'),
  tier: text('tier').notNull().default('member'),
  status: memberStatus('status').notNull().default('active'),
  /** e.g. [{ "scope": "venue:*", "role": "venue_manager" }, { "scope": "community:*", "role": "admin" }] */
  roles: jsonb('roles').$type<Array<{ scope: string; role: string }>>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pointsMirror = pgTable('points_mirror', {
  memberId: uuid('member_id')
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastSyncedLedgerId: text('last_synced_ledger_id'),
});

export const pointsLedgerLocal = pgTable('points_ledger_local', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  refType: text('ref_type'),
  refId: text('ref_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type PointsMirror = typeof pointsMirror.$inferSelect;
export type PointsLedgerLocal = typeof pointsLedgerLocal.$inferSelect;
