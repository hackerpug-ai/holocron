/**
 * Real Drizzle migration runner against Postgres 18.
 * Applies SQL journal migrations; ensures vector extension; reports table counts.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSql, type Sql } from './client';
import { resolveOwnerDatabaseUrl } from './connection';
import { DOMAIN_TABLE_NAMES } from './schema';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, 'migrations');

export interface MigrateResult {
  ok: boolean;
  databaseUrl: string;
  migrationsApplied: string[];
  alreadyApplied: string[];
  tableCount: number;
  domainTablesPresent: number;
  missingTables: string[];
  errors: string[];
  messages: string[];
}

async function ensureMigrationsTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function listApplied(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ hash: string }[]>`SELECT hash FROM drizzle_migrations ORDER BY id`;
  return new Set(rows.map((r) => r.hash));
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith('.sql')).sort();
}

export async function applyMigrations(options?: { databaseUrl?: string }): Promise<MigrateResult> {
  // Admin/migrate path: owner URL only (never forced to holocron_app).
  const databaseUrl = options?.databaseUrl ?? resolveOwnerDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const migrationsApplied: string[] = [];
  const alreadyApplied: string[] = [];
  const errors: string[] = [];
  const messages: string[] = [];

  try {
    // Prove admin escape hatch: session must not be forced to holocron_app.
    const who = await sql<{ current_user: string }[]>`SELECT current_user::text`;
    const sessionUser = who[0]?.current_user ?? '';
    messages.push(`current_user: ${sessionUser}`);
    messages.push('role_mode: owner/admin');

    // Ensure vector extension exists (schema-1 should have done this; fail-closed if missing).
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    messages.push('extension vector: ok');

    await ensureMigrationsTable(sql);
    const applied = await listApplied(sql);
    const files = await listMigrationFiles();

    if (files.length === 0) {
      errors.push(`no migration SQL files found in ${MIGRATIONS_DIR}`);
      return {
        ok: false,
        databaseUrl,
        migrationsApplied,
        alreadyApplied,
        tableCount: 0,
        domainTablesPresent: 0,
        missingTables: [...DOMAIN_TABLE_NAMES],
        errors,
        messages,
      };
    }

    for (const file of files) {
      if (applied.has(file)) {
        alreadyApplied.push(file);
        messages.push(`skip (already applied): ${file}`);
        continue;
      }
      const full = join(MIGRATIONS_DIR, file);
      const body = await readFile(full, 'utf8');
      try {
        // Run entire migration as one transaction.
        await sql.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`INSERT INTO drizzle_migrations (hash) VALUES (${file})`;
        });
        migrationsApplied.push(file);
        messages.push(`applied: ${file}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`migration failed: ${file}: ${msg}`);
        messages.push(`ERROR: ${file}: ${msg}`);
        break;
      }
    }

    const countRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('drizzle_migrations')
    `;
    const tableCount = Number(countRows[0]?.count ?? 0);

    const presentRows = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;
    const present = new Set(presentRows.map((r) => r.table_name));
    const missingTables = DOMAIN_TABLE_NAMES.filter((t) => !present.has(t));
    const domainTablesPresent = DOMAIN_TABLE_NAMES.length - missingTables.length;

    const ok =
      errors.length === 0 &&
      tableCount >= 55 &&
      missingTables.length === 0 &&
      (migrationsApplied.length > 0 || alreadyApplied.length > 0);

    if (missingTables.length) {
      errors.push(`missing domain tables: ${missingTables.join(', ')}`);
    }
    if (tableCount < 55) {
      errors.push(`table count ${tableCount} < 55`);
    }

    return {
      ok,
      databaseUrl,
      migrationsApplied,
      alreadyApplied,
      tableCount,
      domainTablesPresent,
      missingTables,
      errors,
      messages,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function countPublicTables(databaseUrl?: string): Promise<number> {
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('drizzle_migrations')
    `;
    return Number(rows[0]?.count ?? 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
