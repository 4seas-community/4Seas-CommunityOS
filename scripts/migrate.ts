/**
 * Apply the SQLite migrations to the LOCAL database file (dev / tests).
 *
 * Production is Cloudflare D1 and is migrated with wrangler:
 *
 *   wrangler d1 migrations apply 4seas-communityos --remote
 */
import { closeDb } from '../src/lib/db';
import { applyLocalMigrations } from '../src/lib/db/migrate-local';

async function main() {
  const count = await applyLocalMigrations();
  console.log(count === 0 ? '[db] migrations already up to date' : '[db] applied ' + count + ' migration(s)');
  closeDb();
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});
