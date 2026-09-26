/**
 * Booking module routes (docs/03 §6):
 *   POST /api/bookings                       (standalone booking; rules + conflict + approval)
 *   POST /api/bookings/{id}/approve|reject|cancel
 *   GET  /api/bookings?venue=&from=&to=      (occupancy overview)
 */
import type { Router } from '../../lib/http';
import { forbidden, json, unauthorized } from '../../lib/errors';
import { hasRole } from '../../lib/auth/roles';
import * as service from './service';
import { db } from '../../lib/db';
import { venues } from '../place/schema';
import { members } from '../people/schema';
import { eq } from 'drizzle-orm';
import type { SessionPayload } from '../../lib/auth/session';

function requireSession(s: SessionPayload | null): SessionPayload {
  if (!s) throw unauthorized();
  return s;
}

export function registerBookingRoutes(router: Router): void {
  router.post('/api/bookings', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = service.bookingCreateSchema.parse(await req.json().catch(() => ({})));
    const result = await service.createBooking(input, session);
    return json({ booking: result.booking, warnings: result.warnings, approvalMode: result.approvalMode }, 201, {
      'x-audit-logged': '1',
    });
  });

  router.post('/api/bookings/:id/approve', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const booking = await service.approveBooking(ctx.params.id, session, body.note);
    return json({ booking }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/bookings/:id/reject', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const booking = await service.rejectBooking(ctx.params.id, session, body.note);
    return json({ booking }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/bookings/:id/cancel', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const booking = await service.cancelBooking(ctx.params.id, session, body.reason);
    return json({ booking }, 200, { 'x-audit-logged': '1' });
  });

  /**
   * Occupancy overview. Session required: booking rows carry member identity, so
   * this is never public (the previous public version leaked member emails).
   * - venue managers / admins see the whole requested range
   * - everyone else only sees their own bookings
   */
  router.get('/api/bookings', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const from = ctx.url.searchParams.get('from');
    const to = ctx.url.searchParams.get('to');
    const venueId = ctx.url.searchParams.get('venue') ?? undefined;
    const status = ctx.url.searchParams.get('status') ?? undefined;

    const isCommunityAdmin = hasRole(session.roles, 'admin');
    const canSeeVenue = venueId ? hasRole(session.roles, 'venue_manager', 'venue:' + venueId) : false;
    const unrestricted = isCommunityAdmin || canSeeVenue;

    const rows = await service.listBookings({
      venueId,
      status,
      memberId: unrestricted ? ctx.url.searchParams.get('member') ?? undefined : session.sub,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    const venueMap = new Map<string, string>();
    for (const v of await db.select().from(venues)) venueMap.set(v.id, v.name);
    // Member names are only resolved for callers allowed to see other people's rows.
    const memberMap = new Map<string, string>();
    if (unrestricted) {
      for (const m of await db.select().from(members)) memberMap.set(m.id, m.displayName ?? m.email);
    }
    return json({
      bookings: rows.map((b) => ({
        ...b,
        venueName: venueMap.get(b.venueId) ?? null,
        memberName: b.memberId === session.sub ? 'you' : (memberMap.get(b.memberId) ?? (unrestricted ? null : 'member')),
      })),
    });
  });

  /** A booking is visible to its owner, the venue's manager, or a community admin. */
  router.get('/api/bookings/:id', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const b = await service.getBooking(ctx.params.id);
    const allowed =
      b.memberId === session.sub ||
      hasRole(session.roles, 'admin') ||
      hasRole(session.roles, 'venue_manager', 'venue:' + b.venueId);
    if (!allowed) throw forbidden('Not allowed to view this booking');
    return json({ booking: b });
  });
}
