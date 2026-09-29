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
import { json, unauthorized, badRequest } from '../../lib/errors';
import { z } from 'zod';
import * as service from './service';
import * as notifyService from '../notify/service';
import * as agentService from '../agent/service';
import * as exportModule from './export';
import * as auditModule from './audit';
import { auditActorTypeValues, type AuditActorType } from '../../lib/db/audit-schema';
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

  router.get('/api/admin/agent-keys', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');
    const keys = await agentService.listKeys();
    return json({ keys });
  });

  router.post('/api/admin/agent-keys', async (req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');
    const body = await readJson(
      req,
      z.object({
        name: z.string().trim().min(1, 'Name is required').max(100),
        scopes: z.array(z.enum(agentService.AGENT_SCOPES)).min(1, 'At least one scope is required'),
        memberId: z.string().nullish(),
      }),
    );
    const result = await agentService.createKey(body, session.sub);
    return json(
      {
        key: {
          id: result.key.id,
          name: result.key.name,
          scopes: result.key.scopes,
          memberId: result.key.memberId,
          createdAt: result.key.createdAt,
        },
        secret: result.secret,
      },
      201,
      { 'x-audit-logged': '1' },
    );
  });

  router.delete('/api/admin/agent-keys/:id', async (_req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');
    const updated = await agentService.revokeKey(ctx.params.id, session.sub);
    return json({ ok: true, revokedId: updated.id }, 200, { 'x-audit-logged': '1' });
  });

  router.get('/api/admin/export', async (req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');

    const url = new URL(req.url);
    const typeParam = url.searchParams.get('type') as exportModule.ExportType | null;
    const formatParam = url.searchParams.get('format') as exportModule.ExportFormat | null;

    if (!typeParam || !exportModule.EXPORT_TYPES.includes(typeParam)) {
      throw badRequest('Invalid export type. Allowed: ' + exportModule.EXPORT_TYPES.join(', '));
    }
    const format: exportModule.ExportFormat = formatParam === 'json' ? 'json' : 'csv';

    const dataset = await exportModule.getExportDataset(typeParam, session);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `4seas-${typeParam}-${timestamp}.${format}`;

    if (format === 'csv') {
      const csvContent = exportModule.toCsv(dataset.headers, dataset.rows);
      return new Response(csvContent, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control': 'no-store',
        },
      });
    }

    return new Response(
      JSON.stringify(
        {
          type: typeParam,
          exportedAt: new Date().toISOString(),
          count: dataset.rows.length,
          data: dataset.rows,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control': 'no-store',
        },
      },
    );
  });

  router.get('/api/admin/audit', async (req, ctx) => {
    const session = requireSession(ctx.session);
    requireRole(session, 'admin');

    const url = new URL(req.url);
    const actor = url.searchParams.get('actor') || undefined;
    const actorTypeParam = url.searchParams.get('actorType');
    const actorType = actorTypeParam && (auditActorTypeValues as readonly string[]).includes(actorTypeParam)
      ? (actorTypeParam as AuditActorType)
      : undefined;
    const action = url.searchParams.get('action') || undefined;
    const entityType = url.searchParams.get('entityType') || undefined;
    const entityId = url.searchParams.get('entityId') || undefined;
    const fromRaw = url.searchParams.get('from');
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const toRaw = url.searchParams.get('to');
    const to = toRaw ? new Date(toRaw) : undefined;
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const cursor = url.searchParams.get('cursor') || undefined;

    const result = await auditModule.listAuditLogs(
      {
        actorType,
        actorId: actor,
        action,
        entityType,
        entityId,
        from: from && !isNaN(from.getTime()) ? from : undefined,
        to: to && !isNaN(to.getTime()) ? to : undefined,
        limit: limit && !isNaN(limit) ? limit : undefined,
        cursor,
      },
      session,
    );

    return json(result);
  });
}
