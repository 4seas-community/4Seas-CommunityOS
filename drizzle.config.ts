import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Schema source of truth for both dialects of this project's history. The live
 * database is Cloudflare D1 (SQLite); `drizzle/` holds the SQLite migrations
 * applied with `wrangler d1 migrations apply`. The Postgres migrations that came
 * before the migration are kept in `drizzle-postgres/` for reference only.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
