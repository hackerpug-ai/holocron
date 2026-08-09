/**
 * S31-OPS-02 — Alert-sweep truth + zero-row floor (agent-safe half).
 *
 * AC-1 (agent): operator purge checklist/runbook path exists; never agent-DELETE production.
 * AC-2: empty backup_heartbeat → runBackupAlertSweep / verifyBackupHealth fail closed ZERO_ROW_FLOOR
 * AC-3: alert-sweep plist ProgramArguments is real (not /usr/bin/true) and references backup:alert-sweep
 *
 * NONPROD ONLY for row mutation — never production DELETE.
 *
 * Run:
 *   PLATFORM_IT=1 ./node_modules/.bin/vitest run --project integration \
 *     services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { isNonprodDatabaseUrl, NONPROD_DB_NAME, toNonprodUrl } from '../../src/db/nonprod.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/s31-ops-02');
const PORTABLE_PLIST = resolve(
  REPO_ROOT,
  'services/platform/deploy/launchd/holocron-backup-alert-sweep.plist'
);
const RUNBOOK_PATH = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/runbooks/ops-02-heartbeat-fixture-purge.md'
);
const ALERTING_SRC = resolve(REPO_ROOT, 'services/platform/src/backup/alerting.ts');

/** Prefer explicit nonprod; rewrite prod-ish URLs to holocron_nonprod. */
const NONPROD_URL = (() => {
  const raw =
    process.env.DATABASE_URL ??
    process.env.DATABASE_URL_OWNER ??
    'postgres://127.0.0.1:5432/holocron_nonprod';
  return isNonprodDatabaseUrl(raw) ? raw : toNonprodUrl(raw);
})();

type HeartbeatSnapshotRow = {
  job_name: string;
  status: string | null;
  last_success_at: string | null;
  last_wal_segment: string | null;
  last_snapshot_id: string | null;
  object_count: number | null;
  trace_id: string | null;
};

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function assertNonprodOnly(url: string): void {
  expect(isNonprodDatabaseUrl(url), `must use ${NONPROD_DB_NAME} only — refused: ${url}`).toBe(
    true
  );
  expect(url).toContain(NONPROD_DB_NAME);
  expect(url).not.toMatch(/\/holocron(?:\?|$)/);
}

