/**
 * AC-4 / TC-4: IdempotencyKey replay returns existing revision.
 *
 * NEGATIVE CONTROL (would fail if):
 * - idempotency check omitted
 * - idempotencyKey unique index omitted
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-idempotency.test.ts
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

describe('AC-4: idempotency key replay returns existing', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('second revise with same idempotency key returns R1.id', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { reviseBelief } = await import('../../../services/platform/src/db/evidence/index');

      const { beliefId: b1Id } = await seedBeliefForTest({ statement: 'idem-predecessor' });
      const key = `key-abc-${Date.now()}`;

      writeImmutabilityArtifact('AC-4-red-against-start.txt', {
        b1Id,
        idempotencyKey: key,
        note: 'no revision with this key yet',
      });

      const first = await reviseBelief({
        beliefId: b1Id,
        actor: 'op-1',
        runId: 'run-1',
        idempotencyKey: key,
        statement: 'statement-1',
        confidence: 0.8,
        databaseUrl: DEFAULT_DATABASE_URL,
      });

      const second = await reviseBelief({
        beliefId: b1Id,
        actor: 'op-2',
        runId: 'run-2',
        idempotencyKey: key,
        statement: 'different',
        confidence: 0.5,
        databaseUrl: DEFAULT_DATABASE_URL,
      });

      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const rows = await sql<
          { id: string; statement: string; actor: string | null; count: string }[]
        >`
          SELECT id::text AS id,
                 statement,
                 actor,
                 count(*) OVER()::text AS count
          FROM beliefs
          WHERE idempotency_key = ${key}
        `;

        const green = {
          must_observe: {
            first_ok: first.ok,
            first_id: first.successorId,
            second_ok: second.ok,
            second_id: second.successorId,
            same_id: first.successorId === second.successorId,
            key_row_count: rows.length,
            r1_statement: rows[0]?.statement,
            r1_actor: rows[0]?.actor,
          },
        };
        writeImmutabilityArtifact('AC-4-green.txt', green);
        writeImmutabilityArtifact('AC-4-seeded-belief.json', {
          b1Id,
          r1Id: first.successorId,
          key,
        });

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        expect(second.successorId).toBe(first.successorId);
        expect(rows.length).toBe(1);
        expect(rows[0]?.statement).toBe('statement-1');
        expect(rows[0]?.actor).toBe('op-1');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
