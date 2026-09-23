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

const loginRequest: Handler = async (req) => {
  const body = await readJson(req, loginRequestSchema);
  const res = await auth.requestLogin(body.email);
  return json({ sent: true, devToken: res.devToken ?? null, consoleEmail: config.emailBackend !== 'smtp' }, 202);
};

const loginVerify: Handler = async (req) => {
  const body = await readJson(req, loginVerifySchema);
  const member = await auth.verifyLogin(body.token);
  const token = await signSession({
    sub: member.id,
    email: member.email,
    roles: member.roles,
  });
  return json({ member: people.publicMember(member) }, 200, { 'set-cookie': sessionCookie(token) });
};

const logout: Handler = async () => json({ ok: true }, 200, { 'set-cookie': clearedSessionCookie() });

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
