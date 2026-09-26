/**
 * Integration service — outbound one-way publish records (docs/04 §2/§3) and the
 * 4seasbot outbound feed (docs/04 §4.2). External ids only live in sync_records
 * (docs/03 invariant #4).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import { syncRecords, type SyncRecord } from './schema';
import { events } from '../event/schema';
import { venues, buildings, floors } from '../place/schema';
import * as notify from '../notify/service';
import { publishEvent as publishToLuma } from './luma/sync';
import { publishEvent as publishToSola } from './social-layer/sync';

/** Create/refresh pending sync rows for an entity (called on publish). */
export async function markSyncPending(entityType: 'event' | 'venue', entityId: string, platforms: Array<'luma' | 'social_layer'>) {
  for (const platform of platforms) {
    await db
      .insert(syncRecords)
      .values({ entityType, entityId, platform, status: 'pending' })
      .onConflictDoUpdate({
        target: [syncRecords.entityType, syncRecords.entityId, syncRecords.platform],
        set: { status: 'pending', lastError: null, updatedAt: new Date() },
      });
  }
}

export async function markSyncCanceled(entityType: 'event' | 'venue', entityId: string) {
  await db
    .update(syncRecords)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(syncRecords.entityType, entityType), eq(syncRecords.entityId, entityId)));
}

export async function listSyncRecords(entityType?: string, entityId?: string): Promise<SyncRecord[]> {
  const rows = await db.select().from(syncRecords);
  return rows.filter((r) => (!entityType || r.entityType === entityType) && (!entityId || r.entityId === entityId));
}

/** GET /v1/integrations/bot/events?from&to — published events for 4seasbot. */
export async function botEventsFeed(from?: Date, to?: Date) {
  const rows = await db.select().from(events).where(eq(events.status, 'published'));
  const out = [];
  for (const e of rows) {
    if (from && e.endAt < from) continue;
    if (to && e.startAt > to) continue;
    let venue: { id: string; name: string; building: string | null; floor: string | null; address: string | null } | null = null;
    if (e.venueId) {
      const [v] = await db.select().from(venues).where(eq(venues.id, e.venueId)).limit(1);
      if (v) {
        const [b] = await db.select().from(buildings).where(eq(buildings.id, v.buildingId)).limit(1);
        const [f] = v.floorId ? await db.select().from(floors).where(eq(floors.id, v.floorId)).limit(1) : [null];
        venue = { id: v.id, name: v.name, building: b?.name ?? null, floor: f?.name ?? null, address: b?.address ?? null };
      }
    }
    out.push({
      id: e.id,
      title: e.title,
      description: e.description,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      timezone: e.timezone,
      eventType: e.eventType,
      venue,
      externalLocation: e.externalLocation,
      meetingUrl: e.meetingUrl,
      visibility: e.visibility,
      tags: e.tags,
      maxCapacity: e.maxCapacity,
      url: null as string | null,
    });
  }
  out.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return out;
}

/** GET /v1/integrations/bot/notifications?since= — pending outbox rows. */
export async function botNotificationsFeed(since?: Date) {
  return notify.listPending(since);
}

export async function ackNotification(id: string, body: { delivered?: boolean; error?: string }) {
  if (body.error) return notify.markFailed(id, body.error);
  return notify.markDelivered(id);
}

/**
 * Outbox processor (docs/04 §1): publish every pending sync record to its
 * platform. Idempotent — safe to run on a schedule (cron / queue consumer).
 */
export async function processPendingSyncs(): Promise<{ processed: number; failed: number }> {
  const pending = await db.select().from(syncRecords).where(eq(syncRecords.status, 'pending'));
  let processed = 0;
  let failed = 0;
  for (const row of pending) {
    if (row.entityType !== 'event') continue;
    const result = row.platform === 'luma' ? await publishToLuma(row.entityId) : await publishToSola(row.entityId);
    processed += 1;
    if (result.status !== 'synced') failed += 1;
  }
  return { processed, failed };
}
