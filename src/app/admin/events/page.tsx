import Link from 'next/link';
import { apiGet } from '../../../lib/api-client';
import { config } from '../../../lib/config';
import { canUseAdmin, getCurrentMember } from '../../../lib/session-server';
import { EventApproval } from '../../../components/admin-forms';

export const dynamic = 'force-dynamic';

interface EventRow {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  venueId: string | null;
  status: string;
  hostId: string;
}

function localTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/**
 * Event review queue (docs/10 §3 batch 2.2). An event lands in `pending_review`
 * when the venue's rules ask for a human decision before publishing; publishEvent
 * then only lets that venue's manager (or a community admin) approve it.
 */
export default async function AdminEventsPage() {
  const member = await getCurrentMember();
  if (!canUseAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Event review</h1>
        <div className="notice notice-warn">You need a venue manager or community admin role.</div>
        <Link href="/admin" className="btn btn-ghost">Back to console</Link>
      </section>
    );
  }

  const timezone = config.defaultTimezone;
  let queue: EventRow[] = [];
  let venueNames = new Map<string, string>();
  let error: string | null = null;
  try {
    const [eventsRes, venuesRes] = await Promise.all([
      apiGet<{ events: EventRow[] }>('/api/events?view=list&status=pending_review'),
      apiGet<{ venues: Array<{ id: string; name: string }> }>('/api/venues'),
    ]);
    queue = eventsRes.events;
    venueNames = new Map(venuesRes.venues.map((v) => [v.id, v.name]));
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <section>
      <Link href="/admin" className="muted">
        ← Operations console
      </Link>
      <h1 style={{ marginTop: 8 }}>Event review</h1>
      <p className="page-sub">
        Events whose venue requires approval before publishing. Approving publishes the event and queues the
        usual notifications.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="section-head">
        <h2>Awaiting review</h2>
        <span className="badge badge-accent">{queue.length}</span>
      </div>

      {queue.length === 0 ? (
        <div className="empty-state">No events waiting for review.</div>
      ) : (
        <div className="stack">
          {queue.map((event) => (
            <article className="card" key={event.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{event.title}</strong>
                  <div className="muted">
                    {(event.venueId && venueNames.get(event.venueId)) ?? 'no venue'} ·{' '}
                    {localTime(event.startAt, timezone)} → {localTime(event.endAt, timezone)}
                  </div>
                </div>
                <span className="badge badge-accent">{event.status}</span>
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <Link className="btn btn-ghost" href={'/events/' + event.id}>
                  Preview
                </Link>
                <EventApproval eventId={event.id} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
