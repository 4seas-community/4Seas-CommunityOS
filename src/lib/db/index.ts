/**
 * Shared Drizzle database handle (node-postgres driver).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://community:community@127.0.0.1:5433/communityos';

export const pool = new Pool({ connectionString });
export const db = drizzle(pool);
export { sql, eq, and, or, not, inArray, desc, asc, gte, lte, lt, gt, isNull, isNotNull, ne, sql as raw } from 'drizzle-orm';
