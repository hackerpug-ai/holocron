/**
 * AC-5 / TC-5: holo evidence:revise calls revise_belief and prints successor id.
 *
 * NEGATIVE CONTROL (would fail if):
 * - CLI command not registered
 * - Argument parsing stubbed
 * - Function call bypassed
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-cli-revise.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  runHolo,
  seedBeliefForTest,
  withEvidenceLock,
  writeImmutabilityArtifact,
} from './immutability-harness';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('AC-5: CLI evidence:revise calls revise_belief', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('exits 0 and prints successor UUID + actor/run metadata', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { beliefId: b1Id, claimId } = await seedBeliefForTest({
        statement: 'cli-revise-predecessor',
      });
      const key = `key-cli-${Date.now()}`;

      writeImmutabilityArtifact('AC-5-red-against-start.txt', {
        b1Id,
        claimId,
        note: 'belief open before CLI revise',
      });

      const result = runHolo([
        'evidence:revise',
        b1Id,
        '--actor',
        'op-1',
        '--run-id',
        'run-123',
        '--idempotency-key',
        key,
        '--statement',
        'revised statement',
        '--confidence',
        '0.95',
        '--json',
      ]);

      const combined = `${result.stdout}\n${result.stderr}`;
      writeImmutabilityArtifact('AC-5-cli-stdout.txt', combined);

      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const closed = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE id = ${b1Id}::uuid AND tx_to IS NOT NULL
        `;
        const open = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        } catch {
          parsed = null;
        }

        const green = {
          exit: result.status,
          successorId: parsed?.successorId ?? null,
          actor: parsed?.actor ?? null,
          runId: parsed?.runId ?? null,
          predecessor_closed: Number(closed[0]?.count ?? 0),
          open_count: Number(open[0]?.count ?? 0),
          stdout_has_uuid: UUID_RE.test(combined),
        };
        writeImmutabilityArtifact('AC-5-green.txt', green);
        writeImmutabilityArtifact('AC-5-seeded-belief.json', { b1Id, claimId, key });

        expect(result.status).toBe(0);
        expect(parsed?.ok).toBe(true);
        expect(String(parsed?.successorId ?? '')).toMatch(UUID_RE);
        expect(parsed?.actor).toBe('op-1');
        expect(parsed?.runId).toBe('run-123');
        expect(Number(closed[0]?.count ?? 0)).toBe(1);
        expect(Number(open[0]?.count ?? 0)).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
