/**
 * Apply database migrations. In dev this pushes the Drizzle schema directly;
 * for production, generate SQL migrations with `pnpm db:generate` and apply them
 * with your migration tool of choice.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../src/lib/db';

async function main() {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('[db] migrations applied');
  await pool.end();
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});
