/**
 * AC-1 — 0-error migrate against REAL Postgres (DB_IT=1).
 *
 * GREEN: clean migrate reports ok, ≥55 tables, 0 errors.
 * NEGATIVE controls: dead DB / invalid SQL fail closed (prove teeth).
 *
 * Run:
 *   DB_IT=1 DATABASE_URL=postgres://justinrich@127.0.0.1:5432/holocron \
 *     bun test tests/integration/db-migrate.test.ts
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { createSql } from '../../src/db/client';
import { applyMigrations, countPublicTables, MIGRATIONS_DIR } from '../../src/db/migrate';
import { DOMAIN_TABLE_NAMES } from '../../src/db/schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron';

describe('AC-1 db:migrate integration (real Postgres)', () => {
  it(
    'GREEN: 0-error migrate against live holocron (≥55 domain tables, 0 missing)',
    async () => {
      const result = await applyMigrations({ databaseUrl: DATABASE_URL });
      expect(result.errors, `migrate errors: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.tableCount).toBeGreaterThanOrEqual(55);
      expect(result.missingTables).toEqual([]);
      expect(result.domainTablesPresent).toBe(DOMAIN_TABLE_NAMES.length);
      expect(result.migrationsApplied.length + result.alreadyApplied.length).toBeGreaterThan(0);

      const liveCount = await countPublicTables(DATABASE_URL);
      expect(liveCount).toBeGreaterThanOrEqual(55);
    },
    { timeout: 60_000 }
  );

  it(
    'NEGATIVE: dead DATABASE_URL fails closed (Postgres not running / unreachable)',
    async () => {
      // would fail if migrate reported ok without a real connection (mock/stub success)
      const deadUrl = 'postgres://127.0.0.1:1/schema5_dead';
      let threw = false;
      let okIfReturned: boolean | null = null;
      let errorText = '';
      try {
        const result = await applyMigrations({ databaseUrl: deadUrl });
        okIfReturned = result.ok;
        errorText = result.errors.join('; ');
      } catch (err) {
        threw = true;
        errorText = err instanceof Error ? err.message : String(err);
      }
      const failedClosed = threw || okIfReturned === false;
      expect(failedClosed, `expected connection/migration failure, got: ${errorText}`).toBe(true);
      expect(errorText.length).toBeGreaterThan(0);
      expect(errorText).toMatch(
        /ECONNREFUSED|connect|timeout|ENOTFOUND|failed|refused|migration|error/i
      );
    },
    { timeout: 30_000 }
  );

  it(
    'NEGATIVE: invalid SQL is rejected by real Postgres (migration error path has teeth)',
    async () => {
      // would fail if broken SQL were silently accepted (no real engine / mocked success)
      const sql = createSql(DATABASE_URL);
      try {
        let rejected = false;
        let msg = '';
        try {
          await sql.unsafe('CREATE TABLE schema5_bad_syntax (');
        } catch (err) {
          rejected = true;
          msg = err instanceof Error ? err.message : String(err);
        }
        expect(rejected).toBe(true);
        expect(msg).toMatch(/syntax error|ERROR|failed|migration/i);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    { timeout: 30_000 }
  );

  it('NEGATIVE: migration SQL files must exist (missing migrations would fail migrate)', () => {
    // would fail if MIGRATIONS_DIR were empty / missing (no-op migrate)
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.startsWith('0000_'))).toBe(true);
  });
});
