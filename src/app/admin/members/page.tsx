import Link from 'next/link';
import { apiGet } from '../../../lib/api-client';
import { canUseAdmin, getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';
import { PointsAdjuster, RoleEditor } from '../../../components/admin-forms';

export const dynamic = 'force-dynamic';

interface MemberRow {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  tier: string;
  status: string;
  roles: Array<{ scope: string; role: string }>;
  telegram: { id: string; username: string | null } | null;
  walletAddress: string | null;
  pointsBalance: number;
}

export default async function AdminMembersPage() {
  const me = await getCurrentMember();
  const admin = isCommunityAdmin(me);

  if (!canUseAdmin(me)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Members</h1>
        <div className="notice notice-warn">Venue manager or community admin role required.</div>
        <Link href="/admin" className="btn btn-ghost">
          ← Back to console
        </Link>
      </section>
    );
  }

  let members: MemberRow[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ members: MemberRow[] }>('/api/admin/members');
    members = res.members ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <section>
      <p style={{ marginBottom: 14 }}>
        <Link href="/admin" className="muted">
          ← Operations console
        </Link>
      </p>
      <h1>Members &amp; roles</h1>
      <p className="page-sub">
        {members.length} members. Role changes and points adjustments are audit-logged; points are written to CAS
        first, then mirrored here.
      </p>

      {error && <div className="notice notice-error">{error}</div>}
      {!admin && (
        <div className="notice notice-warn">
          Read-only: you need the community admin role to change roles or points.
        </div>
      )}

      <div className="stack" style={{ marginTop: 8 }}>
        {members.map((m) => (
          <article className="card" key={m.id}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{m.displayName ?? m.email}</strong>
                <div className="muted">{m.email}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className={m.emailVerified ? 'badge badge-ok' : 'badge badge-danger'}>
                  {m.emailVerified ? 'verified' : 'unverified'}
                </span>
                <span className="badge badge-brand">{m.tier}</span>
                <span className="points-pill">◈ {m.pointsBalance}</span>
              </div>
            </div>

            <div className="tag-row" style={{ marginTop: 10 }}>
              {m.roles.length === 0 && <span className="muted">no roles</span>}
              {m.roles.map((r) => (
                <span className="tag" key={r.role + r.scope}>
                  {r.role} @ {r.scope}
                </span>
              ))}
            </div>

            {m.telegram && (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                telegram: {m.telegram.username ? '@' + m.telegram.username : m.telegram.id}
                {m.walletAddress ? ' · wallet: ' + m.walletAddress : ''}
              </p>
            )}

            <hr className="divider" />
            <RoleEditor memberId={m.id} roles={m.roles} isAdmin={admin} />
            <div style={{ marginTop: 10 }}>
              <PointsAdjuster memberId={m.id} isAdmin={admin} />
            </div>
          </article>
        ))}
        {members.length === 0 && !error && (
          <div className="empty-state">No members yet — they appear here as soon as they register.</div>
        )}
      </div>

      {admin && (
        <div className="notice notice-info" style={{ marginTop: 16 }}>
          Tip: grant <code>community:* / admin</code> to a second person so the console is never locked to one account.
          Roles are additive; the last admin cannot be revoked.
        </div>
      )}
    </section>
  );
}
