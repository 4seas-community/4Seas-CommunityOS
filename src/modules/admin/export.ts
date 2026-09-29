/**
 * Admin data export service (docs/10 §3 batch 2.5).
 * Formats: CSV (RFC 4180 with CRLF + UTF-8 BOM for Excel) and JSON.
 * Gated strictly to community admins.
 */
import { db } from '../../lib/db';
import { buildings, venues } from '../place/schema';
import * as adminService from './service';
import * as eventService from '../event/service';
import * as bookingService from '../booking/service';
import type { SessionPayload } from '../../lib/auth/session';
import { requireRole } from '../../lib/auth/roles';
import { badRequest } from '../../lib/errors';

export const EXPORT_TYPES = ['events', 'bookings', 'venues', 'members'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map((row) => headers.map((h) => escapeCell(row[h])).join(','));
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n') + '\r\n';
}

function toIso(date: unknown): string {
  if (date instanceof Date) return date.toISOString();
  if (typeof date === 'string') return date;
  if (typeof date === 'number') return new Date(date).toISOString();
  return '';
}

export async function getExportDataset(
  type: ExportType,
  session: SessionPayload,
): Promise<{ headers: string[]; rows: Array<Record<string, unknown>> }> {
  requireRole(session, 'admin');

  switch (type) {
    case 'members': {
      const list = await adminService.listMembers(session);
      const headers = [
        'id',
        'email',
        'displayName',
        'emailVerified',
        'tier',
        'status',
        'roles',
        'telegram',
        'walletAddress',
        'pointsBalance',
        'createdAt',
      ];
      const rows = list.map((m) => ({
        id: m.id,
        email: m.email,
        displayName: m.displayName ?? '',
        emailVerified: m.emailVerified ? 'true' : 'false',
        tier: m.tier,
        status: m.status,
        roles: m.roles.map((r) => `${r.role}@${r.scope}`).join('; '),
        telegram: m.telegram?.username ? `@${m.telegram.username}` : (m.telegram?.id ?? ''),
        walletAddress: m.walletAddress ?? '',
        pointsBalance: m.pointsBalance,
        createdAt: toIso(m.createdAt),
      }));
      return { headers, rows };
    }

    case 'venues': {
      const venueRows = await db.select().from(venues);
      const buildingRows = await db.select().from(buildings);
      const buildingMap = new Map(buildingRows.map((b) => [b.id, b.name]));

      const headers = [
        'id',
        'name',
        'code',
        'buildingId',
        'buildingName',
        'capacitySeated',
        'capacityStanding',
        'areaSqm',
        'status',
        'defaultBufferMin',
        'createdAt',
      ];
      const rows = venueRows.map((v) => ({
        id: v.id,
        name: v.name,
        code: v.code,
        buildingId: v.buildingId,
        buildingName: buildingMap.get(v.buildingId) ?? '',
        capacitySeated: v.capacitySeated ?? '',
        capacityStanding: v.capacityStanding ?? '',
        areaSqm: v.areaSqm ?? '',
        status: v.status,
        defaultBufferMin: v.defaultBufferMin,
        createdAt: toIso(v.createdAt),
      }));
      return { headers, rows };
    }

    case 'events': {
      const eventRows = await eventService.listEvents({}, session);
      const headers = [
        'id',
        'title',
        'status',
        'eventType',
        'startAt',
        'endAt',
        'timezone',
        'venueId',
        'hostId',
        'visibility',
        'isPaid',
        'maxCapacity',
        'checkinMode',
        'tags',
        'createdAt',
      ];
      const rows = eventRows.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        eventType: e.eventType,
        startAt: toIso(e.startAt),
        endAt: toIso(e.endAt),
        timezone: e.timezone,
        venueId: e.venueId ?? '',
        hostId: e.hostId,
        visibility: e.visibility,
        isPaid: e.isPaid,
        maxCapacity: e.maxCapacity ?? '',
        checkinMode: e.checkinMode,
        tags: e.tags.join('; '),
        createdAt: toIso(e.createdAt),
      }));
      return { headers, rows };
    }

    case 'bookings': {
      const bookingRows = await bookingService.listBookings({});
      const headers = [
        'id',
        'venueId',
        'eventId',
        'memberId',
        'purpose',
        'startAt',
        'endAt',
        'status',
        'attendeesCount',
        'pointsCharged',
        'approvedBy',
        'decisionNote',
        'createdAt',
      ];
      const rows = bookingRows.map((b) => ({
        id: b.id,
        venueId: b.venueId,
        eventId: b.eventId ?? '',
        memberId: b.memberId,
        purpose: b.purpose,
        startAt: toIso(b.startAt),
        endAt: toIso(b.endAt),
        status: b.status,
        attendeesCount: b.attendeesCount,
        pointsCharged: b.pointsCharged,
        approvedBy: b.approvedBy ?? '',
        decisionNote: b.decisionNote ?? '',
        createdAt: toIso(b.createdAt),
      }));
      return { headers, rows };
    }

    default:
      throw badRequest(`Unknown export type: ${type}`);
  }
}
