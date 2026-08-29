/**
 * Real Drizzle migration runner against Postgres 18.
 * Applies SQL journal migrations; ensures vector extension; reports table counts.
 *
 * S31-01: fail-closed ordinal uniqueness + contiguity gate runs BEFORE any apply.
 * The gate is also exported for CI (`checkMigrationOrdinals`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSql, type Sql } from './client';
import { resolveOwnerDatabaseUrl } from './connection';
import { DOMAIN_TABLE_NAMES } from './schema';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, 'migrations');

/** Named gate error codes (string literal union — not free-form). */
export type MigrationGateCode = 'ORDINAL_COLLISION' | 'ORDINAL_GAP' | 'ORDINAL_INVALID';

export type MigrationGateError = {
  code: MigrationGateCode;
  message: string;
  files?: string[];
  ordinal?: string;
};

export type OrdinalGateResult = {
  ok: boolean;
  files: string[];
  ordinals: number[];
  errors: MigrationGateError[];
};

export type MigrateResult = {
  ok: boolean;
  /** Process exit hint: 2 for ordinal gate failures, 1 for other failures, 0 on success. */
  exitCode: number;
  databaseUrl: string;
  migrationsApplied: string[];
  alreadyApplied: string[];
  tableCount: number;
  domainTablesPresent: number;
  missingTables: string[];
  /** Human-readable errors; ordinal gate entries embed CODE: prefixes. */
  errors: string[];
  /** Structured gate / apply errors (AC-2 ORDINAL_*). */
  errorDetails: MigrationGateError[];
  messages: string[];
};

const ORDINAL_RE = /^(\d{4})_.*\.sql$/;

function resolveMigrationsDir(override?: string): string {
  return override?.trim() || process.env.HOLO_MIGRATIONS_DIR?.trim() || MIGRATIONS_DIR;
}

/**
 * Parse a migration filename's leading 4-digit ordinal.
 * Returns null when the filename does not match `NNNN_*.sql`.
 */
export function parseMigrationOrdinal(filename: string): number | null {
  const m = ORDINAL_RE.exec(filename);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Fail-closed uniqueness + contiguity check over a migrations directory.
 * CI-callable (R26) — does not touch the database.
 */
export async function checkMigrationOrdinals(migrationsDir?: string): Promise<OrdinalGateResult> {
  const dir = resolveMigrationsDir(migrationsDir);
  const entries = await readdir(dir);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();
  const errors: MigrationGateError[] = [];
  const byOrdinal = new Map<number, string[]>();

  for (const file of files) {
    const ordinal = parseMigrationOrdinal(file);
    if (ordinal === null) {
      errors.push({
        code: 'ORDINAL_INVALID',
        message: `migration filename must match NNNN_*.sql: ${file}`,
        files: [file],
      });
      continue;
    }
    const list = byOrdinal.get(ordinal) ?? [];
    list.push(file);
    byOrdinal.set(ordinal, list);
  }

  for (const [ordinal, group] of [...byOrdinal.entries()].sort((a, b) => a[0] - b[0])) {
    if (group.length > 1) {
      const padded = String(ordinal).padStart(4, '0');
      errors.push({
        code: 'ORDINAL_COLLISION',
        message: `ORDINAL_COLLISION: ordinal ${padded} claimed by ${group.join(', ')}`,
        files: group,
        ordinal: padded,
      });
    }
  }

  const ordinals = [...byOrdinal.keys()].sort((a, b) => a - b);
  if (ordinals.length > 0) {
    const min = ordinals[0]!;
    const max = ordinals[ordinals.length - 1]!;
    // Contiguity from the minimum present ordinal through max (house style starts at 0000).
    for (let n = min; n <= max; n++) {
      if (!byOrdinal.has(n)) {
        const padded = String(n).padStart(4, '0');
        errors.push({
          code: 'ORDINAL_GAP',
          message: `ORDINAL_GAP: missing ordinal ${padded}`,
          ordinal: padded,
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    files,
    ordinals,
    errors,
  };
}

function gateErrorsToStrings(errors: MigrationGateError[]): string[] {
  return errors.map((e) => e.message);
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

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries.filter((f) => f.endsWith('.sql')).sort();
}

export async function applyMigrations(options?: {
  databaseUrl?: string;
  /** Override migrations directory (tests / HOLO_MIGRATIONS_DIR). */
  migrationsDir?: string;
  /** When true, skip ordinal gate (NEVER use in production paths). */
  skipOrdinalGate?: boolean;
}): Promise<MigrateResult> {
  // Admin/migrate path: owner URL only (never forced to holocron_app).
  const databaseUrl = options?.databaseUrl ?? resolveOwnerDatabaseUrl({ preferHolocron: true });
  const migrationsDir = resolveMigrationsDir(options?.migrationsDir);
  const migrationsApplied: string[] = [];
  const alreadyApplied: string[] = [];
  const errors: string[] = [];
  const errorDetails: MigrationGateError[] = [];
  const messages: string[] = [];

  const empty = (exitCode: number, ok: boolean): MigrateResult => ({
    ok,
    exitCode,
    databaseUrl,
    migrationsApplied,
    alreadyApplied,
    tableCount: 0,
    domainTablesPresent: 0,
    missingTables: [...DOMAIN_TABLE_NAMES],
    errors,
    errorDetails,
    messages,
  });

  // Ordinal gate BEFORE opening a DB connection when possible — still open DB only after gate
  // so collision trees leave 0 rows applied.
  if (!options?.skipOrdinalGate) {
    const gate = await checkMigrationOrdinals(migrationsDir);
    messages.push(`migrations_dir: ${migrationsDir}`);
    messages.push(`ordinal_gate: ${gate.ok ? 'ok' : 'FAIL'} (${gate.files.length} files)`);
    if (!gate.ok) {
      errorDetails.push(...gate.errors);
      errors.push(...gateErrorsToStrings(gate.errors));
      // Open target just enough to report applied count for AC-2 (must stay 0 on fresh ns).
      // Do NOT apply anything.
      const sqlProbe = createSql(databaseUrl);
      try {
        await ensureMigrationsTable(sqlProbe);
        const applied = await listApplied(sqlProbe);
        messages.push(`drizzle_migrations rows (pre-apply refuse): ${applied.size}`);
      } catch (err) {
        messages.push(
          `drizzle_migrations probe skipped: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        await sqlProbe.end({ timeout: 5 }).catch(() => undefined);
      }
      return empty(2, false);
    }
  }

  const sql = createSql(databaseUrl);

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
    const files = await listMigrationFiles(migrationsDir);

    if (files.length === 0) {
      errors.push(`no migration SQL files found in ${migrationsDir}`);
      return {
        ok: false,
        exitCode: 1,
        databaseUrl,
        migrationsApplied,
        alreadyApplied,
        tableCount: 0,
        domainTablesPresent: 0,
        missingTables: [...DOMAIN_TABLE_NAMES],
        errors,
        errorDetails,
        messages,
      };
    }

    for (const file of files) {
      if (applied.has(file)) {
        alreadyApplied.push(file);
        messages.push(`skip (already applied): ${file}`);
        continue;
      }
      const full = join(migrationsDir, file);
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
      exitCode: ok ? 0 : 1,
      databaseUrl,
      migrationsApplied,
      alreadyApplied,
      tableCount,
      domainTablesPresent,
      missingTables,
      errors,
      errorDetails,
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
