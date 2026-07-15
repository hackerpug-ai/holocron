/**
 * AC-4 / TC-4 (T-DATA-005): as-of query preserves full audit chain B1→B2→B3→B4.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-chain.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  parseJsonObject,
  REPO_ROOT,
  runHolo,
  truncateEvidenceTables,
  withEvidenceLock,
} from './evidence-harness';

const TMP = resolve(REPO_ROOT, '.tmp/ledger-3');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(TMP, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(TMP, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('AC-4: as-of query preserves full audit chain', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('full chain B1→B2→B3→B4: each as-of returns the correct belief', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimId = 'claim-asof-full-chain-ledger3';
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

        writeArtifact('AC-4-red-against-start.json', {
          claimId,
          ids,
          note: 'would fail if only open belief (tx_to IS NULL) is returned',
        });

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
          const payload = parseJsonObject(r.stdout);
          const statement =
            (payload.statement as string | undefined) ??
            (payload.belief as { statement?: string } | undefined)?.statement ??
            null;
          const beliefId =
            (payload.beliefId as string | undefined) ??
            (payload.id as string | undefined) ??
            (payload.belief as { id?: string } | undefined)?.id ??
            null;

          results.push({
            asOf: p.asOf,
            status: r.status,
            statement,
            beliefId,
            expectStatement: p.expectStatement,
            expectId: p.expectId,
          });

          expect(r.status, `as-of ${p.asOf} must exit 0`).toBe(0);
          expect(statement).toBe(p.expectStatement);
          expect(beliefId).toBe(p.expectId);
        }

        // Chain preserved: all four rows still present with supersedes links.
        const chain = await sql<{ id: string; statement: string; supersedes_id: string | null }[]>`
          SELECT id::text AS id, statement, supersedes_id
          FROM beliefs
          WHERE claim_id = ${claimId}
          ORDER BY tx_from
        `;
        expect(chain).toHaveLength(4);
        expect(chain[0]?.supersedes_id).toBeNull();
        expect(chain[1]?.supersedes_id).toBe(ids[0]);
        expect(chain[2]?.supersedes_id).toBe(ids[1]);
        expect(chain[3]?.supersedes_id).toBe(ids[2]);

        writeArtifact('AC-4-green-full-chain.json', { ids, results, chain });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('evidence:belief --as-of now returns current open belief', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimId = 'claim-asof-now-ledger3';
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
        expect(now.status).toBe(0);
        const payload = parseJsonObject(now.stdout);
        const beliefId =
          (payload.beliefId as string | undefined) ??
          (payload.id as string | undefined) ??
          (payload.belief as { id?: string } | undefined)?.id ??
          null;
        const statement =
          (payload.statement as string | undefined) ??
          (payload.belief as { statement?: string } | undefined)?.statement ??
          null;

        writeArtifact('AC-4-green-asof-now.json', { beliefId, statement, b1Id, b2Id });
        expect(beliefId).toBe(b2Id);
        expect(statement).toBe('current-open');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
