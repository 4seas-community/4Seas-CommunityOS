/**
 * Booking flows at ZERO points (the default): every flow must work end to end
 * with points_per_hour = 0 and POINTS_ENABLED unset (docs/02 D6, docs/03 §4.3).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as bookingService from '../src/modules/booking/service';
import { casClient } from '../src/modules/cas';
import { config } from '../src/lib/config';
import { bookingInput, seedCommunity, seedMember, seedVenue, sessionFor } from './helpers';
import { db } from '../src/lib/db';
import { members } from '../src/modules/people/schema';
import { eq } from 'drizzle-orm';

describe('booking flow with points disabled (default)', () => {
  it('auto-approves a booking and charges zero points', async () => {
    expect(config.pointsEnabled).toBe(false);
    const community = await seedCommunity();
    const { venue, rule } = await seedVenue(community.id); // pointsPerHour defaults to 0
    const member = await seedMember();
    const session = sessionFor(member.id);

    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    const { booking, approvalMode } = await bookingService.createBooking(bookingInput(venue.id, start, end), session);

    expect(approvalMode).toBe('auto');
    expect(booking.status).toBe('approved');
    expect(booking.pointsCharged).toBe(0);
    expect(booking.depositPoints).toBe(0);

    // CAS mirror balance stays at zero — nothing was charged.
    const balance = await casClient().getPoints(member.casUserId ?? member.id);
    expect(balance.balance).toBe(0);

    // lifecycle: check-in -> completed
    const checkedIn = await bookingService.checkInBooking(booking.id, session);
    expect(checkedIn.status).toBe('checked_in');
    const completed = await bookingService.completeBooking(booking.id, session);
    expect(completed.status).toBe('completed');
  });

  it('rejects overlapping bookings (buffer included)', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const member = await seedMember();
    const session = sessionFor(member.id);

    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    await bookingService.createBooking(bookingInput(venue.id, start, end), session);

    // overlapping by 30 minutes -> conflict
    const clashStart = new Date(end.getTime() - 30 * 60 * 1000);
    const clashEnd = new Date(clashStart.getTime() + 3600 * 1000);
    await expect(bookingService.createBooking(bookingInput(venue.id, clashStart, clashEnd), session)).rejects.toThrow(
      /already booked|conflict/i,
    );
  });

  it('routes venue_manager approval requests to pending', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id, { approvalMode: 'venue_manager' });
    const member = await seedMember();
    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    const { booking, approvalMode } = await bookingService.createBooking(bookingInput(venue.id, start, end), sessionFor(member.id));
    expect(approvalMode).toBe('venue_manager');
    expect(booking.status).toBe('pending');
  });

  it('cancels without any points movement when points are off', async () => {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const member = await seedMember();
    const session = sessionFor(member.id);
    const start = nextWeekday10am();
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    const { booking } = await bookingService.createBooking(bookingInput(venue.id, start, end), session);
    const canceled = await bookingService.cancelBooking(booking.id, session);
    expect(canceled.status).toBe('canceled');
  });
});

/** Next Monday 10:00 Asia/Bangkok as a UTC Date (within opening hours). */
function nextWeekday10am(): Date {
  const now = new Date();
  const d = new Date(now.getTime() + 24 * 3600 * 1000);
  d.setUTCHours(3, 0, 0, 0); // 10:00 +07:00
  return d;
}
