import Link from 'next/link';
import { apiGet } from '../../lib/api-client';
import { canUseAdmin, getCurrentMember, isCommunityAdmin } from '../../lib/session-server';

export const dynamic = 'force-dynamic';

interface Overview {
  members: { total: number; verified: number; admins: number; venueManagers: number };
  points: { accounts: number; totalBalance: number };
  queues: { bookingsPending: number; eventsPendingReview: number; bookingsUpcoming: number };
}

export default async function AdminPage() {
  const member = await getCurrentMember();
  if (!canUseAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Admin console</h1>
        <div className="notice notice-warn">
          You need a venue manager or community admin role to use the operations console.
        </div>
        <p className="muted">
          Signed in as {member?.email ?? 'nobody'}. An existing admin can grant roles from{' '}
          <Link href="/admin/members">Members</Link>; on a fresh deployment run{' '}
          <code>pnpm tsx scripts/make-admin.ts &lt;email&gt;</code>.
        </p>
      </section>
    );
  }

  // The counters are community-wide, so only an admin may read them; a venue
  // manager still gets the queue pages linked below.
  let overview: Overview | null = null;
  let error: string | null = null;
  if (isCommunityAdmin(member)) {
    try {
      overview = await apiGet<Overview>('/api/admin/overview');
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return (
    <section>
      <h1>Operations console</h1>
      <p className="page-sub">
        Manage buildings, venues, members, roles and points. Signed in as {member?.email}
        {isCommunityAdmin(member) ? ' (community admin)' : ' (venue manager)'}.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      {overview && (
        <div className="card-grid" style={{ marginBottom: 8 }}>
          <div className="card">
            <h3>Members</h3>
            <p style={{ margin: '4px 0' }}>
              <strong style={{ fontSize: 26 }}>{overview.members.total}</strong> total
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {overview.members.verified} verified · {overview.members.admins} admins ·{' '}
              {overview.members.venueManagers} venue managers
            </p>
          </div>
          <div className="card">
            <h3>Points (mirror)</h3>
            <p style={{ margin: '4px 0' }}>
              <strong style={{ fontSize: 26 }}>{overview.points.totalBalance}</strong> total
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {overview.points.accounts} accounts · authority is CAS
            </p>
          </div>
        </div>
      )}

      <div className="section-head">
        <h2>Needs attention</h2>
      </div>
      <div className="card-grid">
        <Link className="card" href="/admin/bookings" style={{ display: 'block' }}>
          <h3>Booking requests</h3>
          <p style={{ margin: '4px 0' }}>
            <strong style={{ fontSize: 26 }}>{overview ? overview.queues.bookingsPending : '—'}</strong> pending
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Approve or reject, and see the next 14 days of occupancy per venue.
          </p>
        </Link>
        <Link className="card" href="/admin/events" style={{ display: 'block' }}>
          <h3>Event review</h3>
          <p style={{ margin: '4px 0' }}>
            <strong style={{ fontSize: 26 }}>{overview ? overview.queues.eventsPendingReview : '—'}</strong> awaiting
            review
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Publish events whose venue rules ask for a human decision.
          </p>
        </Link>
      </div>

      <div className="section-head">
        <h2>Manage</h2>
      </div>
      <div className="card-grid">
        <Link className="card" href="/admin/venues" style={{ display: 'block' }}>
          <h3>Buildings &amp; venues</h3>
          <p className="muted" style={{ margin: 0 }}>
            Add buildings and floors, create venues, review their booking rules.
          </p>
        </Link>
        <Link className="card" href="/admin/members" style={{ display: 'block' }}>
          <h3>Members &amp; roles</h3>
          <p className="muted" style={{ margin: 0 }}>
            Member directory, role grants and points adjustments.
          </p>
        </Link>
        {isCommunityAdmin(member) && (
          <Link className="card" href="/admin/notifications" style={{ display: 'block' }}>
            <h3>Notification history</h3>
            <p className="muted" style={{ margin: 0 }}>
              Delivery log for emails and bot feeds, errors and retry queue.
            </p>
          </Link>
        )}
        {isCommunityAdmin(member) && (
          <Link className="card" href="/admin/agent-keys" style={{ display: 'block' }}>
            <h3>Agent keys</h3>
            <p className="muted" style={{ margin: 0 }}>
              Credentials for AI agents and MCP clients with scoped permissions.
            </p>
          </Link>
        )}
        {isCommunityAdmin(member) && (
          <Link className="card" href="/admin/export" style={{ display: 'block' }}>
            <h3>Data export</h3>
            <p className="muted" style={{ margin: 0 }}>
              Download complete CSV or JSON tables for events, bookings, venues, and members.
            </p>
          </Link>
        )}
        {isCommunityAdmin(member) && (
          <Link className="card" href="/admin/audit" style={{ display: 'block' }}>
            <h3>Audit logs</h3>
            <p className="muted" style={{ margin: 0 }}>
              Inspect immutable mutation records, diff snapshots, operator actions, and IP traces.
            </p>
          </Link>
        )}
        <Link className="card" href="/venues" style={{ display: 'block' }}>
          <h3>Public venue list</h3>
          <p className="muted" style={{ margin: 0 }}>
            What members see when they browse spaces.
          </p>
        </Link>
      </div>
    </section>
  );
}
