import { describe, expect, it } from 'vitest';
import { buildRouter } from '../src/lib/app-router';
import { signSession, SESSION_COOKIE } from '../src/lib/auth/session';
import { seedCommunity, seedMember, seedVenue, sessionFor, bookingInput } from './helpers';
import * as eventService from '../src/modules/event/service';
import * as bookingService from '../src/modules/booking/service';

async function authHeader(memberId: string, roles: Array<{ scope: string; role: string }>) {
  const token = await signSession(sessionFor(memberId, roles));
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

describe('admin data export api', () => {
  it('enforces community-admin only access', async () => {
    const router = buildRouter();
    const admin = await seedMember('export-admin@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const manager = await seedMember('export-manager@test.dev', { roles: [{ scope: 'venue:1', role: 'venue_manager' }] });
    const member = await seedMember('export-member@test.dev', { roles: [{ scope: 'community:*', role: 'member' }] });

    // 1. Unauthenticated -> 401
    const resNoAuth = await router.handle(
      new Request('http://test.local/api/admin/export?type=events'),
      '/api/admin/export',
    );
    expect(resNoAuth.status).toBe(401);

    // 2. Regular member -> 403
    const memberHeaders = await authHeader(member.id, member.roles as never);
    const resMember = await router.handle(
      new Request('http://test.local/api/admin/export?type=events', { headers: memberHeaders }),
      '/api/admin/export',
    );
    expect(resMember.status).toBe(403);

    // 3. Venue manager -> 403
    const managerHeaders = await authHeader(manager.id, manager.roles as never);
    const resManager = await router.handle(
      new Request('http://test.local/api/admin/export?type=events', { headers: managerHeaders }),
      '/api/admin/export',
    );
    expect(resManager.status).toBe(403);

    // 4. Admin -> 200
    const adminHeaders = await authHeader(admin.id, admin.roles as never);
    const resAdmin = await router.handle(
      new Request('http://test.local/api/admin/export?type=events', { headers: adminHeaders }),
      '/api/admin/export',
    );
    expect(resAdmin.status).toBe(200);
  });

  it('rejects invalid export type', async () => {
    const router = buildRouter();
    const admin = await seedMember('export-bad@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    const res = await router.handle(
      new Request('http://test.local/api/admin/export?type=passwords', { headers: adminHeaders }),
      '/api/admin/export',
    );
    expect(res.status).toBe(400);
  });

  it('exports valid JSON and CSV with UTF-8 BOM, CRLF, and proper cell escaping', async () => {
    const router = buildRouter();
    const admin = await seedMember('export-formats@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    // Seed some data with commas and quotes to test CSV escaping
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const session = sessionFor(admin.id, admin.roles as never);

    await eventService.createEvent(
      {
        title: 'Event with "quotes" and, commas',
        startAt: new Date(Date.now() + 3600_000).toISOString(),
        endAt: new Date(Date.now() + 7200_000).toISOString(),
        timezone: 'Asia/Bangkok',
        eventType: 'in_person',
        venueId: venue.id,
        tags: ['community'],
      },
      session,
    );

    // 1. JSON Export
    const resJson = await router.handle(
      new Request('http://test.local/api/admin/export?type=events&format=json', { headers: adminHeaders }),
      '/api/admin/export',
    );
    expect(resJson.status).toBe(200);
    expect(resJson.headers.get('content-type')).toContain('application/json');
    expect(resJson.headers.get('content-disposition')).toMatch(/attachment; filename="4seas-events-.*\.json"/);

    const jsonData = await resJson.json();
    expect(jsonData.type).toBe('events');
    expect(jsonData.count).toBeGreaterThan(0);
    const foundEvent = jsonData.data.find((e: { title: string }) => e.title.includes('Event with "quotes"'));
    expect(foundEvent).toBeDefined();

    // 2. CSV Export
    const resCsv = await router.handle(
      new Request('http://test.local/api/admin/export?type=events&format=csv', { headers: adminHeaders }),
      '/api/admin/export',
    );
    expect(resCsv.status).toBe(200);
    expect(resCsv.headers.get('content-type')).toContain('text/csv');
    expect(resCsv.headers.get('content-disposition')).toMatch(/attachment; filename="4seas-events-.*\.csv"/);

    const buf = new Uint8Array(await resCsv.arrayBuffer());
    // Starts with UTF-8 BOM bytes 0xEF, 0xBB, 0xBF
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    const csvText = new TextDecoder('utf-8').decode(buf);
    // Uses CRLF
    expect(csvText).toContain('\r\n');
    // Correctly escaped cell with quotes and commas
    expect(csvText).toContain('"Event with ""quotes"" and, commas"');
  });

  it('exports all 4 entity types successfully', async () => {
    const router = buildRouter();
    const admin = await seedMember('export-all@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const adminHeaders = await authHeader(admin.id, admin.roles as never);

    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const session = sessionFor(admin.id, admin.roles as never);

    const start = new Date(Date.now() + 86400_000);
    const end = new Date(start.getTime() + 3600_000);
    await bookingService.createBooking(bookingInput(venue.id, start, end), session);
    await eventService.createEvent(
      {
        title: 'Exported Workshop',
        startAt: new Date(Date.now() + 100_000_000).toISOString(),
        endAt: new Date(Date.now() + 103_600_000).toISOString(),
        timezone: 'Asia/Bangkok',
        eventType: 'in_person',
        venueId: venue.id,
        tags: ['community'],
      },
      session,
    );

    for (const type of ['events', 'bookings', 'venues', 'members'] as const) {
      const res = await router.handle(
        new Request(`http://test.local/api/admin/export?type=${type}&format=json`, { headers: adminHeaders }),
        '/api/admin/export',
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.type).toBe(type);
      expect(data.data.length).toBeGreaterThan(0);
    }
  });
});
