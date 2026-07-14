/**
 * Shared Drizzle column helpers — uuidv7 PKs, legacy_convex_id, timestamptz.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  customType,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** pgvector column (dims fixed at author time; HNSW indexes land in schema-3). */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1024})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value !== 'string') return value as unknown as number[];
    const inner = value.replace(/^\[/, '').replace(/\]$/, '');
    if (!inner) return [];
    return inner.split(',').map((x) => Number(x.trim()));
  },
});

/** uuidv7 primary key using Postgres 18 built-in uuidv7(). */
export function idColumn() {
  return uuid('id').primaryKey().default(sql`uuidv7()`).notNull();
}

/**
 * Nullable indexed legacy Convex `_id` retained through soak.
 * Every domain table carries this column (STRICT requirement).
 */
export function legacyConvexIdColumn() {
  return text('legacy_convex_id');
}

export function createdAtColumn() {
  return timestamp('created_at', { withTimezone: true, mode: 'date' })
    .default(sql`now()`)
    .notNull();
}

export function updatedAtColumn() {
  return timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .default(sql`now()`)
    .notNull();
}

export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}

export function typedJsonb<T = Record<string, unknown>>(name: string) {
  return jsonb(name).$type<T>();
}

/** Standard table base: id + legacy_convex_id + created_at. */
export const baseColumns = {
  id: idColumn(),
  legacyConvexId: legacyConvexIdColumn(),
  createdAt: createdAtColumn(),
};

export function legacyConvexIdIndex(tableName: string, col: AnyPgColumn) {
  return index(`${tableName}_legacy_convex_id_idx`).on(col);
}

export { index, integer, jsonb, sql, text, uuid };
