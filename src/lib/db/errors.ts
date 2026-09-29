/**
 * Constraint-violation detection shared by the SQLite drivers.
 *
 * Drizzle wraps driver errors, so the underlying error can sit on `cause`. D1
 * reports codes such as SQLITE_CONSTRAINT_UNIQUE while node:sqlite reports
 * ERR_SQLITE_ERROR and puts the reason in the message, so both are inspected.
 */

export interface DriverConstraint {
  unique: boolean;
  message: string;
}

function candidates(err: unknown): unknown[] {
  return [err, (err as { cause?: unknown } | null)?.cause];
}

export function driverConstraint(err: unknown): DriverConstraint {
  for (const candidate of candidates(err)) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const message = String((candidate as { message?: string }).message ?? '');
    const code = String((candidate as { code?: string }).code ?? '');
    // The Postgres codes stay here so a stale error still maps to a 409.
    if (code === '23505' || code === '23P01') return { unique: true, message };
    if (code.startsWith('SQLITE_CONSTRAINT')) return { unique: true, message };
    if (/UNIQUE constraint failed/i.test(message)) return { unique: true, message };
  }
  return { unique: false, message: '' };
}

/** A venue slot was already taken — raised by the bookings overlap triggers. */
export function isBookingOverlap(err: unknown): boolean {
  for (const candidate of candidates(err)) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    if (String((candidate as { message?: string }).message ?? '').includes('booking_overlap')) return true;
  }
  return false;
}

/** Any unique-index violation (e.g. one registration per member per event). */
export function isUniqueViolation(err: unknown): boolean {
  return driverConstraint(err).unique;
}
