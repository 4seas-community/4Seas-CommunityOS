/**
 * Operations console, batch 2 (docs/10 §3): the two review queues an operator
 * clears every day, plus the authorisation around approving.
 */
import { describe, expect, it } from 'vitest';
import * as adminService from '../src/modules/admin/service';
import * as eventService from '../src/modules/event/service';
import * as bookingService from '../src/modules/booking/service';
import { seedCommunity, seedMember, seedVenue, sessionFor, bookingInput } from './helpers';

// Tomorrow 10:00 Asia/Bangkok (03:00 UTC) - always inside venue opening hours.
const startAt = (() => {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setUTCHours(3, 0, 0, 0);
  return d;
})();
const endAt = new Date(startAt.getTime() + 2 * 3600 * 1000);

function eventInput(venueId: string) {
  return {
    title: 'Review me',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: 'Asia/Bangkok',
    eventType: 'in_person' as const,
    venueId,
    tags: ['community'],
  };
}

describe('operations console - batch 2 queues', () => {
  it('counts pending bookings and events awaiting review', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { approvalMode: 'venue_manager' });
    const admin = await seedMember('ops@test.dev', { roles: [{ scope: 'community:*', role: 'admin' }] });
    const host = await seedMember('queue-host@test.dev', {
      roles: [{ scope: 'community:*', role: 'member' }, { scope: 'venue:' + venue.id, role: 'venue_manager' }],
    });
    const hostSession = sessionFor(host.id, host.roles);

    const before = await adminService.overview(sessionFor(admin.id, admin.roles));
    expect(before.queues).toEqual({ bookingsPending: 0, eventsPendingReview: 0, bookingsUpcoming: 0 });

    // A different slot from the event below, or the overlap guard would fire.
    const ownSlot = { start: new Date(startAt.getTime() + 5 * 3600_000), end: new Date(startAt.getTime() + 7 * 3600_000) };
    await bookingService.createBooking(bookingInput(venue.id, ownSlot.start, ownSlot.end), hostSession);
    const { event } = await eventService.createEvent(eventInput(venue.id), hostSession);
    await eventService.publishEvent(event.id, hostSession); // draft -> pending_review

    const after = await adminService.overview(sessionFor(admin.id, admin.roles));
    // the standalone booking plus the one created with the event
    expect(after.queues.bookingsPending).toBe(2);
    expect(after.queues.eventsPendingReview).toBe(1);
  });

  it('filters events by status so the review queue only sees pending_review', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { approvalMode: 'venue_manager' });
    const host = await seedMember('filter-host@test.dev', {
      roles: [{ scope: 'venue:' + venue.id, role: 'venue_manager' }],
    });
    const session = sessionFor(host.id, host.roles);

    const { event } = await eventService.createEvent(eventInput(venue.id), session);
    expect(await eventService.listEvents({ status: 'pending_review' }, session)).toHaveLength(0);
    expect(await eventService.listEvents({ status: 'draft' }, session)).toHaveLength(1);

    await eventService.publishEvent(event.id, session);
    const queue = await eventService.listEvents({ status: 'pending_review' }, session);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(event.id);
    expect(await eventService.listEvents({ status: 'draft' }, session)).toHaveLength(0);

    // the array form is what the route uses for ?status=a&status=b
    expect(await eventService.listEvents({ status: ['pending_review', 'draft'] }, session)).toHaveLength(1);
  });

  it('refuses self-approval and non-managers, and the overview is admin-only', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { approvalMode: 'venue_manager' });
    const host = await seedMember('self-approve@test.dev', {
      roles: [{ scope: 'community:*', role: 'member' }],
    });
    const manager = await seedMember('venue-manager@test.dev', {
      roles: [{ scope: 'venue:' + venue.id, role: 'venue_manager' }],
    });
    const hostSession = sessionFor(host.id, host.roles);

    const { event } = await eventService.createEvent(eventInput(venue.id), hostSession);
    await eventService.publishEvent(event.id, hostSession); // -> pending_review

    // A host cannot approve their own event, even though they can edit it.
    await expect(eventService.publishEvent(event.id, hostSession)).rejects.toMatchObject({ status: 403 });
    // The venue's manager can.
    const published = await eventService.publishEvent(event.id, sessionFor(manager.id, manager.roles));
    expect(published.event.status).toBe('published');

    // Booking decisions follow the same venue-scoped rule.
    const ownSlot = { start: new Date(startAt.getTime() + 5 * 3600_000), end: new Date(startAt.getTime() + 7 * 3600_000) };
    const booking = await bookingService.createBooking(bookingInput(venue.id, ownSlot.start, ownSlot.end), hostSession);
    expect(booking.booking.status).toBe('pending');
    await expect(
      bookingService.approveBooking(booking.booking.id, hostSession),
    ).rejects.toMatchObject({ status: 403 });
    const approved = await bookingService.approveBooking(
      booking.booking.id,
      sessionFor(manager.id, manager.roles),
      'looks fine',
    );
    expect(approved.status).toBe('approved');

    // The community dashboard counters stay admin-only.
    await expect(adminService.overview(hostSession)).rejects.toMatchObject({ status: 403 });
  });
});
