/**
 * Shared Drizzle database handle with runtime-aware driver selection:
 *
 * - Neon serverless Postgres (*.neon.tech): the stateless HTTP driver
 *   (drizzle-orm/neon-http). Each query is a fresh HTTPS request, which is the
 *   most reliable option on Cloudflare Workers (no sockets to manage).
 *   Interactive transactions (db.transaction) use a separate WebSocket Pool.
 * - Anything else (local docker-compose Postgres): node-postgres.
 */
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNeonWs } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';

// On Cloudflare Workers a Hyperdrive binding injects the origin connection
// string; otherwise DATABASE_URL (local docker Postgres or Neon).
const hyperdrive = (globalThis as { HYPERDRIVE?: { connectionString?: string } }).HYPERDRIVE;
const connectionString =
  hyperdrive?.connectionString ??
  process.env.DATABASE_URL ??
  'postgres://community:community@127.0.0.1:5433/communityos';

const isNeon = connectionString.includes('neon.tech');

type PgDb = ReturnType<typeof drizzleNode>;

let db: PgDb;
let txDb: PgDb; // WebSocket-pooled handle for interactive transactions
let pool: { end: () => Promise<unknown> };

if (isNeon) {
  // Lazy require keeps the Neon SDK out of the local node-postgres bundle.
  const { neon, Pool: NeonPool } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless');
  const httpSql = neon(connectionString);
  db = drizzleNeonHttp(httpSql) as unknown as PgDb;
  // One shared WS pool for the (few) transactional code paths.
  const wsPool = new NeonPool({ connectionString });
  txDb = drizzleNeonWs(wsPool) as unknown as PgDb;
  pool = wsPool as unknown as { end: () => Promise<unknown> };
} else {
  const pgPool = new PgPool({ connectionString });
  db = drizzleNode(pgPool);
  txDb = db;
  pool = pgPool;
}

export { pool, db, txDb, connectionString };
export { sql, eq, and, or, not, inArray, desc, asc, gte, lte, lt, gt, isNull, isNotNull, ne, sql as raw } from 'drizzle-orm';
