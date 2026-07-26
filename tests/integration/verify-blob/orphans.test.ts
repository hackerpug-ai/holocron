/**
 * S-UPLOAD-03 AC-3 / TC-3 — holo verify:blob --orphans against REAL Postgres.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/verify-blob/orphans.test.ts
 *
 * Asserts: zero non-finalized upload_intents on a clean cancel path; fail-closed
 * when a staged orphan exists. NEVER hardcodes orphan count to 0.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countOrphanUploadIntents,
  DATABASE_URL,
  insertStagedOrphan,
  itLive,
  openSql,
  PLATFORM_IT,
  runHolo,
  type Sql,
  seedClearedFileObjects,
  writeArtifact,
} from './_helpers';

describe('S-UPLOAD-03 AC-3: verify:blob --orphans', () => {
  let sql: Sql | null = null;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    await seedClearedFileObjects();
    sql = openSql();
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('refuses skip-to-green without PLATFORM_IT=1', () => {
    if (PLATFORM_IT) {
      expect(DATABASE_URL).toContain('holocron_nonprod');
      return;
    }
    expect.fail(
      'PLATFORM_IT=1 required for S-UPLOAD-03 verify:blob --orphans — refusing skip-to-green'
    );
  });

  itLive('exits 0 with orphan rows: 0 after a clean (cancel-safe) state', async () => {
    const db = sql;
    if (!db) throw new Error('sql not initialized');
    await seedClearedFileObjects();
    const orphans = await countOrphanUploadIntents(db);
    expect(orphans, 'start_ref cleared_file_objects → no staged intents').toBe(0);

    const r = runHolo(['verify:blob', '--orphans']);
    expect(r.status, r.combined).toBe(0);
    expect(r.stdout).toMatch(/orphan rows:\s*0/);
    expect(r.stdout).toMatch(/status:\s*OK/i);

    const json = runHolo(['verify:blob', '--orphans', '--json']);
    expect(json.status, json.combined).toBe(0);
    const body = JSON.parse(json.stdout.slice(json.stdout.indexOf('{'))) as {
      ok?: boolean;
      orphanCount?: number;
    };
    expect(body.ok).toBe(true);
    expect(body.orphanCount).toBe(0);

    writeArtifact('AC-3-seeded-artifact.json', {
      artifact_type: 'stdout',
      start_ref: 'cleared_file_objects',
      orphan_rows: body.orphanCount,
      verify_stdout: r.stdout,
    });
    writeArtifact('AC-3-green.txt', r.stdout);
  });

  itLive('fails closed when a staged (non-finalized) upload intent exists', async () => {
    const db = sql;
    if (!db) throw new Error('sql not initialized');
    await seedClearedFileObjects();
    const orphanId = await insertStagedOrphan(db);
    expect(await countOrphanUploadIntents(db)).toBeGreaterThan(0);

    const r = runHolo(['verify:blob', '--orphans', '--json']);
    expect(r.status, `must fail closed for orphan ${orphanId}: ${r.combined}`).not.toBe(0);
    const body = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))) as {
      ok?: boolean;
      orphanCount?: number;
      orphans?: Array<{ id: string; status: string }>;
    };
    expect(body.ok).toBe(false);
    expect(body.orphanCount).toBeGreaterThan(0);
    expect(body.orphans?.some((o) => o.id === orphanId)).toBe(true);
    expect(body.orphans?.every((o) => o.status !== 'finalized')).toBe(true);

    // Cleanup so subsequent suites see a clean namespace.
    await db`DELETE FROM upload_intents WHERE id = ${orphanId}::uuid`;
    expect(await countOrphanUploadIntents(db)).toBe(0);

    writeArtifact('AC-3-fail-closed-orphan.txt', r.combined);
  });
});
