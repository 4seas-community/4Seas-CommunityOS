/**
 * Agent API (docs/04 §5-6) — reads execute directly, writes go through
 * draft + confirm. Authenticated with an agent API key (Authorization: Bearer
 * cos_ak_...). Scopes: venues:read, events:read, events:write, bookings:write.
 *
 *   GET    /v1/agent/venues
 *   GET    /v1/agent/venues/{id}/availability?from&to
 *   GET    /v1/agent/events
 *   GET    /v1/agent/events/{id}
 *   POST   /v1/agent/events/draft            -> { draft_id, preview }
 *   POST   /v1/agent/events/draft/{id}/confirm
 *   DELETE /v1/agent/events/draft/{id}
 *   POST   /v1/agent/bookings/draft
 *   POST   /v1/agent/bookings/draft/{id}/confirm
 *   POST   /v1/agent/events/{id}/cancel/draft
 *   POST   /v1/agent/events/{id}/cancel/draft/{draftId}/confirm
 */
import type { Router, Ctx } from '../../lib/http';
import { json, badRequest, forbidden, unauthorized, notFound } from '../../lib/errors';
import * as agent from './service';
import * as place from '../place/service';
import * as eventService from '../event/service';
import * as bookingService from '../booking/service';
import type { SessionPayload } from '../../lib/auth/session';

async function requireAgent(req: Request, scope: agent.AgentScope) {
  const header = req.headers.get('authorization') ?? '';
  const secret = header.startsWith('Bearer ') ? header.slice(7) : '';
  const key = await agent.authenticate(secret);
  if (!key) throw unauthorized('invalid agent key');
  if (!agent.hasScope(key, scope)) throw forbidden('missing scope: ' + scope);
  return key;
}

/** Agent writes are attributed to the bound member when present. */
function actorFor(key: Awaited<ReturnType<typeof agent.authenticate>>): SessionPayload {
  if (!key) throw unauthorized('invalid agent key');
  if (!key.memberId) throw badRequest('this agent key is not bound to a member');
  return { sub: key.memberId, email: 'agent+' + key.id + '@agent.local', roles: [{ scope: 'community:*', role: 'member' }] };
}

