import Link from 'next/link';
import { getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';

export const dynamic = 'force-dynamic';

const EXPORT_SECTIONS = [
  {
    type: 'events',
    title: 'Events',
    description: 'All public and private events, draft/review statuses, hosting info, schedules, and capacity limits.',
  },
  {
    type: 'bookings',
    title: 'Bookings',
    description: 'Venue reservations, slot intervals, check-in statuses, purpose notes, and point charges.',
  },
  {
    type: 'venues',
    title: 'Venues',
    description: 'Physical spaces, building associations, seated/standing capacities, amenities, and buffer minutes.',
  },
  {
    type: 'members',
    title: 'Members',
    description: 'Member roster, email verification status, assigned scopes & roles, points balance, and contact info.',
  },
] as const;

export default async function AdminExportPage() {
  const member = await getCurrentMember();
  if (!member || !isCommunityAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Data export</h1>
        <div className="notice notice-warn">
          Exporting community database records is restricted to community administrators.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/admin" className="btn btn-ghost">
            Back to console
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Link href="/admin" className="muted">
        ← Operations console
      </Link>
      <h1 style={{ marginTop: 8 }}>Data export</h1>
      <p className="page-sub">
        Download full snapshots of community operational tables in CSV or JSON format.
      </p>

      <div className="card-grid" style={{ marginTop: 16 }}>
        {EXPORT_SECTIONS.map((sec) => (
          <div className="card" key={sec.type} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3>{sec.title}</h3>
              <p className="muted" style={{ margin: '8px 0 16px', fontSize: 14 }}>
                {sec.description}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <a
                href={`/api/admin/export?type=${sec.type}&format=csv`}
                className="btn btn-secondary"
                download
              >
                Download CSV
              </a>
              <a
                href={`/api/admin/export?type=${sec.type}&format=json`}
                className="btn btn-ghost"
                download
              >
                Download JSON
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="notice notice-info" style={{ marginTop: 24 }}>
        <strong>Export specifications:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13 }}>
          <li>CSV files include a UTF-8 BOM (<code>\uFEFF</code>) for immediate compatibility with Excel and Numbers.</li>
          <li>Fields containing commas, quotes, or line breaks are properly quoted per RFC 4180.</li>
          <li>Timestamps are exported in standardized ISO 8601 UTC notation.</li>
        </ul>
      </div>
    </section>
  );
}
