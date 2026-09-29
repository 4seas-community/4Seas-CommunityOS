/**
 * SQLite column helpers shared by every module schema.
 *
 * The database is Cloudflare D1 (SQLite) in production; local dev/tests use
 * node:sqlite through a small drizzle `sqlite-proxy` driver, so the schema is
 * written once. Postgres/Neon was abandoned after the shared Neon project blew
 * its free-tier quota — see docs/10-gap-analysis.md §5.
 */
import { sql, type SQL } from 'drizzle-orm';
import { integer, text } from 'drizzle-orm/sqlite-core';

/**
 * UUID primary key. Generated in JS on every drizzle insert; the SQL default is a
 * fallback so `wrangler d1 execute` / manual SQL still produces valid UUIDs.
 */
const UUID_DEFAULT = sql`(lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))))`;

export const idPk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
    .default(UUID_DEFAULT);

/** Milliseconds-epoch timestamps: they read back as JS `Date`, like timestamptz did. */
export const tsNow = (name: string) => integer(name, { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`);
export const tsAt = (name: string) => integer(name, { mode: 'timestamp_ms' }).notNull();
export const tsOpt = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** JSON as TEXT: SQLite has no jsonb, and drizzle maps the value to/from JS. */
export const jsonCol = <T>(name: string, defaultJson = '{}') =>
  text(name, { mode: 'json' })
    .$type<T>()
    .notNull()
    .default(sql.raw(`'${defaultJson}'`));

/** Nullable JSON (no NOT NULL, no default). */
export const jsonOpt = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

/** String-list JSON (covers the Postgres `text[].array()` columns). */
export const jsonList = <T = string>(name: string) => jsonCol<T[]>(name, '[]');

/** Booleans are integers in SQLite; drizzle maps them back to JS booleans. */
export const boolCol = (name: string) => integer(name, { mode: 'boolean' });

/**
 * Enum mirror. SQLite has no enum type: the allowed values live in the `*Values`
 * tuple (Zod enforces them at the API edge, CHECK constraints in the migration),
 * while `enumOf` keeps the old `enumValues` accessor working for TS unions.
 */
export function enumOf<const T extends readonly string[]>(values: T): { enumValues: T } {
  return { enumValues: values };
}

/**
 * `CHECK (column IN (...))` for an enum column. SQLite has no enum types, so this
 * is the DB-level mirror of the Postgres enums the schema used to declare.
 * Values come from our own `as const` tuples, so inlining them is safe.
 */
export function oneOf(column: { name: string }, values: readonly string[]): SQL {
  const list = sql.join(
    values.map((value) => sql.raw("'" + value.replace(/'/g, "''") + "'")),
    sql`, `,
  );
  return sql`${sql.raw('"' + column.name + '"')} IN (${list})`;
}

/** `CHECK (end > start)` for interval columns stored as epoch milliseconds. */
export function intervalOrder(start: { name: string }, end: { name: string }): SQL {
  return sql`${sql.raw('"' + end.name + '"')} > ${sql.raw('"' + start.name + '"')}`;
}

/** `CHECK (column >= 0)` for counters and point amounts. */
export function nonNegative(column: { name: string }): SQL {
  return sql`${sql.raw('"' + column.name + '"')} >= 0`;
}
