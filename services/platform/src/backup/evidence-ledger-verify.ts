/**
 * Evidence-ledger integrity for CAP-BAK-01 fire drill (D05-04).
 *
 * Captures per-table COUNT(*) and a deterministic checksum over ordered
 * domain rows (beliefs / sources / passages / claims / relations) so a
 * restored cluster can be proven bit-equivalent to a pre-failure snapshot.
 *
 * Uses real psql against a live connection — never invents counts/digests.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { pgToolEnv, resolveTrustedPsqlBin } from './trusted-bin.ts';

export { resolveTrustedPsqlBin };

/** Domain tables whose content feeds the evidence-ledger checksum. */
export const LEDGER_DOMAIN_TABLES = [
  'beliefs',
  'sources',
  'passages',
  'claims',
  'relations',
] as const;

export type LedgerDomainTable = (typeof LEDGER_DOMAIN_TABLES)[number];

/**
 * Tables included in per-table COUNT(*) parity (ledger domain + storage refs).
 * Missing tables are skipped (not fatal) — snapshot only records present ones.
 */
export const FIRE_DRILL_COUNT_TABLES = [
  ...LEDGER_DOMAIN_TABLES,
  'file_objects',
  'entities',
] as const;

export type PsqlConnection = {
  /** Unix socket dir OR hostname (e.g. 127.0.0.1 or PGDATA path). */
  host: string;
  port: number;
  database: string;
  user?: string;
  env?: NodeJS.ProcessEnv;
};

export type RowCountSnapshot = {
  capturedAt: string;
  connection: { host: string; port: number; database: string };
  /** Per-table COUNT(*) for tables that exist; missing tables omitted. */
  row_counts: Record<string, number>;
  /** Tables probed that did not exist. */
  missing_tables: string[];
};

export type LedgerChecksumResult = {
  ok: boolean;
  /** 32-char lowercase hex md5 of the ordered concatenated domain rows. */
  ledger_checksum: string;
  /** Per-table md5 digests that compose the final checksum. */
  per_table: Record<string, string>;
  /** Sample row with tx_from/tx_to when available (beliefs/relations). */
  sample_tx_windows: Array<{
    table: string;
    id: string;
    tx_from: string | null;
    tx_to: string | null;
  }>;
  errors: string[];
};

export type LedgerVerifyResult = {
  ok: boolean;
  row_counts: Record<string, number>;
  ledger_checksum: string;
  LEDGER_CHECKSUM_MATCH: boolean;
  expected_checksum: string | null;
  sample_tx_windows: LedgerChecksumResult['sample_tx_windows'];
  errors: string[];
};

/**
 * GATE-FIX-S28R3-QA26: root-trusted absolute psql only — never bare PATH or
 * user-owned absolute/Homebrew fallback while credentials may be ambient.
 */
function resolvePsqlBin(env: NodeJS.ProcessEnv = process.env): string {
  return resolveTrustedPsqlBin(env);
}

function runPsql(
  conn: PsqlConnection,
  sql: string,
  options?: { tuplesOnly?: boolean }
): { status: number; stdout: string; stderr: string } {
  const args = [
    '-h',
    conn.host,
    '-p',
    String(conn.port),
    '-d',
    conn.database,
    '-v',
    'ON_ERROR_STOP=1',
  ];
  if (conn.user) {
    args.push('-U', conn.user);
  }
  if (options?.tuplesOnly !== false) {
    args.push('-tAc');
  } else {
    args.push('-c');
  }
  args.push(sql);
  const env = conn.env ?? process.env;
  // Resolve trusted bin first (throws if untrusted override), then strip secrets.
  const bin = resolvePsqlBin(env);
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    env: pgToolEnv(env),
    timeout: 60_000,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout?.toString() ?? '',
    stderr: res.stderr?.toString() ?? '',
  };
}

/** True when information_schema reports the table in public schema. */
export function tableExists(conn: PsqlConnection, table: string): boolean {
  const sql = `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}' LIMIT 1`;
  const r = runPsql(conn, sql);
  return r.status === 0 && r.stdout.trim() === '1';
}

/** COUNT(*) for a single public table; null when query fails / table missing. */
export function countTable(conn: PsqlConnection, table: string): number | null {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error(`invalid table name for COUNT(*): ${table}`);
  }
  const r = runPsql(conn, `SELECT COUNT(*)::bigint FROM ${table}`);
  if (r.status !== 0) return null;
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Capture per-table COUNT(*) for the fire-drill domain set (and any extra tables).
 * STRICTLY must run BEFORE restore begins when used as pre-failure baseline.
 */
