/**
 * REDHAT-FIX-S27-12 / CAP-BAK-01 — backup_heartbeat migrate ownership.
 *
 * Proves on real Postgres:
 *   AC-1: holo db:migrate applies 0029 → table + backup_heartbeat_status_check
 *   AC-2: no runtime CREATE TABLE outside migrations/ (source grep)
 *   AC-3: missing table fails closed (no silent CHECK-less recreate)
 *   AC-4: journal lists 0029_backup_heartbeat
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { ensureBackupHeartbeatTable, upsertBackupHeartbeat } from '../../src/backup/heartbeat.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { applyMigrations } from '../../src/db/migrate.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const MIGRATION_SQL = resolve(
  REPO_ROOT,
  'packages/platform/src/db/migrations/0029_backup_heartbeat.sql'
);
const JOURNAL = resolve(REPO_ROOT, 'packages/platform/src/db/migrations/meta/_journal.json');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S27-12');
// Prefer nonprod: default holocron can be blocked on unrelated prior migrations (e.g. 0028).
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function rgNoRuntimeCreateTable(): { matches: string; exitCode: number } {
  const result = spawnSync(
    'rg',
    [
      '-n',
      'CREATE TABLE IF NOT EXISTS backup_heartbeat',
      'packages/platform/src',
      '--glob',
      '!**/migrations/**',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  return {
    matches: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    // rg exit 1 = no matches (desired); 0 = found matches (bad); 2 = error
    exitCode: result.status ?? 2,
  };
}

describe('REDHAT-FIX-S27-12 backup_heartbeat migrate ownership', () => {
  let sql: Sql | null = null;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  it('AC-2/AC-4 source: 0029 migration + journal + zero runtime CREATE TABLE', () => {
    expect(existsSync(MIGRATION_SQL), '0029_backup_heartbeat.sql must exist').toBe(true);
    const migBody = readFileSync(MIGRATION_SQL, 'utf8');
    expect(migBody).toMatch(/CREATE TABLE IF NOT EXISTS\s+"?backup_heartbeat"?/i);
    expect(migBody).toMatch(/backup_heartbeat_status_check/);
    expect(migBody).toMatch(/success.*failed.*running.*overdue|IN \('success'/s);

    const journal = readFileSync(JOURNAL, 'utf8');
    expect(journal).toContain('0029_backup_heartbeat');

    const grep = rgNoRuntimeCreateTable();
    writeEvidence('ac2-rg-runtime-create-table.json', grep);
    expect(grep.exitCode, `runtime CREATE TABLE still present:\n${grep.matches}`).toBe(1);
    expect(grep.matches).toBe('');
  });

  itLive(
    'AC-1: migrate creates backup_heartbeat with status CHECK; invalid status rejected',
    async () => {
      const client = sql;
      if (!client) throw new Error('SQL client not initialized');

      const mig = await applyMigrations({ databaseUrl: DATABASE_URL });
      writeEvidence('ac1-migrate-result.json', {
        ok: mig.ok,
        errors: mig.errors,
        migrationsApplied: mig.migrationsApplied,
        alreadyApplied: mig.alreadyApplied.filter((h) => h.includes('0029') || h.includes('0028')),
        messages: mig.messages.filter(
          (m) => m.includes('0029') || m.includes('ERROR') || m.includes('current_user')
        ),
      });
      expect(mig.errors, `migrate errors: ${mig.errors.join('; ')}`).toEqual([]);
      expect(
        mig.migrationsApplied.includes('0029_backup_heartbeat.sql') ||
          mig.alreadyApplied.includes('0029_backup_heartbeat.sql')
      ).toBe(true);

      const reg = await client<{ reg: string | null }[]>`
        SELECT to_regclass('public.backup_heartbeat')::text AS reg
      `;
      expect(reg[0]?.reg).toBe('backup_heartbeat');

      const constraints = await client<{ conname: string; def: string }[]>`
        SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'public.backup_heartbeat'::regclass
          AND contype = 'c'
      `;
      writeEvidence('ac1-pg-constraint.json', constraints);
      const statusCheck = constraints.find((c) => c.conname === 'backup_heartbeat_status_check');
      expect(statusCheck, 'backup_heartbeat_status_check missing').toBeTruthy();
      expect(statusCheck?.def.toLowerCase()).toMatch(/success/);
      expect(statusCheck?.def.toLowerCase()).toMatch(/failed/);
      expect(statusCheck?.def.toLowerCase()).toMatch(/running/);
      expect(statusCheck?.def.toLowerCase()).toMatch(/overdue/);

      // Valid status accepted
      const okJob = `s27-12-ok-${Date.now().toString(16)}`;
      await client`
        INSERT INTO backup_heartbeat (job_name, status)
        VALUES (${okJob}, 'failed')
      `;
      await client`DELETE FROM backup_heartbeat WHERE job_name = ${okJob}`;

      // Invalid status rejected (check_violation)
      const poisonJob = `s27-12-poison-${Date.now().toString(16)}`;
      let rejected = false;
      let errText = '';
      try {
        await client`
          INSERT INTO backup_heartbeat (job_name, status)
          VALUES (${poisonJob}, 'poisoned')
        `;
      } catch (err) {
        rejected = true;
        errText = err instanceof Error ? err.message : String(err);
      }
      writeEvidence('ac1-poison-insert.json', { rejected, errText });
      expect(rejected).toBe(true);
      expect(errText).toMatch(/check|backup_heartbeat_status_check|violat/i);

      // Upsert path works after migrate-only bootstrap (no runtime DDL)
      const row = await upsertBackupHeartbeat(
        {
          jobName: `s27-12-upsert-${Date.now().toString(16)}`,
          status: 'success',
          lastSuccessAt: new Date(),
          objectCount: 1,
          traceId: 's27-12-migrate-proof',
        },
        client
      );
      expect(row.status).toBe('success');
      await client`DELETE FROM backup_heartbeat WHERE job_name = ${row.job_name}`;
    },
    120_000
  );

  itLive(
    'AC-3: missing table fails closed without silent CHECK-less recreate',
    async () => {
      const client = sql;
      if (!client) throw new Error('SQL client not initialized');

      // Ensure migrate path is healthy first, then drop in a transaction and roll back.
      await applyMigrations({ databaseUrl: DATABASE_URL });

      await client
        .begin(async (tx) => {
          await tx`DROP TABLE IF EXISTS backup_heartbeat`;

          let threw = false;
          let msg = '';
          try {
            await ensureBackupHeartbeatTable(tx as unknown as Sql);
          } catch (err) {
            threw = true;
            msg = err instanceof Error ? err.message : String(err);
          }

          writeEvidence('ac3-missing-table-ensure.json', { threw, msg });
          expect(threw, 'ensure must fail closed when table is missing').toBe(true);
          expect(msg).toMatch(/missing|holo db:migrate|0029/i);
          expect(msg).toMatch(/migrate-owned|db:migrate/i);

          // Upsert must also fail closed (no silent recreate)
          let upsertThrew = false;
          let upsertMsg = '';
          try {
            await upsertBackupHeartbeat(
              { jobName: 'should-not-create', status: 'failed' },
              tx as unknown as Sql
            );
          } catch (err) {
            upsertThrew = true;
            upsertMsg = err instanceof Error ? err.message : String(err);
          }
          writeEvidence('ac3-missing-table-upsert.json', { upsertThrew, upsertMsg });
          expect(upsertThrew).toBe(true);
          expect(upsertMsg).toMatch(/missing|holo db:migrate|0029|does not exist|relation/i);

          // Prove no CHECK-less table was recreated inside this txn
          const recreated = await tx<{ reg: string | null }[]>`
          SELECT to_regclass('public.backup_heartbeat')::text AS reg
        `;
          expect(recreated[0]?.reg).toBeNull();

          // Roll back so live DB keeps the migrated table.
          throw new Error('ROLLBACK_S27_12_AC3_PROBE');
        })
        .catch((err: unknown) => {
          const text = err instanceof Error ? err.message : String(err);
          if (!text.includes('ROLLBACK_S27_12_AC3_PROBE')) throw err;
        });

      // Outside the rolled-back txn the migrated table still exists
      const still = await client<{ reg: string | null }[]>`
        SELECT to_regclass('public.backup_heartbeat')::text AS reg
      `;
      expect(still[0]?.reg).toBe('backup_heartbeat');
    },
    120_000
  );
});
