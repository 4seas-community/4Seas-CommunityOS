import { describe, expect, it } from 'vitest';
import { buildRouter } from '../src/lib/app-router';
import { signSession, SESSION_COOKIE } from '../src/lib/auth/session';
import { db } from '../src/lib/db';
import { notificationOutbox } from '../src/modules/notify/schema';
import { auditLogs } from '../src/lib/db/audit-schema';
import { seedMember, sessionFor } from './helpers';
import { eq } from 'drizzle-orm';

async function authHeader(memberId: string, roles: Array<{ scope: string; role: string }>) {
  const token = await signSession(sessionFor(memberId, roles));
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

describe('admin notifications api', () => {
  it('enforces admin-only access (rejects unauthenticated, members, and venue managers)', async () => {
    const router = buildRouter();
    const admin = await seedMember('admin@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const manager = await seedMember('manager@test.dev', { roles: [{ scope: 'venue:123', role: 'venue_manager' }] });
    const member = await seedMember('member@test.dev', { roles: [{ scope: 'community:*', role: 'member' }] });

    // 1. Unauthenticated -> 401
    const resNoAuth = await router.handle(new Request('http://test.local/api/admin/notifications'), '/api/admin/notifications');
    expect(resNoAuth.status).toBe(401);

    // 2. Regular member -> 403
    const memberHeaders = await authHeader(member.id, member.roles as never);
    const resMember = await router.handle(
      new Request('http://test.local/api/admin/notifications', { headers: memberHeaders }),
      '/api/admin/notifications',
    );
    expect(resMember.status).toBe(403);

    // 3. Venue manager (cannot see PII target outbox) -> 403
    const managerHeaders = await authHeader(manager.id, manager.roles as never);
    const resManager = await router.handle(
      new Request('http://test.local/api/admin/notifications', { headers: managerHeaders }),
      '/api/admin/notifications',
    );
    expect(resManager.status).toBe(403);

    // 4. Community admin -> 200
    const adminHeaders = await authHeader(admin.id, admin.roles as never);
    const resAdmin = await router.handle(
      new Request('http://test.local/api/admin/notifications', { headers: adminHeaders }),
      '/api/admin/notifications',
    );
    expect(resAdmin.status).toBe(200);
  });

  it('lists notifications and filters by status, channel, template, and joins member details', async () => {
    const router = buildRouter();
    const admin = await seedMember('admin2@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const user = await seedMember('user@test.dev');

    // Seed outbox entries
    const [n1] = await db
      .insert(notificationOutbox)
      .values({
        channel: 'telegram',
        template: 'booking_created',
        target: '@tgchannel',
        status: 'pending',
        payload: { bookingId: 'b1' },
      })
      .returning();

    const [n2] = await db
      .insert(notificationOutbox)
      .values({
        memberId: user.id,
        channel: 'email',
        template: 'verify_email',
        target: user.email,
        status: 'delivered',
        payload: { token: 't1' },
      })
      .returning();

    const [n3] = await db
      .insert(notificationOutbox)
      .values({
        channel: 'email',
        template: 'event_reminder',
        target: 'fail@test.dev',
        status: 'failed',
        retryCount: 5,
        lastError: 'Resend rejected 403 domain not verified',
        payload: { eventId: 'e1' },
      })
      .returning();

    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    // Filter by status=failed
    const resFailed = await router.handle(
      new Request('http://test.local/api/admin/notifications?status=failed', { headers: adminHeaders }),
      '/api/admin/notifications',
    );
    expect(resFailed.status).toBe(200);
    const dataFailed = await resFailed.json();
    expect(dataFailed.notifications).toHaveLength(1);
    expect(dataFailed.notifications[0].id).toBe(n3.id);
    expect(dataFailed.notifications[0].lastError).toContain('Resend rejected');

    // Filter by channel=telegram
    const resTg = await router.handle(
      new Request('http://test.local/api/admin/notifications?channel=telegram', { headers: adminHeaders }),
      '/api/admin/notifications',
    );
    expect(resTg.status).toBe(200);
    const dataTg = await resTg.json();
    expect(dataTg.notifications).toHaveLength(1);
    expect(dataTg.notifications[0].id).toBe(n1.id);

    // Filter by template=verify_email and check member details
    const resTpl = await router.handle(
      new Request('http://test.local/api/admin/notifications?template=verify_email', { headers: adminHeaders }),
      '/api/admin/notifications',
    );
    expect(resTpl.status).toBe(200);
    const dataTpl = await resTpl.json();
    expect(dataTpl.notifications).toHaveLength(1);
    expect(dataTpl.notifications[0].id).toBe(n2.id);
    expect(dataTpl.notifications[0].member).toMatchObject({
      id: user.id,
      email: 'user@test.dev',
    });
  });

  it('allows retrying a failed notification and writes audit log', async () => {
    const router = buildRouter();
    const admin = await seedMember('admin3@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const manager = await seedMember('manager3@test.dev', { roles: [{ scope: 'venue:1', role: 'venue_manager' }] });

    const [failed] = await db
      .insert(notificationOutbox)
      .values({
        channel: 'email',
        template: 'login_link',
        target: 'someone@test.dev',
        status: 'failed',
        retryCount: 5,
        lastError: 'connection timeout',
        payload: {},
      })
      .returning();

    const managerHeaders = await authHeader(manager.id, manager.roles as never);
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    // Non-admin cannot retry
    const resForbidden = await router.handle(
      new Request(`http://test.local/api/admin/notifications/${failed.id}/retry`, {
        method: 'POST',
        headers: managerHeaders,
      }),
      `/api/admin/notifications/${failed.id}/retry`,
    );
    expect(resForbidden.status).toBe(403);

    // Non-existent id returns 404
    const resNotFound = await router.handle(
      new Request('http://test.local/api/admin/notifications/non-existent-id/retry', {
        method: 'POST',
        headers: adminHeaders,
      }),
      '/api/admin/notifications/non-existent-id/retry',
    );
    expect(resNotFound.status).toBe(404);

    // Admin can retry
    const resRetry = await router.handle(
      new Request(`http://test.local/api/admin/notifications/${failed.id}/retry`, {
        method: 'POST',
        headers: adminHeaders,
      }),
      `/api/admin/notifications/${failed.id}/retry`,
    );
    expect(resRetry.status).toBe(200);
    const dataRetry = await resRetry.json();
    expect(dataRetry.notification.status).toBe('pending');
    expect(dataRetry.notification.lastError).toBeNull();

    // Verify in db
    const [rowInDb] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, failed.id));
    expect(rowInDb.status).toBe('pending');
    expect(rowInDb.lastError).toBeNull();

    // Verify audit log
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, failed.id));
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].action).toBe(`POST /api/admin/notifications/${failed.id}/retry`);
    expect(auditRows[0].actorId).toBe(admin.id);
  });
});
