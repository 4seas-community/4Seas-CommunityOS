/**
 * Event lifecycle + check-in flow (docs/03 §3.1, §4.4):
 * create -> publish (auto rule) -> outbox notifications -> register ->
 * rotate QR -> one-time claim -> replay rejected.
 */
import { describe, expect, it } from 'vitest';
import * as eventService from '../src/modules/event/service';
import { casClient } from '../src/modules/cas';
import { db } from '../src/lib/db';
import { events } from '../src/modules/event/schema';
import { notificationOutbox } from '../src/modules/notify/schema';
import { eq, sql } from 'drizzle-orm';
import { seedCommunity, seedMember, seedVenue, sessionFor } from './helpers';

const startAt = new Date(Date.now() + 48 * 3600 * 1000);
const endAt = new Date(startAt.getTime() + 2 * 3600 * 1000);

function eventInput(venueId: string) {
  return {
    title: 'Welcome Session',
    description: 'Weekly welcome session.',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: 'Asia/Bangkok',
    eventType: 'in_person' as const,
    venueId,
    tags: ['community'],
    visibility: 'public' as const,
    checkinMode: 'qr_rotating' as const,
    checkinClaimCap: 50,
  };
}

describe('event lifecycle', () => {
  it('publishes, fans out notifications and serves one-time check-in claims', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id); // auto approval, zero points
    const host = await seedMember('host@test.dev', {
      roles: [
        { scope: 'community:*', role: 'member' },
        { scope: 'venue:' + venue.id, role: 'venue_manager' },
      ],
    });
    const session = sessionFor(host.id, host.roles);

    const { event } = await eventService.createEvent(eventInput(venue.id), session);
    expect(event.status).toBe('draft');

    const published = await eventService.publishEvent(event.id, session);
    expect(published.event.status).toBe('published');

    // publish fans out to the 4seasbot feed + in-app notifications
    const outbox = await db
      .select()
      .from(notificationOutbox)
      .where(sql<string>`${notificationOutbox.payload} ->> 'eventId' = ${event.id}`);
    expect(outbox.length).toBeGreaterThan(0);

    // registration
    const guest = await seedMember('guest@test.dev');
    const reg = await eventService.registerForEvent(event.id, guest.id);
    expect(reg.status).toBe('approved');

    // host rotates the QR; participant consumes the one-time claim URL
    const { token } = await eventService.rotateCheckin(event.id, session);
    const cas = casClient();
    const mockToken = token.tokenHash; // CAS mock token id
    const url = new URL(token.claimUrl);
    const tId = url.searchParams.get('ck')!;
    const sig = url.searchParams.get('sig')!;

    const claim1 = await eventService.claimCheckin(event.id, { tokenId: tId, sig }, sessionFor(guest.id));
    expect(claim1.registration.checkedInAt).not.toBeNull();

    // replay of the same claim URL is rejected by CAS
    await expect(eventService.claimCheckin(event.id, { tokenId: tId, sig }, sessionFor(guest.id))).rejects.toThrow();

    // rotating again voids the previous URL and issues a fresh one
    const rotated = await eventService.rotateCheckin(event.id, session);
    expect(rotated.token.id).not.toBe(token.id);
    expect(mockToken).toBeTruthy();
  });

  it('routes venue_manager-approval venues to pending_review then publishes on approval', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { approvalMode: 'venue_manager' });
    const host = await seedMember('host2@test.dev', {
      roles: [
        { scope: 'community:*', role: 'member' },
        { scope: 'venue:' + venue.id, role: 'venue_manager' },
      ],
    });
    const session = sessionFor(host.id, host.roles);

    const { event } = await eventService.createEvent(eventInput(venue.id), session);
    const pending = await eventService.publishEvent(event.id, session);
    expect(pending.reviewRequired).toBe(true);
    expect(pending.event.status).toBe('pending_review');

    const approved = await eventService.publishEvent(event.id, session);
    expect(approved.event.status).toBe('published');

    const [row] = await db.select().from(events).where(eq(events.id, event.id)).limit(1);
    expect(row?.status).toBe('published');
  });
});
