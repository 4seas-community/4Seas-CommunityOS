import { apiGet } from '../../lib/api-client';

interface VenueRow {
  id: string;
  name: string;
  code: string;
  areaSqm: string | null;
  capacitySeated: number | null;
  capacityStanding: number | null;
  amenities: string[];
  building: { name: string } | null;
  rules: Array<{ version: number; approvalMode: string; pointsPerHour: number; allowedEventTypes: string[] }>;
}

export default async function VenuesPage() {
  let venues: VenueRow[] = [];
  try {
    const res = await apiGet<{ venues: VenueRow[] }>('/api/venues');
    venues = res.venues ?? [];
  } catch {
    venues = [];
  }
  return (
    <section>
      <h1>Venues</h1>
      <p className="muted">Self-operated spaces across 4Seas buildings.</p>
      {venues.map((v) => {
        const rule = v.rules?.[0];
        return (
          <div className="card" key={v.id}>
            <strong>{v.name}</strong> <span className="muted">{v.code}</span>
            <div className="muted">
              {v.building?.name ?? '—'} · {v.areaSqm ?? '?'} m² · seats {v.capacitySeated ?? '—'} / standing{' '}
              {v.capacityStanding ?? '—'}
            </div>
            <div className="muted">Amenities: {v.amenities.join(', ') || '—'}</div>
            {rule && (
              <div className="muted">
                Booking: {rule.approvalMode} · {rule.pointsPerHour} pts/h · allows: {rule.allowedEventTypes.join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
