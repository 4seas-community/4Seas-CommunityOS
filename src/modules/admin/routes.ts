/**
 * Admin console API (docs/02 §3 运营后台, gap list docs/10 §3 batch 1).
 * Every route is admin-gated (the service re-checks, so a route slip cannot
 * open a hole). The console UI lives at /admin.
 *
 *   GET    /api/admin/overview
 *   GET    /api/admin/members
 *   POST   /api/admin/members/{id}/roles          { role, scope }
 *   DELETE /api/admin/members/{id}/roles          { role, scope }
 *   POST   /api/admin/members/{id}/points         { delta, reason }
 */
import { readJson, type Router } from '../../lib/http';
import { json, unauthorized } from '../../lib/errors';
import { z } from 'zod';
import * as service from './service';
import * as notifyService from '../notify/service';
import { outboxStatusValues, type OutboxStatus, notificationChannelValues, type NotificationChannel } from '../notify/schema';
import { requireRole } from '../../lib/auth/roles';
import { writeAudit } from '../../lib/audit';
import type { SessionPayload } from '../../lib/auth/session';

function requireSession(s: SessionPayload | null): SessionPayload {
  if (!s) throw unauthorized();
  return s;
}

const roleSchema = z.object({
  role: z.enum(service.ASSIGNABLE_ROLES),
  scope: z.string().min(1).max(120),
});

const pointsSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'delta must not be zero'),
  reason: z.string().min(1).max(120),
  refType: z.string().max(60).nullish(),
  refId: z.string().max(120).nullish(),
});

export function registerAdminRoutes(router: Router): void {
  router.get('/api/admin/overview', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    return json(await service.overview(session));
  });

  router.get('/api/admin/members', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    return json({ members: await service.listMembers(session) });
  });

  router.post('/api/admin/members/:id/roles', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = await readJson(req, roleSchema);
    const member = await service.grantRole(ctx.params.id, body, session);
    return json({ member: { id: member.id, roles: member.roles } }, 200, { 'x-audit-logged': '1' });
  });

  router.delete('/api/admin/members/:id/roles', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = await readJson(req, roleSchema);
    const member = await service.revokeRole(ctx.params.id, body, session);
    return json({ member: { id: member.id, roles: member.roles } }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/admin/members/:id/points', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = await readJson(req, pointsSchema);
    return json(await service.adjustPoints(ctx.params.id, body, session), 201, { 'x-audit-logged': '1' });
  });

  router.get('/api/admin/notifications', async (req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam && (outboxStatusValues as readonly string[]).includes(statusParam)
      ? (statusParam as OutboxStatus)
      : undefined;
    const channelParam = url.searchParams.get('channel');
    const channel = channelParam && (notificationChannelValues as readonly string[]).includes(channelParam)
      ? (channelParam as NotificationChannel)
      : undefined;
    const template = url.searchParams.get('template') || undefined;
    const sinceRaw = url.searchParams.get('since');
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

    const notifications = await notifyService.listNotifications({
      status,
      channel,
      template,
      since: since && !isNaN(since.getTime()) ? since : undefined,
      limit: limit && !isNaN(limit) ? limit : undefined,
    });
    return json({ notifications });
  });

  router.post('/api/admin/notifications/:id/retry', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');
    const updated = await notifyService.retryNotification(ctx.params.id);
    await writeAudit({
      actorType: 'user',
      actorId: session.sub,
      action: 'POST /api/admin/notifications/' + ctx.params.id + '/retry',
      entityType: 'notification_outbox',
      entityId: ctx.params.id,
      after: { status: updated.status, lastError: updated.lastError },
    });
    return json({ notification: updated }, 200, { 'x-audit-logged': '1' });
  });
}
