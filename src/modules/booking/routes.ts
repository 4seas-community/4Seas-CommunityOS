/**
 * Booking module routes (docs/03 §6):
 *   POST /api/bookings                       (standalone booking; rules + conflict + approval)
 *   POST /api/bookings/{id}/approve|reject|cancel
 *   GET  /api/bookings?venue=&from=&to=      (occupancy overview)
 */
import type { Router } from '../../lib/http';
import { json, unauthorized } from '../../lib/errors';
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

  router.get('/api/bookings', async (_req, ctx) => {
    const from = ctx.url.searchParams.get('from');
    const to = ctx.url.searchParams.get('to');
    const venueId = ctx.url.searchParams.get('venue') ?? undefined;
    const memberId = ctx.url.searchParams.get('member') ?? undefined;
    const status = ctx.url.searchParams.get('status') ?? undefined;
    const rows = await service.listBookings({
      venueId,
      memberId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    // Occupancy overview: join venue + member names (docs/03 §6 "占用总览").
    const venueMap = new Map<string, string>();
    const memberMap = new Map<string, string>();
    for (const v of await db.select().from(venues)) venueMap.set(v.id, v.name);
    for (const m of await db.select().from(members)) memberMap.set(m.id, m.displayName ?? m.email);
    return json({
      bookings: rows.map((b) => ({
        ...b,
        venueName: venueMap.get(b.venueId) ?? null,
        memberName: memberMap.get(b.memberId) ?? null,
      })),
    });
  });

  router.get('/api/bookings/:id', async (_req, ctx) => {
    const rows = await service.listBookings({});
    const b = rows.find((x) => x.id === ctx.params.id);
    if (!b) return json({ error: { code: 'not_found', message: 'Booking not found' } }, 404);
    return json({ booking: b });
  });
}
