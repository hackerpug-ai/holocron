import postgres from 'postgres';
import { createSql } from './client';
import { applyMigrations } from './migrate';
import { ZERO_PUB_NAME } from './schema/zero-pub';

export const NONPROD_DB_NAME = 'holocron_nonprod';
export const PROD_DB_NAME = 'holocron';

export function databaseNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || '/').replace(/^\//, '') || 'postgres';
  } catch {
    return '';
  }
}

export function isProdDatabaseUrl(url: string): boolean {
  const name = databaseNameFromUrl(url);
  return name === PROD_DB_NAME || name === 'postgres';
}

export function isNonprodDatabaseUrl(url: string): boolean {
  return databaseNameFromUrl(url) === NONPROD_DB_NAME;
}

export function toAdminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

export function toNonprodUrl(baseUrl?: string): string {
  const src = baseUrl ?? process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
  const u = new URL(src);
  u.pathname = `/${NONPROD_DB_NAME}`;
  return u.toString();
}

export type ProvisionResult = {
  ok: boolean;
  database: string;
  created: boolean;
  databaseUrl: string;
  messages: string[];
  errors: string[];
};

/** Create holocron_nonprod if missing (connect via admin DB). */
export async function provisionNonprodNamespace(options?: {
  ownerUrl?: string;
}): Promise<ProvisionResult> {
  const ownerUrl =
    options?.ownerUrl ??
    process.env.DATABASE_URL_OWNER ??
    process.env.DATABASE_URL ??
    'postgres://127.0.0.1:5432/holocron';
  const nonprodUrl = toNonprodUrl(ownerUrl);
  const adminUrl = toAdminUrl(ownerUrl);
  const messages: string[] = [];
  const errors: string[] = [];
  let created = false;

  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const rows = await admin<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${NONPROD_DB_NAME}) AS exists
    `;
    if (!rows[0]?.exists) {
      // CREATE DATABASE cannot run inside a transaction / prepared pipeline easily
      await admin.unsafe(`CREATE DATABASE ${NONPROD_DB_NAME}`);
      created = true;
      messages.push(`created database ${NONPROD_DB_NAME}`);
    } else {
      messages.push(`database ${NONPROD_DB_NAME} already exists`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await admin.end({ timeout: 2 }).catch(() => undefined);
  }

  if (errors.length) {
    return {
      ok: false,
      database: NONPROD_DB_NAME,
      created,
      databaseUrl: nonprodUrl,
      messages,
      errors,
    };
  }

  // Apply migrations into nonprod
  const mig = await applyMigrations({ databaseUrl: nonprodUrl });
  messages.push(...mig.messages);
  if (!mig.ok) errors.push(...mig.errors);

  // Ensure zero_pub exists after migrate (migration 0002 should create it)
  const sql = createSql(nonprodUrl);
  try {
    const pub = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM pg_publication WHERE pubname = ${ZERO_PUB_NAME}) AS exists
    `;
    if (!pub[0]?.exists) {
      errors.push(`zero_pub publication missing after migrate on ${NONPROD_DB_NAME}`);
    } else {
      messages.push(`zero_pub present on ${NONPROD_DB_NAME}`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }

  return {
    ok: errors.length === 0,
    database: NONPROD_DB_NAME,
    created,
    databaseUrl: nonprodUrl,
    messages,
    errors,
  };
}

export async function countPublicRows(databaseUrl: string): Promise<number> {
  const sql = createSql(databaseUrl);
  try {
    const tables = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    const _total = 0;
    for (const t of tables) {
      const _rows = await sql.unsafe(
        `SELECT count(*)::int AS n FROM ${JSON.stringify(t.relname).replaceAll('"', '')}`
      );
      // safer quoting:
    }
    // Use a single query against pg_stat_user_tables for speed/safety
    const stats = await sql<{ n: number }[]>`
      SELECT COALESCE(SUM(n_live_tup), 0)::int AS n FROM pg_stat_user_tables
    `;
    return stats[0]?.n ?? 0;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

export async function dbStatusPayload(databaseUrl: string) {
  const sql = createSql(databaseUrl);
  try {
    const db = await sql<{ db: string }[]>`SELECT current_database() AS db`;
    const tables = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    return {
      ok: true,
      connected: true,
      database: db[0]?.db ?? databaseNameFromUrl(databaseUrl),
      databaseUrl,
      tableCount: tables[0]?.n ?? 0,
    };
  } catch (err) {
    return {
      ok: false,
      connected: false,
      database: databaseNameFromUrl(databaseUrl),
      databaseUrl,
      tableCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}
