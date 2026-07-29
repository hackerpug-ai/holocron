/**
 * PITR sentinel seed helper (REDHAT-FIX-C3 / D05-02 contract).
 *
 * Creates deterministic before-target / after-target rows around a target
 * timestamp so pause/promote restores can prove the exact cut without invented
 * pg_stat_recovery fields.
 *
 * Table contract:
 *   pitr_sentinel(id bigserial, label text, observed_at timestamptz, note text, wal_lsn pg_lsn)
 *
 * Labels:
 *   - before-target  (observed_at = T0 < Tt)
 *   - after-target   (observed_at = T1 > Tt)
 */
import { spawnSync } from 'node:child_process';

export const PITR_SENTINEL_TABLE = 'pitr_sentinel';
export const LABEL_BEFORE = 'before-target';
export const LABEL_AFTER = 'after-target';

export type SentinelSeedResult = {
  ok: boolean;
  t0: string;
  tt: string;
  t1: string;
  beforeLsn: string | null;
  afterLsn: string | null;
  errors: string[];
  stdout: string;
  stderr: string;
};

function runPsql(
  databaseUrl: string,
  sql: string,
  timeoutMs = 30_000
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: result.stderr ?? '',
  };
}

export function ensurePitrSentinelTable(databaseUrl: string): { ok: boolean; error?: string } {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${PITR_SENTINEL_TABLE} (
      id bigserial PRIMARY KEY,
      label text NOT NULL,
      observed_at timestamptz NOT NULL,
      note text,
      wal_lsn pg_lsn
    );
    CREATE INDEX IF NOT EXISTS pitr_sentinel_label_idx ON ${PITR_SENTINEL_TABLE}(label);
  `;
  const res = runPsql(databaseUrl, sql);
  if (res.status !== 0) {
    return { ok: false, error: res.stderr || res.stdout || 'ensure table failed' };
  }
  return { ok: true };
}

/**
 * Seed a WAL window with before/after sentinel rows.
 * Order: INSERT before @ T0 → switch_wal → sleep → record Tt → sleep → INSERT after @ T1 → switch_wal.
 * Returns timestamps in ISO-8601 UTC (second precision).
 */
export function seedPitrSentinelWindow(options: {
  databaseUrl: string;
  note?: string;
  /** Gap on each side of Tt in ms (default 2000). */
  gapMs?: number;
}): SentinelSeedResult {
  const gapMs = options.gapMs ?? 2000;
  const note = options.note ?? `redhat-fix-c3-${Date.now()}`;
  const errors: string[] = [];

  const ensured = ensurePitrSentinelTable(options.databaseUrl);
  if (!ensured.ok) {
    return {
      ok: false,
      t0: '',
      tt: '',
      t1: '',
      beforeLsn: null,
      afterLsn: null,
      errors: [ensured.error ?? 'ensure failed'],
      stdout: '',
      stderr: ensured.error ?? '',
    };
  }

  // Clear previous labels for this note so re-runs stay deterministic.
  runPsql(
    options.databaseUrl,
    `DELETE FROM ${PITR_SENTINEL_TABLE} WHERE note = '${note.replace(/'/g, "''")}'`
  );

  const beforeSql = `
    WITH ins AS (
      INSERT INTO ${PITR_SENTINEL_TABLE}(label, observed_at, note, wal_lsn)
      VALUES (
        '${LABEL_BEFORE}',
        clock_timestamp(),
        '${note.replace(/'/g, "''")}',
        pg_current_wal_lsn()
      )
      RETURNING observed_at, wal_lsn
    )
    SELECT format('%s|%s', (SELECT observed_at AT TIME ZONE 'UTC' FROM ins),
                           (SELECT wal_lsn::text FROM ins));
  `;
  const before = runPsql(options.databaseUrl, beforeSql);
  if (before.status !== 0 || !before.stdout.includes('|')) {
    errors.push(`before-target insert failed: ${before.stderr || before.stdout}`);
    return {
      ok: false,
      t0: '',
      tt: '',
      t1: '',
      beforeLsn: null,
      afterLsn: null,
      errors,
      stdout: before.stdout,
      stderr: before.stderr,
    };
  }
  const [t0Raw, beforeLsn] = before.stdout.split('|');
  const t0 = toIsoUtc(t0Raw);

  // Force WAL segment boundary after before-target so restore can stop between rows.
  runPsql(options.databaseUrl, `SELECT pg_switch_wal()`);
  spawnSync('sleep', [String(Math.max(1, Math.ceil(gapMs / 1000)))], { encoding: 'utf8' });

  const ttRes = runPsql(
    options.databaseUrl,
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
  );
  const tt = ttRes.stdout || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  spawnSync('sleep', [String(Math.max(1, Math.ceil(gapMs / 1000)))], { encoding: 'utf8' });

  const afterSql = `
    WITH ins AS (
      INSERT INTO ${PITR_SENTINEL_TABLE}(label, observed_at, note, wal_lsn)
      VALUES (
        '${LABEL_AFTER}',
        clock_timestamp(),
        '${note.replace(/'/g, "''")}',
        pg_current_wal_lsn()
      )
      RETURNING observed_at, wal_lsn
    )
    SELECT format('%s|%s', (SELECT observed_at AT TIME ZONE 'UTC' FROM ins),
                           (SELECT wal_lsn::text FROM ins));
  `;
  const after = runPsql(options.databaseUrl, afterSql);
  if (after.status !== 0 || !after.stdout.includes('|')) {
    errors.push(`after-target insert failed: ${after.stderr || after.stdout}`);
    return {
      ok: false,
      t0,
      tt,
      t1: '',
      beforeLsn: beforeLsn || null,
      afterLsn: null,
      errors,
      stdout: after.stdout,
      stderr: after.stderr,
    };
  }
  const [t1Raw, afterLsn] = after.stdout.split('|');
  const t1 = toIsoUtc(t1Raw);
  runPsql(options.databaseUrl, `SELECT pg_switch_wal()`);

  return {
    ok: errors.length === 0,
    t0,
    tt,
    t1,
    beforeLsn: beforeLsn || null,
    afterLsn: afterLsn || null,
    errors,
    stdout: [before.stdout, tt, after.stdout].join('\n'),
    stderr: '',
  };
}

