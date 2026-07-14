/**
 * Shared Drizzle column helpers — uuidv7 PKs, legacy_convex_id, timestamptz,
 * pgvector, generated search_vector tsvector, HNSW/GIN index builders.
 */
import { type SQL, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  customType,
  type ExtraConfigColumn,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** pgvector column — dims fixed at author time (Qwen3-Embedding 1024). */
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

/** Native Postgres tsvector (used for generated FTS columns). */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * Generated ALWAYS AS STORED search_vector from weighted text expressions.
 * `expression` must reference physical column names (not TS props).
 */
export function searchVectorColumn(expression: SQL) {
  return tsvector('search_vector').generatedAlwaysAs(expression);
}

/** Weighted FTS expression: A-weight first arg, B-weight remaining. */
export function weightedSearchVectorSql(primary: string, ...secondary: string[]): SQL {
  const parts: SQL[] = [
    sql`setweight(to_tsvector('english', coalesce(${sql.raw(primary)}, '')), 'A')`,
  ];
  for (const col of secondary) {
    parts.push(sql`setweight(to_tsvector('english', coalesce(${sql.raw(col)}, '')), 'B')`);
  }
  return sql.join(parts, sql` || `);
}

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

/** HNSW cosine index on embedding (never IVFFlat). */
export function hnswEmbeddingIndex(name: string, col: ExtraConfigColumn) {
  return index(name).using('hnsw', col.op('vector_cosine_ops'));
}

/** GIN index on generated search_vector. */
export function searchVectorGinIndex(name: string, col: AnyPgColumn) {
  return index(name).using('gin', col);
}

export { index, integer, jsonb, sql, text, uuid };
