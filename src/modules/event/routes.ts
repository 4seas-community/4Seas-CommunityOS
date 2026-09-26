/**
 * Event module routes (docs/03 §6):
 *   POST /api/events                          (quick or full creation)
 *   GET  /api/events?view=day|week|list&venue&program&tag&from&to
 *   GET  /api/events/{id}
 *   POST /api/events/{id}/publish             (state machine + outbox + sync_records)
 *   POST /api/events/{id}/cancel
 *   POST /api/events/{id}/registrations
 *   GET  /api/events/{id}/registrations       (host)
 *   POST /api/events/{id}/check-in/rotate     (host: rotating QR)
 *   GET  /api/events/{id}/check-in            (host: current QR)
 *   POST /api/events/{id}/check-in/claim      (participant: one-time claim URL)
 */
import type { Router } from '../../lib/http';
import { json, unauthorized } from '../../lib/errors';
import * as service from './service';
import type { SessionPayload } from '../../lib/auth/session';

function requireSession(s: SessionPayload | null): SessionPayload {
  if (!s) throw unauthorized();
  return s;
}

export function registerEventRoutes(router: Router): void {
  router.post('/api/events', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = service.eventCreateSchema.parse(await req.json().catch(() => ({})));
    const result = await service.createEvent(input, session);
    return json({ event: result.event, warnings: result.warnings }, 201, { 'x-audit-logged': '1' });
  });

  router.get('/api/events', async (_req, ctx) => {
    const view = ctx.url.searchParams.get('view') ?? undefined;
    const from = ctx.url.searchParams.get('from');
    const to = ctx.url.searchParams.get('to');
    const events = await service.listEvents(
      {
        view: view === 'day' || view === 'week' ? view : 'list',
        venue: ctx.url.searchParams.get('venue') ?? undefined,
        program: ctx.url.searchParams.get('program') ?? undefined,
        tag: ctx.url.searchParams.get('tag') ?? undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      ctx.session,
    );
    return json({ events });
  });

  router.get('/api/events/:id', async (_req, ctx) => {
    const detail = await service.getEvent(ctx.params.id, ctx.session);
    return json(detail);
  });

  router.post('/api/events/:id/publish', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const result = await service.publishEvent(ctx.params.id, session);
    return json({ event: result.event, reviewRequired: result.reviewRequired }, 200, { 'x-audit-logged': '1' });
  });

  /** Manager approval alias for pending_review events. */
  router.post('/api/events/:id/approve', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const result = await service.publishEvent(ctx.params.id, session);
    return json({ event: result.event, reviewRequired: result.reviewRequired }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/events/:id/cancel', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const event = await service.cancelEvent(ctx.params.id, session, body.reason);
    return json({ event }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/events/:id/registrations', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, unknown>; source?: 'web' | 'agent' | 'telegram' };
    const registration = await service.registerForEvent(ctx.params.id, session.sub, body.answers ?? {}, body.source ?? 'web');
    return json({ registration }, 201);
  });

  router.get('/api/events/:id/registrations', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const registrations = await service.listRegistrations(ctx.params.id, session);
    return json({ registrations });
  });

  router.post('/api/events/:id/check-in/rotate', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const result = await service.rotateCheckin(ctx.params.id, session);
    return json({ token: result.token, rotation: result.rotation }, 201, { 'x-audit-logged': '1' });
  });

  router.get('/api/events/:id/check-in', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    const token = await service.getActiveCheckinToken(ctx.params.id, session);
    return json({ token, active: Boolean(token) });
  });

  router.post('/api/events/:id/check-in/claim', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = (await req.json().catch(() => ({}))) as { tokenId?: string; sig?: string; claimUrl?: string };
    let tokenId = body.tokenId;
    let sig = body.sig;
    if ((!tokenId || !sig) && body.claimUrl) {
      const u = new URL(body.claimUrl);
      tokenId = u.searchParams.get('ck') ?? undefined;
      sig = u.searchParams.get('sig') ?? undefined;
    }
    if (!tokenId || !sig) throw unauthorized('tokenId and sig (or claimUrl) are required');
    const result = await service.claimCheckin(ctx.params.id, { tokenId, sig }, session);
    return json({ registration: result.registration, claimedAt: result.claimedAt }, 200, { 'x-audit-logged': '1' });
  });
}
