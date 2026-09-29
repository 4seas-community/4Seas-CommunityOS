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
import type { Router } from '../../lib/http';
import { json, unauthorized } from '../../lib/errors';
import { z } from 'zod';
import * as service from './service';
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
    const body = roleSchema.parse(await req.json().catch(() => ({})));
    const member = await service.grantRole(ctx.params.id, body, session);
    return json({ member: { id: member.id, roles: member.roles } }, 200, { 'x-audit-logged': '1' });
  });

  router.delete('/api/admin/members/:id/roles', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = roleSchema.parse(await req.json().catch(() => ({})));
    const member = await service.revokeRole(ctx.params.id, body, session);
    return json({ member: { id: member.id, roles: member.roles } }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/admin/members/:id/points', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const body = pointsSchema.parse(await req.json().catch(() => ({})));
    return json(await service.adjustPoints(ctx.params.id, body, session), 201, { 'x-audit-logged': '1' });
  });
}
