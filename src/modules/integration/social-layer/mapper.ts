/**
 * Pure mapping: CommunityOS event -> Social Layer event payload.
 * Field names follow the official SDK (@see types.ts).
 */

export interface MappableSolaEvent {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  visibility: 'public' | 'members' | 'private';
  maxCapacity: number | null;
  approvalRequired: boolean;
  tags: string[];
  meetingUrl: string | null;
  bannerUrl: string | null;
  transportInfo: string | null;
  entryRequirements: string | null;
  externalLocation: string | null;
}

import type { SolaEventBody } from './types';

/** Social Layer has no transport/entry fields — fold them into content. */
function buildContent(ev: MappableSolaEvent): string {
  const parts: string[] = [];
  if (ev.description) parts.push(ev.description.trim());
  if (ev.transportInfo) parts.push('**Getting there**\n' + ev.transportInfo.trim());
  if (ev.entryRequirements) parts.push('**Entry requirements**\n' + ev.entryRequirements.trim());
  if (!ev.meetingUrl && ev.externalLocation) parts.push('**Location**\n' + ev.externalLocation.trim());
  return parts.join('\n\n');
}

export function toSolaEvent(
  ev: MappableSolaEvent,
  opts: { groupId: string; venueId?: string | null },
): SolaEventBody {
  return {
    title: ev.title,
    content: buildContent(ev),
    image_url: ev.bannerUrl ?? null,
    start_time: ev.startAt.toISOString(),
    end_time: ev.endAt.toISOString(),
    timezone: ev.timezone,
    status: 'open',
    visibility: ev.visibility === 'private' ? 'private' : 'public',
    venue_id: opts.venueId ?? null,
    meeting_url: ev.meetingUrl ?? null,
    max_participant: ev.maxCapacity ?? null,
    require_approval: ev.approvalRequired,
    tags: ev.tags,
    group_id: opts.groupId,
  };
}
