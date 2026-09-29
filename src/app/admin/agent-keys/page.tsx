import Link from 'next/link';
import { apiGet } from '../../../lib/api-client';
import { config } from '../../../lib/config';
import { getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';
import { CreateAgentKeyForm, RevokeAgentKeyButton } from '../../../components/admin-forms';

export const dynamic = 'force-dynamic';

interface KeyRow {
  id: string;
  name: string;
  scopes: string[];
  memberId: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  isRevoked: boolean;
}

function localTime(iso: string | null, timezone: string): string {
  if (!iso) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AdminAgentKeysPage() {
  const member = await getCurrentMember();
  if (!member || !isCommunityAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Agent keys</h1>
        <div className="notice notice-warn">
          Managing API keys for agents is restricted to community administrators.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/admin" className="btn btn-ghost">
            Back to console
          </Link>
        </div>
      </section>
    );
  }

  const timezone = config.defaultTimezone;
  let keys: KeyRow[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ keys: KeyRow[] }>('/api/admin/agent-keys');
    keys = res.keys ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <section>
      <Link href="/admin" className="muted">
        ← Operations console
      </Link>
      <h1 style={{ marginTop: 8 }}>Agent keys</h1>
      <p className="page-sub">
        Issue and revoke scoped credentials for AI agents (Claude, Cursor, MCP clients).
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="card" style={{ marginBottom: 24, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Create agent key</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          Generate a secret bearer token. The token will only be revealed once upon creation.
        </p>
        <CreateAgentKeyForm />
      </div>

      <div className="section-head">
        <h2>Active &amp; revoked keys</h2>
        <span className="badge badge-accent">{keys.length}</span>
      </div>

      {keys.length === 0 ? (
        <div className="empty-state">No agent keys have been created yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #333)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>Scopes</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px' }}>Last Used</th>
                <th style={{ padding: '8px 10px' }}>Created</th>
                <th style={{ padding: '8px 10px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <strong>{k.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <code>{k.id}</code>
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {k.scopes.map((s) => (
                        <span key={s} className="badge" style={{ fontSize: 11 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {k.isRevoked ? (
                      <span style={{ color: '#ef4444' }}>
                        Revoked ({localTime(k.revokedAt, timezone)})
                      </span>
                    ) : (
                      <span style={{ color: '#22c55e', fontWeight: 600 }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }} className="muted">
                    {localTime(k.lastUsedAt, timezone)}
                  </td>
                  <td style={{ padding: '8px 10px' }} className="muted">
                    {localTime(k.createdAt, timezone)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {!k.isRevoked && <RevokeAgentKeyButton id={k.id} name={k.name} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
