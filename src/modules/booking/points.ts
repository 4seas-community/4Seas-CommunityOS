/**
 * Points charging for bookings (docs/03 §4.3, docs/02 D6).
 *
 * Default OFF: venue rules ship with points_per_hour = 0, so every flow runs at
 * zero cost. When a rule sets a price and POINTS_ENABLED=true, charges are
 * executed against CAS (the authority) on approval and refunded when a booking
 * is cancelled inside the free window. Local tables stay mirrors only.
 */
import { casClient } from '../cas';
import { config } from '../../lib/config';
import type { Booking } from './schema';
import type { Member } from '../people/schema';

/** CAS ledger key: the linked account id once mapped, else the local member id. */
export function pointsKey(member: Member): string {
  return member.casUserId ?? member.id;
}

/** Charge a booking's points to CAS. Returns the amount charged (0 when disabled). */
export async function chargeBooking(booking: Booking, member: Member): Promise<number> {
  if (!config.pointsEnabled || booking.pointsCharged <= 0) return 0;
  await casClient().adjustPoints(pointsKey(member), {
    delta: -booking.pointsCharged,
    reason: 'booking_charge',
    refType: 'booking',
    refId: booking.id,
  });
  return booking.pointsCharged;
}

/** Refund a cancelled booking's points to CAS. Returns the amount refunded. */
export async function refundBooking(booking: Booking, member: Member): Promise<number> {
  if (!config.pointsEnabled || booking.pointsCharged <= 0) return 0;
  await casClient().adjustPoints(pointsKey(member), {
    delta: booking.pointsCharged,
    reason: 'booking_refund',
    refType: 'booking',
    refId: booking.id,
  });
  return booking.pointsCharged;
}
