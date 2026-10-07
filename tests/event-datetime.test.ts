/**
 * Event/booking datetime validation.
 *
 * `z.string().datetime()` rejects offsets by default, so the create-event form's
 * own documented format ("2026-10-01T10:00:00+07:00") failed with a 400. The form
 * now sends UTC converted from the community timezone, but offsets must still be
 * accepted for API/agent callers.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { eventCreateSchema } from '../src/modules/event/service';
import { buildingCreateSchema, buildingUpdateSchema } from '../src/modules/place/service';
import { DateBlock, EventCard } from '../src/components/event-card';
import { safeTimezone } from '../src/lib/timezone';
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

  it('maps a spring-forward gap wall time to the instant just after the gap (west of UTC)', () => {
    // 02:30 doesn't exist on 2026-03-08 in New York; 07:30Z is 03:30 EDT.
    expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('maps a spring-forward gap wall time to the instant just after the gap (east of UTC)', () => {
    // 01:30 doesn't exist on 2026-03-29 in London; 01:30Z is 02:30 BST.
    expect(zonedTimeToUtc('2026-03-29', '01:30', 'Europe/London').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    // Lord Howe shifts by 30 minutes: 02:15 doesn't exist on 2026-10-04; 15:45Z (read at +10:30) is 02:45 (+11:00).
    expect(zonedTimeToUtc('2026-10-04', '02:15', 'Australia/Lord_Howe').toISOString()).toBe('2026-10-03T15:45:00.000Z');
  });

  it('picks the first occurrence of an ambiguous fall-back wall time (west of UTC)', () => {
    // 01:30 happens twice on 2026-11-01; the first is 01:30 EDT = 05:30Z.
    expect(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('picks the first occurrence of an ambiguous fall-back wall time (east of UTC)', () => {
    // 01:30 happens twice on 2026-10-25 in London; the first is 01:30 BST = 00:30Z.
    expect(zonedTimeToUtc('2026-10-25', '01:30', 'Europe/London').toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('handles ordinary times on either side of DST', () => {
    expect(zonedTimeToUtc('2026-01-15', '10:00', 'America/New_York').toISOString()).toBe('2026-01-15T15:00:00.000Z');
    expect(zonedTimeToUtc('2026-07-15', '10:00', 'America/New_York').toISOString()).toBe('2026-07-15T14:00:00.000Z');
  });
});

describe('timezone validation (write side)', () => {
  const base = { title: 't', startAt: '2026-10-07T03:00:00Z', endAt: '2026-10-07T04:00:00Z' };

  it('rejects unknown or empty event timezones', () => {
    expect(eventCreateSchema.safeParse({ ...base, timezone: 'Foo/Bar' }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...base, timezone: '' }).success).toBe(false);
  });

  it('accepts IANA timezones and defaults when omitted', () => {
    expect(eventCreateSchema.safeParse({ ...base, timezone: 'Europe/London' }).success).toBe(true);
    const r = eventCreateSchema.parse(base);
    expect(r.timezone).toBe('Asia/Bangkok');
  });

  it('rejects unknown building timezones on create and update', () => {
    expect(buildingCreateSchema.safeParse({ name: 'B', timezone: 'Foo/Bar' }).success).toBe(false);
    expect(buildingUpdateSchema.safeParse({ timezone: 'Foo/Bar' }).success).toBe(false);
  });
});

describe('timezone rendering (read side)', () => {
  const card = {
    id: 'e1',
    title: 'Language Corner',
    startAt: '2026-10-06T22:30:00Z',
    endAt: '2026-10-07T01:00:00Z',
    eventType: 'in_person',
    isPaid: 'free',
    tags: [],
    venue: null,
  };

  it('falls back to the default zone for a bad stored timezone', () => {
    expect(safeTimezone('Foo/Bar')).toBe('Asia/Bangkok');
    expect(safeTimezone('')).toBe('Asia/Bangkok');
    expect(safeTimezone(null)).toBe('Asia/Bangkok');
    expect(safeTimezone('Europe/London')).toBe('Europe/London');
  });

  it('renders EventCard instead of throwing when the stored timezone is invalid', () => {
    expect(() => renderToStaticMarkup(createElement(EventCard, { ev: { ...card, timezone: 'Foo/Bar' } }))).not.toThrow();
  });

  it('DateBlock shows the event-local date, not the server (UTC) date', () => {
    // 22:30Z on the 6th is 05:30 on Wed the 7th in Bangkok.
    const html = renderToStaticMarkup(createElement(DateBlock, { start: card.startAt, timezone: 'Asia/Bangkok' }));
    expect(html).toContain('>7<');
    expect(html).toContain('>Wed<');
    expect(html).toContain('>Oct<');
  });

  it('EventCard shows times in the event timezone', () => {
    const html = renderToStaticMarkup(createElement(EventCard, { ev: { ...card, timezone: 'Asia/Bangkok' } }));
    expect(html).toContain('05:30');
    expect(html).toContain('08:00');
  });
});
