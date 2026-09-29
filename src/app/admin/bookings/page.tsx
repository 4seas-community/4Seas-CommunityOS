import Link from 'next/link';
import { config } from '../../../lib/config';
import { canUseAdmin, getCurrentMember, isCommunityAdmin } from '../../../lib/session-server';
import { manageableVenues, scopedBookings, type AdminBooking, type AdminVenue } from '../../../lib/admin-scope';
import { BookingDecision } from '../../../components/admin-forms';
import { dateKeyInZone, zonedTimeToUtc } from '../../../lib/time';

export const dynamic = 'force-dynamic';

/** Statuses that occupy a slot, i.e. the ones the occupancy grid counts. */
const ACTIVE = ['pending', 'approved', 'checked_in'];
const DAYS = 14;

function localTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default async function AdminBookingsPage() {
  const member = await getCurrentMember();
  // `!member` first so TypeScript narrows the member for the rest of the page.
  if (!member || !canUseAdmin(member)) {
    return (
      <section style={{ maxWidth: 560 }}>
        <h1>Bookings</h1>
        <div className="notice notice-warn">You need a venue manager or community admin role.</div>
        <Link href="/admin" className="btn btn-ghost">Back to console</Link>
      </section>
    );
  }

  const timezone = config.defaultTimezone;
  const from = new Date();
  const to = new Date(from.getTime() + DAYS * 86400_000);

  let pending: AdminBooking[] = [];
  let range: AdminBooking[] = [];
  let venues: AdminVenue[] = [];
  let error: string | null = null;
  try {
    venues = await manageableVenues(member);
    [pending, range] = await Promise.all([
      scopedBookings(member, { status: 'pending' }),
      scopedBookings(member, { from: from.toISOString(), to: to.toISOString() }),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }

  const days: string[] = [];
  for (let i = 0; i < DAYS; i += 1) days.push(dateKeyInZone(new Date(from.getTime() + i * 86400_000), timezone));

  // venueId -> day -> active bookings overlapping that day (docs/03 §4.2).
  const grid = new Map<string, Map<string, number>>();
  for (const booking of range) {
    if (!ACTIVE.includes(booking.status)) continue;
    const start = new Date(booking.startAt);
    const end = new Date(booking.endAt);
    if (end <= from || start >= to) continue;
    const row = grid.get(booking.venueId) ?? new Map<string, number>();
    for (const day of days) {
      const dayStart = zonedTimeToUtc(day, '00:00', timezone);
      const dayEnd = new Date(dayStart.getTime() + 86400_000);
      if (start < dayEnd && end > dayStart) row.set(day, (row.get(day) ?? 0) + 1);
    }
    grid.set(booking.venueId, row);
  }

  return (
    <section>
      <Link href="/admin" className="muted">
        ← Operations console
      </Link>
      <h1 style={{ marginTop: 8 }}>Bookings</h1>
      <p className="page-sub">
        Approve or reject requests, and see how the next {DAYS} days are filling up. If you manage a single
        venue, the lists below cover just that venue.
      </p>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="section-head">
        <h2>Waiting for a decision</h2>
        <span className="badge badge-accent">{pending.length}</span>
      </div>

      {pending.length === 0 ? (
        <div className="empty-state">Nothing pending — every request has been decided.</div>
      ) : (
        <div className="stack">
          {pending.map((booking) => (
            <article className="card" key={booking.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{booking.venueName ?? 'Venue'}</strong>
                  <div className="muted">
                    {localTime(booking.startAt, timezone)} → {localTime(booking.endAt, timezone)} · {booking.attendeesCount} people
                  </div>
                  <div className="muted">
                    {booking.memberName ?? 'member'} · {booking.purpose || 'no purpose given'}
                  </div>
                </div>
                <span className="badge badge-accent">{booking.status}</span>
              </div>
              <hr className="divider" />
              <BookingDecision
                bookingId={booking.id}
                canDecide={
                  isCommunityAdmin(member) ||
                  member.roles.some((r) => r.role === 'venue_manager' && r.scope === 'venue:' + booking.venueId)
                }
              />
            </article>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>Occupancy · next {DAYS} days</h2>
        <span className="muted">active bookings per day (pending included)</span>
      </div>

      {venues.length === 0 ? (
        <div className="empty-state">No venues to show.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 720, fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Venue</th>
                {days.map((day) => (
                  <th key={day} style={{ padding: '6px 4px', fontWeight: 500, color: 'var(--muted)' }}>
                    {day.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {venues.map((venue) => (
                <tr key={venue.id}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{venue.name}</td>
                  {days.map((day) => {
                    const count = grid.get(venue.id)?.get(day) ?? 0;
                    return (
                      <td
                        key={day}
                        title={day + ' · ' + count + ' booking(s)'}
                        style={{
                          textAlign: 'center',
                          padding: '6px 4px',
                          background: count === 0 ? undefined : 'rgba(226,118,43,' + Math.min(0.12 + count * 0.18, 0.75) + ')',
                          color: count === 0 ? 'var(--muted)' : '#fff',
                        }}
                      >
                        {count === 0 ? '·' : count}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
