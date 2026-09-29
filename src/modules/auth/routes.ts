/**
 * Auth routes — email registration, verification and magic-link login.
 * This system owns email identity (docs/02 §1.2 v3); CAS is the extension layer.
 */
import { Router, type Ctx, type Handler } from '../../lib/http';
import { json, badRequest } from '../../lib/errors';
import { config } from '../../lib/config';
import { getSession, signSession, sessionCookie, clearedSessionCookie } from '../../lib/auth/session';
import { readJson } from '../../lib/http';
import { z } from 'zod';
import * as auth from './service';
import * as people from '../people/service';

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

const verifyEmailSchema = z.object({ token: z.string().min(10) });
const loginRequestSchema = z.object({ email: z.string().email() });
const loginVerifySchema = z.object({ token: z.string().min(10) });

const register: Handler = async (req) => {
  const body = await readJson(req, registerSchema);
  const result = await auth.register(body);
  return json(result, 201);
};

const verifyEmail: Handler = async (req) => {
  const body = await readJson(req, verifyEmailSchema);
  return json(await auth.verifyEmail(body.token));
};

/** True when a browser posted an HTML form rather than fetch() sending JSON. */
function isFormPost(req: Request): boolean {
  const type = req.headers.get('content-type') ?? '';
  return type.includes('form-urlencoded') || type.includes('multipart/form-data');
}

/**
 * A redirect that keeps its Set-Cookie.
 *
 * Magic links and the no-JS forms must be completed by the *browser*, not by a
 * server-side fetch: the session cookie is set on this response, so it only
 * reaches the user if the browser makes the request and follows the redirect.
 * The old landing page fetched this endpoint from the server, which consumed the
 * one-time token and dropped the cookie — nobody was signed in, and the token was
 * gone.
 */
function seeOther(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

const loginRequest: Handler = async (req) => {
  const form = isFormPost(req);
  const body = await readJson(req, loginRequestSchema);
  const res = await auth.requestLogin(body.email);
  if (form) return seeOther('/me?login=link-sent');
  // consoleEmail tells the caller whether the link is only in the server log:
  // it must stay false once a real provider is configured, or a client would
  // happily report "check the logs" for a mail that actually went out.
  return json({ sent: true, devToken: res.devToken ?? null, consoleEmail: config.emailBackend === 'console' }, 202);
};

const loginVerify: Handler = async (req) => {
  const form = isFormPost(req);
  try {
    const body = await readJson(req, loginVerifySchema);
    const member = await auth.verifyLogin(body.token);
    const token = await signSession({
      sub: member.id,
      email: member.email,
      roles: member.roles,
    });
    if (form) return seeOther('/me', { 'set-cookie': sessionCookie(token) });
    return json({ member: people.publicMember(member) }, 200, { 'set-cookie': sessionCookie(token) });
  } catch (err) {
    // A used or expired link owes the visitor an explanation, not raw JSON.
    if (form) return seeOther('/me?login=failed');
    throw err;
  }
};

const logout: Handler = async (req) => {
  const headers = { 'set-cookie': clearedSessionCookie() };
  if (isFormPost(req)) return seeOther('/me', headers);
  return json({ ok: true }, 200, headers);
};

const me: Handler = async (_req, ctx: Ctx) => {
  const session = ctx.session;
  if (!session) throw badRequest('Not signed in');
  const bundle = await people.getMeBundle(session.sub);
  return json({ member: people.publicMember(bundle.member), points: bundle.points, ledger: bundle.ledger });
};

export function registerAuthRoutes(router: Router): void {
  router.post('/api/auth/register', register);
  router.post('/api/auth/verify-email', verifyEmail);
  router.post('/api/auth/login/request', loginRequest);
  router.post('/api/auth/login/verify', loginVerify);
  router.post('/api/auth/logout', logout);
  router.get('/api/me', me, 'session');
}
