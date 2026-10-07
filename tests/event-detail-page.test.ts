/**
 * Event detail page against the real GET /api/events/:id shape.
 *
 * The page used to read a flat event (ev.eventType, ev.tags, ...) while the
 * route returns getEvent()'s { event, venue, host, ... }; the type assertion in
 * apiGet hid it and every detail page threw while rendering. The page is fed by
 * the real GET /api/events/:id route, never a hand-written fixture.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as eventService from '../src/modules/event/service';
import { seedCommunity, seedMember, seedVenue, sessionFor } from './helpers';

// apiGet goes through the real router, so the route's response body (not
// getEvent()'s return value) is what the page renders.
vi.mock('../src/lib/api-client', async () => {
  const { Router } = await import('../src/lib/http');
  const { registerEventRoutes } = await import('../src/modules/event/routes');
  const router = new Router();
  registerEventRoutes(router);
  return {
    apiGet: async (path: string) => {
      const res = await router.handle(new Request('http://test.local' + path), path);
      if (!res.ok) throw new Error('API ' + res.status + ' for ' + path);
      return res.json();
    },
  };
});
// Client component needs the Next app router; irrelevant to what's under test.
vi.mock('../src/components/forms', () => ({ RegisterButton: () => null }));

const { default: EventDetailPage } = await import('../src/app/events/[id]/page');

describe('event detail page', () => {
  it('renders the nested getEvent() response without throwing', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const host = await seedMember('host@test.dev', {
      roles: [
        { scope: 'community:*', role: 'member' },
        { scope: 'venue:' + venue.id, role: 'venue_manager' },
      ],
    });
    const session = sessionFor(host.id, host.roles);
    const { event } = await eventService.createEvent(
      {
        title: 'Language Corner',
        // tomorrow 10:00-12:00 Asia/Bangkok: inside the seeded venue's opening hours
        startAt: new Date(Math.ceil(Date.now() / 86400000) * 86400000 + 3 * 3600000).toISOString(),
        endAt: new Date(Math.ceil(Date.now() / 86400000) * 86400000 + 5 * 3600000).toISOString(),
        venueId: venue.id,
        eventType: 'in_person',
        tags: ['community'], // must match the venue rule's allowed event types
      },
      session,
    );
    await eventService.publishEvent(event.id, session);
    await eventService.registerForEvent(event.id, (await seedMember('guest@test.dev')).id);

    const detail = await eventService.getEvent(event.id, session);

    const element = await EventDetailPage({ params: Promise.resolve({ id: event.id }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Language Corner');
    expect(html).toContain('in person');
    expect(html).toContain('#community');
    expect(html).toContain(venue.name);
    expect(html).toContain('1 going');
    expect(html).toContain('Hosted by ' + (detail.host?.displayName ?? ''));
  });

  it('labels a venue-less event with an empty external location as online/external', async () => {
    const community = await seedCommunity();
    await seedVenue(community.id);
    const host = await seedMember('host2@test.dev');
    const session = sessionFor(host.id, host.roles);
    const { event } = await eventService.createEvent(
      {
        title: 'Remote Meetup',
        startAt: new Date(Math.ceil(Date.now() / 86400000) * 86400000 + 3 * 3600000).toISOString(),
        endAt: new Date(Math.ceil(Date.now() / 86400000) * 86400000 + 5 * 3600000).toISOString(),
        eventType: 'online',
        externalLocation: '',
      },
      session,
    );
    await eventService.publishEvent(event.id, session);

    const html = renderToStaticMarkup(await EventDetailPage({ params: Promise.resolve({ id: event.id }) }));
    expect(html).toContain('Online / external');
  });
});
