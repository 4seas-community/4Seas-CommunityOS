/**
 * Social Layer one-way publish (docs/04 §3): our event is the source of truth.
 * External ids live only in sync_records (docs/03 invariant #4).
 *
 * The 4Seas group id maps 1:1 to a sola.day group (currently "4seas").
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { config } from '../../../lib/config';
import { syncRecords, type SyncRecord } from '../schema';
import { events } from '../../event/schema';
import { venues } from '../../place/schema';
import { toSolaEvent } from './mapper';
import { HttpSocialLayerClient, MockSocialLayerClient, type SocialLayerClient } from './client';

let singleton: SocialLayerClient | null = null;

export function socialLayerClient(): SocialLayerClient {
  if (!singleton) {
    singleton =
      config.socialLayerEnabled && config.socialLayerToken
        ? new HttpSocialLayerClient()
        : new MockSocialLayerClient();
  }
  return singleton;
}

/** Test seam. */
export function setSocialLayerClient(client: SocialLayerClient): void {
  singleton = client;
}

export function isSocialLayerConfigured(): boolean {
  return config.socialLayerEnabled && config.socialLayerToken !== '';
}

const LUMA_GROUP_ID = '4seas';

async function loadContext(eventId: string) {
  const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) throw new Error('event not found: ' + eventId);
  // A venue-linked event reuses the mirrored Social Layer venue id when present.
  let venueId: string | null = null;
  if (ev.venueId) {
    const [v] = await db.select().from(venues).where(eq(venues.id, ev.venueId)).limit(1);
    venueId = v?.solDayVenueId ?? null;
  }
  return { ev, venueId };
}

export async function publishEvent(eventId: string): Promise<SyncRecord> {
  const { ev, venueId } = await loadContext(eventId);
  const client = socialLayerClient();

  const [existing] = await db
    .select()
    .from(syncRecords)
    .where(
      and(
        eq(syncRecords.entityType, 'event'),
        eq(syncRecords.entityId, eventId),
        eq(syncRecords.platform, 'social_layer'),
      ),
    )
    .limit(1);

  const payload = toSolaEvent(
    {
      title: ev.title,
      description: ev.description,
      startAt: ev.startAt,
      endAt: ev.endAt,
      timezone: ev.timezone,
      visibility: ev.visibility,
      maxCapacity: ev.maxCapacity,
      approvalRequired: ev.approvalRequired,
      tags: ev.tags,
      meetingUrl: ev.meetingUrl,
      bannerUrl: ev.bannerUrl,
      transportInfo: ev.transportInfo,
      entryRequirements: ev.entryRequirements,
      externalLocation: ev.externalLocation,
    },
    { groupId: LUMA_GROUP_ID, venueId },
  );

  try {
    const remote =
      existing?.externalId && existing.status !== 'canceled'
        ? await client.updateEvent(existing.externalId, payload)
        : await client.createEvent(payload);
    const [row] = await db
      .insert(syncRecords)
      .values({
        entityType: 'event',
        entityId: eventId,
        platform: 'social_layer',
        externalId: remote.id,
        externalUrl: 'https://app.sola.day/event/detail/' + remote.id,
        status: 'synced',
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [syncRecords.entityType, syncRecords.entityId, syncRecords.platform],
        set: {
          externalId: remote.id,
          externalUrl: 'https://app.sola.day/event/detail/' + remote.id,
          status: 'synced',
          lastError: null,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [row] = await db
      .insert(syncRecords)
      .values({
        entityType: 'event',
        entityId: eventId,
        platform: 'social_layer',
        status: 'failed',
        lastError: message,
      })
      .onConflictDoUpdate({
        target: [syncRecords.entityType, syncRecords.entityId, syncRecords.platform],
        set: { status: 'failed', lastError: message, updatedAt: new Date() },
      })
      .returning();
    return row;
  }
}

/** Soft-cancel on Social Layer (DELETE /events/{id}). */
export async function cancelEvent(eventId: string): Promise<SyncRecord> {
  const [existing] = await db
    .select()
    .from(syncRecords)
    .where(
      and(
        eq(syncRecords.entityType, 'event'),
        eq(syncRecords.entityId, eventId),
        eq(syncRecords.platform, 'social_layer'),
      ),
    )
    .limit(1);
  if (!existing?.externalId) throw new Error('event is not synced to Social Layer');
  await socialLayerClient().cancelEvent(existing.externalId);
  const [row] = await db
    .update(syncRecords)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(syncRecords.id, existing.id))
    .returning();
  return row;
}

/** Publish to every enabled one-way target (used by the publish flow). */
export async function publishToAllTargets(eventId: string): Promise<SyncRecord[]> {
  const out: SyncRecord[] = [];
  out.push(await publishEvent(eventId));
  return out;
}
