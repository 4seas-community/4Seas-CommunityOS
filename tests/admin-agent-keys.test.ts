import { describe, expect, it } from 'vitest';
import { buildRouter } from '../src/lib/app-router';
import { signSession, SESSION_COOKIE } from '../src/lib/auth/session';
import { db } from '../src/lib/db';
import { agentKeys } from '../src/modules/agent/schema';
import { auditLogs } from '../src/lib/db/audit-schema';
import { seedMember, sessionFor } from './helpers';
import { eq } from 'drizzle-orm';

async function authHeader(memberId: string, roles: Array<{ scope: string; role: string }>) {
  const token = await signSession(sessionFor(memberId, roles));
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

describe('admin agent keys api', () => {
  it('enforces admin-only access on all endpoints', async () => {
    const router = buildRouter();
    const admin = await seedMember('admin-ak@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const manager = await seedMember('manager-ak@test.dev', { roles: [{ scope: 'venue:1', role: 'venue_manager' }] });
    const member = await seedMember('member-ak@test.dev', { roles: [{ scope: 'community:*', role: 'member' }] });

    // 1. GET unauthenticated -> 401
    const resNoAuth = await router.handle(new Request('http://test.local/api/admin/agent-keys'), '/api/admin/agent-keys');
    expect(resNoAuth.status).toBe(401);

    // 2. GET regular member -> 403
    const memberHeaders = await authHeader(member.id, member.roles as never);
    const resMember = await router.handle(
      new Request('http://test.local/api/admin/agent-keys', { headers: memberHeaders }),
      '/api/admin/agent-keys',
    );
    expect(resMember.status).toBe(403);

    // 3. GET venue manager -> 403
    const managerHeaders = await authHeader(manager.id, manager.roles as never);
    const resManager = await router.handle(
      new Request('http://test.local/api/admin/agent-keys', { headers: managerHeaders }),
      '/api/admin/agent-keys',
    );
    expect(resManager.status).toBe(403);

    // 4. GET community admin -> 200
    const adminHeaders = await authHeader(admin.id, admin.roles as never);
    const resAdmin = await router.handle(
      new Request('http://test.local/api/admin/agent-keys', { headers: adminHeaders }),
      '/api/admin/agent-keys',
    );
    expect(resAdmin.status).toBe(200);
  });

  it('creates an agent key, reveals secret once, and key authenticates against agent API', async () => {
    const router = buildRouter();
    const admin = await seedMember('admin-create-ak@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    // Create a key
    const res = await router.handle(
      new Request('http://test.local/api/admin/agent-keys', {
        method: 'POST',
        headers: { ...adminHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'claude-desktop',
          scopes: ['venues:read', 'events:read'],
        }),
      }),
      '/api/admin/agent-keys',
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.key.name).toBe('claude-desktop');
    expect(data.key.scopes).toEqual(['venues:read', 'events:read']);
    expect(data.secret).toMatch(/^cos_ak_/);
    expect(data.key.keyHash).toBeUndefined(); // never expose keyHash

    // Verify database row
    const [row] = await db.select().from(agentKeys).where(eq(agentKeys.id, data.key.id));
    expect(row).toBeDefined();
    expect(row.keyHash).not.toBe(data.secret); // stored as SHA-256

    // Verify audit log
    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, data.key.id));
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].action).toBe('POST /api/admin/agent-keys');
    expect(auditRows[0].actorId).toBe(admin.id);

    // Test calling the agent API with this secret
    const agentRes = await router.handle(
      new Request('http://test.local/v1/agent/venues', {
        headers: { authorization: `Bearer ${data.secret}` },
      }),
      '/v1/agent/venues',
    );
    expect(agentRes.status).toBe(200);
  });

  it('lists keys without hash, and revokes key rendering it immediately unusable', async () => {
    const router = buildRouter();
    const admin = await seedMember('admin-revoke-ak@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const member = await seedMember('member-revoke-ak@test.dev', { roles: [{ scope: 'community:*', role: 'member' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);
    const memberHeaders = await authHeader(member.id, member.roles as never);

    // 1. Create a key
    const createRes = await router.handle(
      new Request('http://test.local/api/admin/agent-keys', {
        method: 'POST',
        headers: { ...adminHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'revokable-agent',
          scopes: ['venues:read'],
        }),
      }),
      '/api/admin/agent-keys',
    );
    const { key, secret } = await createRes.json();

    // 2. List keys
    const listRes = await router.handle(
      new Request('http://test.local/api/admin/agent-keys', { headers: adminHeaders }),
      '/api/admin/agent-keys',
    );
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const found = listData.keys.find((k: { id: string }) => k.id === key.id);
    expect(found).toBeDefined();
    expect(found.isRevoked).toBe(false);
    expect(found.keyHash).toBeUndefined();

    // 3. Authenticate works before revoke
    const beforeRes = await router.handle(
      new Request('http://test.local/v1/agent/venues', {
        headers: { authorization: `Bearer ${secret}` },
      }),
      '/v1/agent/venues',
    );
    expect(beforeRes.status).toBe(200);

    // 4. Non-admin cannot revoke
    const forbiddenRes = await router.handle(
      new Request(`http://test.local/api/admin/agent-keys/${key.id}`, {
        method: 'DELETE',
        headers: memberHeaders,
      }),
      `/api/admin/agent-keys/${key.id}`,
    );
    expect(forbiddenRes.status).toBe(403);

    // 5. Admin revokes key
    const revokeRes = await router.handle(
      new Request(`http://test.local/api/admin/agent-keys/${key.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      }),
      `/api/admin/agent-keys/${key.id}`,
    );
    expect(revokeRes.status).toBe(200);
    expect((await revokeRes.json()).ok).toBe(true);

    // 6. DB has revokedAt set
    const [row] = await db.select().from(agentKeys).where(eq(agentKeys.id, key.id));
    expect(row.revokedAt).not.toBeNull();

    // 7. Audit log written
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, key.id));
    expect(auditRows.some((a) => a.action === `DELETE /api/admin/agent-keys/${key.id}`)).toBe(true);

    // 8. Authenticate fails immediately after revoke (401)
    const afterRes = await router.handle(
      new Request('http://test.local/v1/agent/venues', {
        headers: { authorization: `Bearer ${secret}` },
      }),
      '/v1/agent/venues',
    );
    expect(afterRes.status).toBe(401);
  });
});
