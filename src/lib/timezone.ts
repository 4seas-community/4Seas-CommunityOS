/**
 * Server-side timezone guards. Stored timezones flow into Intl calls on public
 * pages, where an unknown zone throws RangeError and takes the whole render down.
 */
import { z } from 'zod';
import { config } from './config';
import { canonicalTimezone, isValidTimezone } from './time';

/**
 * Write-side: only IANA names Intl recognises, stored in canonical spelling.
 * `abort` stops at the length check so oversized input never reaches Intl.
 */
export const ianaTimezone = z
  .string()
  .min(1)
  .max(64, { abort: true })
  .refine(isValidTimezone, 'Invalid IANA timezone')
  .transform((tz) => canonicalTimezone(tz)!);

/** Read-side: a bad or missing stored value falls back to the community default. */
export function safeTimezone(tz?: string | null): string {
  return tz && isValidTimezone(tz) ? tz : config.defaultTimezone;
}
