/**
 * ledger-4 / AC-3 / TC-3 (T-DATA-006):
 * Stale concurrent revise_belief on the same open belief is rejected.
 *
 * GIVEN open belief B1
 * WHEN two clients race revise_belief(B1.id) with distinct idempotency keys
 * THEN exactly one succeeds; the other raises; exactly one successor; B1 closed once.
 *
 * RED against current base: revise_belief missing / no stale detection → fails.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/immutability-concurrent-reject.RED.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  insertOpenBelief,
  itLive,
  pgError,
  truncateEvidenceTables,
  withEvidenceLock,
  writeRedArtifact,
} from './red-harness';

describe('AC-3 / TC-3: stale concurrent revision rejected', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive(
    'second revise_belief on already-closed predecessor raises; only one successor',
    async () => {
      await withEvidenceLock(async () => {
        await truncateEvidenceTables();
        const { createSql } = await import('../../../../services/platform/src/db/client');
        // Two independent app-role connections (real concurrent sessions).
        const sqlA = createSql(DEFAULT_DATABASE_URL);
        const sqlB = createSql(DEFAULT_DATABASE_URL);

        try {
          const b1 = await insertOpenBelief(sqlA, {
            claimId: 'claim-concurrent-1',
            statement: 'statement-open',
            confidence: 0.6,
          });

          // T1: revise succeeds and closes B1
          let t1Id: string | null = null;
          let t1Error: { code: string | null; message: string } | null = null;
          try {
            const rows = await sqlA<{ id: string }[]>`
              SELECT revise_belief(
                ${b1.id}::uuid,
                'op-1',
                'run-1',
                'key-1',
                'statement-from-t1',
                0.8::float8,
                now(),
                NULL::timestamptz
              )::text AS id
            `;
            t1Id = rows[0]?.id ?? null;
          } catch (err) {
            t1Error = pgError(err);
          }

          // T2: stale revise of same predecessor (already closed by T1) must raise
          let t2Id: string | null = null;
          let t2Error: { code: string | null; message: string } | null = null;
          try {
            const rows = await sqlB<{ id: string }[]>`
              SELECT revise_belief(
                ${b1.id}::uuid,
                'op-2',
                'run-2',
                'key-2',
                'statement-from-t2',
                0.7::float8,
                now(),
                NULL::timestamptz
              )::text AS id
            `;
            t2Id = rows[0]?.id ?? null;
          } catch (err) {
            t2Error = pgError(err);
          }

          const open = await sqlA<
            { id: string; supersedes_id: string | null; statement: string }[]
          >`
            SELECT id::text AS id, supersedes_id, statement
            FROM beliefs
            WHERE claim_id = ${b1.claimId} AND tx_to IS NULL
          `;
          const successors = await sqlA<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE supersedes_id = ${b1.id}
          `;
          const pred = await sqlA<{ tx_to: string | null }[]>`
            SELECT tx_to::text AS tx_to FROM beliefs WHERE id = ${b1.id}::uuid
          `;

          const artifact = {
            ac: 'AC-3',
            tc: 'TC-3',
            b1Id: b1.id,
            t1Id,
            t1Error,
            t2Id,
            t2Error,
            openBeliefs: open,
            successorCount: Number(successors[0]?.count ?? 0),
            predecessorTxTo: pred[0]?.tx_to ?? null,
            must_observe: {
              'T1 succeeds': t1Error === null && Boolean(t1Id),
              'T2 raises exception': t2Error !== null,
              'exactly 1 open belief': open.length === 1,
              'exactly 1 successor of B1': Number(successors[0]?.count ?? 0) === 1,
              'B1.tx_to set': pred[0]?.tx_to != null,
            },
            must_not_observe: {
              bothSucceeded: t1Error === null && t2Error === null,
              twoOpen: open.length === 2,
              twoSuccessors: Number(successors[0]?.count ?? 0) === 2,
            },
          };
          writeRedArtifact('AC-3-concurrent-reject.json', artifact);

          expect(t1Error, `T1 must succeed; got ${JSON.stringify(t1Error)}`).toBeNull();
          expect(t1Id).toBeTruthy();
          expect(t2Error, 'T2 must raise stale concurrent revision exception').not.toBeNull();
          expect(t2Id).toBeNull();
          expect(open.length).toBe(1);
          expect(Number(successors[0]?.count ?? 0)).toBe(1);
          expect(pred[0]?.tx_to).not.toBeNull();
          expect(open[0]?.supersedes_id).toBe(b1.id);
          expect(open[0]?.statement).toBe('statement-from-t1');
        } finally {
          await Promise.all([sqlA.end({ timeout: 5 }), sqlB.end({ timeout: 5 })]);
        }
      });
    }
  );

  itLive(
    'true race: two concurrent revise_belief calls yield one success and one rejection',
    async () => {
      await withEvidenceLock(async () => {
        await truncateEvidenceTables();
        const { createSql } = await import('../../../../services/platform/src/db/client');
        const sqlSeed = createSql(DEFAULT_DATABASE_URL);
        const sqlA = createSql(DEFAULT_DATABASE_URL);
        const sqlB = createSql(DEFAULT_DATABASE_URL);

        try {
          const b1 = await insertOpenBelief(sqlSeed, {
            claimId: 'claim-race-1',
            statement: 'race-open',
          });

          type Outcome = {
            id: string | null;
            error: { code: string | null; message: string } | null;
          };

          const revise = async (
            sql: ReturnType<typeof createSql>,
            actor: string,
            key: string,
            statement: string
          ): Promise<Outcome> => {
            try {
              const rows = await sql<{ id: string }[]>`
                SELECT revise_belief(
                  ${b1.id}::uuid,
                  ${actor},
                  ${`run-${actor}`},
                  ${key},
                  ${statement},
                  0.75::float8,
                  now(),
                  NULL::timestamptz
                )::text AS id
              `;
              return { id: rows[0]?.id ?? null, error: null };
            } catch (err) {
              return { id: null, error: pgError(err) };
            }
          };

          const [a, b] = await Promise.all([
            revise(sqlA, 'op-a', 'key-race-a', 'from-a'),
            revise(sqlB, 'op-b', 'key-race-b', 'from-b'),
          ]);

          const successes = [a, b].filter((o) => o.error === null && o.id);
          const failures = [a, b].filter((o) => o.error !== null);
          const open = await sqlSeed<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE claim_id = ${b1.claimId} AND tx_to IS NULL
          `;
          const successors = await sqlSeed<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE supersedes_id = ${b1.id}
          `;

          writeRedArtifact('AC-3-true-race.json', {
            a,
            b,
            successCount: successes.length,
            failureCount: failures.length,
            openCount: Number(open[0]?.count ?? 0),
            successorCount: Number(successors[0]?.count ?? 0),
          });

          expect(successes.length, 'exactly one concurrent revise must succeed').toBe(1);
          expect(failures.length, 'exactly one concurrent revise must fail').toBe(1);
          expect(Number(open[0]?.count ?? 0)).toBe(1);
          expect(Number(successors[0]?.count ?? 0)).toBe(1);
        } finally {
          await Promise.all([
            sqlSeed.end({ timeout: 5 }),
            sqlA.end({ timeout: 5 }),
            sqlB.end({ timeout: 5 }),
          ]);
        }
      });
    }
  );
});
