/**
 * Viewer-scope helpers for the operations console (docs/10 §3 batch 2).
 *
 * The booking list endpoint is deliberately owner-scoped: a community admin
 * gets every row, while a venue manager only ever sees the venues in their
 * `venue:<uuid>` roles and only when they ask for that venue explicitly. These
 * helpers reproduce that rule on the page side so a screen fetches exactly what
 * the API is willing to return — the console must never show more than the API
 * authorises, and must not silently show less either.
 */
import { apiGet } from './api-client';
import { isCommunityAdmin, type CurrentMember } from './session-server';

export interface AdminBooking {
  id: string;
  venueId: string;
  eventId: string | null;
  memberId: string;
  purpose: string;
  startAt: string;
  endAt: string;
  attendeesCount: number;
  status: string;
  venueName: string | null;
  memberName: string | null;
}

export interface AdminVenue {
  id: string;
  name: string;
  code: string;
}

/** Venues the viewer can administer; a community admin administers all of them. */
export async function manageableVenues(member: CurrentMember): Promise<AdminVenue[]> {
  const all = await apiGet<{ venues: AdminVenue[] }>('/api/venues');
  if (isCommunityAdmin(member)) return all.venues;
  const scopes = new Set(
    member.roles
      .filter((r) => r.role === 'venue_manager' && r.scope.startsWith('venue:'))
      .map((r) => r.scope.slice('venue:'.length)),
  );
  return all.venues.filter((v) => scopes.has(v.id));
}

/** Bookings the viewer may see for a query (per-venue when not an admin). */
export async function scopedBookings(
  member: CurrentMember,
  query: { status?: string; from?: string; to?: string } = {},
): Promise<AdminBooking[]> {
  const base = new URLSearchParams();
  if (query.status) base.set('status', query.status);
  if (query.from) base.set('from', query.from);
  if (query.to) base.set('to', query.to);

  if (isCommunityAdmin(member)) {
    const res = await apiGet<{ bookings: AdminBooking[] }>('/api/bookings?' + base.toString());
    return res.bookings;
  }

  const venues = await manageableVenues(member);
  const pages = await Promise.all(
    venues.map((venue) => {
      const scoped = new URLSearchParams(base);
      scoped.set('venue', venue.id);
      return apiGet<{ bookings: AdminBooking[] }>('/api/bookings?' + scoped.toString());
    }),
  );
  return pages.flatMap((page) => page.bookings);
}
