/**
 * Notify service — notification outbox consumed by 4seasbot (pull-based feed).
 * Source of truth: docs/03 §2.5 + docs/04-integrations.md §4.2.
 * This system never talks to Telegram directly; 4seasbot pulls pending rows.
 */
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../../lib/db';
import { notificationOutbox, type NotificationOutbox } from './schema';
import { members } from '../people/schema';

export interface EnqueueInput {
  memberId?: string | null;
  target?: string;
  channel?: 'telegram' | 'email';
  template: string;
  payload: Record<string, unknown>;
  scheduledAt?: Date;
}

export async function enqueue(input: EnqueueInput): Promise<NotificationOutbox> {
  const [row] = await db
    .insert(notificationOutbox)
    .values({
      memberId: input.memberId ?? null,
      target: input.target ?? 'broadcast',
      channel: input.channel ?? 'telegram',
      template: input.template,
      payload: input.payload,
      scheduledAt: input.scheduledAt ?? new Date(),
      status: 'pending',
    })
    .returning();
  return row;
}

/** Pending rows for the bot feed, optionally after a cursor timestamp. */
export async function listPending(since?: Date): Promise<Array<NotificationOutbox & { memberTelegram: string | null }>> {
  const conditions = [eq(notificationOutbox.status, 'pending'), lte(notificationOutbox.scheduledAt, new Date())];
  if (since) conditions.push(gte(notificationOutbox.createdAt, since));
  const rows = await db
    .select()
    .from(notificationOutbox)
    .where(and(...conditions))
    .orderBy(notificationOutbox.createdAt);
  const memberIds = [...new Set(rows.map((r) => r.memberId).filter(Boolean))] as string[];
  const tgMap = new Map<string, string | null>();
  if (memberIds.length > 0) {
    for (const m of await db.select().from(members).where(inArray(members.id, memberIds))) {
      tgMap.set(m.id, m.telegramId);
    }
  }
  return rows.map((r) => ({ ...r, memberTelegram: r.memberId ? tgMap.get(r.memberId) ?? null : null }));
}

export async function markDelivered(id: string): Promise<NotificationOutbox> {
  const [row] = await db
    .update(notificationOutbox)
    .set({ status: 'delivered', updatedAt: new Date() })
    .where(eq(notificationOutbox.id, id))
    .returning();
  return row;
}

export async function markFailed(id: string, error: string): Promise<NotificationOutbox> {
  const [existing] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, id)).limit(1);
  if (!existing) throw new Error('notification not found');
  const retryCount = existing.retryCount + 1;
  const [row] = await db
    .update(notificationOutbox)
    .set({ status: retryCount >= 5 ? 'failed' : 'pending', retryCount, lastError: error, updatedAt: new Date() })
    .where(eq(notificationOutbox.id, id))
    .returning();
  return row;
}

export async function recent(limit = 50): Promise<NotificationOutbox[]> {
  return db.select().from(notificationOutbox).orderBy(desc(notificationOutbox.createdAt)).limit(limit);
}
