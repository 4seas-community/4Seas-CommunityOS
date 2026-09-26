/**
 * Luma HTTP client — one-way publish (docs/04 §2).
 * Auth: x-luma-api-key header (calendar-scoped key, requires Luma Plus).
 * Rate limits: 200/min (calendar key) — this client self-throttles to 150/min.
 */
import { config } from '../../../lib/config';
import {
  LumaError,
  type LumaCancelToken,
  type LumaCreateEventInput,
  type LumaEvent,
  type LumaUploadUrl,
} from './types';

const BASE = 'https://public-api.luma.com';

export interface LumaClient {
  createEvent(input: LumaCreateEventInput): Promise<LumaEvent>;
  updateEvent(eventId: string, input: Partial<LumaCreateEventInput>): Promise<LumaEvent>;
  getEvent(eventId: string): Promise<LumaEvent>;
  listEvents(): Promise<LumaEvent[]>;
  requestCancellation(eventId: string): Promise<LumaCancelToken>;
  cancelEvent(eventId: string, token: string): Promise<void>;
  createCoverUploadUrl(): Promise<LumaUploadUrl>;
}

class RateLimiter {
  private windowStart = Date.now();
  private count = 0;
  constructor(private readonly limitPerMin: number) {}
  async acquire(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart > 60_000) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= this.limitPerMin) {
      await new Promise((r) => setTimeout(r, 60_000 - (now - this.windowStart) + 50));
      this.windowStart = Date.now();
      this.count = 0;
    }
    this.count += 1;
  }
}

export class HttpLumaClient implements LumaClient {
  private limiter = new RateLimiter(150);

  private async call<T>(path: string, init: RequestInit = {}, retries = 3): Promise<T> {
    await this.limiter.acquire();
    const res = await fetch(BASE + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-luma-api-key': config.lumaApiKey,
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 429 && retries > 0) {
      await new Promise((r) => setTimeout(r, 2_000));
      return this.call<T>(path, init, retries - 1);
    }
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = (body as { message?: string } | null)?.message ?? ('Luma returned ' + res.status);
      throw new LumaError(res.status, 'luma_error', msg);
    }
    return body as T;
  }

  createEvent(input: LumaCreateEventInput) {
    return this.call<LumaEvent>('/v1/events/create', { method: 'POST', body: JSON.stringify(input) });
  }

  updateEvent(eventId: string, input: Partial<LumaCreateEventInput>) {
    return this.call<LumaEvent>('/v1/events/update', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId, ...input }),
    });
  }

  getEvent(eventId: string) {
    return this.call<LumaEvent>('/v1/events/get?event_id=' + encodeURIComponent(eventId));
  }

  listEvents() {
    return this.call<{ events: LumaEvent[] }>('/v1/calendar/events/list').then((r) => r.events ?? []);
  }

  requestCancellation(eventId: string) {
    return this.call<LumaCancelToken>('/v1/events/cancel/request', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    });
  }

  async cancelEvent(eventId: string, token: string) {
    await this.call<unknown>('/v1/events/cancel', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId, cancellation_token: token }),
    });
  }

  createCoverUploadUrl() {
    return this.call<LumaUploadUrl>('/v1/images/create-upload-url', { method: 'POST', body: '{}' });
  }
}

/** In-memory client for dev/tests — no network, no Luma Plus needed. */
export class MockLumaClient implements LumaClient {
  events = new Map<string, LumaEvent & { canceled?: boolean }>();
  private seq = 0;
  failNext = false;

  private guard() {
    if (this.failNext) {
      this.failNext = false;
      throw new LumaError(500, 'mock_failure', 'mock Luma failure');
    }
  }

  async createEvent(input: LumaCreateEventInput): Promise<LumaEvent> {
    this.guard();
    const id = 'luma_' + ++this.seq;
    const ev: LumaEvent = {
      api_id: id,
      name: input.name,
      start_at: input.start_at,
      end_at: input.end_at,
      url: 'https://luma.com/' + id,
      cover_url: input.cover_url,
    };
    this.events.set(id, ev);
    return ev;
  }

  async updateEvent(eventId: string, input: Partial<LumaCreateEventInput>): Promise<LumaEvent> {
    this.guard();
    const existing = this.events.get(eventId);
    if (!existing) throw new LumaError(404, 'not_found', 'event not found');
    const updated: LumaEvent = { ...existing, ...input } as LumaEvent;
    this.events.set(eventId, updated);
    return updated;
  }

  async getEvent(eventId: string): Promise<LumaEvent> {
    const ev = this.events.get(eventId);
    if (!ev) throw new LumaError(404, 'not_found', 'event not found');
    return ev;
  }

  async listEvents(): Promise<LumaEvent[]> {
    return [...this.events.values()];
  }

  async requestCancellation(eventId: string): Promise<LumaCancelToken> {
    const ev = this.events.get(eventId);
    if (!ev) throw new LumaError(404, 'not_found', 'event not found');
    return { cancellation_token: 'tok_' + eventId };
  }

  async cancelEvent(eventId: string, token: string): Promise<void> {
    if (token !== 'tok_' + eventId) throw new LumaError(401, 'unauthorized', 'bad cancellation token');
    const ev = this.events.get(eventId);
    if (ev) this.events.set(eventId, { ...ev, canceled: true });
  }

  async createCoverUploadUrl(): Promise<LumaUploadUrl> {
    return { upload_url: 'https://upload.luma.test/' + ++this.seq, file_url: 'https://images.lumacdn.com/mock-' + this.seq };
  }
}
