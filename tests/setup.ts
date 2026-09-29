/**
 * Test setup: one in-memory SQLite database per run, reset before each test.
 *
 * No database server and no network: the schema is applied from drizzle/*.sql to
 * node:sqlite, through the same driver the app uses locally (docs/10 §5 explains
 * why Postgres/Neon went away).
 */
import 'dotenv/config';
import { beforeAll, beforeEach } from 'vitest';
import { execRaw } from '../src/lib/db';
import { applyLocalMigrations } from '../src/lib/db/migrate-local';

// Must be set before the first query: the driver reads it when it resolves.
process.env.DATABASE_FILE = ':memory:';
// Tests must never talk to a real mail provider, whatever .env says.
process.env.EMAIL_BACKEND = 'console';

/** Child tables first: foreign keys are enforced (PRAGMA foreign_keys = ON). */
const TABLES = [
  'agent_drafts',
  'agent_keys',
  'audit_logs',
  'auth_tokens',
  'notification_outbox',
  'sync_records',
  'checkin_tokens',
  'registrations',
  'bookings',
  'events',
  'venue_rules',
  'venues',
  'floors',
  'buildings',
  'communities',
  'points_ledger_local',
  'points_mirror',
  'members',
];

beforeAll(async () => {
  await applyLocalMigrations();
});

beforeEach(async () => {
  for (const table of TABLES) await execRaw('DELETE FROM ' + table);
});
