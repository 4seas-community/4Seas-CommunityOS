/**
 * Router contract tests.
 *
 * Two failure paths used to escape the router as unhandled exceptions, which Next
 * turns into an opaque 500 with an empty body (both were found live while
 * verifying the D1 deployment):
 *   1. auth failures for routes using the router's 'session'/'service' mode
 *   2. invalid request bodies on handlers that parsed the body themselves
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Router, readJson } from '../src/lib/http';

function buildRouter() {
  const router = new Router();
  router.get('/api/secure', async () => new Response(JSON.stringify({ ok: true })), 'session');
  router.get('/v1/service', async () => new Response(JSON.stringify({ ok: true })), 'service');
  router.post('/api/thing', async (req) => {
    const body = await readJson(req, z.object({ name: z.string().min(3) }));
    return new Response(JSON.stringify({ name: body.name }), { status: 201 });
  });
  return router;
}

const jsonPost = (path: string, payload: unknown) =>
  new Request('http://test.local' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

describe('router error contract', () => {
  it('returns 401 JSON (not 500) for a session route without a session', async () => {
    const res = await buildRouter().handle(new Request('http://test.local/api/secure'), '/api/secure');
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('returns 401 JSON (not 500) for a service route with the wrong token', async () => {
    const req = new Request('http://test.local/v1/service', { headers: { authorization: 'Bearer nope' } });
    const res = await buildRouter().handle(req, '/v1/service');
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('returns 400 JSON for an invalid body instead of letting ZodError escape', async () => {
    const res = await buildRouter().handle(jsonPost('/api/thing', { name: 'x' }), '/api/thing');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'bad_request' } });
  });

  it('summarises validation issues as "field: message" instead of dumping raw Zod JSON', async () => {
    const res = await buildRouter().handle(jsonPost('/api/thing', { name: 'x' }), '/api/thing');
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/^Invalid request body: name: /);
    expect(body.error.message).not.toContain('"code"');
  });

  it('accepts a valid body', async () => {
    const res = await buildRouter().handle(jsonPost('/api/thing', { name: 'valid' }), '/api/thing');
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ name: 'valid' });
  });

  it('still returns 404 JSON for unknown paths', async () => {
    const res = await buildRouter().handle(new Request('http://test.local/api/nope'), '/api/nope');
    expect(res.status).toBe(404);
  });
});
