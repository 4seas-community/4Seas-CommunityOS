/**
 * Email identity flow: register -> verify -> login -> session (docs/02 §1.2 v3).
 * This system owns email identity; CAS is only the extension layer.
 */
import { describe, expect, it } from 'vitest';
import * as auth from '../src/modules/auth/service';
import * as people from '../src/modules/people/service';
import { lastConsoleEmailTo, tokenFromEmail } from '../src/lib/email';
import { seedMember } from './helpers';

function tokenFor(email: string): string {
  return tokenFromEmail(lastConsoleEmailTo(email));
}

describe('email registration & login', () => {
  it('registers an unverified member and sends a verification link', async () => {
    const res = await auth.register({ email: 'New@Example.com ', displayName: 'New' });
    expect(res.status).toBe('unverified');
    expect(res.email).toBe('new@example.com');

    const member = await people.findMemberByEmail('new@example.com');
    expect(member).not.toBeNull();
    expect(member!.emailVerifiedAt).toBeNull();
    expect(tokenFor('new@example.com')).toBeTruthy();
  });

  it('verifies the email and then issues a login token', async () => {
    await auth.register({ email: 'verify@example.com' });
    await auth.verifyEmail(tokenFor('verify@example.com'));

    const login = await auth.requestLogin('verify@example.com');
    expect(login.devToken).toBeTruthy();
    const member = await auth.verifyLogin(login.devToken!);
    expect(member.emailVerifiedAt).not.toBeNull();
    expect(member.email).toBe('verify@example.com');
  });

  it('rejects login before verification', async () => {
    await auth.register({ email: 'unverified@example.com' });
    // login request for an unverified account sends nothing and returns no token
    const login = await auth.requestLogin('unverified@example.com');
    expect(login.devToken).toBeUndefined();
  });

  it('rejects duplicate registration of a verified email', async () => {
    await auth.register({ email: 'dup@example.com' });
    await auth.verifyEmail(tokenFor('dup@example.com'));
    await expect(auth.register({ email: 'dup@example.com' })).rejects.toThrow(/already registered/i);
  });

  it('rejects a reused verification token', async () => {
    await auth.register({ email: 'replay@example.com' });
    const token = tokenFor('replay@example.com');
    await auth.verifyEmail(token);
    await expect(auth.verifyEmail(token)).rejects.toThrow();
  });

  it('does not leak account existence on member login request', async () => {
    const unknown = await auth.requestLogin('nobody@example.com');
    expect(unknown.devToken).toBeUndefined();
  });

  it('validates administrator privileges when target is admin', async () => {
    // 1. Not found
    const notFound = await auth.requestLogin('ghost@example.com', { target: 'admin' });
    expect(notFound.result).toBe('not_found');
    expect(notFound.devToken).toBeUndefined();

    // 2. Unverified
    await auth.register({ email: 'unverified-admin@example.com' });
    const unverified = await auth.requestLogin('unverified-admin@example.com', { target: 'admin' });
    expect(unverified.result).toBe('unverified');

    // 3. Regular member without admin/venue_manager role
    await auth.register({ email: 'normal-user@example.com' });
    await auth.verifyEmail(tokenFor('normal-user@example.com'));
    const notAdmin = await auth.requestLogin('normal-user@example.com', { target: 'admin' });
    expect(notAdmin.result).toBe('not_admin');
    expect(notAdmin.devToken).toBeUndefined();

    // 4. Actual admin gets login token
    await seedMember('real-admin@example.com', {
      verified: true,
      roles: [{ scope: 'community:*', role: 'admin' }],
    });
    const sent = await auth.requestLogin('real-admin@example.com', { target: 'admin' });
    expect(sent.result).toBe('sent');
    expect(sent.devToken).toBeTruthy();
  });
});

describe('member mirror', () => {
  it('creates members with a zero points mirror', async () => {
    const m = await people.createMember({ email: 'zero@example.com', displayName: null, timezone: 'Asia/Bangkok' });
    const bundle = await people.getMeBundle(m.id);
    expect(bundle.points.balance).toBe(0);
  });
});
