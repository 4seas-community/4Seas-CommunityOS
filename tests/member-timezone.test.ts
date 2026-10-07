/**
 * Member timezone inputs (register, PATCH /api/me) use the shared IANA schema,
 * like events and buildings (#32): unknown zones are rejected with 400 instead
 * of being stored and later thrown on by Intl.
 */
import { describe, expect, it } from 'vitest';
import { Router } from '../src/lib/http';
import { registerAuthRoutes } from '../src/modules/auth/routes';
import { registerCasRoutes } from '../src/modules/cas/routes';
import { SESSION_COOKIE, signSession } from '../src/lib/auth/session';
import { seedMember, sessionFor } from './helpers';

function router() {
  const r = new Router();
  registerAuthRoutes(r);
  registerCasRoutes(r);
  return r;
}

const send = (method: string, path: string, body: unknown, cookie?: string) =>
  router().handle(
    new Request('http://test.local' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    path,
  );

describe('member timezone validation', () => {
  it('register rejects an unknown timezone and accepts an IANA one', async () => {
    const bad = await send('POST', '/api/auth/register', { email: 'a@test.dev', timezone: 'Foo/Bar' });
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toMatchObject({ error: { message: expect.stringContaining('timezone') } });

    const ok = await send('POST', '/api/auth/register', { email: 'b@test.dev', timezone: 'Europe/London' });
    expect(ok.status).toBe(201);
  });

  it('PATCH /api/me rejects an unknown timezone and stores an IANA one', async () => {
    const member = await seedMember('me@test.dev');
    const cookie = SESSION_COOKIE + '=' + (await signSession(sessionFor(member.id, member.roles)));

    const bad = await send('PATCH', '/api/me', { timezone: 'Foo/Bar' }, cookie);
    expect(bad.status).toBe(400);

    const ok = await send('PATCH', '/api/me', { timezone: 'Europe/London' }, cookie);
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ member: { timezone: 'Europe/London' } });
  });
});
