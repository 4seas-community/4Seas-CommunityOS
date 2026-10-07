/**
 * GET /api/events rows carry `venue` for EventCard. Raw rows only had venueId,
 * so every card showed "Online / external".
 */
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/modules/event/service';
import { seedCommunity, seedMember, seedVenue, sessionFor } from './helpers';

const day = 86400000;
const tomorrowUtc = Math.ceil(Date.now() / day) * day;

describe('withVenueSummaries', () => {
  it('attaches venue + building to venue events and null to venue-less ones', async () => {
    const community = await seedCommunity();
    const { venue, building } = await seedVenue(community.id);
    const host = await seedMember('host@test.dev', {
      roles: [
        { scope: 'community:*', role: 'member' },
        { scope: 'venue:' + venue.id, role: 'venue_manager' },
      ],
    });
    const session = sessionFor(host.id, host.roles);
    const base = {
      // 10:00-12:00 Asia/Bangkok: inside the seeded venue's opening hours
      startAt: new Date(tomorrowUtc + 3 * 3600000).toISOString(),
      endAt: new Date(tomorrowUtc + 5 * 3600000).toISOString(),
      tags: ['community'],
    };
    await eventService.createEvent({ ...base, title: 'At venue', venueId: venue.id }, session);
    await eventService.createEvent({ ...base, title: 'Online', eventType: 'online' }, session);

    const rows = await eventService.withVenueSummaries(await eventService.listEvents({}, session));
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));

    expect(byTitle['At venue'].venue).toEqual({ id: venue.id, name: venue.name, building: { name: building.name } });
    expect(byTitle['Online'].venue).toBeNull();
  });

  it('returns an empty list without querying for venues', async () => {
    await expect(eventService.withVenueSummaries([])).resolves.toEqual([]);
  });
});

describe('GET /api/events', () => {
  it('returns rows with venue summaries through the real route', async () => {
    const { Router } = await import('../src/lib/http');
    const { registerEventRoutes } = await import('../src/modules/event/routes');
    const community = await seedCommunity();
    const { venue, building } = await seedVenue(community.id);
    const host = await seedMember('host@test.dev', {
      roles: [
        { scope: 'community:*', role: 'member' },
        { scope: 'venue:' + venue.id, role: 'venue_manager' },
      ],
    });
    const session = sessionFor(host.id, host.roles);
    const { event } = await eventService.createEvent(
      {
        title: 'At venue',
        startAt: new Date(tomorrowUtc + 3 * 3600000).toISOString(),
        endAt: new Date(tomorrowUtc + 5 * 3600000).toISOString(),
        tags: ['community'],
        venueId: venue.id,
      },
      session,
    );
    await eventService.publishEvent(event.id, session);

    const router = new Router();
    registerEventRoutes(router);
    const res = await router.handle(new Request('http://test.local/api/events?view=list'), '/api/events');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<{ id: string; venue: unknown }> };
    expect(body.events.find((e) => e.id === event.id)?.venue).toEqual({
      id: venue.id,
      name: venue.name,
      building: { name: building.name },
    });
  });
});
