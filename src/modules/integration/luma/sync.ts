/**
 * Luma one-way publish (docs/04 §2): our event is the source of truth; Luma is
 * a mirror. External ids live only in sync_records (docs/03 invariant #4).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { config } from '../../../lib/config';
import { syncRecords, type SyncRecord } from '../schema';
import { events } from '../../event/schema';
import { venues, buildings } from '../../place/schema';
import { toLumaEvent } from './mapper';
import { HttpLumaClient, MockLumaClient, type LumaClient } from './client';
import { LumaError } from './types';

const MAX_ATTEMPTS = 5;

let singleton: LumaClient | null = null;

/** Real client when configured, otherwise the in-memory mock (dev/tests). */
export function lumaClient(): LumaClient {
  if (!singleton) singleton = config.lumaEnabled && config.lumaApiKey ? new HttpLumaClient() : new MockLumaClient();
  return singleton;
}

/** Test seam: replace the process-wide client. */
export function setLumaClient(client: LumaClient): void {
  singleton = client;
}

export function isLumaConfigured(): boolean {
  return config.lumaEnabled && config.lumaApiKey !== '';
}

async function loadEventContext(eventId: string) {
  const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) throw new Error('event not found: ' + eventId);
  let venue: { name: string; address: string | null } | null = null;
  if (ev.venueId) {
    const [v] = await db.select().from(venues).where(eq(venues.id, ev.venueId)).limit(1);
    if (v) {
      const [b] = await db.select().from(buildings).where(eq(buildings.id, v.buildingId)).limit(1);
      venue = { name: v.name, address: b?.address ?? null };
    }
  }
  return { ev, venue };
}

/** Publish (create or update) an event on Luma. Idempotent via sync_records. */
export async function publishEvent(eventId: string): Promise<SyncRecord> {
  const { ev, venue } = await loadEventContext(eventId);
  const client = lumaClient();

  const [existing] = await db
    .select()
    .from(syncRecords)
    .where(and(eq(syncRecords.entityType, 'event'), eq(syncRecords.entityId, eventId), eq(syncRecords.platform, 'luma')))
    .limit(1);

  const payload = toLumaEvent(
    {
      title: ev.title,
      description: ev.description,
      startAt: ev.startAt,
      endAt: ev.endAt,
      timezone: ev.timezone,
      eventType: ev.eventType,
      visibility: ev.visibility,
      maxCapacity: ev.maxCapacity,
      waitlistEnabled: ev.waitlistEnabled,
      registrationQuestions: ev.registrationQuestions as unknown[],
      isPaid: ev.isPaid,
      entryRequirements: ev.entryRequirements,
      transportInfo: ev.transportInfo,
      tags: ev.tags,
      meetingUrl: ev.meetingUrl,
      venue,
      externalLocation: ev.externalLocation,
      bannerUrl: ev.bannerUrl,
    },
    { placeQuery: venue?.name ?? null },
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
        platform: 'luma',
        externalId: remote.api_id,
        externalUrl: remote.url ?? null,
        status: 'synced',
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [syncRecords.entityType, syncRecords.entityId, syncRecords.platform],
        set: {
          externalId: remote.api_id,
          externalUrl: remote.url ?? null,
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
      .values({ entityType: 'event', entityId: eventId, platform: 'luma', status: 'failed', lastError: message })
      .onConflictDoUpdate({
        target: [syncRecords.entityType, syncRecords.entityId, syncRecords.platform],
        set: { status: 'failed', lastError: message, updatedAt: new Date() },
      })
      .returning();
    return row;
  }
}

/** Cancel on Luma using the mandatory two-step token flow (docs/04 §2.3). */
export async function cancelEvent(eventId: string): Promise<SyncRecord> {
  const [existing] = await db
    .select()
    .from(syncRecords)
    .where(and(eq(syncRecords.entityType, 'event'), eq(syncRecords.entityId, eventId), eq(syncRecords.platform, 'luma')))
    .limit(1);
  if (!existing?.externalId) throw new Error('event is not synced to Luma');
  const client = lumaClient();
  const { cancellation_token: token } = await client.requestCancellation(existing.externalId);
  await client.cancelEvent(existing.externalId, token);
  const [row] = await db
    .update(syncRecords)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(syncRecords.id, existing.id))
    .returning();
  return row;
}

/** Retry all failed syncs (called by the outbox worker / cron). */
export async function retryFailed(): Promise<{ retried: number; stillFailing: number }> {
  const failed = await db.select().from(syncRecords).where(eq(syncRecords.status, 'failed'));
  let retried = 0;
  let stillFailing = 0;
  for (const row of failed) {
    if (row.entityType !== 'event') continue;
    const result = await publishEvent(row.entityId);
    retried += 1;
    if (result.status !== 'synced') stillFailing += 1;
  }
  return { retried, stillFailing };
}

export { MAX_ATTEMPTS, LumaError };
