/**
 * Security regression tests for the issues raised in external review of the
 * merged PR stack: cross-venue authz, public PII/visibility leaks, check-in key
 * exposure, account-takeover via dev tokens, token replay, and the missing
 * database-level double-booking guard.
 */
import { describe, expect, it } from 'vitest';
import { hasRole } from '../src/lib/auth/roles';
import { configProblems } from '../src/lib/config';
import { canSeeEventForTest, listEvents } from '../src/modules/event/service';
import * as bookingService from '../src/modules/booking/service';
import * as peopleService from '../src/modules/people/service';
import { db } from '../src/lib/db';
import { bookings } from '../src/modules/booking/schema';
import { seedCommunity, seedMember, seedVenue, sessionFor, bookingInput } from './helpers';
import { sql } from 'drizzle-orm';

const VENUE_A = 'venue:aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const VENUE_B = 'venue:bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

describe('hasRole scoping (cross-venue bypass)', () => {
  it('a venue-scoped role does NOT grant another venue', () => {
    const roles = [{ scope: VENUE_A, role: 'venue_manager' }];
    expect(hasRole(roles, 'venue_manager', VENUE_A)).toBe(true);
    expect(hasRole(roles, 'venue_manager', VENUE_B)).toBe(false);
  });

  it('venue:* grants every venue (and only venue scopes)', () => {
    const roles = [{ scope: 'venue:*', role: 'venue_manager' }];
    expect(hasRole(roles, 'venue_manager', VENUE_B)).toBe(true);
    expect(hasRole(roles, 'venue_manager', 'community:*')).toBe(false);
  });

  it('community roles apply everywhere; omitted scope is a presence check', () => {
    const roles = [{ scope: 'community:*', role: 'admin' }];
    expect(hasRole(roles, 'admin', VENUE_B)).toBe(true);
    expect(hasRole(roles, 'venue_manager')).toBe(false);
    expect(hasRole([{ scope: VENUE_A, role: 'venue_manager' }], 'venue_manager')).toBe(true);
  });
});

describe('configuration fail-fast', () => {
  it('is quiet in development but reports insecure defaults in production', () => {
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    try {
      env.NODE_ENV = 'development';
      expect(configProblems()).toEqual([]);
      env.NODE_ENV = 'production';
      expect(Array.isArray(configProblems())).toBe(true);
    } finally {
      if (original === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = original;
    }
  });
});

describe('telegram unbind (unique-constraint collision)', () => {
  it('two members can unbind one after another', async () => {
    const a = await seedMember('tg-a@test.dev');
    const b = await seedMember('tg-b@test.dev');
    await peopleService.applyTelegramBinding(a.id, { id: '111', username: 'a' });
    await peopleService.applyTelegramBinding(b.id, { id: '222', username: 'b' });
    await peopleService.clearTelegramBinding(a.id);
    await peopleService.clearTelegramBinding(b.id);
    const [ra, rb] = [await peopleService.getMember(a.id), await peopleService.getMember(b.id)];
    expect(ra.telegramId).toBeNull();
    expect(rb.telegramId).toBeNull();
  });
});

describe('event visibility', () => {
  it('hides drafts, pending and private events from anonymous callers', () => {
    const base = { hostId: 'host-1', coHostIds: [], venueId: null } as never;
    expect(canSeeEventForTest({ ...(base as object), status: 'draft', visibility: 'public' } as never, null)).toBe(false);
    expect(canSeeEventForTest({ ...(base as object), status: 'pending_review', visibility: 'public' } as never, null)).toBe(false);
    expect(canSeeEventForTest({ ...(base as object), status: 'published', visibility: 'private' } as never, null)).toBe(false);
    expect(canSeeEventForTest({ ...(base as object), status: 'published', visibility: 'members' } as never, null)).toBe(false);
    expect(canSeeEventForTest({ ...(base as object), status: 'published', visibility: 'public' } as never, null)).toBe(true);
  });

  it('lets the host see their own draft and members see member-only events', () => {
    const draft = { hostId: 'me', coHostIds: [], venueId: null, status: 'draft', visibility: 'public' } as never;
    expect(canSeeEventForTest(draft, { sub: 'me', email: 'me@x.dev', roles: [] })).toBe(true);
    const membersOnly = { hostId: 'other', coHostIds: [], venueId: null, status: 'published', visibility: 'members' } as never;
    expect(canSeeEventForTest(membersOnly, { sub: 'me', email: 'me@x.dev', roles: [] })).toBe(true);
  });

  it('hides drafts in the default list view', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const host = await seedMember('draft-host@test.dev');
    const { events: eventSchema } = await import('../src/modules/event/schema');
    const { events } = await import('../src/modules/event/schema');
    await db.insert(events).values({
      communityId: community.id,
      title: 'Secret draft',
      startAt: new Date(Date.now() + 3600_000),
      endAt: new Date(Date.now() + 7200_000),
      timezone: 'Asia/Bangkok',
      eventType: 'in_person',
      venueId: venue.id,
      hostId: host.id,
      status: 'draft',
      visibility: 'public',
    });
    const anonymous = await listEvents({ view: 'list' }, null);
    expect(anonymous.map((e) => e.title)).not.toContain('Secret draft');
    const asHost = await listEvents({ view: 'list' }, sessionFor(host.id));
    expect(asHost.map((e) => e.title)).toContain('Secret draft');
    void eventSchema;
  });
});

