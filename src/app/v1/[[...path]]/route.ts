/**
 * Machine-facing API surface: /v1/* (Agent API + 4seasbot integration feed).
 * Same router as /api/* — module routes declare their own absolute paths.
 */
import { router } from '../../../lib/app-router';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const pathname = '/v1/' + (path ?? []).join('/');
  return router.handle(req, pathname);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
