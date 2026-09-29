/**
 * Apply the SQLite migration files to the local database (dev scripts + tests).
 *
 * The Cloudflare D1 database is migrated with wrangler instead, which keeps its
 * own bookkeeping table:
 *
 *   wrangler d1 migrations apply 4seas-communityos --remote
 *
 * Keeping the local path in-process means tests need no database server and no
 * network, which is the point of moving off Postgres (docs/10 §5).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { driverKind, execRaw, queryRaw } from './index';

const BREAKPOINT = '--> statement-breakpoint';

export async function applyLocalMigrations(migrationsDir = 'drizzle'): Promise<number> {
  if (driverKind() === 'd1') {
    throw new Error(
      'refusing to migrate the D1 binding in-process; run: wrangler d1 migrations apply 4seas-communityos --remote',
    );
  }
  await execRaw(
    'CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const applied = new Set((await queryRaw('select tag from _migrations')).map((row) => String(row.tag)));

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const statements = readFileSync(join(migrationsDir, file), 'utf8')
      .split(BREAKPOINT)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await execRaw(statement);
    await execRaw("INSERT INTO _migrations (tag, applied_at) VALUES ('" + file + "', " + Date.now() + ")");
    count += 1;
  }
  return count;
}
