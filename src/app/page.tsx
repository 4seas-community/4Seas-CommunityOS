import { apiGet } from '../lib/api-client';
import { EventCard, EmptyState, type EventCardData } from '../components/event-card';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let events: EventCardData[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ events: EventCardData[] }>('/api/events?view=list');
    events = res.events ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  const upcoming = events.filter((e) => new Date(e.endAt).getTime() > Date.now());

  return (
    <section>
      <div className="hero">
        <h1>What&rsquo;s happening at 4Seas</h1>
        <p>
          A community operating system for our buildings in Chiang Mai — discover events, book spaces, and
          grow the community together.
        </p>
        <div className="hero-meta">
          <span>{upcoming.length} upcoming events</span>
          <span>Venues across Building F &amp; 4Seas Nimman</span>
          <span>Members host, everyone joins</span>
        </div>
      </div>

      {error && <div className="notice notice-error">Could not load events: {error}</div>}

      <div className="section-head">
        <h2>Upcoming events</h2>
        <a href="/events" className="muted">
          View all →
        </a>
      </div>

      {!error && upcoming.length === 0 && (
        <EmptyState emoji="🌱" title="No events yet" hint="Be the first to host something — it takes 30 seconds." />
      )}

      <div className="stack">
        {upcoming.slice(0, 8).map((ev) => (
          <EventCard ev={ev} key={ev.id} />
        ))}
      </div>
    </section>
  );
}
