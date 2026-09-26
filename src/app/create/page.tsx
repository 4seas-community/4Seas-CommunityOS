import { apiGet } from '../../lib/api-client';

interface VenueOption {
  id: string;
  name: string;
  building: { name: string } | null;
}

export const dynamic = 'force-dynamic';

export default async function CreateEventPage() {
  let venues: VenueOption[] = [];
  try {
    const res = await apiGet<{ venues: VenueOption[] }>('/api/venues');
    venues = res.venues ?? [];
  } catch {
    venues = [];
  }

  return (
    <section style={{ maxWidth: 640 }}>
      <h1>Create an event</h1>
      <p className="page-sub">
        Three fields is enough to start — title, time and place. You can enrich the details any time before publishing.
      </p>

      <div className="card">
        <form method="post" action="/api/events">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required minLength={2} placeholder="e.g. Language Corner" />

          <label htmlFor="startAt">Starts</label>
          <input id="startAt" name="startAt" required placeholder="2026-10-01T10:00:00+07:00" />

          <label htmlFor="endAt">Ends</label>
          <input id="endAt" name="endAt" required placeholder="2026-10-01T12:00:00+07:00" />

          <label htmlFor="venueId">Venue</label>
          <select id="venueId" name="venueId">
            <option value="">— online / external location —</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} {v.building ? '· ' + v.building.name : ''}
              </option>
            ))}
          </select>

          <label htmlFor="tags">Tags</label>
          <input id="tags" name="tags" placeholder="workshop, community" />

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">
              Create draft
            </button>
            <a href="/events" className="btn btn-ghost">
              Cancel
            </a>
          </div>
        </form>
      </div>

      <div className="notice notice-info">
        Your draft stays private until you publish it. Publishing notifies the community and syncs the event to Luma and
        Social Layer automatically.
      </div>
    </section>
  );
}
