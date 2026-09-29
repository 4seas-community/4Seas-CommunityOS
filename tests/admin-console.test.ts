/**
 * Batch 1 gap remediation (docs/10 §3): admin console backend.
 * Covers the operational blockers — nobody could gain a role, buildings/floors
 * had no API, points had no adjustment path.
 */
import { describe, expect, it } from 'vitest';
import * as admin from '../src/modules/admin/service';
import * as place from '../src/modules/place/service';
import { seedCommunity, seedMember, sessionFor } from './helpers';
import { db } from '../src/lib/db';
import { members } from '../src/modules/people/schema';
import { eq } from 'drizzle-orm';

const ADMIN = sessionFor('admin-1', [{ scope: 'community:*', role: 'admin' }]);
const MEMBER = sessionFor('member-1', [{ scope: 'community:*', role: 'member' }]);

describe('admin console authorization', () => {
  it('rejects non-admins on every admin operation', async () => {
    const target = await seedMember('target@test.dev');
    await expect(admin.listMembers(MEMBER)).rejects.toThrow(/requires role admin/i);
    await expect(admin.overview(MEMBER)).rejects.toThrow(/requires role admin/i);
    await expect(
      admin.grantRole(target.id, { role: 'admin', scope: 'community:*' }, MEMBER),
    ).rejects.toThrow(/requires role admin/i);
    await expect(
      admin.adjustPoints(target.id, { delta: 10, reason: 'test' }, MEMBER),
    ).rejects.toThrow(/requires role admin/i);
  });
});

describe('role management (unblocks the "nobody can be admin" gap)', () => {
  it('grants and revokes a scoped role, idempotently', async () => {
    const target = await seedMember('grant@test.dev');
    const venueScope = 'venue:11111111-1111-4111-8111-111111111111';

    const granted = await admin.grantRole(target.id, { role: 'venue_manager', scope: venueScope }, ADMIN);
    expect(granted.roles).toContainEqual({ role: 'venue_manager', scope: venueScope });

    const again = await admin.grantRole(target.id, { role: 'venue_manager', scope: venueScope }, ADMIN);
    expect(again.roles.filter((r) => r.role === 'venue_manager')).toHaveLength(1);

    const revoked = await admin.revokeRole(target.id, { role: 'venue_manager', scope: venueScope }, ADMIN);
    expect(revoked.roles).not.toContainEqual({ role: 'venue_manager', scope: venueScope });
  });

  it('rejects unknown roles and malformed scopes', async () => {
    const target = await seedMember('bad-role@test.dev');
    await expect(admin.grantRole(target.id, { role: 'root', scope: 'community:*' }, ADMIN)).rejects.toThrow(
      /unknown role/i,
    );
    await expect(admin.grantRole(target.id, { role: 'admin', scope: 'everything' }, ADMIN)).rejects.toThrow(
      /scope must look like/i,
    );
  });

  it('refuses to revoke the last admin', async () => {
    const onlyAdmin = await seedMember('last-admin@test.dev', {
      roles: [{ scope: 'community:*', role: 'admin' }],
    });
    await expect(
      admin.revokeRole(onlyAdmin.id, { role: 'admin', scope: 'community:*' }, ADMIN),
    ).rejects.toThrow(/last admin/i);
  });

  it('lists members with roles, verification and points balance', async () => {
    const m = await seedMember('listed@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const rows = await admin.listMembers(ADMIN);
    const row = rows.find((r) => r.id === m.id);
    expect(row?.email).toBe('listed@test.dev');
    expect(row?.emailVerified).toBe(true);
    expect(row?.roles).toContainEqual({ scope: 'community:*', role: 'admin' });
    expect(row?.pointsBalance).toBe(0);
  });
});

describe('points adjustment', () => {
  it('applies the delta through CAS and mirrors it locally', async () => {
    const target = await seedMember('points-target@test.dev');
    const first = await admin.adjustPoints(target.id, { delta: 100, reason: 'manual_adjust' }, ADMIN);
    expect(first.balance).toBe(100);

    const second = await admin.adjustPoints(target.id, { delta: -30, reason: 'correction' }, ADMIN);
    expect(second.balance).toBe(70);

    const rows = await admin.listMembers(ADMIN);
    expect(rows.find((r) => r.id === target.id)?.pointsBalance).toBe(70);
  });

  it('rejects a zero delta', async () => {
    const target = await seedMember('points-zero@test.dev');
    await expect(admin.adjustPoints(target.id, { delta: 0, reason: 'noop' }, ADMIN)).rejects.toThrow(/non-zero/i);
  });
});

describe('buildings & floors (previously no API at all)', () => {
  it('creates a building, a floor and a venue beneath them', async () => {
    await seedCommunity();
    const building = await place.createBuilding({ name: 'Building G', address: 'Nimman', timezone: 'Asia/Bangkok' } as never, ADMIN);
    expect(building.name).toBe('Building G');

    const floor = await place.createFloor({ buildingId: building.id, name: '2nd Floor', sortOrder: 2 } as never, ADMIN);
    expect(floor.buildingId).toBe(building.id);

    const venue = await place.createVenue(
      { name: 'Studio', code: 'G2-STUDIO', buildingId: building.id, floorId: floor.id } as never,
      ADMIN,
    );
    expect(venue.buildingId).toBe(building.id);

    const detail = await place.getBuilding(building.id);
    expect(detail.floors.map((f) => f.name)).toContain('2nd Floor');
    expect(detail.venues.map((v) => v.code)).toContain('G2-STUDIO');
  });

  it('requires admin for building/floor creation', async () => {
    await seedCommunity();
    await expect(
      place.createBuilding({ name: 'Nope', address: '', timezone: 'Asia/Bangkok' } as never, MEMBER),
    ).rejects.toThrow(/requires role admin/i);
  });
});

describe('overview counters', () => {
  it('reports members and points totals to admins', async () => {
    const m = await seedMember('counted@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    await admin.adjustPoints(m.id, { delta: 25, reason: 'seed' }, ADMIN);
    const o = await admin.overview(ADMIN);
    expect(o.members.total).toBeGreaterThan(0);
    expect(o.members.admins).toBeGreaterThan(0);
    expect(o.points.totalBalance).toBeGreaterThanOrEqual(25);
  });
});
