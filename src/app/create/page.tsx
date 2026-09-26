import { apiGet } from '../../lib/api-client';
import { CreateEventForm } from '../../components/forms';

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
        <CreateEventForm venues={venues.map((v) => ({ id: v.id, name: v.name, building: v.building?.name ?? null }))} />
      </div>

      <div className="notice notice-info">
        Your draft stays private until you publish it. Publishing notifies the community and syncs the event to Luma and
        Social Layer automatically.
      </div>
    </section>
  );
}