/**
 * Shared presentational components for the community pages.
 * Server components only — no client JS needed for the M0 surface.
 */
import Link from 'next/link';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DateBlock({ start }: { start: string }) {
  const d = new Date(start);
  return (
    <div className="date-block" aria-hidden="true">
      <span className="d-mon">{MONTHS[d.getMonth()]}</span>
      <span className="d-day">{d.getDate()}</span>
      <span className="d-week">{WEEKDAYS[d.getDay()]}</span>
    </div>
  );
}

export interface EventCardData {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  eventType: string;
  isPaid: string;
  tags: string[];
  venue: { id: string; name: string; building?: { name: string } | null } | null;
}

export function EventCard({ ev }: { ev: EventCardData }) {
  const where = ev.venue ? ev.venue.name + (ev.venue.building ? ' · ' + ev.venue.building.name : '') : 'Online / external';
  return (
    <article className="card event-card">
      <DateBlock start={ev.startAt} />
      <div style={{ minWidth: 0 }}>
        <Link className="ev-title" href={'/events/' + ev.id}>
          {ev.title}
        </Link>
        <div className="ev-meta">
          <span>{formatTime(ev.startAt)} – {formatTime(ev.endAt)}</span>
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}
