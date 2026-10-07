import { apiGet } from '../../../lib/api-client';
import { DateBlock } from '../../../components/event-card';
import { safeTimezone } from '../../../lib/timezone';
import { RegisterButton } from '../../../components/forms';
import type { getEvent } from '../../../modules/event/service';

/** Wire shape of GET /api/events/:id — derived from the service so the two can't drift. */
type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;
type EventDetailResponse = Jsonified<Awaited<ReturnType<typeof getEvent>>>;

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail: EventDetailResponse | null = null;
  let error: string | null = null;
  try {
    detail = await apiGet<EventDetailResponse>('/api/events/' + id);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error || !detail) {
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

  const { event: ev, venue, host, registrationCount } = detail;
  const start = new Date(ev.startAt);
  const end = new Date(ev.endAt);
  const timeZone = safeTimezone(ev.timezone);

  return (
    <article>
      <p style={{ marginBottom: 14 }}>
        <a href="/events" className="muted">
          ← All events
        </a>
      </p>

      <div className="card" style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <DateBlock start={ev.startAt} timezone={ev.timezone} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ marginBottom: 4 }}>{ev.title}</h1>
          <div className="ev-meta">
            <span>
              {start.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone })}
              {' → '}
              {end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })}
            </span>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <span className="badge badge-brand">
              {venue ? venue.name + (venue.buildingName ? ' · ' + venue.buildingName : '') : (ev.externalLocation ?? 'Online / external')}
            </span>
            <span className="badge">{ev.eventType.replace('_', ' ')}</span>
            {ev.isPaid !== 'free' && <span className="badge badge-accent">Paid · {ev.isPaid}</span>}
            {ev.maxCapacity && <span className="badge">Cap {ev.maxCapacity}</span>}
            <span className="badge badge-ok">{registrationCount} going</span>
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
          Hosted by {host?.displayName ?? 'a community member'}
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