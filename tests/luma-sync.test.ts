/**
 * Luma one-way publish (docs/04 §2): mapping purity, mock publish/cancel,
 * failure recording and retry.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { toLumaEvent, type MappableEvent } from '../src/modules/integration/luma/mapper';
import { MockLumaClient } from '../src/modules/integration/luma/client';
import * as sync from '../src/modules/integration/luma/sync';
import { db } from '../src/lib/db';
import { communities, buildings, venues } from '../src/modules/place/schema';
import { events } from '../src/modules/event/schema';
import { members } from '../src/modules/people/schema';
import { syncRecords } from '../src/modules/integration/schema';
import { and, eq } from 'drizzle-orm';

function baseEvent(overrides: Partial<MappableEvent> = {}): MappableEvent {
  return {
    title: 'Language Corner',
    description: 'Practice Chinese together.',
    startAt: new Date('2026-10-01T03:00:00.000Z'),
    endAt: new Date('2026-10-01T05:00:00.000Z'),
    timezone: 'Asia/Bangkok',
    eventType: 'in_person',
    visibility: 'public',
    maxCapacity: 30,
    waitlistEnabled: true,
    registrationQuestions: [],
    isPaid: 'free',
    entryRequirements: null,
    transportInfo: 'BTS to Ari, 5 min walk',
    tags: ['community', 'language'],
    meetingUrl: null,
    venue: { name: 'Event Space', address: '4Seas Campus, Chiang Mai' },
    externalLocation: null,
    bannerUrl: null,
    ...overrides,
  };
}

describe('toLumaEvent mapper', () => {
  it('maps core fields and appends Luma-less sections to the description', () => {
    const payload = toLumaEvent(baseEvent());
    expect(payload.name).toBe('Language Corner');
    expect(payload.start_at).toBe('2026-10-01T03:00:00.000Z');
    expect(payload.timezone).toBe('Asia/Bangkok');
    expect(payload.visibility).toBe('public');
    expect(payload.max_capacity).toBe(30);
    expect(payload.waitlist_status).toBe('enabled');
    expect(payload.geo_address_json).toEqual({ type: 'lookup', query: 'Event Space' });
    expect(payload.description_md).toContain('**Getting there**');
    expect(payload.description_md).toContain('BTS to Ari');
    expect(payload.description_md).toContain('#community #language');
  });

  it('uses the meeting url for online events and skips geo', () => {
    const payload = toLumaEvent(
      baseEvent({ eventType: 'online', meetingUrl: 'https://meet.example/x', venue: null }),
    );
    expect(payload.meeting_url).toBe('https://meet.example/x');
    expect(payload.geo_address_json).toBeUndefined();
  });

  it('prefers the uploaded cover url over the local banner', () => {
    const payload = toLumaEvent(baseEvent(), { coverUrl: 'https://images.lumacdn.com/abc' });
    expect(payload.cover_url).toBe('https://images.lumacdn.com/abc');
  });

  it('maps private visibility through', () => {
    expect(toLumaEvent(baseEvent({ visibility: 'private' })).visibility).toBe('private');
  });
});

describe('luma sync service', () => {
  let mock: MockLumaClient;

  beforeEach(async () => {
    mock = new MockLumaClient();
    sync.setLumaClient(mock);
  });

  async function seedPublishedEvent() {
    const [c] = await db.insert(communities).values({ name: 'C', slug: 'c-luma', timezone: 'Asia/Bangkok' }).returning();
    const [b] = await db.insert(buildings).values({ communityId: c.id, name: 'B', address: 'addr', timezone: 'Asia/Bangkok' }).returning();
    const [v] = await db.insert(venues).values({ buildingId: b.id, name: 'Event Space', code: 'L-1', status: 'open' }).returning();
    const [m] = await db.insert(members).values({ email: 'h@luma.dev', emailVerifiedAt: new Date() }).returning();
    const [ev] = await db
      .insert(events)
      .values({
        communityId: c.id,
        title: 'Language Corner',
        description: 'Practice Chinese together.',
        startAt: new Date('2026-10-01T03:00:00.000Z'),
        endAt: new Date('2026-10-01T05:00:00.000Z'),
        timezone: 'Asia/Bangkok',
        eventType: 'in_person',
        venueId: v.id,
        hostId: m.id,
        status: 'published',
        visibility: 'public',
        tags: ['community'],
      })
      .returning();
    return ev;
  }

  it('creates a Luma event and records the mapping', async () => {
    const ev = await seedPublishedEvent();
    const row = await sync.publishEvent(ev.id);
    expect(row.status).toBe('synced');
    expect(row.externalId).toBe('luma_1');
    expect(row.externalUrl).toContain('luma.com');
    expect(mock.events.size).toBe(1);
  });

  it('updates instead of duplicating on re-publish', async () => {
    const ev = await seedPublishedEvent();
    await sync.publishEvent(ev.id);
    await db.update(events).set({ title: 'Language Corner v2' }).where(eq(events.id, ev.id));
    const row = await sync.publishEvent(ev.id);
    expect(row.externalId).toBe('luma_1');
    expect(mock.events.size).toBe(1);
    expect(mock.events.get('luma_1')!.name).toBe('Language Corner v2');
  });

  it('records failures and retries them', async () => {
    const ev = await seedPublishedEvent();
    mock.failNext = true;
    const failed = await sync.publishEvent(ev.id);
    expect(failed.status).toBe('failed');
    expect(failed.lastError).toContain('mock');

    const retried = await sync.retryFailed();
    expect(retried.retried).toBe(1);
    expect(retried.stillFailing).toBe(0);
    const [row] = await db
      .select()
      .from(syncRecords)
      .where(and(eq(syncRecords.entityType, 'event'), eq(syncRecords.entityId, ev.id), eq(syncRecords.platform, 'luma')))
      .limit(1);
    expect(row.status).toBe('synced');
  });

  it('cancels via the two-step token flow', async () => {
    const ev = await seedPublishedEvent();
    await sync.publishEvent(ev.id);
    const row = await sync.cancelEvent(ev.id);
    expect(row.status).toBe('canceled');
    expect(mock.events.get('luma_1')!.canceled).toBe(true);
  });

  it('rejects cancelling an unsynced event', async () => {
    const ev = await seedPublishedEvent();
    await expect(sync.cancelEvent(ev.id)).rejects.toThrow(/not synced/i);
  });
});
