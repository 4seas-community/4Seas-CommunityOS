/**
 * 4seasbot outbound feed (docs/04 §4.2). Pull-based; authenticated with a shared
 * service token (BOT_FEED_TOKEN) — this system never holds a Telegram bot token.
 *
 *   GET  /v1/integrations/bot/events?from&to
 *   GET  /v1/integrations/bot/notifications?since=
 *   POST /v1/integrations/bot/notifications/{id}/ack
 */
import type { Router } from '../../lib/http';
import { json, badRequest } from '../../lib/errors';
import * as service from './service';

export function registerIntegrationRoutes(router: Router): void {
  router.get('/v1/integrations/bot/events', async (_req, ctx) => {
    const from = ctx.url.searchParams.get('from');
    const to = ctx.url.searchParams.get('to');
    const events = await service.botEventsFeed(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
    return json({ events });
  }, 'service');

  router.get('/v1/integrations/bot/notifications', async (_req, ctx) => {
    const since = ctx.url.searchParams.get('since');
    const rows = await service.botNotificationsFeed(since ? new Date(since) : undefined);
    return json({
      notifications: rows.map((r) => ({
        id: r.id,
        memberId: r.memberId,
        target: r.memberTelegram ?? r.target,
        channel: r.channel,
        template: r.template,
        payload: r.payload,
        scheduledAt: r.scheduledAt.toISOString(),
        status: r.status,
      })),
    });
  }, 'service');

  router.post('/v1/integrations/bot/notifications/:id/ack', async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as { delivered?: boolean; error?: string };
    const row = await service.ackNotification(ctx.params.id, body);
    return json({ notification: row });
  }, 'service');
}
