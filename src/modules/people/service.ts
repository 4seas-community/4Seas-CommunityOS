/**
 * People service — local email identity + CAS extension mapping.
 *
 * Email registration/verification is owned by this system (docs/02 §1.2 v3).
 * CAS provides: on-chain account mapping (casUserId/walletAddress), points
 * authority (mirrored read-only here), check-in tokens, NFT records.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '../../lib/db';
import { members, pointsMirror, pointsLedgerLocal, type Member } from './schema';
import { casClient } from '../cas';

/** Create a member from local email registration (unverified until email check). */
export async function createMember(input: {
  email: string;
  displayName: string | null;
  timezone: string;
}): Promise<Member> {
  const [created] = await db
    .insert(members)
    .values({
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      timezone: input.timezone,
      roles: [{ scope: 'community:*', role: 'member' }],
    })
    .returning();
  await ensurePointsMirror(created.id);
  return created;
}

export async function findMemberByEmail(email: string): Promise<Member | null> {
  const [m] = await db.select().from(members).where(eq(members.email, email.toLowerCase())).limit(1);
  return m ?? null;
}

export async function markEmailVerified(memberId: string): Promise<Member> {
  const [updated] = await db
    .update(members)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

/** Link the CAS/on-chain account (extension layer). Idempotent per member. */
export async function applyAccountExtension(
  memberId: string,
  ext: { casUserId?: string; walletAddress?: string },
): Promise<Member> {
  const [updated] = await db
    .update(members)
    .set({ ...ext, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

async function ensurePointsMirror(memberId: string): Promise<void> {
  await db.insert(pointsMirror).values({ memberId }).onConflictDoNothing();
}

/**
 * Pull the points balance from CAS into the read-only local mirror (docs/03 §5).
 * Until a member links their CAS/on-chain account, the mock/dev client keys the
 * balance by the local member id.
 */
export async function syncPointsFromCas(member: Member) {
  const cas = await casClient().getPoints(member.casUserId ?? member.id);
  const [existing] = await db.select().from(pointsMirror).where(eq(pointsMirror.memberId, member.id)).limit(1);
  if (!existing) {
    const [row] = await db.insert(pointsMirror).values({ memberId: member.id, balance: cas.balance }).returning();
    return row;
  }
  if (existing.balance !== cas.balance) {
    const delta = cas.balance - existing.balance;
    await db.insert(pointsLedgerLocal).values({
      memberId: member.id,
      delta,
      reason: 'manual_adjust',
      refType: 'cas_sync',
    });
    const [row] = await db
      .update(pointsMirror)
      .set({ balance: cas.balance, updatedAt: new Date() })
      .where(eq(pointsMirror.memberId, member.id))
      .returning();
    return row;
  }
  return existing;
}

export async function getMember(memberId: string): Promise<Member> {
  const [m] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!m) throw new Error('member not found: ' + memberId);
  return m;
}

export async function getMeBundle(memberId: string) {
  const member = await getMember(memberId);
  const [mirror] = await db.select().from(pointsMirror).where(eq(pointsMirror.memberId, memberId)).limit(1);
  const ledger = await db
    .select()
    .from(pointsLedgerLocal)
    .where(eq(pointsLedgerLocal.memberId, memberId))
    .orderBy(desc(pointsLedgerLocal.createdAt))
    .limit(50);
  return { member, points: mirror ?? { memberId, balance: 0, updatedAt: new Date(0), lastSyncedLedgerId: null }, ledger };
}

/** Update the local profile (this system owns the profile mirror). */
export async function applyProfilePatch(memberId: string, patch: { displayName?: string; avatarUrl?: string; timezone?: string; bio?: string }) {
  const [updated] = await db
    .update(members)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

/** Bind Telegram after local initData verification (docs/04 §4). */
export async function applyTelegramBinding(memberId: string, telegram: { id: string; username: string | null }) {
  const clash = await db.select().from(members).where(eq(members.telegramId, telegram.id)).limit(1);
  if (clash[0] && clash[0].id !== memberId) {
    throw new Error('telegram account already bound to another member');
  }
  const [updated] = await db
    .update(members)
    .set({ telegramId: telegram.id, telegramUsername: telegram.username, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

/**
 * Unbind Telegram by setting the column to NULL.
 *
 * The previous version wrote an empty string, which collided with the unique
 * index on the second unbind ("telegram account already bound…" / 23505) — the
 * first member to unbind effectively blocked everyone else.
 */
export async function clearTelegramBinding(memberId: string): Promise<Member> {
  const [updated] = await db
    .update(members)
    .set({ telegramId: null, telegramUsername: null, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return updated;
}

export function publicMember(m: Member) {
  return {
    id: m.id,
    email: m.email,
    emailVerified: Boolean(m.emailVerifiedAt),
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    bio: m.bio,
    timezone: m.timezone,
    tier: m.tier,
    status: m.status,
    roles: m.roles,
    casUserId: m.casUserId,
    walletAddress: m.walletAddress,
    telegram: m.telegramId ? { bound: true, id: m.telegramId, username: m.telegramUsername } : null,
  };
}