/**
 * People module schema — members with locally-owned email identity plus the
 * CAS extension layer (on-chain account mapping, points mirror).
 *
 * Revised boundary (docs/02 §1.2 v3): this system owns email
 * registration/verification (emailVerifiedAt). CAS is the extension account:
 * casUserId + walletAddress are the mapping to blockchain accounts; points
 * mirror is read-only with CAS/on-chain as the authority (docs/03 §5).
 */
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { enumOf, idPk, jsonCol, oneOf, tsNow, tsOpt } from '../../lib/db/sqlite';

export const memberStatusValues = ['active', 'suspended'] as const;
export const memberStatus = enumOf(memberStatusValues);
export type MemberStatus = (typeof memberStatus.enumValues)[number];

export const members = sqliteTable('members', {
  id: idPk(),
  /** CAS account id — set once the member links their on-chain account (extension layer). */
  casUserId: text('cas_user_id').unique(),
  email: text('email').notNull().unique(),
  /** Local email verification (this system is the email identity authority). */
  emailVerifiedAt: tsOpt('email_verified_at'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  telegramId: text('telegram_id').unique(),
  telegramUsername: text('telegram_username'),
  /** On-chain account mapping (mirror; CAS/chain is the authority, V2). */
  walletAddress: text('wallet_address'),
  tier: text('tier').notNull().default('member'),
  status: text('status').$type<MemberStatus>().notNull().default('active'),
  /** e.g. [{ "scope": "venue:*", "role": "venue_manager" }, { "scope": "community:*", "role": "admin" }] */
  roles: jsonCol<Array<{ scope: string; role: string }>>('roles', '[]'),
  createdAt: tsNow('created_at'),
  updatedAt: tsNow('updated_at'),
}, (t) => [check('members_status_check', oneOf(t.status, memberStatusValues))]);

export const pointsMirror = sqliteTable('points_mirror', {
  memberId: text('member_id')
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  updatedAt: tsNow('updated_at'),
  lastSyncedLedgerId: text('last_synced_ledger_id'),
});

export const pointsLedgerLocal = sqliteTable('points_ledger_local', {
  id: idPk(),
  memberId: text('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  refType: text('ref_type'),
  refId: text('ref_id'),
  createdAt: tsNow('created_at'),
});

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type PointsMirror = typeof pointsMirror.$inferSelect;
export type PointsLedgerLocal = typeof pointsLedgerLocal.$inferSelect;
