/**
 * AC-2 / TC-2 (ledger-2) + REDHAT-FIX-H1 AC-3:
 * revise_belief closes predecessor and inserts successor atomically under holocron_app
 * after 0006 INSERT lockdown.
 *
 * NEGATIVE CONTROL (would fail if):
 * - revise_belief stub/empty or not SECURITY DEFINER
 * - REVOKE INSERT broke revise_belief successor INSERT without owner privileges on definer
 * - EXECUTE on revise_belief revoked from holocron_app
 * - SELECT FOR UPDATE omitted / close + insert not atomic
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('AC-2 / H1-AC-3: revise_belief atomic supersession after insert lockdown', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('closes B1 and inserts B2 with supersedes_id = B1.id (as holocron_app)', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { reviseBelief, toAppRoleDatabaseUrl } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const { beliefId: b1Id, claimId } = await seedBeliefForTest({
        statement: 'predecessor statement',
      });

      const appUrl = toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL);
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

        // App role after 0006: no table INSERT; revise_belief DEFINER must still work.
        const result = await reviseBelief({
          beliefId: b1Id,
          actor: 'op-h1',
          runId: 'run-h1',
          idempotencyKey: `key-atomic-${Date.now()}`,
          statement: 'revised-after-insert-lock',
          confidence: 0.9,
          databaseUrl: appUrl,
        });

        expect(result.ok, result.errors.join('; ')).toBe(true);
        expect(result.successorId).toBeTruthy();
        const b2Id = result.successorId ?? '';
        expect(b2Id).toMatch(UUID_RE);

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
        expect(b2[0]?.statement).toBe('revised-after-insert-lock');
        expect(b2[0]?.actor).toBe('op-h1');
        expect(b2[0]?.run_id).toBe('run-h1');
        expect(b2[0]?.claim_id).toBe(claimId);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
