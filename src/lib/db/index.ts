/**
 * Shared Drizzle database handle.
 *
 * Production: Cloudflare D1 (SQLite) through the `DB` binding.
 * Local dev/tests: node:sqlite (built into Node 22+) behind drizzle's
 * `sqlite-proxy` driver — no database server and no extra dependency.
 *
 * Postgres/Neon was retired after the shared Neon project exceeded its free-tier
 * quota; D1 is Cloudflare-native, so the database has no separate quota to trip
 * over (docs/10-gap-analysis.md §5).
 *
 * `db` is a lazy proxy: importing this module never resolves a binding, which
 * matters because Next.js imports server modules during `next build`.
 */
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import {
  drizzle as drizzleProxy,
  type AsyncBatchRemoteCallback,
  type AsyncRemoteCallback,
  type SqliteRemoteDatabase,
} from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

/**
 * Application-wide handle type: the async SQLite interface both drivers satisfy.
 * D1's concrete type is narrowed/cast at the binding site because it also
 * exposes `$client`, which the app never uses.
 */
export type AppDb = SqliteRemoteDatabase<typeof schema>;

/** OpenNext stores the Worker context on this global symbol (@opennextjs/cloudflare). */
const CF_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');
const DEFAULT_LOCAL_FILE = '.data/communityos.db';

type DriverKind = 'd1' | 'node-sqlite';

interface Resolved {
  db: AppDb;
  kind: DriverKind;
  close: () => void;
  rawExec: (sqlText: string) => void | Promise<void>;
  rawAll: (sqlText: string) => Promise<Record<string, unknown>[]>;
}

function cloudflareEnv(): Record<string, unknown> | null {
  const context = (globalThis as unknown as Record<symbol, unknown>)[CF_CONTEXT_SYMBOL] as
    | { env?: Record<string, unknown> }
    | undefined;
  return context?.env ?? null;
}

function isWorkersRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

/**
 * node:sqlite behind drizzle's remote proxy callback. Statements run with
 * `setReturnArrays(true)` because the proxy expects raw value arrays — a
 * column-name object would silently collapse duplicate names in joins.
 */
/**
 * Load a Node built-in without a bundler-visible import: process.getBuiltinModule
 * works from ESM and CJS (scripts, vitest, Next) and keeps node:* modules out of
 * the Workers bundle, where they only exist as stubs.
 */
function loadBuiltin<T>(id: string): T {
  const getBuiltinModule = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  const mod = getBuiltinModule?.(id);
  if (!mod) throw new Error(id + ' is unavailable in this runtime');
  return mod as T;
}

function createNodeSqliteDriver(file: string) {
  const { DatabaseSync } = loadBuiltin<typeof import('node:sqlite')>('node:sqlite');
  const { mkdirSync } = loadBuiltin<typeof import('node:fs')>('node:fs');
  const { dirname, resolve } = loadBuiltin<typeof import('node:path')>('node:path');
  const inMemory = file === ':memory:';
  if (!inMemory) mkdirSync(dirname(resolve(file)), { recursive: true });
  const connection = new DatabaseSync(file);
  connection.exec('PRAGMA foreign_keys = ON');
  connection.exec('PRAGMA busy_timeout = 5000');
  if (!inMemory) connection.exec('PRAGMA journal_mode = WAL');

  const statement = (query: string) => {
    const stmt = connection.prepare(query);
    stmt.setReturnArrays(true);
    return stmt;
  };

  const client: AsyncRemoteCallback = async (query, params, method) => {
    if (method === 'run') {
      statement(query).run(...(params as never[]));
      return { rows: [] };
    }
    return { rows: statement(query).all(...(params as never[])) as unknown[] };
  };

  const batch: AsyncBatchRemoteCallback = async (queries) => {
    connection.exec('BEGIN');
    try {
      const results = queries.map((q) => {
        if (q.method === 'run') {
          statement(q.sql).run(...(q.params as never[]));
          return { rows: [] as unknown[] };
        }
        return { rows: statement(q.sql).all(...(q.params as never[])) as unknown[] };
      });
      connection.exec('COMMIT');
      return results;
    } catch (err) {
      connection.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    client,
    batch,
    close: () => connection.close(),
    rawExec: (sqlText: string) => connection.exec(sqlText),
    // Column-name rows: only used by maintenance scripts, where a stable object
    // shape matters more than the proxy's positional arrays.
    rawAll: async (sqlText: string) => connection.prepare(sqlText).all() as Record<string, unknown>[],
  };
}

let cached: Resolved | null = null;

function resolveDb(): Resolved {
  if (cached) return cached;

  const binding = cloudflareEnv()?.DB;
  if (binding) {
    const db = drizzleD1(binding as Parameters<typeof drizzleD1>[0], { schema }) as unknown as AppDb;
    cached = {
      db,
      kind: 'd1',
      close: () => {},
      rawExec: async (sqlText: string) => {
        await (binding as { exec: (text: string) => Promise<unknown> }).exec(sqlText);
      },
      rawAll: async (sqlText: string) => {
        const result = (await (
          binding as { prepare: (text: string) => { all: () => Promise<{ results: unknown[] }> } }
        )
          .prepare(sqlText)
          .all()) as { results: Record<string, unknown>[] };
        return result.results;
      },
    };
    return cached;
  }

  if (isWorkersRuntime()) {
    throw new Error('D1 binding "DB" is missing from the Worker environment (see wrangler.jsonc d1_databases)');
  }

  const file = process.env.DATABASE_FILE ?? DEFAULT_LOCAL_FILE;
  const driver = createNodeSqliteDriver(file);
  cached = {
    db: drizzleProxy(driver.client, driver.batch, { schema }),
    kind: 'node-sqlite',
    close: driver.close,
    rawExec: driver.rawExec,
    rawAll: driver.rawAll,
  };
  return cached;
}

/** Real driver handle — for scripts that need `getDb().batch()` or `$client`. */
export function getDb(): AppDb {
  return resolveDb().db;
}

export function driverKind(): DriverKind {
  return resolveDb().kind;
}

/** Run a literal SQL script (migrations / test truncation) outside the query builder. */
export async function execRaw(sqlText: string): Promise<void> {
  await resolveDb().rawExec(sqlText);
}

/**
 * Run a literal SELECT and get column-name rows. Available to scripts only:
 * drizzle's query builder is the path for application reads, and it is the only
 * one that behaves identically on both drivers.
 */
export async function queryRaw(sqlText: string): Promise<Record<string, unknown>[]> {
  return resolveDb().rawAll(sqlText);
}

export function closeDb(): void {
  cached?.close();
  cached = null;
}

/**
 * Lazy, driver-agnostic handle. Property access resolves the driver on first use,
 * so every existing `import { db }` call site keeps working unchanged.
 */
export const db: AppDb = new Proxy({} as AppDb, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
  has(_target, prop) {
    return prop in (getDb() as object);
  },
});

export { sql, eq, and, or, not, inArray, desc, asc, gte, lte, lt, gt, isNull, isNotNull, ne, sql as raw } from 'drizzle-orm';
