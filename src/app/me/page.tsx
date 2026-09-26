import { apiGet } from '../../lib/api-client';

interface MeBundle {
  member: {
    id: string;
    email: string;
    emailVerified: boolean;
    displayName: string | null;
    tier: string;
    roles: Array<{ scope: string; role: string }>;
    telegram: { bound: boolean; username: string | null } | null;
    walletAddress: string | null;
  } | null;
  points: { balance: number };
}

export const dynamic = 'force-dynamic';

export default async function MePage() {
  let bundle: MeBundle = { member: null, points: { balance: 0 } };
  try {
    bundle = await apiGet<MeBundle>('/api/me');
  } catch {
    bundle = { member: null, points: { balance: 0 } };
  }

  if (!bundle.member) {
    return (
      <section style={{ maxWidth: 480 }}>
        <h1>Sign in</h1>
        <p className="page-sub">Email registration and verification are handled right here — no password needed.</p>
        <div className="card">
          <form method="post" action="/api/auth/login/request">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required placeholder="you@example.com" />
            <div style={{ marginTop: 18 }}>
              <button type="submit" className="btn btn-primary">
                Send login link
              </button>
            </div>
          </form>
        </div>
        <div className="notice notice-info">
          New here? Your first sign-in creates the account — we email you a verification link to confirm it&rsquo;s you.
        </div>
      </section>
    );
  }

  const m = bundle.member;
  return (
    <section style={{ maxWidth: 720 }}>
      <h1>{m.displayName ?? m.email}</h1>
      <p className="page-sub">{m.email}</p>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={m.emailVerified ? 'badge badge-ok' : 'badge badge-danger'}>
              {m.emailVerified ? '✓ Verified member' : '⚠ Email not verified'}
            </span>
            <span className="badge badge-brand">{m.tier}</span>
            {m.roles.some((r) => r.role === 'admin') && <span className="badge">admin</span>}
          </div>
          <span className="points-pill">◈ {bundle.points.balance} pts</span>
        </div>

        <hr className="divider" />

        <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
          <div>
            <dt className="muted">Telegram</dt>
            <dd style={{ margin: 0 }}>
              {m.telegram?.bound ? '@' + (m.telegram.username ?? m.telegram) : 'Not bound yet — bind it to get event reminders'}
            </dd>
          </div>
          <div>
            <dt className="muted">On-chain account</dt>
            <dd style={{ margin: 0 }}>{m.walletAddress ?? 'Not linked (V2 — coming with on-chain points)'}</dd>
          </div>
          <div>
            <dt className="muted">Points authority</dt>
            <dd style={{ margin: 0 }} className="muted">
              CAS / on-chain — this is a read-only mirror
            </dd>
          </div>
        </dl>
      </div>

      <form method="post" action="/api/auth/logout" style={{ marginTop: 16 }}>
        <button type="submit" className="btn btn-ghost">
          Sign out
        </button>
      </form>
    </section>
  );
}
