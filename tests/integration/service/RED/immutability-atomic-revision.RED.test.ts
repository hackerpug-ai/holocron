/**
 * ledger-4 / AC-2 / TC-2 (T-DATA-006):
 * revise_belief(...) SECURITY DEFINER atomically closes predecessor and inserts successor.
 *
 * RED against current base: revise_belief does not exist → assertions fail.
 *
 * Signature (ledger-2):
 *   revise_belief(p_belief_id, p_actor, p_run_id, p_idempotency_key,
 *                 p_new_statement, p_new_confidence, p_valid_from, p_valid_to)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/immutability-atomic-revision.RED.test.ts
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

describe('AC-2 / TC-2: atomic supersession via revise_belief', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('pg_proc contains revise_belief SECURITY DEFINER function', async () => {
    const { createSql } = await import('../../../../services/platform/src/db/client');
    const sql = createSql(DEFAULT_DATABASE_URL);
    try {
      const rows = await sql<{ proname: string; prosecdef: boolean; provolatile: string }[]>`
        SELECT p.proname, p.prosecdef, p.provolatile::text AS provolatile
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'revise_belief'
          AND n.nspname = 'public'
      `;
      writeRedArtifact('AC-2-function-catalog.json', rows);
      expect(rows.length, 'revise_belief must exist in public schema').toBeGreaterThanOrEqual(1);
      expect(rows[0]?.prosecdef, 'revise_belief must be SECURITY DEFINER').toBe(true);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  itLive(
    'revise_belief closes B1.tx_to, inserts B2 with supersedes_id=B1, returns B2.id',
    async () => {
      await withEvidenceLock(async () => {
        await truncateEvidenceTables();
        const { createSql } = await import('../../../../services/platform/src/db/client');
        const sql = createSql(DEFAULT_DATABASE_URL);

        try {
          const b1 = await insertOpenBelief(sql, {
            claimId: 'claim-atomic-1',
            statement: 'statement-1',
            confidence: 0.5,
          });

          let successorId: string | null = null;
          let reviseError: { code: string | null; message: string } | null = null;
          try {
            const rows = await sql<{ id: string }[]>`
              SELECT revise_belief(
                ${b1.id}::uuid,
                'op-1',
                'run-123',
                'key-abc',
                'new statement',
                0.9::float8,
                now(),
                NULL::timestamptz
              )::text AS id
            `;
            successorId = rows[0]?.id ?? null;
          } catch (err) {
            reviseError = pgError(err);
          }

          const predecessor = await sql<{ id: string; tx_to: string | null; statement: string }[]>`
            SELECT id::text AS id, tx_to::text AS tx_to, statement
            FROM beliefs
            WHERE id = ${b1.id}::uuid
          `;
          const successor = successorId
            ? await sql<
                {
                  id: string;
                  supersedes_id: string | null;
                  tx_from: string | null;
                  tx_to: string | null;
                  statement: string;
                  actor: string | null;
                  run_id: string | null;
                  idempotency_key: string | null;
                  confidence: number | null;
                }[]
              >`
                SELECT id::text AS id,
                       supersedes_id,
                       tx_from::text AS tx_from,
                       tx_to::text AS tx_to,
                       statement,
                       actor,
                       run_id,
                       idempotency_key,
                       confidence
                FROM beliefs
                WHERE id = ${successorId}::uuid
              `
            : [];

          const openCount = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE claim_id = ${b1.claimId} AND tx_to IS NULL
          `;
          const closedCount = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE claim_id = ${b1.claimId} AND tx_to IS NOT NULL
          `;

          const pred = predecessor[0];
          const succ = successor[0];

          const artifact = {
            ac: 'AC-2',
            tc: 'TC-2',
            b1Id: b1.id,
            successorId,
            reviseError,
            must_observe: {
              'revise_belief succeeds (no error)': reviseError === null,
              'returns B2.id': Boolean(successorId),
              'B1.tx_to IS NOT NULL': pred?.tx_to != null,
              'B2.supersedes_id = B1.id': succ?.supersedes_id === b1.id,
              'B2.tx_from IS NOT NULL': succ?.tx_from != null,
              'B2.tx_to IS NULL': succ != null && succ.tx_to == null,
              'exactly 1 open belief': Number(openCount[0]?.count ?? 0) === 1,
              'exactly 1 closed belief': Number(closedCount[0]?.count ?? 0) === 1,
              'B2.statement = new statement': succ?.statement === 'new statement',
              'B2.actor = op-1': succ?.actor === 'op-1',
              'B2.run_id = run-123': succ?.run_id === 'run-123',
              'B2.idempotency_key = key-abc': succ?.idempotency_key === 'key-abc',
            },
          };
          writeRedArtifact('AC-2-atomic-revision.json', artifact);

          expect(
            reviseError,
            `revise_belief must succeed; got ${JSON.stringify(reviseError)}`
          ).toBeNull();
          expect(successorId).toBeTruthy();
          expect(pred?.tx_to, 'predecessor must be closed (tx_to set)').not.toBeNull();
          expect(succ?.supersedes_id).toBe(b1.id);
          expect(succ?.tx_from).toBeTruthy();
          expect(succ?.tx_to).toBeNull();
          expect(Number(openCount[0]?.count ?? 0)).toBe(1);
          expect(Number(closedCount[0]?.count ?? 0)).toBe(1);
          expect(succ?.statement).toBe('new statement');
          expect(succ?.actor).toBe('op-1');
          expect(succ?.run_id).toBe('run-123');
          expect(succ?.idempotency_key).toBe('key-abc');
          expect(succ?.confidence).toBeCloseTo(0.9, 5);
        } finally {
          await sql.end({ timeout: 5 });
        }
      });
    }
  );

  itLive('idempotency_key replay returns same successor id without new row', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const b1 = await insertOpenBelief(sql, {
          claimId: 'claim-idem-1',
          statement: 'statement-1',
        });

        const call = async (key: string) => {
          try {
            const rows = await sql<{ id: string }[]>`
              SELECT revise_belief(
                ${b1.id}::uuid,
                'op-1',
                'run-123',
                ${key},
                'statement-revised',
                0.8::float8,
                now(),
                NULL::timestamptz
              )::text AS id
            `;
            return { id: rows[0]?.id ?? null, error: null as null };
          } catch (err) {
            return { id: null, error: pgError(err) };
          }
        };

        const first = await call('key-abc');
        const second = await call('key-abc');

        const keyCount = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE idempotency_key = 'key-abc'
        `;

        writeRedArtifact('AC-2-idempotency.json', {
          first,
          second,
          keyCount: Number(keyCount[0]?.count ?? 0),
        });

        expect(first.error).toBeNull();
        expect(second.error).toBeNull();
        expect(first.id).toBeTruthy();
        expect(second.id).toBe(first.id);
        expect(Number(keyCount[0]?.count ?? 0)).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
