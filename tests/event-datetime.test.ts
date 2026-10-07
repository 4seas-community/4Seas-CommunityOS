/**
 * Event/booking datetime validation.
 *
 * `z.string().datetime()` rejects offsets by default, so the create-event form's
 * own documented format ("2026-10-01T10:00:00+07:00") failed with a 400. The form
 * now sends UTC converted from the community timezone, but offsets must still be
 * accepted for API/agent callers.
 */
import { describe, expect, it } from 'vitest';
import { eventCreateSchema } from '../src/modules/event/service';
import { bookingCreateSchema } from '../src/modules/booking/service';
import { zonedTimeToUtc } from '../src/lib/time';

const VENUE = '00000000-0000-4000-8000-000000000000';

describe('datetime validation', () => {
  it('accepts event times with an explicit offset', () => {
    const r = eventCreateSchema.safeParse({
      title: 'Language Corner',
      startAt: '2026-10-07T10:00:00+07:00',
      endAt: '2026-10-07T18:00:00+07:00',
    });
    expect(r.success).toBe(true);
  });

  it('still accepts UTC "Z" event times', () => {
    const r = eventCreateSchema.safeParse({
      title: 'Language Corner',
      startAt: '2026-10-07T03:00:00.000Z',
      endAt: '2026-10-07T11:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('compares offset times by instant, not by string', () => {
    // 10:00+07:00 is 03:00Z, so 04:00Z is after it even though "04" < "10" as strings.
    const ok = eventCreateSchema.safeParse({
      title: 't',
      startAt: '2026-10-07T10:00:00+07:00',
      endAt: '2026-10-07T04:00:00Z',
    });
    expect(ok.success).toBe(true);
    const bad = eventCreateSchema.safeParse({
      title: 't',
      startAt: '2026-10-07T10:00:00+07:00',
      endAt: '2026-10-07T02:00:00Z',
    });
    expect(bad.success).toBe(false);
  });

  it('rejects non-datetime strings', () => {
    const r = eventCreateSchema.safeParse({ title: 't', startAt: '2026-10-07 10:00', endAt: '2026-10-07 12:00' });
    expect(r.success).toBe(false);
  });

  it('accepts booking times with an explicit offset', () => {
    const r = bookingCreateSchema.safeParse({
      venueId: VENUE,
      startAt: '2026-10-07T10:00:00+07:00',
      endAt: '2026-10-07T12:00:00+07:00',
    });
    expect(r.success).toBe(true);
  });
});

describe('datetime-local -> UTC conversion', () => {
  it('reads the form wall time in the community timezone', () => {
    expect(zonedTimeToUtc('2026-10-07', '10:00', 'Asia/Bangkok').toISOString()).toBe('2026-10-07T03:00:00.000Z');
  });

  it('crosses the UTC date boundary correctly', () => {
    expect(zonedTimeToUtc('2026-10-07', '05:30', 'Asia/Bangkok').toISOString()).toBe('2026-10-06T22:30:00.000Z');
  });
});

describe('zonedTimeToUtc across DST transitions', () => {
  it('uses the post-switch offset just after spring-forward', () => {
    // 03:30 EDT (UTC-4); a single-pass lookup at the naive guess saw EST and gave 08:30Z.
    expect(zonedTimeToUtc('2026-03-08', '03:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('maps a non-existent wall time in the spring-forward gap to the instant after it', () => {
    // 02:30 doesn't exist on 2026-03-08 in New York; 07:30Z is 03:30 EDT.
    expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('picks the first occurrence of an ambiguous fall-back wall time', () => {
    // 01:30 happens twice on 2026-11-01; the first is 01:30 EDT = 05:30Z.
    expect(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('handles ordinary times on either side of DST', () => {
    expect(zonedTimeToUtc('2026-01-15', '10:00', 'America/New_York').toISOString()).toBe('2026-01-15T15:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-15', '10:00', 'America/New_York').toISOString()).toBe('2026-07-15T14:00:00.000Z');
  });
});
