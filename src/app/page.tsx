import { apiGet } from '../lib/api-client';

interface EventRow {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  eventType: string;
  visibility: string;
  status: string;
  tags: string[];
  venue: { id: string; name: string; building?: { name: string } | null } | null;
}

export default async function HomePage() {
  let events: EventRow[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ events: EventRow[] }>('/api/events?view=list');
    events = res.events ?? [];
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section>
      <h1>Upcoming events</h1>
      {error && <p className="muted">Could not load events: {error}</p>}
      {!error && events.length === 0 && <p className="muted">No events yet.</p>}
      {events.map((ev) => (
        <div className="card" key={ev.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <a href={'/events/' + ev.id} style={{ fontWeight: 600 }}>
              {ev.title}
            </a>
            <span className="muted">{new Date(ev.startAt).toLocaleString('en-GB')}</span>
          </div>
          <div className="muted">
            {ev.venue ? ev.venue.name + (ev.venue.building ? ' · ' + ev.venue.building.name : '') : 'Online / external'}
            {' · '}
            {ev.tags.join(', ')}
          </div>
        </div>
      ))}
    </section>
  );
}
