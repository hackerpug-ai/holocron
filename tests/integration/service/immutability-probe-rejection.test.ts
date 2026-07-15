/**
 * AC-6 / TC-6: holo db:probe --raw demonstrates direct DML permission denied.
 *
 * NEGATIVE CONTROL (would fail if):
 * - db:probe --raw not implemented
 * - Raw DML executed as superuser instead of app role
 * - Error not captured/reported
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-probe-rejection.test.ts
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

describe('AC-6: db:probe --raw rejects UPDATE on beliefs', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('exits non-zero with ERROR 42501 and leaves statement unchanged', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { beliefId, statement } = await seedBeliefForTest({
        statement: 'probe-raw-original',
      });

      writeImmutabilityArtifact('AC-6-red-against-start.txt', {
        beliefId,
        statement,
        note: 'belief present before malicious UPDATE via db:probe --raw',
      });

      const raw = `UPDATE beliefs SET statement = 'hacked' WHERE id = '${beliefId}'`;
      const result = runHolo(['db:probe', '--raw', raw]);
      const combined = `${result.stdout}\n${result.stderr}`;
      writeImmutabilityArtifact('AC-6-cli-stdout.txt', combined);

      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const rows = await sql<{ statement: string }[]>`
          SELECT statement FROM beliefs WHERE id = ${beliefId}::uuid
        `;
        const hacked = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM beliefs WHERE statement = 'hacked'
        `;

        const green = {
          exit: result.status,
          stdout: combined,
          statement_after: rows[0]?.statement,
          hacked_count: Number(hacked[0]?.count ?? 0),
          has_42501: /42501/.test(combined),
          has_permission_denied: /permission denied/i.test(combined),
          mentions_beliefs: /beliefs/i.test(combined),
          mentions_update: /UPDATE/i.test(combined),
        };
        writeImmutabilityArtifact('AC-6-green.txt', green);
        writeImmutabilityArtifact('AC-6-seeded-belief.json', { beliefId, statement });

        expect(result.status).not.toBe(0);
        expect(combined).toMatch(/42501|permission denied/i);
        expect(combined.toLowerCase()).toContain('beliefs');
        expect(combined).toMatch(/UPDATE/i);
        expect(rows[0]?.statement).toBe(statement);
        expect(Number(hacked[0]?.count ?? 0)).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
