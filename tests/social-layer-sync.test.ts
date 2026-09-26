/**
 * Social Layer one-way publish (docs/04 §3): mapper purity + mock publish/cancel.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { toSolaEvent, type MappableSolaEvent } from '../src/modules/integration/social-layer/mapper';
import { MockSocialLayerClient } from '../src/modules/integration/social-layer/client';
import * as sync from '../src/modules/integration/social-layer/sync';
import { db } from '../src/lib/db';
import { communities, buildings, venues } from '../src/modules/place/schema';
import { events } from '../src/modules/event/schema';
import { members } from '../src/modules/people/schema';
import { syncRecords } from '../src/modules/integration/schema';
import { and, eq } from 'drizzle-orm';

function baseEvent(overrides: Partial<MappableSolaEvent> = {}): MappableSolaEvent {
  return {
    title: 'Build your AI Co-Founder',
    description: 'Hands-on session.',
    startAt: new Date('2026-10-02T04:00:00.000Z'),
    endAt: new Date('2026-10-02T06:00:00.000Z'),
    timezone: 'Asia/Bangkok',
    visibility: 'public',
    maxCapacity: 40,
    approvalRequired: true,
    tags: ['ai', 'workshop'],
    meetingUrl: null,
    bannerUrl: 'https://cdn.example/banner.png',
    transportInfo: 'Nimman Soi 7',
    entryRequirements: 'Bring a laptop',
    externalLocation: null,
    ...overrides,
  };
}

describe('toSolaEvent mapper', () => {
  it('maps core fields and folds extra sections into content', () => {
    const body = toSolaEvent(baseEvent(), { groupId: '4seas', venueId: 'v-1' });
    expect(body.title).toBe('Build your AI Co-Founder');
    expect(body.start_time).toBe('2026-10-02T04:00:00.000Z');
    expect(body.timezone).toBe('Asia/Bangkok');
    expect(body.group_id).toBe('4seas');
    expect(body.venue_id).toBe('v-1');
    expect(body.max_participant).toBe(40);
    expect(body.require_approval).toBe(true);
    expect(body.image_url).toBe('https://cdn.example/banner.png');
    expect(body.tags).toEqual(['ai', 'workshop']);
    expect(body.content).toContain('**Getting there**');
    expect(body.content).toContain('**Entry requirements**');
  });

  it('maps private visibility', () => {
    expect(toSolaEvent(baseEvent({ visibility: 'private' }), { groupId: 'g' }).visibility).toBe('private');
  });

  it('carries the meeting url for online events', () => {
    const body = toSolaEvent(baseEvent({ meetingUrl: 'https://meet.example/y' }), { groupId: 'g' });
    expect(body.meeting_url).toBe('https://meet.example/y');
  });
});

describe('social layer sync service', () => {
  let mock: MockSocialLayerClient;

  beforeEach(() => {
    mock = new MockSocialLayerClient();
    sync.setSocialLayerClient(mock);
  });

  async function seedEvent() {
    const [c] = await db.insert(communities).values({ name: 'C2', slug: 'c-sola', timezone: 'Asia/Bangkok' }).returning();
    const [b] = await db
      .insert(buildings)
      .values({ communityId: c.id, name: 'B2', address: 'addr', timezone: 'Asia/Bangkok' })
      .returning();
    const [v] = await db
      .insert(venues)
      .values({ buildingId: b.id, name: 'Event Space', code: 'S-1', status: 'open', solDayVenueId: 'solav-1' })
      .returning();
    const [m] = await db.insert(members).values({ email: 'h@sola.dev', emailVerifiedAt: new Date() }).returning();
    const [ev] = await db
      .insert(events)
      .values({
        communityId: c.id,
        title: 'Build your AI Co-Founder',
        description: 'Hands-on session.',
        startAt: new Date('2026-10-02T04:00:00.000Z'),
        endAt: new Date('2026-10-02T06:00:00.000Z'),
        timezone: 'Asia/Bangkok',
        eventType: 'in_person',
        venueId: v.id,
        hostId: m.id,
        status: 'published',
        visibility: 'public',
        tags: ['ai'],
      })
      .returning();
    return ev;
  }

  it('creates the event and records the mapping with a public url', async () => {
    const ev = await seedEvent();
    const row = await sync.publishEvent(ev.id);
    expect(row.status).toBe('synced');
    expect(row.externalId).toBe('sola_1');
    expect(row.externalUrl).toContain('app.sola.day');
  });

  it('updates on re-publish instead of duplicating', async () => {
    const ev = await seedEvent();
    await sync.publishEvent(ev.id);
    await db.update(events).set({ title: 'AI Co-Founder v2' }).where(eq(events.id, ev.id));
    const row = await sync.publishEvent(ev.id);
    expect(row.externalId).toBe('sola_1');
    expect(mock.events.size).toBe(1);
  });

  it('records failures without throwing', async () => {
    const ev = await seedEvent();
    mock.failNext = true;
    const row = await sync.publishEvent(ev.id);
    expect(row.status).toBe('failed');
    expect(row.lastError).toContain('mock');
  });

  it('cancels a synced event', async () => {
    const ev = await seedEvent();
    await sync.publishEvent(ev.id);
    const row = await sync.cancelEvent(ev.id);
    expect(row.status).toBe('canceled');
    expect(mock.events.get('sola_1')!.canceled).toBe(true);
  });
});
