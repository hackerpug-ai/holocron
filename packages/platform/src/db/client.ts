/**
 * Postgres client factory (postgres.js + drizzle).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resolveDatabaseUrl } from './index';
import { schema } from './schema';

export type Sql = ReturnType<typeof postgres>;
export type TransactionSql = postgres.TransactionSql;
export type Db = ReturnType<typeof createDb>;
export type SqlJsonValue = Parameters<Sql['json']>[0];

/** Convert untrusted values to postgres.js JSON without weakening its strict JSON contract. */
export function toSqlJsonValue(value: unknown, seen = new Set<object>()): SqlJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError('Cannot serialize circular JSON array');
    }
    seen.add(value);
    const output = value.map((item) => toSqlJsonValue(item, seen));
    seen.delete(value);
    return output;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new TypeError('Cannot serialize circular JSON object');
    }
    seen.add(value);
    const output: Record<string, SqlJsonValue | undefined> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) {
        output[key] = toSqlJsonValue(child, seen);
      }
    }
    seen.delete(value);
    return output;
  }

  throw new TypeError(`Cannot serialize JSON value of type ${typeof value}`);
}

export function createSql(url?: string, options?: { max?: number }): Sql {
  const connectionString = url ?? resolveDatabaseUrl({ preferHolocron: true });
  return postgres(connectionString, {
    max: options?.max ?? 10,
    prepare: false,
    onnotice: () => {},
  });
}

export function createDb(sql?: Sql, url?: string) {
  const client = sql ?? createSql(url);
  return drizzle(client, { schema });
}

export async function withDb<T>(fn: (db: Db, sql: Sql) => Promise<T>): Promise<T> {
  const sql = createSql();
  try {
    const db = createDb(sql);
    return await fn(db, sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
