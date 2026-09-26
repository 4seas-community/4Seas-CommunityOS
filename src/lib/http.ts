/**
 * Minimal pattern router shared by all module route files (docs/03 §6 API sketch).
 * The Next.js catch-all route (src/app/api/[[...path]]/route.ts) delegates here.
 * Also implements the audit middleware: every successful write is recorded
 * (docs/03 §4.5) with actor type user/agent/service and draft id when present.
 */
import { badRequest, errorBody, json, unauthorized, type ApiError } from './errors';
import { getSession, type SessionPayload } from './auth/session';
import { config } from './config';
import { writeAudit } from './audit';

export type AuthMode = 'public' | 'session' | 'service' | 'session-or-service';

export interface Ctx {
  params: Record<string, string>;
  url: URL;
  session: SessionPayload | null;
  /** True when the request carried a valid service token (BOT_FEED_TOKEN). */
  service: boolean;
}

export type Handler = (req: Request, ctx: Ctx) => Promise<Response> | Response;

interface RouteEntry {
  method: string;
  pattern: string;
  auth: AuthMode;
  handler: Handler;
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export class Router {
  private routes: RouteEntry[] = [];

  add(method: string, pattern: string, auth: AuthMode, handler: Handler): this {
    this.routes.push({ method: method.toUpperCase(), pattern, auth, handler });
    return this;
  }

  get(p: string, h: Handler, auth: AuthMode = 'public') { return this.add('GET', p, auth, h); }
  post(p: string, h: Handler, auth: AuthMode = 'public') { return this.add('POST', p, auth, h); }
  patch(p: string, h: Handler, auth: AuthMode = 'public') { return this.add('PATCH', p, auth, h); }
  put(p: string, h: Handler, auth: AuthMode = 'public') { return this.add('PUT', p, auth, h); }
  delete(p: string, h: Handler, auth: AuthMode = 'public') { return this.add('DELETE', p, auth, h); }

  async handle(req: Request, path: string): Promise<Response> {
    const url = new URL(req.url);
    let matched: RouteEntry | undefined;
    let params: Record<string, string> = {};
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = matchPattern(r.pattern, path);
      if (m) {
        matched = r;
        params = m;
        break;
      }
    }
    if (!matched) return json({ error: { code: 'not_found', message: 'Not found' } }, 404);

    const session = await getSession(req);
    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const service =
      matched.auth === 'service' || matched.auth === 'session-or-service'
        ? bearer !== '' && bearer === config.botFeedToken
        : false;

    if (matched.auth === 'session' && !session) throw unauthorized();
    if (matched.auth === 'service' && !service) throw unauthorized('Invalid or missing service token');
    if (matched.auth === 'session-or-service' && !session && !service) throw unauthorized();

    try {
      const res = await matched.handler(req, { params, url, session, service });
      // ---- audit middleware: record every successful write (docs/03 §4.5) ----
      const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
      if (isWrite && res.status < 400 && res.headers.get('x-audit-logged') !== '1') {
        try {
          await writeAudit({
            actorType: session ? 'user' : service ? 'service' : 'anonymous',
            actorId: session?.sub ?? null,
            action: req.method + ' ' + path,
            entityType: entityTypeOf(path),
            entityId: params.id ?? null,
            draftId: req.headers.get('x-draft-id') ?? url.searchParams.get('draft_id'),
            ip: req.headers.get('x-forwarded-for') ?? null,
            ua: req.headers.get('user-agent') ?? null,
          });
        } catch (e) {
          console.error('[audit] failed to write audit log', e);
        }
      }
      return res;
    } catch (err) {
      const { status, body } = errorBody(err as ApiError);
      return json(body, status);
    }
  }
}

function entityTypeOf(path: string): string | null {
  const seg = path.split('/').filter(Boolean);
  if (seg.length < 2 || seg[0] !== 'api') return null;
  const singular: Record<string, string> = {
    venues: 'venue',
    events: 'event',
    bookings: 'booking',
    members: 'member',
    notifications: 'notification',
    auth: 'auth',
  };
  return singular[seg[1]] ?? seg[1];
}

/**
 * Read + validate a request body against a zod schema.
 *
 * Accepts JSON, and also classic HTML form bodies (`application/x-www-form-urlencoded`
 * / `multipart/form-data`) so server-rendered <form> submissions work without
 * client JavaScript. Numeric-looking and comma-separated fields are normalised
 * because form values always arrive as strings.
 */
export async function readJson<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  const contentType = req.headers.get('content-type') ?? '';
  let raw: unknown;

  if (contentType.includes('form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const obj: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value !== 'string') continue;
      obj[key] = normalizeFormValue(value);
    }
    raw = obj;
  } else {
    try {
      raw = await req.json();
    } catch {
      throw badRequest('Invalid JSON body');
    }
  }

  try {
    return schema.parse(raw);
  } catch (err) {
    // Zod errors would otherwise surface as a generic 500.
    throw badRequest('Invalid request body: ' + (err as Error).message.slice(0, 300));
  }
}

/** Form strings -> numbers / arrays, so one schema serves JSON and form posts. */
function normalizeFormValue(value: string): unknown {
  if (value === '') return undefined;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.includes(',')) return value.split(',').map((s) => s.trim()).filter(Boolean);
  return value;
}
