/**
 * Pure mapping: CommunityOS event -> Luma create/update payload (docs/04 §2.2).
 * Kept side-effect free so it can be unit tested without any HTTP.
 */
import type { LumaCreateEventInput } from './types';

export interface MappableEvent {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  eventType: 'in_person' | 'online' | 'hybrid';
  visibility: 'public' | 'members' | 'private';
  maxCapacity: number | null;
  waitlistEnabled: boolean;
  registrationQuestions: unknown[];
  isPaid: 'free' | 'fixed' | 'pwyf';
  entryRequirements: string | null;
  transportInfo: string | null;
  tags: string[];
  meetingUrl: string | null;
  venue: { name: string; address: string | null } | null;
  externalLocation: string | null;
  bannerUrl: string | null;
}

/** Extra sections Luma has no dedicated field for are appended to the description. */
function appendSections(base: string | null, sections: Array<[string, string | null]>): string {
  const parts: string[] = [];
  if (base && base.trim().length > 0) parts.push(base.trim());
  for (const [heading, body] of sections) {
    if (body && body.trim().length > 0) parts.push('**' + heading + '**\n' + body.trim());
  }
  return parts.join('\n\n');
}

export function toLumaEvent(
  ev: MappableEvent,
  opts: { coverUrl?: string | null; placeQuery?: string | null } = {},
): LumaCreateEventInput {
  const description = appendSections(ev.description, [
    ['Getting there', ev.transportInfo],
    ['Entry requirements', ev.entryRequirements],
    ['Tags', ev.tags.length > 0 ? ev.tags.map((t) => '#' + t).join(' ') : null],
  ]);

  const payload: LumaCreateEventInput = {
    name: ev.title,
    start_at: ev.startAt.toISOString(),
    end_at: ev.endAt.toISOString(),
    timezone: ev.timezone,
    description_md: description,
    visibility: ev.visibility === 'members' ? 'members' : ev.visibility === 'private' ? 'private' : 'public',
    max_capacity: ev.maxCapacity,
    waitlist_status: ev.waitlistEnabled ? 'enabled' : 'disabled',
    registration_questions: ev.registrationQuestions,
  };

  if (opts.coverUrl ?? ev.bannerUrl) payload.cover_url = (opts.coverUrl ?? ev.bannerUrl) as string;

  if (ev.eventType === 'online') {
    if (ev.meetingUrl) payload.meeting_url = ev.meetingUrl;
  } else {
    // In-person / hybrid: prefer an explicit place query, else the venue name.
    const query = opts.placeQuery ?? ev.venue?.name ?? ev.externalLocation ?? null;
    if (query) payload.geo_address_json = { type: 'lookup', query };
    if (ev.eventType === 'hybrid' && ev.meetingUrl) payload.meeting_url = ev.meetingUrl;
  }

  return payload;
}
