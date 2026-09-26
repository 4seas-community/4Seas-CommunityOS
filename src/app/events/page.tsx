import { apiGet } from '../../lib/api-client';
import { EventCard, EmptyState, type EventCardData } from '../../components/event-card';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  let events: EventCardData[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ events: EventCardData[] }>('/api/events?view=list');
    events = res.events ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  const upcoming = events.filter((e) => new Date(e.endAt).getTime() > Date.now());
  const past = events.filter((e) => new Date(e.endAt).getTime() <= Date.now()).reverse();

  return (
    <section>
      <h1>Events</h1>
      <p className="page-sub">The shared schedule across all 4Seas venues — member-hosted and community-organised.</p>

      {error && <div className="notice notice-error">Could not load events: {error}</div>}

      <h2>Upcoming</h2>
      {!error && upcoming.length === 0 && <EmptyState emoji="🗓️" title="Nothing scheduled yet" />}
      <div className="stack">
        {upcoming.map((ev) => (
          <EventCard ev={ev} key={ev.id} />
        ))}
      </div>

      {past.length > 0 && (
        <>
          <div className="section-head">
            <h2>Past</h2>
            <span className="muted">{past.length} events</span>
          </div>
          <div className="stack">
            {past.slice(0, 10).map((ev) => (
              <EventCard ev={ev} key={ev.id} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
