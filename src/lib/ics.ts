/**
 * iCal (RFC 5545) generation for the schedule feed — GET /schedule.ics (docs/03 §6).
 */

export interface IcsEvent {
  id: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  url?: string | null;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function generateIcs(events: IcsEvent[], calendarName = '4Seas CommunityOS'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//4Seas CommunityOS//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(calendarName),
  ];
  const stamp = toIcsDate(new Date());
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + e.id + '@communityos',
      'DTSTAMP:' + stamp,
      'DTSTART:' + toIcsDate(e.startAt),
      'DTEND:' + toIcsDate(e.endAt),
      'SUMMARY:' + escapeText(e.title),
    );
    if (e.description) lines.push('DESCRIPTION:' + escapeText(e.description));
    if (e.location) lines.push('LOCATION:' + escapeText(e.location));
    if (e.url) lines.push('URL:' + escapeText(e.url));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
