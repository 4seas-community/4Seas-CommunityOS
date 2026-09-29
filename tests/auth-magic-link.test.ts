/**
 * Magic-link contract.
 *
 * The link must sign the visitor in on the first click, and that only happens if
 * the *browser* makes the request and receives the Set-Cookie. The old landing
 * page asked the API from the server, which consumed the one-time token and threw
 * the cookie away, so the visitor was bounced to the sign-in form and asked for
 * the email the link already identified. These tests pin the shape that fixes it.
 */
import { describe, expect, it } from 'vitest';
import { router } from '../src/lib/app-router';
import { seedMember } from './helpers';

const formPost = (path: string, fields: Record<string, string>) =>
  new Request('http://test.local' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

const jsonPost = (path: string, payload: unknown) =>
  new Request('http://test.local' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

/** Request a link the way a test can read it: the console backend returns the token. */
async function loginToken(email: string): Promise<string> {
  const res = await router.handle(jsonPost('/api/auth/login/request', { email }), '/api/auth/login/request');
  expect(res.status).toBe(202);
  const body = (await res.json()) as { devToken?: string };
  expect(body.devToken).toBeTruthy();
  return body.devToken as string;
}

describe('magic link', () => {
  it('signs the browser in with a 303 that carries the session cookie', async () => {
    const member = await seedMember('magic@test.dev');
    const token = await loginToken(member.email);

    const res = await router.handle(formPost('/api/auth/login/verify', { token }), '/api/auth/login/verify');

    expect(res.status).toBe(303);
    // ?login=ok is what lets /me tell "cookie refused" apart from "not signed in".
    expect(res.headers.get('location')).toBe('/me?login=ok');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('cos_session=');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('consumes the token once and explains itself on the second use', async () => {
    const member = await seedMember('once@test.dev');
    const token = await loginToken(member.email);

    const first = await router.handle(formPost('/api/auth/login/verify', { token }), '/api/auth/login/verify');
    expect(first.status).toBe(303);
    expect(first.headers.get('location')).toBe('/me?login=ok');

    const second = await router.handle(formPost('/api/auth/login/verify', { token }), '/api/auth/login/verify');
    expect(second.status).toBe(303);
    expect(second.headers.get('location')).toBe('/me?login=failed');
    expect(second.headers.get('set-cookie')).toBeNull();
  });

  it('keeps the JSON contract (and the cookie) for API clients', async () => {
    const member = await seedMember('json@test.dev');
    const token = await loginToken(member.email);

    const res = await router.handle(jsonPost('/api/auth/login/verify', { token }), '/api/auth/login/verify');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { member: { email: string } };
    expect(body.member.email).toBe('json@test.dev');
    expect(res.headers.get('set-cookie') ?? '').toContain('cos_session=');
  });

  it('turns the no-JS login form into a redirect instead of raw JSON', async () => {
    const res = await router.handle(
      formPost('/api/auth/login/request', { email: 'nobody@test.dev' }),
      '/api/auth/login/request',
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/me?login=link-sent');
  });

  it('clears the cookie through a redirect when the sign-out form is posted', async () => {
    const res = await router.handle(formPost('/api/auth/logout', {}), '/api/auth/logout');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/me');
    expect(res.headers.get('set-cookie') ?? '').toContain('cos_session=;');
  });
});