export function captureRowCounts(
  conn: PsqlConnection,
  tables: readonly string[] = FIRE_DRILL_COUNT_TABLES
): RowCountSnapshot {
  const row_counts: Record<string, number> = {};
  const missing_tables: string[] = [];
  for (const t of tables) {
    if (!tableExists(conn, t)) {
      missing_tables.push(t);
      continue;
    }
    const n = countTable(conn, t);
    if (n === null) {
      missing_tables.push(t);
      continue;
    }
    row_counts[t] = n;
  }
  return {
    capturedAt: new Date().toISOString(),
    connection: { host: conn.host, port: conn.port, database: conn.database },
    row_counts,
    missing_tables,
  };
}

/**
 * SQL that emits one canonical line per row for a domain table (ORDER BY id).
 * Beliefs/relations include bi-temporal tx windows + supersedes chain.
 *
 * All columns are cast to text before COALESCE(..., '') so uuid/timestamptz
 * columns never hit "invalid input syntax for type uuid" against ''.
 */
function canonicalRowsSql(table: LedgerDomainTable): string | null {
  // ORDER BY sort_id (inner id) — outer string_agg cannot see bare `id` after projection.
  switch (table) {
    case 'beliefs':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(claim_id::text, '') || E'\\t' ||
            COALESCE(statement::text, '') || E'\\t' ||
            COALESCE(confidence::text, '') || E'\\t' ||
            COALESCE(supersedes_id::text, '') || E'\\t' ||
            COALESCE(tx_from::text, '') || E'\\t' ||
            COALESCE(tx_to::text, '') || E'\\t' ||
            COALESCE(valid_from::text, '') || E'\\t' ||
            COALESCE(valid_to::text, '') AS line
          FROM beliefs
        ) s`;
    case 'sources':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(source_kind::text, '') || E'\\t' ||
            COALESCE(document_id::text, '') || E'\\t' ||
            COALESCE(content_hash::text, '') || E'\\t' ||
            COALESCE(title::text, '') || E'\\t' ||
            COALESCE(url::text, '') AS line
          FROM sources
        ) s`;
    case 'passages':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(source_id::text, '') || E'\\t' ||
            COALESCE(document_id::text, '') || E'\\t' ||
            COALESCE(ordinal::text, '') || E'\\t' ||
            COALESCE(text::text, '') AS line
          FROM passages
        ) s`;
    case 'claims':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(source_id::text, '') || E'\\t' ||
            COALESCE(passage_id::text, '') || E'\\t' ||
            COALESCE(claim_text::text, '') || E'\\t' ||
            COALESCE(claim_category::text, '') || E'\\t' ||
            COALESCE(confidence::text, '') AS line
          FROM claims
        ) s`;
    case 'relations':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(relation_type::text, '') || E'\\t' ||
            COALESCE(subject_id::text, '') || E'\\t' ||
            COALESCE(object_id::text, '') || E'\\t' ||
            COALESCE(tx_from::text, '') || E'\\t' ||
            COALESCE(tx_to::text, '') || E'\\t' ||
            COALESCE(valid_from::text, '') || E'\\t' ||
            COALESCE(valid_to::text, '') AS line
          FROM relations
        ) s`;
    default:
      return null;
  }
}

function md5Hex(payload: string): string {
  return createHash('md5').update(payload, 'utf8').digest('hex');
}

/**
 * Deterministic evidence-ledger checksum: md5 over ordered concatenated domain rows.
 * Empty tables contribute the md5 of empty string so the digest remains stable.
 */
export function computeLedgerChecksum(conn: PsqlConnection): LedgerChecksumResult {
  const errors: string[] = [];
  const per_table: Record<string, string> = {};
  const parts: string[] = [];

  for (const table of LEDGER_DOMAIN_TABLES) {
    if (!tableExists(conn, table)) {
      // Missing table: still record a stable empty digest so restore of a
      // schema-less scratch cannot silently "match" a populated source.
      const empty = md5Hex('');
      per_table[table] = empty;
      parts.push(`${table}:${empty}`);
      errors.push(`table missing for ledger checksum: ${table}`);
      continue;
    }
    const sql = canonicalRowsSql(table);
    if (!sql) {
      errors.push(`no canonical SQL for table ${table}`);
      continue;
    }
    const r = runPsql(conn, sql);
    if (r.status !== 0) {
      errors.push(`ledger checksum query failed for ${table}: ${r.stderr || r.stdout}`);
      const empty = md5Hex('');
      per_table[table] = empty;
      parts.push(`${table}:${empty}`);
      continue;
    }
    const digest = md5Hex(r.stdout);
    per_table[table] = digest;
    parts.push(`${table}:${digest}`);
  }

  const ledger_checksum = md5Hex(parts.join('|'));
  const sample_tx_windows = sampleTxWindows(conn);

  return {
    ok: errors.length === 0,
    ledger_checksum,
    per_table,
    sample_tx_windows,
    errors,
  };
}

function sampleTxWindows(conn: PsqlConnection): LedgerChecksumResult['sample_tx_windows'] {
  const out: LedgerChecksumResult['sample_tx_windows'] = [];
  for (const table of ['beliefs', 'relations'] as const) {
    if (!tableExists(conn, table)) continue;
    const r = runPsql(
      conn,
      `SELECT id || E'\\t' || COALESCE(tx_from::text, '') || E'\\t' || COALESCE(tx_to::text, '')
       FROM ${table}
       WHERE tx_from IS NOT NULL
       ORDER BY id
       LIMIT 3`
    );
    if (r.status !== 0 || !r.stdout.trim()) continue;
    for (const line of r.stdout.trim().split('\n')) {
      const [id, tx_from, tx_to] = line.split('\t');
      if (!id) continue;
      out.push({
        table,
        id,
        tx_from: tx_from && tx_from.length > 0 ? tx_from : null,
        tx_to: tx_to && tx_to.length > 0 ? tx_to : null,
      });
    }
  }
  return out;
}

/**
 * Compare restored ledger checksum to a pre-failure expected digest.
 * Fail-closed: empty expected never matches.
 */
export function verifyEvidenceLedger(
  conn: PsqlConnection,
  expectedChecksum: string | null | undefined
): LedgerVerifyResult {
  const counts = captureRowCounts(conn);
  const checksum = computeLedgerChecksum(conn);
  const expected = expectedChecksum?.trim() || null;
  const match =
    expected !== null &&
    expected.length === 32 &&
    /^[0-9a-f]{32}$/i.test(expected) &&
    checksum.ledger_checksum.toLowerCase() === expected.toLowerCase() &&
    checksum.ok;

  const errors = [...checksum.errors];
  if (!expected) {
    errors.push('expected ledger checksum missing — refuse LEDGER_CHECKSUM_MATCH');
  } else if (!match) {
    errors.push(
      `ledger checksum mismatch: expected=${expected} actual=${checksum.ledger_checksum}`
    );
  }

  return {
    ok: match && errors.length === 0,
    row_counts: counts.row_counts,
    ledger_checksum: checksum.ledger_checksum,
    LEDGER_CHECKSUM_MATCH: match,
    expected_checksum: expected,
    sample_tx_windows: checksum.sample_tx_windows,
    errors,
  };
}

/** Compare two row-count maps for exact equality on the union of keys. */
export function compareRowCountsExact(
  expected: Record<string, number>,
  actual: Record<string, number>
): {
  ok: boolean;
  mismatches: Array<{ table: string; expected: number | null; actual: number | null }>;
} {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const mismatches: Array<{ table: string; expected: number | null; actual: number | null }> = [];
  for (const k of [...keys].sort()) {
    const e = expected[k];
    const a = actual[k];
    if (e === undefined || a === undefined || e !== a) {
      mismatches.push({
        table: k,
        expected: e ?? null,
        actual: a ?? null,
      });
    }
  }
  return { ok: mismatches.length === 0 && keys.size > 0, mismatches };
}

/**
 * Parse a DATABASE_URL into a PsqlConnection (host/port/database).
 * Supports postgres:// and postgresql:// forms.
 */
export function connectionFromDatabaseUrl(
  databaseUrl: string,
  env?: NodeJS.ProcessEnv
): PsqlConnection {
  const u = new URL(databaseUrl);
  const database = (u.pathname || '/holocron').replace(/^\//, '') || 'holocron';
  const port = u.port ? Number(u.port) : 5432;
  const host = u.hostname || '127.0.0.1';
  const user = u.username ? decodeURIComponent(u.username) : undefined;
  return { host, port, database, user, env };
}

/** Default live-source connection for pre-failure snapshot. */
export function defaultSourceConnection(env: NodeJS.ProcessEnv = process.env): PsqlConnection {
  const url = env.DATABASE_URL?.trim();
  if (url) return connectionFromDatabaseUrl(url, env);
  return {
    host: '127.0.0.1',
    port: Number(env.PGPORT?.trim() || 5432),
    database: env.PGDATABASE?.trim() || 'holocron',
    user: env.PGUSER?.trim() || undefined,
    env,
  };
}
