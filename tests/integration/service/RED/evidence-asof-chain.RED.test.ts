/**
 * ledger-4 / AC-4 / TC-4 (T-DATA-005):
 * As-of belief query preserves the pre-revision belief on the audit chain.
 *
 * GIVEN belief chain B1 → B2 (B1 closed, B2 open superseding B1)
 * WHEN holo evidence:belief --claim-id <id> --as-of <timestamp between B1.tx_from and B2.tx_from>
 * THEN returns B1 (statement/id), not B2.
 *
 * RED against current base: evidence:belief / as-of query missing → fails.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/evidence-asof-chain.RED.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  parseJsonObject,
  runHolo,
  truncateEvidenceTables,
  withEvidenceLock,
  writeRedArtifact,
} from './red-harness';

describe('AC-4 / TC-4: as-of chain preserves pre-revision belief', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('evidence:belief --as-of between B1 and B2 returns B1 not B2', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimId = 'claim-asof-chain-1';

        // Seed bi-temporal chain without relying on revise_belief (may be absent in RED base).
        // B1: open [t0, t1); B2: open from t1 superseding B1.
        const t0 = '2024-01-01T00:00:00Z';
        const tMid = '2024-02-01T00:00:00Z';
        const t1 = '2024-03-01T00:00:00Z';

        const b1Rows = await sql<{ id: string }[]>`
            INSERT INTO beliefs (
              claim_id, statement, confidence, tx_from, tx_to, actor, run_id, idempotency_key
            )
            VALUES (
              ${claimId},
              'belief-B1-original',
              0.4,
              ${t0}::timestamptz,
              ${t1}::timestamptz,
              'op-seed',
              'run-b1',
              'key-b1'
            )
            RETURNING id::text AS id
          `;
        const b1Id = b1Rows[0]?.id;
        expect(b1Id).toBeTruthy();

        const b2Rows = await sql<{ id: string }[]>`
            INSERT INTO beliefs (
              claim_id, statement, confidence, supersedes_id,
              tx_from, tx_to, actor, run_id, idempotency_key
            )
            VALUES (
              ${claimId},
              'belief-B2-revised',
              0.9,
              ${b1Id},
              ${t1}::timestamptz,
              NULL,
              'op-revise',
              'run-b2',
              'key-b2'
            )
            RETURNING id::text AS id
          `;
        const b2Id = b2Rows[0]?.id;
        expect(b2Id).toBeTruthy();

        // Public API: as-of belief at midpoint must return B1.
        const asOf = runHolo(['evidence:belief', '--claim-id', claimId, '--as-of', tMid, '--json']);
        const out = `${asOf.stdout}\n${asOf.stderr}`;

        let payload: Record<string, unknown> | null = null;
        let parseError: string | null = null;
        try {
          payload = parseJsonObject(asOf.stdout);
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
        }

        const beliefId =
          (payload?.beliefId as string | undefined) ??
          (payload?.id as string | undefined) ??
          (payload?.belief as { id?: string } | undefined)?.id ??
          null;
        const statement =
          (payload?.statement as string | undefined) ??
          (payload?.belief as { statement?: string } | undefined)?.statement ??
          null;

        const artifact = {
          ac: 'AC-4',
          tc: 'TC-4',
          claimId,
          b1Id,
          b2Id,
          asOf: tMid,
          cli: {
            status: asOf.status,
            stdout: asOf.stdout.slice(0, 2000),
            stderr: asOf.stderr.slice(0, 2000),
          },
          parseError,
          payload,
          must_observe: {
            'CLI exit 0': asOf.status === 0,
            'returns B1 id': beliefId === b1Id,
            'returns B1 statement': statement === 'belief-B1-original',
          },
          must_not_observe: {
            'returns B2 id': beliefId === b2Id,
            'returns B2 statement': statement === 'belief-B2-revised',
          },
        };
        writeRedArtifact('AC-4-asof-between.json', artifact);

        expect(asOf.status, `evidence:belief --as-of must exit 0:\n${out}`).toBe(0);
        expect(parseError, `stdout must be JSON: ${parseError}`).toBeNull();
        expect(beliefId, 'as-of mid must resolve to B1.id').toBe(b1Id);
        expect(statement).toBe('belief-B1-original');
        expect(beliefId).not.toBe(b2Id);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('evidence:belief --as-of now returns current open belief B2', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimId = 'claim-asof-now-1';
        const t0 = '2024-01-01T00:00:00Z';
        const t1 = '2024-03-01T00:00:00Z';

        const b1Rows = await sql<{ id: string }[]>`
          INSERT INTO beliefs (claim_id, statement, confidence, tx_from, tx_to)
          VALUES (${claimId}, 'old', 0.3, ${t0}::timestamptz, ${t1}::timestamptz)
          RETURNING id::text AS id
        `;
        const b1Id = b1Rows[0]?.id;
        const b2Rows = await sql<{ id: string }[]>`
          INSERT INTO beliefs (claim_id, statement, confidence, supersedes_id, tx_from, tx_to)
          VALUES (${claimId}, 'current-open', 0.95, ${b1Id}, ${t1}::timestamptz, NULL)
          RETURNING id::text AS id
        `;
        const b2Id = b2Rows[0]?.id;

        const now = runHolo(['evidence:belief', '--claim-id', claimId, '--as-of', 'now', '--json']);
        let payload: Record<string, unknown> | null = null;
        try {
          payload = parseJsonObject(now.stdout);
        } catch {
          payload = null;
        }
        const beliefId =
          (payload?.beliefId as string | undefined) ??
          (payload?.id as string | undefined) ??
          (payload?.belief as { id?: string } | undefined)?.id ??
          null;
        const statement =
          (payload?.statement as string | undefined) ??
          (payload?.belief as { statement?: string } | undefined)?.statement ??
          null;

        writeRedArtifact('AC-4-asof-now.json', {
          status: now.status,
          stdout: now.stdout.slice(0, 2000),
          stderr: now.stderr.slice(0, 2000),
          beliefId,
          statement,
          b1Id,
          b2Id,
        });

        expect(now.status).toBe(0);
        expect(beliefId).toBe(b2Id);
        expect(statement).toBe('current-open');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('full chain B1→B2→B3→B4: each as-of returns the correct belief', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimId = 'claim-asof-full-chain';
        const marks = [
          { at: '2024-01-01T00:00:00Z', until: '2024-02-01T00:00:00Z', statement: 'B1' },
          { at: '2024-02-01T00:00:00Z', until: '2024-03-01T00:00:00Z', statement: 'B2' },
          { at: '2024-03-01T00:00:00Z', until: '2024-04-01T00:00:00Z', statement: 'B3' },
          { at: '2024-04-01T00:00:00Z', until: null as string | null, statement: 'B4' },
        ];

        let prevId: string | null = null;
        const ids: string[] = [];
        for (const m of marks) {
          const rows: { id: string }[] = await sql`
            INSERT INTO beliefs (claim_id, statement, supersedes_id, tx_from, tx_to)
            VALUES (
              ${claimId},
              ${m.statement},
              ${prevId},
              ${m.at}::timestamptz,
              ${m.until}::timestamptz
            )
            RETURNING id::text AS id
          `;
          prevId = rows[0]?.id ?? null;
          if (prevId) ids.push(prevId);
        }
        expect(ids).toHaveLength(4);

        const probes = [
          { asOf: '2024-01-15T00:00:00Z', expectStatement: 'B1', expectId: ids[0] },
          { asOf: '2024-02-15T00:00:00Z', expectStatement: 'B2', expectId: ids[1] },
          { asOf: '2024-03-15T00:00:00Z', expectStatement: 'B3', expectId: ids[2] },
          { asOf: '2024-04-15T00:00:00Z', expectStatement: 'B4', expectId: ids[3] },
        ];

        const results: unknown[] = [];
        for (const p of probes) {
          const r = runHolo([
            'evidence:belief',
            '--claim-id',
            claimId,
            '--as-of',
            p.asOf,
            '--json',
          ]);
          let payload: Record<string, unknown> | null = null;
          try {
            payload = parseJsonObject(r.stdout);
          } catch {
            payload = null;
          }
          const statement =
            (payload?.statement as string | undefined) ??
            (payload?.belief as { statement?: string } | undefined)?.statement ??
            null;
          const beliefId =
            (payload?.beliefId as string | undefined) ??
            (payload?.id as string | undefined) ??
            (payload?.belief as { id?: string } | undefined)?.id ??
            null;

          results.push({
            asOf: p.asOf,
            status: r.status,
            statement,
            beliefId,
            expectStatement: p.expectStatement,
            expectId: p.expectId,
            stdout: r.stdout.slice(0, 500),
          });

          expect(r.status, `as-of ${p.asOf} must exit 0`).toBe(0);
          expect(statement).toBe(p.expectStatement);
          expect(beliefId).toBe(p.expectId);
        }

        writeRedArtifact('AC-4-full-chain.json', { ids, results });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
