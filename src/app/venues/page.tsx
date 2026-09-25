import { apiGet } from '../../lib/api-client';
import { EmptyState } from '../../components/event-card';

interface VenueRow {
  id: string;
  name: string;
  code: string;
  areaSqm: string | null;
  capacitySeated: number | null;
  capacityStanding: number | null;
  amenities: string[];
  services: string[];
  building: { name: string } | null;
  rules: Array<{
    version: number;
    approvalMode: string;
    pointsPerHour: number;
    allowedEventTypes: string[];
    prohibitedBehaviors: string[];
  }>;
}

export const dynamic = 'force-dynamic';

export default async function VenuesPage() {
  let venues: VenueRow[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ venues: VenueRow[] }>('/api/venues');
    venues = res.venues ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <section>
      <h1>Venues</h1>
      <p className="page-sub">Self-operated spaces across our buildings — book them for meetups, workshops and sessions.</p>

      {error && <div className="notice notice-error">Could not load venues: {error}</div>}
      {!error && venues.length === 0 && <EmptyState emoji="🏠" title="No venues yet" />}

      <div className="card-grid">
        {venues.map((v) => {
          const rule = v.rules?.[0];
          return (
            <article className="card" key={v.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3>{v.name}</h3>
                <span className="badge">{v.code}</span>
              </div>
              <p className="muted" style={{ margin: '2px 0 10px' }}>
                {v.building?.name ?? '—'} · {v.areaSqm ?? '?'} m²
              </p>

              <div className="row" style={{ gap: 8 }}>
                <span className="badge badge-brand">🪑 {v.capacitySeated ?? '—'} seated</span>
                <span className="badge badge-brand">🧍 {v.capacityStanding ?? '—'} standing</span>
                {rule && (
                  <span className={rule.approvalMode === 'auto' ? 'badge badge-ok' : 'badge'}>
                    {rule.approvalMode === 'auto' ? '⚡ Instant booking' : '📋 Approval required'}
                  </span>
                )}
                {rule && rule.pointsPerHour > 0 && <span className="badge badge-accent">{rule.pointsPerHour} pts/h</span>}
              </div>

              {v.amenities.length > 0 && (
                <div className="tag-row">
                  {v.amenities.map((a) => (
                    <span className="tag" key={a}>
                      {a.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              {rule && rule.allowedEventTypes.length > 0 && (
                <p className="muted" style={{ marginTop: 10 }}>
                  Good for: {rule.allowedEventTypes.join(', ')}
                </p>
              )}
              {rule && rule.prohibitedBehaviors.length > 0 && (
                <p className="muted" style={{ marginTop: 4 }}>
                  House rules: {rule.prohibitedBehaviors.join(' · ')}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
