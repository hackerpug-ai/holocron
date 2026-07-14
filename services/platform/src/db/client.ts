/**
 * Postgres client factory (postgres.js + drizzle).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resolveDatabaseUrl } from './index';
import { schema } from './schema';

export type Sql = ReturnType<typeof postgres>;
export type Db = ReturnType<typeof createDb>;

export function createSql(url?: string): Sql {
  const connectionString = url ?? resolveDatabaseUrl({ preferHolocron: true });
  return postgres(connectionString, {
    max: 10,
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
