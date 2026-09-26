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

export default async function MePage() {
  let bundle: MeBundle = { member: null, points: { balance: 0 } };
  try {
    bundle = await apiGet<MeBundle>('/api/me');
  } catch {
    bundle = { member: null, points: { balance: 0 } };
  }
  if (!bundle.member) {
    return (
      <section>
        <h1>Sign in</h1>
        <p className="muted">Email registration and verification are handled by this system.</p>
        <div className="card">
          <form method="post" action="/api/auth/login/request">
            <label>Email</label>
            <input name="email" type="email" required style={{ width: '100%' }} />
            <div style={{ marginTop: 12 }}>
              <button type="submit">Send login link</button>
            </div>
          </form>
        </div>
        <p className="muted">
          New here? POST /api/auth/register with your email — we send a verification link first.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h1>{bundle.member.displayName ?? bundle.member.email}</h1>
      <div className="card">
        <div className="muted">email: {bundle.member.email}</div>
        <div className="muted">verified: {String(bundle.member.emailVerified)}</div>
        <div className="muted">tier: {bundle.member.tier}</div>
        <div className="muted">
          telegram: {bundle.member.telegram?.bound ? '@' + (bundle.member.telegram.username ?? bundle.member.telegram) : 'not bound'}
        </div>
        <div className="muted">wallet: {bundle.member.walletAddress ?? 'not linked (V2)'}</div>
        <div>
          points mirror: <strong>{bundle.points.balance}</strong> <span className="muted">(authority: CAS/on-chain)</span>
        </div>
      </div>
      <form method="post" action="/api/auth/logout">
        <button type="submit">Sign out</button>
      </form>
    </section>
  );
}
