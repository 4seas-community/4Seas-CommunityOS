import Link from 'next/link';
import { apiGet } from '../../lib/api-client';
import { canUseAdmin, getCurrentMember, isCommunityAdmin } from '../../lib/session-server';

export const dynamic = 'force-dynamic';

interface Overview {
  members: { total: number; verified: number; admins: number; venueManagers: number };
  points: { accounts: number; totalBalance: number };
  queues: { bookingsPending: number; eventsPendingReview: number; bookingsUpcoming: number };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ login?: string; email?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { login, email } = params;
  const member = await getCurrentMember();

  if (!canUseAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Admin console</h1>

        {login === 'not-found' && (
          <div className="notice notice-error" style={{ marginBottom: 16 }}>
            <strong>No administrator account found.</strong> There is no registered account for{' '}
            <strong>{email}</strong>. If this should be an administrator, promote the account first:
            <div style={{ marginTop: 8 }}>
              <code>pnpm tsx scripts/make-admin.ts {email}</code>
            </div>
          </div>
        )}

        {login === 'not-admin' && (
          <div className="notice notice-error" style={{ marginBottom: 16 }}>
            <strong>Not an administrator.</strong> The account <strong>{email}</strong> is registered,
            but does not have <code>admin</code> or <code>venue_manager</code> privileges. An existing
            admin can grant roles in the console, or you can run:
            <div style={{ marginTop: 8 }}>
              <code>pnpm tsx scripts/make-admin.ts {email}</code>
            </div>
          </div>
        )}

        {login === 'unverified' && (
          <div className="notice notice-warn" style={{ marginBottom: 16 }}>
            <strong>Email not verified.</strong> The account for <strong>{email}</strong> exists but its email
            is not yet verified. Please complete verification before signing in to the console.
          </div>
        )}

        {login === 'link-sent' && (
          <div className="notice notice-ok" style={{ marginBottom: 16 }}>
            <strong>Admin login link sent!</strong> Check your inbox at <strong>{email}</strong>.
            Click the link in the email to sign directly into the Operations Console.
          </div>
        )}

        {!login && (
          <div className="notice notice-warn">
            You need a venue manager or community admin role to use the operations console.
          </div>
        )}

        {!member ? (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>Sign in as Administrator</h3>
            <p className="muted" style={{ margin: '0 0 16px', fontSize: 14 }}>
              Enter your admin or venue manager email. We will verify your permissions and send a direct sign-in link.
            </p>
            <form method="post" action="/api/auth/login/request">
              <input type="hidden" name="target" value="admin" />
              <label htmlFor="admin-email">Administrator Email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                required
                defaultValue={email ?? ''}
                placeholder="admin@example.com"
              />
              <div style={{ marginTop: 18 }}>
                <button type="submit" className="btn btn-primary">
                  Send admin login link
                </button>
              </div>
            </form>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>
            Signed in as <strong>{member.email}</strong>. You do not have permissions to view this console. An existing admin can grant roles from{' '}
            <Link href="/admin/members">Members</Link>; on a fresh deployment run{' '}
            <code>pnpm tsx scripts/make-admin.ts {member.email}</code>.
          </p>
        )}
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
