import Link from 'next/link';
import { apiGet } from '../../lib/api-client';
import { canUseAdmin, getCurrentMember, isCommunityAdmin } from '../../lib/session-server';

export const dynamic = 'force-dynamic';

interface Overview {
  members: { total: number; verified: number; admins: number; venueManagers: number };
  points: { accounts: number; totalBalance: number };
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

  let overview: Overview | null = null;
  let error: string | null = null;
  try {
    overview = await apiGet<Overview>('/api/admin/overview');
  } catch (e) {
    error = (e as Error).message;
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
        <Link className="card" href="/venues" style={{ display: 'block' }}>
          <h3>Public venue list</h3>
          <p className="muted" style={{ margin: 0 }}>
            What members see when they browse spaces.
          </p>
        </Link>
      </div>

      <div className="notice notice-info" style={{ marginTop: 20 }}>
        Booking approvals, event review queues, notification history and exports arrive in batch 2 of the gap
        remediation plan (see docs/10-gap-analysis.md).
      </div>
    </section>
  );
}
