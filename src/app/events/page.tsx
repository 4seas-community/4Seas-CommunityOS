import { apiGet } from '../../lib/api-client';

export default async function EventsPage() {
  let events: Array<Record<string, unknown>> = [];
  try {
    const res = await apiGet<{ events: Array<Record<string, unknown>> }>('/api/events?view=list');
    events = res.events ?? [];
  } catch {
    events = [];
  }
  return (
    <section>
      <h1>Events</h1>
      <p className="muted">Public schedule across all 4Seas venues.</p>
      {events.map((ev) => (
        <div className="card" key={String(ev.id)}>
          <a href={'/events/' + String(ev.id)}>{String(ev.title)}</a>
          <div className="muted">{String(ev.startAt)} → {String(ev.endAt)}</div>
        </div>
      ))}
    </section>
  );
}
