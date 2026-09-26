/**
 * Auth service — email registration, verification and magic-link login.
 *
 * Authority model (docs/02 §1.2 v3, docs/03 §2.4):
 *   - This system owns email identity: register -> verify email -> login.
 *   - CAS is the extension layer: on-chain account mapping (walletAddress),
 *     points authority, check-in tokens, NFT records.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '../../lib/db';
import { config, isDevelopment } from '../../lib/config';
import { sendEmail } from '../../lib/email';
import { conflict, badRequest, unauthorized } from '../../lib/errors';
import { authTokens, type AuthToken } from './schema';
import * as people from '../people/service';

const VERIFY_TTL_HOURS = 24;
const LOGIN_TTL_MINUTES = 15;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

async function issueToken(email: string, purpose: 'verify_email' | 'login'): Promise<string> {
  const raw = newToken();
  const ttl = purpose === 'verify_email' ? VERIFY_TTL_HOURS * 3600 * 1000 : LOGIN_TTL_MINUTES * 60 * 1000;
  await db.insert(authTokens).values({
    email: email.toLowerCase(),
    purpose,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
  });
  return raw;
}

/**
 * Consume a one-time token.
 *
 * The claim is a single conditional UPDATE (… WHERE consumed_at IS NULL) so two
 * concurrent requests can never both succeed — the previous read-then-write let
 * a raced token be used more than once.
 */
async function consumeToken(raw: string, purpose: 'verify_email' | 'login'): Promise<string> {
  const [claimed] = await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(raw)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning();

  if (claimed) return claimed.email;

  // Nothing claimed: distinguish invalid / already used / expired for the caller.
  const [token] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(raw)), eq(authTokens.purpose, purpose)))
    .limit(1);
  if (!token) throw unauthorized('invalid token');
  if (token.consumedAt) throw unauthorized('token already used');
  throw badRequest('token expired', { code: 'token_expired' });
}

/** Register with an email. Creates an unverified member and sends the verification link. */
export async function register(input: { email: string; displayName?: string; timezone?: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await people.findMemberByEmail(email);
  if (existing?.emailVerifiedAt) throw conflict('email already registered');
  const member =
    existing ??
    (await people.createMember({
      email,
      displayName: input.displayName ?? null,
      timezone: input.timezone ?? config.defaultTimezone,
    }));
  const token = await issueToken(email, 'verify_email');
  await sendEmail({
    to: email,
    subject: 'Verify your 4Seas account',
    body: 'Verify your account: ' + config.appUrl + '/verify-email?token=' + token,
  });
  return { memberId: member.id, email, status: 'unverified' as const };
}

/** Consume a verification token; the member becomes a verified community member. */
export async function verifyEmail(token: string) {
  const email = await consumeToken(token, 'verify_email');
  const member = await people.findMemberByEmail(email);
  if (!member) throw unauthorized('account not found');
  const updated = await people.markEmailVerified(member.id);
  return { memberId: updated.id, email: updated.email, verified: true };
}

/** Always returns success from the caller's perspective (no account enumeration). */
export async function requestLogin(email: string): Promise<{ devToken?: string }> {
  const normalized = email.trim().toLowerCase();
  const member = await people.findMemberByEmail(normalized);
  if (member?.emailVerifiedAt) {
    const token = await issueToken(normalized, 'login');
    await sendEmail({
      to: normalized,
      subject: 'Your 4Seas login link',
      body: 'Login: ' + config.appUrl + '/login/verify?token=' + token,
    });
    // Dev convenience ONLY: with the console email backend the token is already
    // written to the server log, so returning it over HTTP adds no new exposure.
    // In production this must never happen — that would be account takeover.
    if (isDevelopment && config.emailBackend !== 'smtp') return { devToken: token };
  }
  return {};
}

/** Consume a login token and return the member to sign a session for. */
export async function verifyLogin(token: string) {
  const email = await consumeToken(token, 'login');
  const member = await people.findMemberByEmail(email);
  if (!member?.emailVerifiedAt) throw unauthorized('email not verified');
  return member;
}

/** Housekeeping: drop expired tokens (called by the lifecycle job). */
export async function purgeExpiredTokens(): Promise<number> {
  const rows = await db.select().from(authTokens).where(lt(authTokens.expiresAt, new Date()));
  for (const row of rows) {
    await db.delete(authTokens).where(eq(authTokens.id, row.id));
  }
  return rows.length;
}

export type { AuthToken };
