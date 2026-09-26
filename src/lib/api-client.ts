/**
 * Server-side helper for pages: calls our own /api routes, forwarding the
 * caller's session cookie so session-authenticated endpoints work.
 */
import { headers } from 'next/headers';
import { config } from './config';

export async function apiGet<T>(path: string): Promise<T> {
  const h = await headers();
  const cookie = h.get('cookie') ?? '';
  const res = await fetch(config.appUrl + path, {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('API ' + res.status + ' for ' + path);
  return (await res.json()) as T;
}

export async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const h = await headers();
  const cookie = h.get('cookie') ?? '';
  const res = await fetch(config.appUrl + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? ('API ' + res.status);
    throw new Error(msg);
  }
  return data as T;
}