describe('S31-OPS-02 alert-sweep truth (always — filesystem contracts)', () => {
  it('AC-1 agent half: operator purge runbook path exists (no agent production DELETE)', () => {
    expect(existsSync(RUNBOOK_PATH), `missing runbook: ${RUNBOOK_PATH}`).toBe(true);
    const body = readFileSync(RUNBOOK_PATH, 'utf8');
    expect(body).toMatch(/backup_heartbeat/);
    expect(body).toMatch(/dump/i);
    expect(body).toMatch(/DELETE/i);
    expect(body).toMatch(/fixture/i);
    // Must forbid TRUNCATE and agent automation of production DELETE
    expect(body).toMatch(/never\s+TRUNCATE|NEVER\s+TRUNCATE|do not TRUNCATE/i);
    expect(body).toMatch(/operator/i);
    expect(body).not.toMatch(/agent\s+(must|should|will)\s+DELETE\s+production/i);
    writeEvidence('ac1-runbook-path.txt', RUNBOOK_PATH);
  });

  it('AC-3: alert-sweep plist ProgramArguments is real and references backup:alert-sweep', () => {
    expect(existsSync(PORTABLE_PLIST), `missing plist: ${PORTABLE_PLIST}`).toBe(true);
    const text = readFileSync(PORTABLE_PLIST, 'utf8');
    expect(text).toMatch(/<key>ProgramArguments<\/key>/);
    expect(text).toMatch(/backup:alert-sweep/);
    // Not a no-op stub
    expect(text).not.toMatch(/\/usr\/bin\/true/);
    expect(text).not.toMatch(/ProgramArguments[\s\S]*?true<\/string>\s*<\/array>/);
    // DATABASE_URL is placeholder — not a baked harness host
    expect(text).toMatch(/@DATABASE_URL@/);
    expect(text).not.toMatch(/postgres:\/\/[^@"]+@[^"\s]+holocron/);
    // Real CLI entry (bun + holo.ts), not empty args
    expect(text).toMatch(/holo\.ts/);
    expect(text).toMatch(/@BUN_BIN@|bun/);

    writeEvidence('ac3-plist-program-args.txt', text);
  });

  it('source contract: ZERO_ROW_FLOOR token present in alerting module', () => {
    expect(existsSync(ALERTING_SRC)).toBe(true);
    const src = readFileSync(ALERTING_SRC, 'utf8');
    expect(src).toMatch(/export const ZERO_ROW_FLOOR\s*=\s*['"]ZERO_ROW_FLOOR['"]/);
    expect(src).toMatch(/total === 0/);
    expect(src).toMatch(/BackupAlertSweepZeroRowFloorError|ZERO_ROW_FLOOR/);
  });
});

describe('S31-OPS-02 AC-2 zeroRowFloorFailsClosed (live nonprod)', () => {
  let snapshot: HeartbeatSnapshotRow[] = [];

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    assertNonprodOnly(NONPROD_URL);
    const { createSql } = await import('../../src/db/client.ts');
    const { ensureBackupHeartbeatTable } = await import('../../src/backup/heartbeat.ts');
    const sql = createSql(NONPROD_URL);
    try {
      await ensureBackupHeartbeatTable(sql);
      const rows = await sql<HeartbeatSnapshotRow[]>`
        SELECT job_name, status, last_success_at::text, last_wal_segment,
               last_snapshot_id, object_count, trace_id
        FROM backup_heartbeat
      `;
      snapshot = rows.map((r) => ({ ...r }));
      writeEvidence('pre-zero-row-snapshot.json', {
        database: NONPROD_DB_NAME,
        count: snapshot.length,
        job_names: snapshot.map((r) => r.job_name),
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  afterAll(async () => {
    if (!PLATFORM_IT) return;
    assertNonprodOnly(NONPROD_URL);
    const { createSql } = await import('../../src/db/client.ts');
    const sql = createSql(NONPROD_URL);
    try {
      // Restore nonprod snapshot — never leave empty if we had rows.
      // Prefer re-insert only; do not TRUNCATE.
      await sql`DELETE FROM backup_heartbeat`;
      for (const row of snapshot) {
        await sql`
          INSERT INTO backup_heartbeat (
            job_name, status, last_success_at, last_wal_segment,
            last_snapshot_id, object_count, trace_id, updated_at
          ) VALUES (
            ${row.job_name},
            ${row.status ?? 'success'},
            ${row.last_success_at},
            ${row.last_wal_segment},
            ${row.last_snapshot_id},
            ${row.object_count ?? 0},
            ${row.trace_id},
            now()
          )
          ON CONFLICT (job_name) DO UPDATE SET
            status = EXCLUDED.status,
            last_success_at = EXCLUDED.last_success_at,
            last_wal_segment = EXCLUDED.last_wal_segment,
            last_snapshot_id = EXCLUDED.last_snapshot_id,
            object_count = EXCLUDED.object_count,
            trace_id = EXCLUDED.trace_id,
            updated_at = now()
        `;
      }
      writeEvidence('post-restore-count.json', {
        restored: snapshot.length,
        note: 'nonprod only — production never mutated by this suite',
      });
    } catch (err) {
      writeEvidence('restore-error.txt', err instanceof Error ? err.message : String(err));
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
  });

  itLive(
    'zeroRowFloorFailsClosed: empty nonprod heartbeat fails alert-sweep + verify',
    async () => {
      expect(PLATFORM_IT, 'PLATFORM_IT=1 required').toBe(true);
      assertNonprodOnly(NONPROD_URL);

      const { createSql } = await import('../../src/db/client.ts');
      const { ensureBackupHeartbeatTable } = await import('../../src/backup/heartbeat.ts');
      const { runBackupAlertSweep, verifyBackupHealth, ZERO_ROW_FLOOR } = await import(
        '../../src/backup/alerting.ts'
      );

      const sql = createSql(NONPROD_URL);
      try {
        await ensureBackupHeartbeatTable(sql);
        // Empty the nonprod table only (DELETE, never TRUNCATE).
        await sql`DELETE FROM backup_heartbeat`;
        const countRows = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM backup_heartbeat
      `;
        expect(Number(countRows[0]?.n ?? -1)).toBe(0);

        // AC-2: runBackupAlertSweep must fail closed
        let sweepThrew = false;
        let sweepMsg = '';
        let sweepResult: unknown = null;
        try {
          sweepResult = await runBackupAlertSweep({
            sql,
            webhookUrl: 'http://127.0.0.1:9/s31-ops-02-unused',
          });
        } catch (err) {
          sweepThrew = true;
          sweepMsg = err instanceof Error ? err.message : String(err);
        }

        // AC-2: verifyBackupHealth must not report ok with 0 rows
        const verify = await verifyBackupHealth({ sql });

        writeEvidence('zero-row-floor.json', {
          sweepThrew,
          sweepMsg,
          sweepResult,
          verify,
          ZERO_ROW_FLOOR,
        });

        expect(sweepThrew, 'must_not_observe: silent success on 0 rows').toBe(true);
        expect(sweepMsg).toMatch(/ZERO_ROW_FLOOR|empty heartbeat/i);
        expect(sweepMsg).toMatch(new RegExp(ZERO_ROW_FLOOR));
        expect(sweepResult).toBeNull();

        expect(verify.ok, 'must_not_observe: ok:true with 0 rows').toBe(false);
        expect(verify.exitCode).not.toBe(0);
        expect(verify.jobs.length).toBe(0);
        const verifyBlob = JSON.stringify(verify);
        expect(verifyBlob).toMatch(/ZERO_ROW_FLOOR|empty/i);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  );
});
