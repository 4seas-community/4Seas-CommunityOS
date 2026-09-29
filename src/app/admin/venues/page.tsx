import Link from 'next/link';
import { apiGet } from '../../../lib/api-client';
import { canUseAdmin, getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';
import { CreateBuildingForm, CreateFloorForm, CreateVenueForm } from '../../../components/admin-forms';

export const dynamic = 'force-dynamic';

interface BuildingRow {
  id: string;
  name: string;
  address: string;
  status: string;
  floors: Array<{ id: string; name: string; sortOrder: number }>;
  venueCount: number;
}

interface VenueRow {
  id: string;
  name: string;
  code: string;
  buildingId: string;
  floorId: string | null;
  areaSqm: number | null;
  capacitySeated: number | null;
  capacityStanding: number | null;
  status: string;
  amenities: string[];
}

export default async function AdminVenuesPage() {
  const member = await getCurrentMember();
  const admin = isCommunityAdmin(member);

  if (!canUseAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Buildings &amp; venues</h1>
        <div className="notice notice-warn">Venue manager or community admin role required.</div>
        <Link href="/admin" className="btn btn-ghost">
          ← Back to console
        </Link>
      </section>
    );
  }

  let buildings: BuildingRow[] = [];
  let venues: VenueRow[] = [];
  let error: string | null = null;
  try {
    const [b, v] = await Promise.all([
      apiGet<{ buildings: BuildingRow[] }>('/api/buildings'),
      apiGet<{ venues: VenueRow[] }>('/api/venues'),
    ]);
    buildings = b.buildings ?? [];
    venues = v.venues ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  const venueById = new Map(venues.map((v) => [v.id, v]));

  return (
    <section>
      <p style={{ marginBottom: 14 }}>
        <Link href="/admin" className="muted">
          ← Operations console
        </Link>
      </p>
      <h1>Buildings &amp; venues</h1>
      <p className="page-sub">
        {buildings.length} buildings · {venues.length} venues. Creating and editing requires a community admin.
      </p>

      {error && <div className="notice notice-error">{error}</div>}
      {!admin && (
        <div className="notice notice-warn">
          You can browse here, but creating buildings, floors and venues needs the community admin role.
        </div>
      )}

      <div className="card-grid" style={{ marginTop: 8 }}>
        <div className="card">
          <h3>Add a building</h3>
          {admin ? <CreateBuildingForm /> : <p className="muted">Community admin only.</p>}
        </div>
        <div className="card">
          <h3>Add a floor</h3>
          {admin && buildings.length > 0 ? (
            <CreateFloorForm buildings={buildings.map((b) => ({ id: b.id, name: b.name }))} />
          ) : (
            <p className="muted">{admin ? 'Add a building first.' : 'Community admin only.'}</p>
          )}
        </div>
        <div className="card">
          <h3>Add a venue</h3>
          {admin && buildings.length > 0 ? (
            <CreateVenueForm
              buildings={buildings.map((b) => ({ id: b.id, name: b.name, floors: b.floors }))}
            />
          ) : (
            <p className="muted">{admin ? 'Add a building first.' : 'Community admin only.'}</p>
          )}
        </div>
      </div>

      <div className="section-head">
        <h2>Current layout</h2>
        <span className="muted">rules are editable per venue in the API/console batch 2</span>
      </div>

      {buildings.length === 0 && <div className="empty-state">No buildings yet — add the first one above.</div>}

      <div className="stack">
        {buildings.map((b) => {
          const buildingVenues = venues.filter((v) => v.buildingId === b.id);
          return (
            <article className="card" key={b.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{b.name}</h3>
                <span className="badge">{b.status}</span>
              </div>
              <p className="muted" style={{ margin: '4px 0 10px' }}>
                {b.address || 'no address'} · {b.floors.length} floors · {buildingVenues.length} venues
              </p>

              <div className="tag-row">
                {b.floors.length === 0 && <span className="muted">no floors recorded</span>}
                {b.floors.map((f) => {
                  const floorVenues = buildingVenues.filter((v) => v.floorId === f.id);
                  return (
                    <span className="tag" key={f.id}>
                      {f.name}
                      {floorVenues.length > 0 ? ' · ' + floorVenues.length + ' venue(s)' : ''}
                    </span>
                  );
                })}
              </div>

              <div className="stack" style={{ marginTop: 10 }}>
                {buildingVenues.map((v) => (
                  <div className="row" key={v.id} style={{ justifyContent: 'space-between' }}>
                    <span>
                      <strong>{v.name}</strong> <span className="muted">{v.code}</span>
                    </span>
                    <span className="muted">
                      {v.areaSqm ?? '?'} m² · {v.capacitySeated ?? '—'} seated / {v.capacityStanding ?? '—'} standing
                    </span>
                  </div>
                ))}
                {buildingVenues.length === 0 && <span className="muted">no venues yet</span>}
              </div>
            </article>
          );
        })}
      </div>

      {venueById.size === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          Tip: after adding a venue, run the seed script or the rule API to give it booking rules.
        </p>
      )}
    </section>
  );
}
