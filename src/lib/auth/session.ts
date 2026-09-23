/**
 * This system's own session (JWT in an httpOnly cookie).
 * Email identity is owned locally (docs/02 §1.2 v3); the CAS extension mapping
 * lives on the member row. Payload carries local member_id + email + roles.
 */
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';
import { unauthorized } from '../errors';

export const SESSION_COOKIE = 'cos_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  /** local member id (subject) */
  sub: string;
  email: string;
  roles: Array<{ scope: string; role: string }>;
}

const secret = new TextEncoder().encode(config.sessionSecret);

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ''),
      roles: Array.isArray(payload.roles) ? (payload.roles as SessionPayload['roles']) : [],
    };
  } catch {
    return null;
  }
}

export async function getSession(req: Request): Promise<SessionPayload | null> {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return verifySession(decodeURIComponent(v.join('=')));
  }
  return null;
}

export function sessionCookie(token: string): string {
  const attrs = [
    SESSION_COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + SESSION_TTL_SECONDS,
  ];
  if (config.appUrl.startsWith('https://')) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearedSessionCookie(): string {
  return SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function requireSession(session: SessionPayload | null): SessionPayload {
  if (!session) throw unauthorized();
  return session;
}