export function registerAgentRoutes(router: Router): void {
  // ---------------------------------------------------------------- reads
  router.get('/v1/agent/venues', async (req) => {
    await requireAgent(req, 'venues:read');
    const rows = await place.listVenues({});
    return json({ venues: rows });
  });

  router.get('/v1/agent/venues/:id/availability', async (req, ctx: Ctx) => {
    await requireAgent(req, 'venues:read');
    const from = ctx.url.searchParams.get('from');
    const to = ctx.url.searchParams.get('to');
    if (!from || !to) throw badRequest('from and to are required (ISO timestamps)');
    const slots = await place.getVenueAvailability(ctx.params.id, new Date(from), new Date(to));
    return json({ slots });
  });

  router.get('/v1/agent/events', async (req, ctx: Ctx) => {
    await requireAgent(req, 'events:read');
    const rows = await eventService.listEvents({ view: 'list' });
    return json({ events: rows });
  });

  router.get('/v1/agent/events/:id', async (req, ctx: Ctx) => {
    await requireAgent(req, 'events:read');
    return json(await eventService.getEvent(ctx.params.id));
  });

  // ---------------------------------------------------------------- writes (draft + confirm)
  router.post('/v1/agent/events/draft', async (req) => {
    const key = await requireAgent(req, 'events:write');
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let parsed;
    try {
      parsed = eventService.eventCreateSchema.parse(payload);
    } catch (err) {
      throw badRequest('invalid event payload: ' + (err as Error).message);
    }
    // Build a real preview: venue availability + rule checks are visible up front.
    let venueSummary: { id: string; name: string; approvalMode: string } | null = null;
    if (parsed.venueId) {
      const detail = await place.getVenueWithRules(parsed.venueId);
      const rule = detail.rules?.[0];
      venueSummary = { id: detail.venue.id, name: detail.venue.name, approvalMode: rule?.approvalMode ?? 'auto' };
    }
    const preview = {
      title: parsed.title,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      timezone: parsed.timezone,
      venue: venueSummary,
      maxCapacity: parsed.maxCapacity ?? null,
      visibility: parsed.visibility,
      tags: parsed.tags,
      willRequireApproval: venueSummary ? venueSummary.approvalMode !== 'auto' : false,
      confirmWith: 'POST /v1/agent/events/draft/{draft_id}/confirm',
    };
    const draft = await agent.openDraft({ key, action: 'create_event', payload: payload as Record<string, unknown>, preview });
    return json({ draft_id: draft.id, expires_at: draft.expiresAt.toISOString(), preview }, 201);
  });

  router.post('/v1/agent/events/draft/:id/confirm', async (req, ctx: Ctx) => {
    const key = await requireAgent(req, 'events:write');
    const draft = await agent.takeDraftForConfirm(ctx.params.id, key);
    if (draft.action !== 'create_event') throw badRequest('draft is not a create_event draft');
    const input = eventService.eventCreateSchema.parse(draft.payload);
    const { event } = await eventService.createEvent(input, actorFor(key));
    const confirmed = await agent.markConfirmed(draft.id, event.id);
    return json({ event, draft: { id: confirmed.id, status: confirmed.status } }, 201, { 'x-audit-logged': '1' });
  });

  router.delete('/v1/agent/events/draft/:id', async (req, ctx: Ctx) => {
    const key = await requireAgent(req, 'events:write');
    const draft = await agent.cancelDraft(ctx.params.id, key);
    return json({ draft: { id: draft.id, status: draft.status } });
  });

  router.post('/v1/agent/bookings/draft', async (req) => {
    const key = await requireAgent(req, 'bookings:write');
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let parsed;
    try {
      parsed = bookingService.bookingCreateSchema.parse(payload);
    } catch (err) {
      throw badRequest('invalid booking payload: ' + (err as Error).message);
    }
    const preview = {
      venueId: parsed.venueId,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      attendeesCount: parsed.attendeesCount,
      purpose: parsed.purpose,
      confirmWith: 'POST /v1/agent/bookings/draft/{draft_id}/confirm',
    };
    const draft = await agent.openDraft({ key, action: 'create_booking', payload: payload as Record<string, unknown>, preview });
    return json({ draft_id: draft.id, expires_at: draft.expiresAt.toISOString(), preview }, 201);
  });

  router.post('/v1/agent/bookings/draft/:id/confirm', async (req, ctx: Ctx) => {
    const key = await requireAgent(req, 'bookings:write');
    const draft = await agent.takeDraftForConfirm(ctx.params.id, key);
    if (draft.action !== 'create_booking') throw badRequest('draft is not a create_booking draft');
    const input = bookingService.bookingCreateSchema.parse(draft.payload);
    const result = await bookingService.createBooking(input, actorFor(key));
    await agent.markConfirmed(draft.id, result.booking.id);
    return json({ booking: result.booking, approvalMode: result.approvalMode, warnings: result.warnings }, 201, {
      'x-audit-logged': '1',
    });
  });

  router.post('/v1/agent/events/:id/cancel/draft', async (req, ctx: Ctx) => {
    const key = await requireAgent(req, 'events:write');
    const detail = await eventService.getEvent(ctx.params.id);
    if (!detail) throw notFound('event not found');
    const draft = await agent.openDraft({
      key,
      action: 'cancel_event',
      payload: { eventId: ctx.params.id },
      preview: { eventId: ctx.params.id, title: detail.event.title, irreversible: true, confirmWith: 'POST /v1/agent/events/{id}/cancel/draft/{draft_id}/confirm' },
    });
    return json({ draft_id: draft.id, expires_at: draft.expiresAt.toISOString(), preview: draft.preview }, 201);
  });

  router.post('/v1/agent/events/:id/cancel/draft/:draftId/confirm', async (req, ctx: Ctx) => {
    const key = await requireAgent(req, 'events:write');
    const draft = await agent.takeDraftForConfirm(ctx.params.draftId, key);
    if (draft.action !== 'cancel_event') throw badRequest('draft is not a cancel_event draft');
    const canceled = await eventService.cancelEvent(ctx.params.id, actorFor(key), 'canceled by agent');
    await agent.markConfirmed(draft.id, ctx.params.id);
    return json({ event: canceled }, 200, { 'x-audit-logged': '1' });
  });
}
