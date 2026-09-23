/**
 * Event state machine (docs/03 §3.1):
 *
 *   draft -> pending_review -> published -> ongoing -> ended -> archived
 *     |          |                |
 *     +----------+----------------+--> canceled (from any non-terminal state)
 *
 * draft -> published directly when the venue rule does not require approval.
 */
import type { eventStatus } from './schema';

export type EventStatus = (typeof eventStatus.enumValues)[number];

export const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['pending_review', 'published', 'canceled'],
  pending_review: ['published', 'draft', 'canceled'],
  published: ['ongoing', 'canceled'],
  ongoing: ['ended', 'canceled'],
  ended: ['archived'],
  archived: [],
  canceled: [],
};

export const TERMINAL_EVENT_STATUSES: EventStatus[] = ['archived', 'canceled'];

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return (EVENT_TRANSITIONS[from] ?? []).includes(to);
}

export function assertEventTransition(from: EventStatus, to: EventStatus): void {
  if (!canTransition(from, to)) {
    throw new Error('Invalid event transition: ' + from + ' -> ' + to);
  }
}
