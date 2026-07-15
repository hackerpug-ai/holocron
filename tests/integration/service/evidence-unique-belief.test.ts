/**
 * AC-2 / TC-2 (T-DATA-006): partial unique index beliefs_one_open_per_claim_uidx
 * enforces exactly one open belief (tx_to IS NULL) per claim.
 *
 * NEGATIVE CONTROL (would fail if):
 * - partial unique index omitted (2 open beliefs allowed)
 * - index is non-unique btree (no enforcement)
 * - WHERE tx_to IS NULL clause missing
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-unique-belief.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  truncateEvidenceTables,
  withEvidenceLock,
  writeEvidenceArtifact,
} from './evidence-harness';

describe('AC-2: one open belief per claim (partial unique index)', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('pg_indexes shows beliefs_one_open_per_claim_uidx with WHERE tx_to IS NULL', async () => {
    const { getBeliefsOneOpenIndexInfo } = await import(
      '../../../services/platform/src/db/evidence/index'
    );
    const info = await getBeliefsOneOpenIndexInfo({ databaseUrl: DEFAULT_DATABASE_URL });
    writeEvidenceArtifact('AC-2-index-def.txt', info);
    expect(info.indexExists).toBe(true);
    expect(info.indexdef).toBeTruthy();
    expect(info.isPartialOnTxToNull).toBe(true);
    expect(info.indexdef?.toLowerCase()).toContain('unique');
  });

  itLive('second open belief for same claim raises SQLSTATE 23505', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      const claimId = 'claim-1';
      let b1Ok = false;
      let b2Code: string | null = null;
      let b2Message = '';

      try {
        // RED against start: no open beliefs
        const before = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM beliefs WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;
        writeEvidenceArtifact('AC-2-red-against-start.txt', {
          open_beliefs_before: Number(before[0]?.count ?? 0),
        });
        expect(Number(before[0]?.count ?? 0)).toBe(0);

        await sql`
          INSERT INTO beliefs (claim_id, statement, tx_from, tx_to)
          VALUES (${claimId}, 'statement-1', now(), NULL)
        `;
        b1Ok = true;

        try {
          await sql`
            INSERT INTO beliefs (claim_id, statement, tx_from, tx_to)
            VALUES (${claimId}, 'statement-2', now(), NULL)
          `;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          b2Code = e.code ?? null;
          b2Message = e.message ?? String(err);
        }

        const open = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM beliefs WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;
        const openCount = Number(open[0]?.count ?? 0);

        // Closed belief should still be allowed (tx_to set)
        await sql`
          INSERT INTO beliefs (claim_id, statement, tx_from, tx_to)
          VALUES (${claimId}, 'statement-closed', now(), now())
        `;
        const openAfterClosed = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM beliefs WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;

        const green = {
          must_observe: {
            'B1 insert succeeds': b1Ok,
            'B2 insert raises SQLSTATE 23505': b2Code === '23505',
            'open beliefs for claim-1 COUNT': openCount,
            b2Message,
            open_after_closed_insert: Number(openAfterClosed[0]?.count ?? 0),
          },
        };
        writeEvidenceArtifact('AC-2-green.txt', green);

        expect(b1Ok).toBe(true);
        expect(b2Code).toBe('23505');
        expect(openCount).toBe(1);
        expect(Number(openAfterClosed[0]?.count ?? 0)).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
