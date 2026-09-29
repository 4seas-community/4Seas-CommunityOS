import Link from 'next/link';
import { apiGet } from '../../../lib/api-client';
import { config } from '../../../lib/config';
import { getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';

export const dynamic = 'force-dynamic';

interface AuditItem {
  id: string;
  actorType: string;
  actorId: string | null;
  actorDisplay: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  draftId: string | null;
  ip: string | null;
  ua: string | null;
  createdAt: string;
}

function localTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; actorType?: string; action?: string; cursor?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member || !isCommunityAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Audit log</h1>
        <div className="notice notice-warn">
          Viewing system audit logs is restricted to community administrators.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/admin" className="btn btn-ghost">
            Back to console
          </Link>
        </div>
      </section>
    );
  }

  const { entityType, actorType, action, cursor } = await searchParams;
  const timezone = config.defaultTimezone;

  const queryParts: string[] = [];
  if (entityType && entityType !== 'all') queryParts.push(`entityType=${encodeURIComponent(entityType)}`);
  if (actorType && actorType !== 'all') queryParts.push(`actorType=${encodeURIComponent(actorType)}`);
  if (action) queryParts.push(`action=${encodeURIComponent(action)}`);
  if (cursor) queryParts.push(`cursor=${encodeURIComponent(cursor)}`);
  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  let logs: AuditItem[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const res = await apiGet<{ logs: AuditItem[]; nextCursor: string | null }>(`/api/admin/audit${queryStr}`);
    logs = res.logs ?? [];
    nextCursor = res.nextCursor ?? null;
  } catch (e) {
    error = (e as Error).message;
  }

  const entityTypes = ['all', 'member', 'booking', 'event', 'venue', 'agent_key', 'notification_outbox'];
  const actorTypes = ['all', 'user', 'agent', 'service', 'system'];

  return (
    <section>
      <Link href="/admin" className="muted">
        ← Operations console
      </Link>
      <h1 style={{ marginTop: 8 }}>Audit logs</h1>
      <p className="page-sub">
        Immutable record of state transitions, administrative grants, API calls, and agent mutations.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '16px 0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>
            Entity:
          </span>
          {entityTypes.map((et) => {
            const active = (!entityType && et === 'all') || entityType === et;
            const p = new URLSearchParams();
            if (et !== 'all') p.set('entityType', et);
            if (actorType && actorType !== 'all') p.set('actorType', actorType);
            if (action) p.set('action', action);
            const href = `/admin/audit${p.toString() ? '?' + p.toString() : ''}`;
            return (
              <Link
                key={et}
                href={href}
                className={active ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '3px 8px', fontSize: 12 }}
              >
                {et}
              </Link>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>
            Actor:
          </span>
          {actorTypes.map((at) => {
            const active = (!actorType && at === 'all') || actorType === at;
            const p = new URLSearchParams();
            if (entityType && entityType !== 'all') p.set('entityType', entityType);
            if (at !== 'all') p.set('actorType', at);
            if (action) p.set('action', action);
            const href = `/admin/audit${p.toString() ? '?' + p.toString() : ''}`;
            return (
              <Link
                key={at}
                href={href}
                className={active ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '3px 8px', fontSize: 12 }}
              >
                {at}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="section-head">
        <h2>Logged operations</h2>
        <span className="badge badge-accent">{logs.length} entries</span>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">No audit entries found matching the criteria.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #333)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Time</th>
                <th style={{ padding: '8px 10px' }}>Actor</th>
                <th style={{ padding: '8px 10px' }}>Action</th>
                <th style={{ padding: '8px 10px' }}>Entity</th>
                <th style={{ padding: '8px 10px' }}>Changes / Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }} className="muted">
                    {localTime(row.createdAt, timezone)}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <div>
                      <span className="badge" style={{ fontSize: 11, marginRight: 6 }}>
                        {row.actorType}
                      </span>
                      <span>{row.actorDisplay ?? row.actorId ?? 'system'}</span>
                    </div>
                    {row.ip && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>IP: {row.ip}</div>}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <code>{row.action}</code>
                    {row.draftId && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        draft: {row.draftId}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.entityType ? (
                      <div>
                        <strong>{row.entityType}</strong>
                        {row.entityId && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            <code>{row.entityId}</code>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', maxWidth: 300 }}>
                    {row.before || row.after ? (
                      <details>
                        <summary style={{ cursor: 'pointer', color: 'var(--accent, #38bdf8)' }}>
                          View diff
                        </summary>
                        <div style={{ marginTop: 6, fontSize: 11, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 4 }}>
                          {row.before && (
                            <div style={{ marginBottom: 4 }}>
                              <strong style={{ color: '#ef4444' }}>Before:</strong>
                              <pre style={{ margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {JSON.stringify(row.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {row.after && (
                            <div>
                              <strong style={{ color: '#22c55e' }}>After:</strong>
                              <pre style={{ margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {JSON.stringify(row.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          {(() => {
            const p = new URLSearchParams();
            if (entityType && entityType !== 'all') p.set('entityType', entityType);
            if (actorType && actorType !== 'all') p.set('actorType', actorType);
            if (action) p.set('action', action);
            p.set('cursor', nextCursor);
            return (
              <Link href={`/admin/audit?${p.toString()}`} className="btn btn-secondary">
                Next page →
              </Link>
            );
          })()}
        </div>
      )}
    </section>
  );
}
