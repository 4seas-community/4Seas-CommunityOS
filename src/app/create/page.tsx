import { apiGet } from '../../lib/api-client';

interface VenueOption {
  id: string;
  name: string;
  building: { name: string } | null;
}

export default async function CreateEventPage() {
  let venues: VenueOption[] = [];
  try {
    const res = await apiGet<{ venues: VenueOption[] }>('/api/venues');
    venues = res.venues ?? [];
  } catch {
    venues = [];
  }
  return (
    <section>
      <h1>Create event</h1>
      <p className="muted">
        Quick create needs only a title, a time and a venue. Full fields are available via the API and the Telegram bot.
      </p>
      <div className="card">
        <form method="post" action="/api/events">
          <label>Title</label>
          <input name="title" required minLength={2} style={{ width: '100%' }} />
          <label>Start (ISO, e.g. 2026-10-01T10:00:00+07:00)</label>
          <input name="startAt" required style={{ width: '100%' }} />
          <label>End (ISO)</label>
          <input name="endAt" required style={{ width: '100%' }} />
          <label>Venue (self-operated)</label>
          <select name="venueId" style={{ width: '100%' }}>
            <option value="">— external / online —</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.building ? '· ' + v.building.name : ''}
              </option>
            ))}
          </select>
          <label>Tags (comma separated)</label>
          <input name="tags" placeholder="workshop, community" style={{ width: '100%' }} />
          <div style={{ marginTop: 12 }}>
            <button type="submit">Create draft</button>
          </div>
        </form>
      </div>
      <p className="muted">
        After creating a draft, publish it with POST /api/events/:id/publish — that triggers Luma/Social Layer sync and
        notifications.
      </p>
    </section>
  );
}
