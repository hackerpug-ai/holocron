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

/**
 * Bounded default pool size for per-handler connections.
 *
 * The 2026-08-28 production audit found 16 migrated job handlers each opening
 * pools of max 10 against `max_connections=100`; bursts failed with
 * "sorry, too many clients already" (queue_jobs last_error). 3 per handler
 * keeps the worst-case scheduler fan-out well under the ceiling. Operators
 * can raise it per process via HOLO_DB_POOL_MAX; explicit options.max wins.
 */
export const DEFAULT_POOL_MAX = 3;

function defaultPoolMax(): number {
  const parsed = Number(process.env.HOLO_DB_POOL_MAX ?? '');
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_POOL_MAX;
}

export function createSql(url?: string, options?: { max?: number }): Sql {
  const connectionString = url ?? resolveDatabaseUrl({ preferHolocron: true });
  return postgres(connectionString, {
    max: options?.max ?? defaultPoolMax(),
    prepare: false,
    onnotice: () => {},
  });
}

/** True for postgres pool-exhaustion failures ("too many clients", SQLSTATE 53300). */
export function isPoolExhaustionError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === '53300') return true;
  return err instanceof Error && /too many clients/i.test(err.message);
}

export interface DbRetryOptions {
  /** Total attempts INCLUDING the first (default 5). */
  attempts?: number;
  /** Base backoff in ms; doubles per attempt (default 50, capped at 2s). */
  baseDelayMs?: number;
}

/**
 * Run `fn` with bounded exponential backoff on pool-exhaustion errors only.
 * Non-retryable errors rethrow on first occurrence; exhausting attempts
 * rethrows the last error — never silently swallowed.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options?: DbRetryOptions,
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? 5);
  const baseDelayMs = Math.max(1, options?.baseDelayMs ?? 50);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isPoolExhaustionError(err) || attempt === attempts) {
        throw err;
      }
      lastError = err;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 2_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
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