function toIsoUtc(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  // clock_timestamp AT TIME ZONE 'UTC' often yields "YYYY-MM-DD HH:MM:SS.ffffff"
  let n = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  if (!/[Zz]$/.test(n) && !/[+-]\d{2}:?\d{2}$/.test(n)) n = `${n}Z`;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function countSentinelByLabel(
  databaseUrl: string,
  label: string,
  connectArgs?: { host?: string; port?: number; pgdata?: string }
): { status: number | null; count: number; raw: string } {
  const sql = `SELECT COUNT(*)::text FROM ${PITR_SENTINEL_TABLE} WHERE label = '${label.replace(/'/g, "''")}'`;
  if (connectArgs?.pgdata || connectArgs?.host) {
    const args = ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAc', sql];
    if (connectArgs.port) {
      args.unshift('-p', String(connectArgs.port));
    }
    if (connectArgs.host || connectArgs.pgdata) {
      args.unshift('-h', connectArgs.host ?? connectArgs.pgdata ?? '127.0.0.1');
    }
    const result = spawnSync('psql', args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        PGDATA: connectArgs.pgdata,
        PGHOST: connectArgs.host ?? connectArgs.pgdata,
      },
      timeout: 15_000,
    });
    const raw = (result.stdout ?? '').trim();
    return { status: result.status, count: Number(raw || 0), raw };
  }
  const res = runPsql(databaseUrl, sql);
  return { status: res.status, count: Number(res.stdout || 0), raw: res.stdout };
}