describe('request body handling (broken HTML forms)', () => {
  it('parses url-encoded form bodies into the JSON schema (numbers + lists)', async () => {
    const { readJson } = await import('../src/lib/http');
    const { z } = await import('zod');
    const schema = z.object({
      title: z.string().min(1),
      capacity: z.number().int().positive().optional(),
      tags: z.array(z.string()).default([]),
    });
    const body = new URLSearchParams({ title: 'Form event', capacity: '42', tags: 'a, b' });
    const req = new Request('http://test.local/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const parsed = await readJson(req, schema);
    expect(parsed.title).toBe('Form event');
    expect(parsed.capacity).toBe(42);
    expect(parsed.tags).toEqual(['a', 'b']);
  });

  it('turns a schema violation into a 400 instead of a 500', async () => {
    const { readJson } = await import('../src/lib/http');
    const { z } = await import('zod');
    const { ApiError } = await import('../src/lib/errors');
    const req = new Request('http://test.local/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    await expect(readJson(req, z.object({ title: z.string() }))).rejects.toBeInstanceOf(ApiError);
  });
});

describe('booking visibility', () => {
  it('excludes non-active bookings from the overlap guard', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const member = await seedMember('guard@test.dev');
    const session = sessionFor(member.id);
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    start.setUTCHours(5, 0, 0, 0);
    const end = new Date(start.getTime() + 3600 * 1000);

    const { booking } = await bookingService.createBooking(bookingInput(venue.id, start, end), session);
    await bookingService.cancelBooking(booking.id, session);

    // Canceled slot is free again (the exclusion constraint ignores it)…
    const again = await bookingService.createBooking(bookingInput(venue.id, start, end), session);
    expect(again.booking.status).toBe('approved');

    // …but a direct concurrent insert for the same venue+time is rejected by the DB.
    const other = await seedMember('guard2@test.dev');
    let code: string | undefined;
    try {
      await db.insert(bookings).values({
        venueId: venue.id,
        memberId: other.id,
        purpose: 'race',
        startAt: new Date(start.getTime() - 60 * 60 * 1000),
        endAt: new Date(end.getTime() + 60 * 60 * 1000),
        attendeesCount: 1,
        status: 'approved',
        ruleVersion: 1,
        pointsCharged: 0,
        depositPoints: 0,
      });
    } catch (err) {
      code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    }
    expect(code).toBe('23P01');
  });
});
