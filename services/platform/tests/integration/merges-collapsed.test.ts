/**
 * AC-4 — merges collapsed to 3+3 trios (real Postgres).
 *
 * GREEN: exactly analysis_* trio + research_* trio, no per-domain shells.
 * NEGATIVE: creating a forbidden shell table makes verifyMerges fail closed.
 *
 * Run:
 *   DB_IT=1 DATABASE_URL=postgres://justinrich@127.0.0.1:5432/holocron \
 *     bun test tests/integration/merges-collapsed.test.ts
 */
import { describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client';
import { ANALYSIS_TRIO, FORBIDDEN_SHELL_TABLES, RESEARCH_TRIO } from '../../src/db/schema';
import { verifyMerges } from '../../src/db/verify';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron';

describe('AC-4 merges collapsed integration (real Postgres)', () => {
  it('GREEN: exactly 3 analysis_* + 3 research_* trios; discriminators present; no shells', async () => {
    const result = await verifyMerges({ databaseUrl: DATABASE_URL });
    expect(result.errors, result.errors.join('; ')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.analysisTables.sort()).toEqual([...ANALYSIS_TRIO].sort());
    expect(result.researchTables.sort()).toEqual([...RESEARCH_TRIO].sort());
    expect(result.shellTablesFound).toEqual([]);
    expect(result.analysisHasTypeDiscriminator).toBe(true);
    expect(result.researchHasSystemDiscriminator).toBe(true);
    expect(result.analysisItemsHasKind).toBe(true);
    expect(result.analysisEvidenceHasKind).toBe(true);

    // Explicit forbidden names must not appear
    for (const shell of [
      'revenue_validation_sessions',
      'deep_research_sessions',
      'competitive_analysis_sessions',
      'ai_roi_sessions',
      'flights_sessions',
    ] as const) {
      expect(result.analysisTables.includes(shell as never)).toBe(false);
      expect(result.researchTables.includes(shell as never)).toBe(false);
      expect(result.shellTablesFound.includes(shell)).toBe(false);
    }
  }, 60_000);

  it('NEGATIVE: per-domain shell table makes verifyMerges fail (revenue_validation_sessions)', async () => {
    // would fail if verify reported ok while a forbidden shell exists
    const sql = createSql(DATABASE_URL);
    const shell = 'revenue_validation_sessions';
    expect(FORBIDDEN_SHELL_TABLES.includes(shell as (typeof FORBIDDEN_SHELL_TABLES)[number])).toBe(
      true
    );
    let created = false;
    try {
      await sql.unsafe(`
          CREATE TABLE IF NOT EXISTS ${shell} (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            note text
          )
        `);
      created = true;

      const result = await verifyMerges({ databaseUrl: DATABASE_URL });
      expect(result.ok).toBe(false);
      expect(result.shellTablesFound).toContain(shell);
      expect(result.errors.join(' ')).toMatch(/per-domain shell|revenue_validation_sessions/i);
    } finally {
      if (created) {
        await sql.unsafe(`DROP TABLE IF EXISTS ${shell}`);
      }
      await sql.end({ timeout: 5 });
    }

    const restored = await verifyMerges({ databaseUrl: DATABASE_URL });
    expect(restored.ok).toBe(true);
    expect(restored.shellTablesFound).toEqual([]);
  }, 60_000);

  it('NEGATIVE: deep_research_sessions shell is forbidden (research must stay merged)', async () => {
    // would fail if research shells could exist while verify still passes
    const sql = createSql(DATABASE_URL);
    const shell = 'deep_research_sessions';
    let created = false;
    try {
      await sql.unsafe(`
          CREATE TABLE IF NOT EXISTS ${shell} (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            note text
          )
        `);
      created = true;
      const result = await verifyMerges({ databaseUrl: DATABASE_URL });
      expect(result.ok).toBe(false);
      expect(result.shellTablesFound).toContain(shell);
      expect(result.errors.join(' ')).toMatch(/deep_research_sessions|shell/i);
    } finally {
      if (created) {
        await sql.unsafe(`DROP TABLE IF EXISTS ${shell}`);
      }
      await sql.end({ timeout: 5 });
    }
  }, 60_000);
});
