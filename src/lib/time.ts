/**
 * Time utilities: timezone-aware opening-hour math and interval algebra.
 * Venue opening hours are interpreted in the building's timezone (docs/03 §4.1).
 */
import type { OpeningHours } from '../modules/place/schema';

export interface Interval {
  start: Date;
  end: Date;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timezone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timezone, f);
  }
  return f;
}

/** Offset (ms) of timezone at the given instant: local-wall-time(UTC) - utc. */
function tzOffsetMs(date: Date, timezone: string): number {
  const parts = partsFormatter(timezone).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUTC - date.getTime();
}

/** Convert a wall-clock date ("YYYY-MM-DD") + time ("HH:MM") in tz to a UTC Date. */
export function zonedTimeToUtc(dateStr: string, time: string, timezone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMs(new Date(guess), timezone));
}

/** Wall-clock date key ("YYYY-MM-DD") of an instant in tz. */
export function dateKeyInZone(date: Date, timezone: string): string {
  const parts = partsFormatter(timezone).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

/** ISO weekday (1=Mon..7=Sun) of an instant in tz. */
export function isoWeekdayInZone(date: Date, timezone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd) || 7;
}

/** Half-open interval overlap test: [aStart, aEnd) vs [bStart, bEnd). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Expand an interval by buffer minutes on both sides. */
export function withBuffer(iv: Interval, bufferMin: number): Interval {
  return { start: new Date(iv.start.getTime() - bufferMin * 60000), end: new Date(iv.end.getTime() + bufferMin * 60000) };
}

/** Subtract a list of busy intervals from one segment, returning the free pieces. */
export function subtractIntervals(segment: Interval, busy: Interval[]): Interval[] {
  let pieces: Interval[] = [segment];
  for (const b of busy) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (!overlaps(p, b)) {
        next.push(p);
        continue;
      }
      if (p.start < b.start) next.push({ start: p.start, end: new Date(Math.min(b.start.getTime(), p.end.getTime())) });
      if (p.end > b.end) next.push({ start: new Date(Math.max(b.end.getTime(), p.start.getTime())), end: p.end });
    }
    pieces = next;
  }
  return pieces.filter((p) => p.end.getTime() - p.start.getTime() > 0);
}

export interface AvailabilityInput {
  openingHours: OpeningHours;
  blackoutDates: string[]; // "YYYY-MM-DD"
  /** Existing occupancy; already includes each booking's buffer (docs/03 §4.2). */
  busy: Interval[];
  from: Date;
  to: Date;
  timezone: string;
}

export interface Slot {
  start: string; // ISO
  end: string; // ISO
}

/**
 * Compute free slots between from..to for a venue.
 * Rules (docs/03 §4.1): venue open, within opening hours, not a blackout date,
 * no overlap with active bookings (buffered).
 */
export function computeAvailableSlots(input: AvailabilityInput): Slot[] {
  const { openingHours, blackoutDates, busy, from, to, timezone } = input;
  const blackout = new Set(blackoutDates);
  const slots: Slot[] = [];

  // Iterate wall-clock days of the venue timezone covering [from, to].
  const startKey = dateKeyInZone(from, timezone);
  const lastKey = dateKeyInZone(to, timezone);
  const cursor = new Date(startKey + 'T00:00:00Z');
  for (let guard = 0; guard < 400; guard++) {
    const dayKey = dateKeyInZone(cursor, timezone);
    if (dayKey > lastKey) break;
    if (!blackout.has(dayKey)) {
      const weekday = String(isoWeekdayInZone(cursor, timezone));
      for (const window of openingHours[weekday] ?? []) {
        const openTime = window[0];
        const closeTime = window[1];
        let segStart = zonedTimeToUtc(dayKey, openTime, timezone);
        let segEnd = zonedTimeToUtc(dayKey, closeTime, timezone);
        if (segEnd <= segStart) segEnd = new Date(segEnd.getTime() + 24 * 3600000); // crosses midnight
        const clipped: Interval = {
          start: new Date(Math.max(segStart.getTime(), from.getTime())),
          end: new Date(Math.min(segEnd.getTime(), to.getTime())),
        };
        if (clipped.end <= clipped.start) continue;
        for (const free of subtractIntervals(clipped, busy)) {
          slots.push({ start: free.start.toISOString(), end: free.end.toISOString() });
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

/** True when [start, end] fits entirely inside one opening window of that day. */
export function isWithinOpeningHours(openingHours: OpeningHours, timezone: string, start: Date, end: Date): boolean {
  const startKey = dateKeyInZone(start, timezone);
  const endKey = dateKeyInZone(end, timezone);
  if (endKey !== startKey) return false;
  const weekday = String(isoWeekdayInZone(start, timezone));
  for (const win of openingHours[weekday] ?? []) {
    let segStart = zonedTimeToUtc(startKey, win[0], timezone);
    let segEnd = zonedTimeToUtc(startKey, win[1], timezone);
    if (segEnd <= segStart) segEnd = new Date(segEnd.getTime() + 24 * 3600000);
    if (start >= segStart && end <= segEnd) return true;
  }
  return false;
}
