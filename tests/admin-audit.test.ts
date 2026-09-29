import { describe, expect, it } from 'vitest';
import { buildRouter } from '../src/lib/app-router';
import { signSession, SESSION_COOKIE } from '../src/lib/auth/session';
import { db } from '../src/lib/db';
import { auditLogs } from '../src/lib/db/audit-schema';
import { writeAudit } from '../src/lib/audit';
import { seedMember, sessionFor } from './helpers';

async function authHeader(memberId: string, roles: Array<{ scope: string; role: string }>) {
  const token = await signSession(sessionFor(memberId, roles));
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

describe('admin audit logs api', () => {
  it('enforces admin-only access (rejects unauthenticated, members, and venue managers)', async () => {
    const router = buildRouter();
    const admin = await seedMember('audit-admin@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const manager = await seedMember('audit-manager@test.dev', { roles: [{ scope: 'venue:1', role: 'venue_manager' }] });
    const member = await seedMember('audit-member@test.dev', { roles: [{ scope: 'community:*', role: 'member' }] });

    // 1. Unauthenticated -> 401
    const resNoAuth = await router.handle(
      new Request('http://test.local/api/admin/audit'),
      '/api/admin/audit',
    );
    expect(resNoAuth.status).toBe(401);

    // 2. Member -> 403
    const memberHeaders = await authHeader(member.id, member.roles as never);
    const resMember = await router.handle(
      new Request('http://test.local/api/admin/audit', { headers: memberHeaders }),
      '/api/admin/audit',
    );
    expect(resMember.status).toBe(403);

    // 3. Venue manager -> 403
    const managerHeaders = await authHeader(manager.id, manager.roles as never);
    const resManager = await router.handle(
      new Request('http://test.local/api/admin/audit', { headers: managerHeaders }),
      '/api/admin/audit',
    );
    expect(resManager.status).toBe(403);

    // 4. Admin -> 200
    const adminHeaders = await authHeader(admin.id, admin.roles as never);
    const resAdmin = await router.handle(
      new Request('http://test.local/api/admin/audit', { headers: adminHeaders }),
      '/api/admin/audit',
    );
    expect(resAdmin.status).toBe(200);
  });

  it('filters audit logs by entityType, actorType, and action', async () => {
    const router = buildRouter();
    const admin = await seedMember('audit-filter-admin@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    await writeAudit({
      actorType: 'user',
      actorId: admin.id,
      action: 'POST /api/venues',
      entityType: 'venue',
      entityId: 'venue-123',
      after: { name: 'Main Hall' },
    });

    await writeAudit({
      actorType: 'agent',
      actorId: 'agent-key-abc',
      action: 'agent_draft.open:create_event',
      entityType: 'agent_draft',
      entityId: 'draft-456',
      after: { title: 'AI Hackathon' },
    });

    await writeAudit({
      actorType: 'system',
      action: 'booking.auto_expire',
      entityType: 'booking',
      entityId: 'booking-789',
    });

    // Filter by entityType=venue
    const resVenue = await router.handle(
      new Request('http://test.local/api/admin/audit?entityType=venue', { headers: adminHeaders }),
      '/api/admin/audit',
    );
    expect(resVenue.status).toBe(200);
    const dataVenue = await resVenue.json();
    expect(dataVenue.logs.length).toBeGreaterThan(0);
    expect(dataVenue.logs.every((l: { entityType: string }) => l.entityType === 'venue')).toBe(true);

    // Filter by actorType=agent
    const resAgent = await router.handle(
      new Request('http://test.local/api/admin/audit?actorType=agent', { headers: adminHeaders }),
      '/api/admin/audit',
    );
    expect(resAgent.status).toBe(200);
    const dataAgent = await resAgent.json();
    expect(dataAgent.logs.length).toBeGreaterThan(0);
    expect(dataAgent.logs.every((l: { actorType: string }) => l.actorType === 'agent')).toBe(true);

    // Filter by action keyword
    const resAction = await router.handle(
      new Request('http://test.local/api/admin/audit?action=auto_expire', { headers: adminHeaders }),
      '/api/admin/audit',
    );
    expect(resAction.status).toBe(200);
    const dataAction = await resAction.json();
    expect(dataAction.logs.length).toBe(1);
    expect(dataAction.logs[0].action).toBe('booking.auto_expire');
  });

  it('paginates stably using composite (created_at, id) cursor', async () => {
    const router = buildRouter();
    const admin = await seedMember('audit-page-admin@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    // Insert 5 audit log rows sequentially
    for (let i = 1; i <= 5; i++) {
      await writeAudit({
        actorType: 'system',
        action: `test.batch_log_${i}`,
        entityType: 'test_entity',
        entityId: `id_${i}`,
      });
    }

    // Page 1: limit 2
    const resP1 = await router.handle(
      new Request('http://test.local/api/admin/audit?entityType=test_entity&limit=2', { headers: adminHeaders }),
      '/api/admin/audit',
    );
    expect(resP1.status).toBe(200);
    const p1 = await resP1.json();
    expect(p1.logs).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();

    // Page 2: with cursor
    const resP2 = await router.handle(
      new Request(`http://test.local/api/admin/audit?entityType=test_entity&limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`, {
        headers: adminHeaders,
      }),
      '/api/admin/audit',
    );
    expect(resP2.status).toBe(200);
    const p2 = await resP2.json();
    expect(p2.logs).toHaveLength(2);
    expect(p2.nextCursor).toBeTruthy();

    // Verify disjoint sets (no duplicate entries between pages)
    const p1Ids = p1.logs.map((l: { id: string }) => l.id);
    const p2Ids = p2.logs.map((l: { id: string }) => l.id);
    for (const id of p2Ids) {
      expect(p1Ids).not.toContain(id);
    }
  });
});
