/**
 * Social Layer (sola.day) client — one-way publish (docs/04 §3).
 *
 * The API is undocumented but real (extracted from the open-source SDK at
 * sociallayer-im/seastar-app). Auth is a service-account JWT obtained out of
 * band (email one-time code or OAuth) and passed as a bearer token.
 * Field drift is tolerated: the sync layer records failures instead of throwing.
 */
import { config } from '../../../lib/config';
import { SolaError, type SolaEvent, type SolaEventBody } from './types';

export interface SocialLayerClient {
  createEvent(body: SolaEventBody): Promise<SolaEvent>;
  updateEvent(eventId: string, body: Partial<SolaEventBody>): Promise<SolaEvent>;
  getEvent(eventId: string): Promise<SolaEvent>;
  listEvents(groupId: string): Promise<SolaEvent[]>;
  cancelEvent(eventId: string): Promise<void>;
}

function baseUrl(): string {
  return config.socialLayerApiUrl.replace(/\/$/, '');
}

export class HttpSocialLayerClient implements SocialLayerClient {
  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(baseUrl() + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + config.socialLayerToken,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = body as { error?: string; message?: string } | null;
      throw new SolaError(res.status, err?.error ?? 'sola_error', err?.message ?? err?.error ?? 'soladay ' + res.status);
    }
    return body as T;
  }

  createEvent(body: SolaEventBody) {
    return this.call<SolaEvent>('/events', { method: 'POST', body: JSON.stringify({ event: body }) });
  }

  updateEvent(eventId: string, body: Partial<SolaEventBody>) {
    return this.call<SolaEvent>('/events/' + encodeURIComponent(eventId), {
      method: 'PATCH',
      body: JSON.stringify({ event: body }),
    });
  }

  getEvent(eventId: string) {
    return this.call<SolaEvent>('/events/' + encodeURIComponent(eventId));
  }

  listEvents(groupId: string) {
    return this.call<{ data: SolaEvent[] }>('/events?group_id=' + encodeURIComponent(groupId) + '&collection=upcoming&limit=100').then(
      (r) => r.data ?? [],
    );
  }

  async cancelEvent(eventId: string) {
    await this.call<unknown>('/events/' + encodeURIComponent(eventId), { method: 'DELETE' });
  }
}

/** In-memory client for dev/tests. */
export class MockSocialLayerClient implements SocialLayerClient {
  events = new Map<string, SolaEvent & { canceled?: boolean }>();
  private seq = 0;
  failNext = false;

  private guard() {
    if (this.failNext) {
      this.failNext = false;
      throw new SolaError(500, 'mock_failure', 'mock Social Layer failure');
    }
  }

  async createEvent(body: SolaEventBody): Promise<SolaEvent> {
    this.guard();
    const id = 'sola_' + ++this.seq;
    const ev: SolaEvent = { id, title: body.title, start_time: body.start_time, end_time: body.end_time };
    this.events.set(id, ev);
    return ev;
  }

  async updateEvent(eventId: string, body: Partial<SolaEventBody>): Promise<SolaEvent> {
    this.guard();
    const existing = this.events.get(eventId);
    if (!existing) throw new SolaError(404, 'not_found', 'event not found');
    const updated = { ...existing, ...body } as SolaEvent;
    this.events.set(eventId, updated);
    return updated;
  }

  async getEvent(eventId: string): Promise<SolaEvent> {
    const ev = this.events.get(eventId);
    if (!ev) throw new SolaError(404, 'not_found', 'event not found');
    return ev;
  }

  async listEvents(): Promise<SolaEvent[]> {
    return [...this.events.values()];
  }

  async cancelEvent(eventId: string): Promise<void> {
    const ev = this.events.get(eventId);
    if (!ev) throw new SolaError(404, 'not_found', 'event not found');
    this.events.set(eventId, { ...ev, canceled: true });
  }
}
