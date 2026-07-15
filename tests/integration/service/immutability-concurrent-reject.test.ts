/**
 * AC-3 / TC-3: Stale concurrent revise_belief is rejected.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Stale-state check omitted
 * - SELECT FOR UPDATE omitted
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-concurrent-reject.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  seedBeliefForTest,
  withEvidenceLock,
  writeImmutabilityArtifact,
} from './immutability-harness';

describe('AC-3: stale concurrent revision rejected', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('second revise after B1 closed raises REVISE_STALE_CONCURRENT', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { reviseBelief } = await import('../../../services/platform/src/db/evidence/index');

      const { beliefId: b1Id, claimId } = await seedBeliefForTest({
        statement: 'concurrent-predecessor',
      });

      writeImmutabilityArtifact('AC-3-red-against-start.txt', {
        b1Id,
        claimId,
        note: 'single open belief before T1 revise',
      });

      const t1 = await reviseBelief({
        beliefId: b1Id,
        actor: 'op-1',
        runId: 'run-1',
        idempotencyKey: `key-t1-${Date.now()}`,
        statement: 'statement-1',
        confidence: 0.8,
        databaseUrl: DEFAULT_DATABASE_URL,
      });

      const t2 = await reviseBelief({
        beliefId: b1Id,
        actor: 'op-2',
        runId: 'run-2',
        idempotencyKey: `key-t2-${Date.now()}`,
        statement: 'statement-2',
        confidence: 0.7,
        databaseUrl: DEFAULT_DATABASE_URL,
      });

      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const successors = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE supersedes_id = ${b1Id}
        `;
        const open = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;
        const b1 = await sql<{ tx_to: string | null }[]>`
          SELECT tx_to::text AS tx_to FROM beliefs WHERE id = ${b1Id}::uuid
        `;

        const green = {
          must_observe: {
            t1_ok: t1.ok,
            t1_successorId: t1.successorId,
            t2_ok: t2.ok,
            t2_errors: t2.errors,
            successor_count: Number(successors[0]?.count ?? 0),
            open_count: Number(open[0]?.count ?? 0),
            b1_closed: b1[0]?.tx_to !== null,
          },
        };
        writeImmutabilityArtifact('AC-3-green.txt', green);
        writeImmutabilityArtifact('AC-3-seeded-belief.json', { b1Id, claimId });

        expect(t1.ok).toBe(true);
        expect(t1.successorId).toBeTruthy();
        expect(t2.ok).toBe(false);
        expect(t2.errors.join(' ')).toMatch(/REVISE_STALE_CONCURRENT|already closed/i);
        expect(Number(successors[0]?.count ?? 0)).toBe(1);
        expect(Number(open[0]?.count ?? 0)).toBe(1);
        expect(b1[0]?.tx_to).not.toBeNull();
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
