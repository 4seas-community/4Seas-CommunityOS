/**
 * Points deduction tests: with a priced venue rule and POINTS_ENABLED=true,
 * bookings charge CAS points on approval and refund on cancellation.
 * The mock CAS client stands in for the real account system (docs/06).
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as bookingService from '../src/modules/booking/service';
import { casClient } from '../src/modules/cas';
import { config } from '../src/lib/config';
import { bookingInput, seedCommunity, seedMember, seedVenue, sessionFor } from './helpers';

afterEach(() => {
  (config as { pointsEnabled: boolean }).pointsEnabled = false;
});

describe('booking flow with points enabled', () => {
  it('charges points on auto-approved bookings and refunds on cancel', async () => {
    (config as { pointsEnabled: boolean }).pointsEnabled = true;
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { pointsPerHour: 10 });
    const member = await seedMember();
    const key = member.casUserId ?? member.id;
    const cas = casClient();

    // member holds 100 points in CAS
    await cas.adjustPoints(key, { delta: 100, reason: 'quota_grant' });
    expect((await cas.getPoints(key)).balance).toBe(100);

    const session = sessionFor(member.id);
    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    // 2h booking + 30min buffer on each side = 3h occupancy * 10 pts/h = 30.
    const { booking } = await bookingService.createBooking(bookingInput(venue.id, start, end), session);

    expect(booking.pointsCharged).toBe(30);
    expect((await cas.getPoints(key)).balance).toBe(70);

    // cancel inside the free window -> full refund
    const canceled = await bookingService.cancelBooking(booking.id, session);
    expect(canceled.status).toBe('canceled');
    expect((await cas.getPoints(key)).balance).toBe(100);
  });

  it('rejects bookings the member cannot afford', async () => {
    (config as { pointsEnabled: boolean }).pointsEnabled = true;
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { pointsPerHour: 50 });
    const member = await seedMember();
    const key = member.casUserId ?? member.id;
    const cas = casClient();
    await cas.adjustPoints(key, { delta: 10, reason: 'quota_grant' });

    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 2 * 3600 * 1000); // 100 points needed
    await expect(
      bookingService.createBooking(bookingInput(venue.id, start, end), sessionFor(member.id)),
    ).rejects.toThrow(/insufficient/i);
    expect((await cas.getPoints(key)).balance).toBe(10);
  });

  it('charges on manager approval of a pending booking', async () => {
    (config as { pointsEnabled: boolean }).pointsEnabled = true;
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { pointsPerHour: 5, approvalMode: 'venue_manager' });
    const member = await seedMember();
    const key = member.casUserId ?? member.id;
    const cas = casClient();
    await cas.adjustPoints(key, { delta: 100, reason: 'quota_grant' });

    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 3600 * 1000);
    // 1h booking + 1h buffer = 2h occupancy * 5 pts/h = 10.
    const { booking } = await bookingService.createBooking(bookingInput(venue.id, start, end), sessionFor(member.id));
    expect(booking.status).toBe('pending');
    expect(booking.pointsCharged).toBe(10);
    expect((await cas.getPoints(key)).balance).toBe(100); // not charged until approval

    const manager = await seedMember('manager@test.dev', {
      roles: [
        { scope: 'community:*', role: 'member' },
        { scope: 'venue:' + venue.id, role: 'venue_manager' },
      ],
    });
    const approved = await bookingService.approveBooking(booking.id, sessionFor(manager.id, manager.roles));
    expect(approved.status).toBe('approved');
    expect((await cas.getPoints(key)).balance).toBe(90);
  });
});

function nextWeekday10am(): Date {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setUTCHours(3, 0, 0, 0); // 10:00 +07:00
  return d;
}
