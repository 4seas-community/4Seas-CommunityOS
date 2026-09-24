/**
 * Shared Drizzle database handle (node-postgres driver).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// On Cloudflare Workers the connection string comes from the Hyperdrive binding
// (wrangler.jsonc); locally it comes from DATABASE_URL (docker-compose Postgres).
const hyperdrive = (globalThis as { HYPERDRIVE?: { connectionString?: string } }).HYPERDRIVE;
const connectionString =
  hyperdrive?.connectionString ??
  process.env.DATABASE_URL ??
  'postgres://community:community@127.0.0.1:5433/communityos';

export const pool = new Pool({ connectionString });
export const db = drizzle(pool);
export { sql, eq, and, or, not, inArray, desc, asc, gte, lte, lt, gt, isNull, isNotNull, ne, sql as raw } from 'drizzle-orm';