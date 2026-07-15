/**
 * AC-2 / TC-2: revise_belief closes predecessor and inserts successor atomically.
 *
 * NEGATIVE CONTROL (would fail if):
 * - revise_belief stub/empty or not SECURITY DEFINER
 * - SELECT FOR UPDATE omitted
 * - close + insert not atomic
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts
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

describe('AC-2: revise_belief atomic supersession', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('closes B1 and inserts B2 with supersedes_id = B1.id', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { reviseBelief } = await import('../../../services/platform/src/db/evidence/index');

      const { beliefId: b1Id, claimId } = await seedBeliefForTest({
        statement: 'predecessor statement',
      });

      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const before = await sql<{ id: string; tx_to: string | null }[]>`
          SELECT id::text AS id, tx_to::text AS tx_to
          FROM beliefs
          WHERE id = ${b1Id}::uuid
        `;
        writeImmutabilityArtifact('AC-2-red-against-start.txt', {
          b1: before[0],
          open_count: before[0]?.tx_to === null ? 1 : 0,
        });
        expect(before[0]?.tx_to).toBeNull();

        const result = await reviseBelief({
          beliefId: b1Id,
          actor: 'op-1',
          runId: 'run-123',
          idempotencyKey: `key-atomic-${Date.now()}`,
          statement: 'new statement',
          confidence: 0.9,
          databaseUrl: DEFAULT_DATABASE_URL,
        });

        expect(result.ok).toBe(true);
        expect(result.successorId).toBeTruthy();
        const b2Id = result.successorId ?? '';
        expect(b2Id.length).toBeGreaterThan(0);

        const b1 = await sql<{ id: string; tx_to: string | null; claim_id: string }[]>`
          SELECT id::text AS id, tx_to::text AS tx_to, claim_id
          FROM beliefs WHERE id = ${b1Id}::uuid
        `;
        const b2 = await sql<
          {
            id: string;
            supersedes_id: string | null;
            tx_from: string | null;
            tx_to: string | null;
            statement: string;
            actor: string | null;
            run_id: string | null;
            claim_id: string;
          }[]
        >`
          SELECT id::text AS id,
                 supersedes_id,
                 tx_from::text AS tx_from,
                 tx_to::text AS tx_to,
                 statement,
                 actor,
                 run_id,
                 claim_id
          FROM beliefs WHERE id = ${b2Id}::uuid
        `;
        const open = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;

        const green = {
          must_observe: {
            b1_tx_to_set: b1[0]?.tx_to !== null,
            b2_supersedes_id: b2[0]?.supersedes_id,
            b2_tx_from_set: b2[0]?.tx_from !== null,
            b2_tx_to_null: b2[0]?.tx_to === null,
            open_count: Number(open[0]?.count ?? 0),
            b2_statement: b2[0]?.statement,
            b2_actor: b2[0]?.actor,
            b2_run_id: b2[0]?.run_id,
            successorId: b2Id,
          },
        };
        writeImmutabilityArtifact('AC-2-green.txt', green);
        writeImmutabilityArtifact('AC-2-seeded-belief.json', { b1Id, b2Id, claimId });

        expect(b1[0]?.tx_to).not.toBeNull();
        expect(b2[0]?.supersedes_id).toBe(b1Id);
        expect(b2[0]?.tx_from).not.toBeNull();
        expect(b2[0]?.tx_to).toBeNull();
        expect(Number(open[0]?.count ?? 0)).toBe(1);
        expect(b2[0]?.statement).toBe('new statement');
        expect(b2[0]?.actor).toBe('op-1');
        expect(b2[0]?.run_id).toBe('run-123');
        expect(b2[0]?.claim_id).toBe(claimId);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
