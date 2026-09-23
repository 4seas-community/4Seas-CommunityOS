/**
 * Test setup: load env, give every test a clean database.
 * Uses the dev Postgres from docker-compose (DATABASE_URL).
 */
import 'dotenv/config';
import { beforeAll, beforeEach } from 'vitest';
import { pool } from '../src/lib/db';

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

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for tests (see .env.example / docker-compose.yml)');
  }
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE ' + TABLES.join(', ') + ' RESTART IDENTITY CASCADE');
  } finally {
    client.release();
  }
});
