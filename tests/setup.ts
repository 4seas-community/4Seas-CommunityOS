/**
 * Test setup: load env, give every test a clean database.
 *
 * DATABASE_URL may point at the local docker Postgres (node-postgres over TCP)
 * or at a Neon database. Neon is reached over its HTTPS /sql endpoint here
 * because sandboxed/edge environments often block raw TCP to Postgres.
 */
import 'dotenv/config';
import { beforeAll, beforeEach } from 'vitest';

// Tests run against an isolated database: TEST_DATABASE_URL wins over the
// dev DATABASE_URL (local docker Postgres or the shared Neon dev database).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const TABLES = [
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

const TRUNCATE_SQL = 'TRUNCATE ' + TABLES.join(', ') + ' RESTART IDENTITY CASCADE';

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for tests (see .env.example / docker-compose.yml)');
  }
});

/** Truncate via Neon HTTPS /sql (no TCP needed) or local pg over TCP. */
async function truncateAll(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('neon.tech')) {
    const u = new URL(url);
    const res = await fetch('https://' + u.host + '/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url },
      body: JSON.stringify({ query: TRUNCATE_SQL }),
    });
    if (!res.ok) throw new Error('truncate failed: ' + (await res.text()).slice(0, 200));
    return;
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url || 'postgres://community:community@127.0.0.1:5433/communityos' });
  const client = await pool.connect();
  try {
    await client.query(TRUNCATE_SQL);
  } finally {
    client.release();
    await pool.end();
  }
}

beforeEach(async () => {
  await truncateAll();
});
