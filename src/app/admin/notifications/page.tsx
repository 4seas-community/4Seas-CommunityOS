import Link from 'next/link';
import { apiGet } from '../../../lib/api-client';
import { config } from '../../../lib/config';
import { getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';
import { NotificationRetryButton } from '../../../components/admin-forms';

export const dynamic = 'force-dynamic';

interface NotificationItem {
  id: string;
  memberId: string | null;
  target: string;
  channel: 'telegram' | 'email';
  template: string;
  payload: Record<string, unknown>;
  scheduledAt: string;
  status: 'scheduled' | 'pending' | 'delivered' | 'failed';
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  member?: {
    id: string;
    email: string;
    displayName: string | null;
    telegramUsername: string | null;
  } | null;
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

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; template?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member || !isCommunityAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Notification history</h1>
        <div className="notice notice-warn">
          Notification logs contain recipient contact info (PII) and are restricted to community administrators.
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/admin" className="btn btn-ghost">
            Back to console
          </Link>
        </div>
      </section>
    );
  }

  const { status, channel, template } = await searchParams;
  const timezone = config.defaultTimezone;

  const queryParts: string[] = [];
  if (status && status !== 'all') queryParts.push(`status=${encodeURIComponent(status)}`);
  if (channel) queryParts.push(`channel=${encodeURIComponent(channel)}`);
  if (template) queryParts.push(`template=${encodeURIComponent(template)}`);
  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  let list: NotificationItem[] = [];
  let error: string | null = null;
  try {
    const res = await apiGet<{ notifications: NotificationItem[] }>(`/api/admin/notifications${queryStr}`);
    list = res.notifications ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  const statuses = ['all', 'pending', 'delivered', 'failed', 'scheduled'];

  return (
    <section>
      <Link href="/admin" className="muted">
        ← Operations console
      </Link>
      <h1 style={{ marginTop: 8 }}>Notification history</h1>
      <p className="page-sub">
        Delivery log for transactional notifications queued by events, bookings, and system triggers.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>
          Status:
        </span>
        {statuses.map((s) => {
          const active = (!status && s === 'all') || status === s;
          const href = s === 'all' ? '/admin/notifications' : `/admin/notifications?status=${s}`;
          return (
            <Link
              key={s}
              href={href}
              className={active ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ padding: '4px 10px', fontSize: 13 }}
            >
              {s}
            </Link>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Outbox log</h2>
        <span className="badge badge-accent">{list.length}</span>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">No notifications match this filter.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #333)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Created</th>
                <th style={{ padding: '8px 10px' }}>Channel</th>
                <th style={{ padding: '8px 10px' }}>Template</th>
                <th style={{ padding: '8px 10px' }}>Recipient / Target</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px' }}>Retries</th>
                <th style={{ padding: '8px 10px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const statusColor =
                  item.status === 'delivered'
                    ? '#22c55e'
                    : item.status === 'failed'
                      ? '#ef4444'
                      : item.status === 'pending'
                        ? '#f59e0b'
                        : '#94a3b8';
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }} className="muted">
                      {localTime(item.createdAt, timezone)}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="badge">{item.channel}</span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <code>{item.template}</code>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div>{item.target}</div>
                      {item.member && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {item.member.displayName ? `${item.member.displayName} · ` : ''}
                          {item.member.email}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ color: statusColor, fontWeight: 600 }}>{item.status}</span>
                      {item.lastError && (
                        <div style={{ color: '#ef4444', fontSize: 12, maxWidth: 220, wordBreak: 'break-all' }}>
                          {item.lastError}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px' }}>{item.retryCount}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {item.status === 'failed' && <NotificationRetryButton id={item.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
