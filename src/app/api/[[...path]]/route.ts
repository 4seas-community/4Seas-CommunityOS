/**
 * Catch-all API route: delegates every /api/* request to the module router
 * (src/lib/app-router.ts), which applies auth + audit middleware (docs/03 §6).
 */
import { router } from '../../../lib/app-router';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const pathname = '/api/' + (path ?? []).join('/');
  return router.handle(req, pathname + url.search);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
