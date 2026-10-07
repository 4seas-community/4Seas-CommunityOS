/**
 * Shared presentational components for the community pages.
 * Server components only — no client JS needed for the M0 surface.
 */
import Link from 'next/link';
import { config } from '../lib/config';

/**
 * Dates render in the event's own timezone, not the server's (UTC on Workers),
 * so an early-morning Bangkok event doesn't show up on the previous day.
 */
export function DateBlock({ start, timezone }: { start: string; timezone?: string | null }) {
  const d = new Date(start);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleString('en-GB', { ...opts, timeZone: timezone ?? config.defaultTimezone });
  return (
    <div className="date-block" aria-hidden="true">
      <span className="d-mon">{part({ month: 'short' })}</span>
      <span className="d-day">{part({ day: 'numeric' })}</span>
      <span className="d-week">{part({ weekday: 'short' })}</span>
    </div>
  );
}

export interface EventCardData {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone?: string | null;
  eventType: string;
  isPaid: string;
  tags: string[];
  venue: { id: string; name: string; building?: { name: string } | null } | null;
}

export function EventCard({ ev }: { ev: EventCardData }) {
  const where = ev.venue ? ev.venue.name + (ev.venue.building ? ' · ' + ev.venue.building.name : '') : 'Online / external';
  return (
    <article className="card event-card">
      <DateBlock start={ev.startAt} timezone={ev.timezone} />
      <div style={{ minWidth: 0 }}>
        <Link className="ev-title" href={'/events/' + ev.id}>
          {ev.title}
        </Link>
        <div className="ev-meta">
          <span>{formatTime(ev.startAt, ev.timezone)} – {formatTime(ev.endAt, ev.timezone)}</span>
          <span aria-hidden="true">·</span>
          <span>{where}</span>
          {ev.isPaid !== 'free' && <span className="badge badge-accent">Paid</span>}
          {ev.eventType !== 'in_person' && <span className="badge">{ev.eventType.replace('_', ' ')}</span>}
        </div>
        {ev.tags.length > 0 && (
          <div className="tag-row">
            {ev.tags.map((t) => (
              <span className="tag" key={t}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <span className="emoji" aria-hidden="true">
        {emoji}
      </span>
      <strong>{title}</strong>
      {hint && <p style={{ margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

function formatTime(iso: string, timezone?: string | null): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone ?? config.defaultTimezone });
}
