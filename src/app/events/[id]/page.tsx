import { apiGet } from '../../../lib/api-client';
import { DateBlock } from '../../../components/event-card';
import { RegisterButton } from '../../../components/forms';

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  eventType: string;
  status: string;
  visibility: string;
  maxCapacity: number | null;
  suggestedAttendees: number | null;
  entryRequirements: string | null;
  transportInfo: string | null;
  isPaid: string;
  tags: string[];
  checkinMode: string;
  checkinClaimCap: number | null;
  venue: { id: string; name: string; building: { name: string } | null } | null;
  host: { id: string; displayName: string | null; email: string } | null;
  registrationCount: number;
  checkedInCount: number;
}

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev: EventDetail | null = null;
  let error: string | null = null;
  try {
    ev = await apiGet<EventDetail>('/api/events/' + id);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error || !ev) {
    return (
      <section>
        <h1>Event not found</h1>
        <div className="notice notice-error">{error ?? 'This event does not exist or is no longer public.'}</div>
        <a href="/events" className="btn btn-ghost">
          ← Back to events
        </a>
      </section>
    );
  }

  const start = new Date(ev.startAt);
  const end = new Date(ev.endAt);

  return (
    <article>
      <p style={{ marginBottom: 14 }}>
        <a href="/events" className="muted">
          ← All events
        </a>
      </p>

      <div className="card" style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <DateBlock start={ev.startAt} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ marginBottom: 4 }}>{ev.title}</h1>
          <div className="ev-meta">
            <span>
              {start.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Bangkok' })}
              {' → '}
              {end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
            </span>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <span className="badge badge-brand">
              {ev.venue ? ev.venue.name + (ev.venue.building ? ' · ' + ev.venue.building.name : '') : 'Online / external'}
            </span>
            <span className="badge">{ev.eventType.replace('_', ' ')}</span>
            {ev.isPaid !== 'free' && <span className="badge badge-accent">Paid · {ev.isPaid}</span>}
            {ev.maxCapacity && <span className="badge">Cap {ev.maxCapacity}</span>}
            <span className="badge badge-ok">{ev.registrationCount} going</span>
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
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>About</h3>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ev.description || 'No description yet.'}</p>
        <p className="muted" style={{ marginTop: 12 }}>
          Hosted by {ev.host?.displayName ?? ev.host?.email ?? 'a community member'}
        </p>
      </div>

      <div className="card-grid" style={{ marginTop: 14 }}>
        {ev.transportInfo && (
          <div className="card">
            <h3>Getting there</h3>
            <p className="muted" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {ev.transportInfo}
            </p>
          </div>
        )}
        {ev.entryRequirements && (
          <div className="card">
            <h3>Entry requirements</h3>
            <p className="muted" style={{ margin: 0 }}>
              {ev.entryRequirements}
            </p>
          </div>
        )}
        <div className="card">
          <h3>Check-in</h3>
          <p className="muted" style={{ margin: 0 }}>
            {ev.checkinMode === 'none'
              ? 'No check-in for this event.'
              : 'Rotating QR code at the door — the host shows a fresh code for each scan.'}
            {ev.checkinClaimCap ? ' Limited to ' + ev.checkinClaimCap + ' claims.' : ''}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Register</h3>
        <p className="muted">Sign in with your email first — we send a one-time link, no password needed.</p>
        <RegisterButton eventId={ev.id} />
      </div>
    </article>
  );
}