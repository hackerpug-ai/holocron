/**
 * AC-1 / TC-1 (T-DATA-005): holo evidence:seed inserts claim + two contradicting
 * passages + supports/contradicts relations against real Postgres.
 *
 * NEGATIVE CONTROL (would fail if):
 * - seed is a no-op/stub that inserts 0 rows
 * - seed disconnects from database (empty transaction)
 * - relations table omitted (no supports/contradicts rows)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts
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
  writeEvidenceArtifact,
} from './evidence-harness';

describe('AC-1: evidence:seed inserts claim + two contradicting passages + relations', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('empty-evidence-db RED: counts are zero before seed', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const rows = await sql<{ t: string; c: string }[]>`
          SELECT 'sources' AS t, count(*)::text AS c FROM sources
          UNION ALL SELECT 'passages', count(*)::text FROM passages
          UNION ALL SELECT 'claims', count(*)::text FROM claims
          UNION ALL SELECT 'relations', count(*)::text FROM relations
        `;
        const map = Object.fromEntries(rows.map((r) => [r.t, Number(r.c)]));
        const red = {
          must_not_observe_before_seed: true,
          counts: map,
        };
        writeEvidenceArtifact('AC-1-red-against-start.txt', red);
        expect(map.sources).toBe(0);
        expect(map.passages).toBe(0);
        expect(map.claims).toBe(0);
        expect(map.relations).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive(
    'holo evidence:seed → 1 source, 2 passages, 1 claim, 2 supports/contradicts relations',
    async () => {
      await withEvidenceLock(async () => {
        await truncateEvidenceTables();
        const seed = runHolo(['evidence:seed', '--json']);
        const out = `${seed.stdout}\n${seed.stderr}`;
        expect(seed.status, out).toBe(0);
        const payload = parseJsonObject(seed.stdout) as {
          ok?: boolean;
          sourceId?: string;
          claimId?: string;
          beliefId?: string;
          passageIds?: string[];
          relationIds?: string[];
          counts?: Record<string, number>;
        };
        expect(payload.ok).toBe(true);
        expect(payload.sourceId).toBeTruthy();
        expect(payload.claimId).toBeTruthy();
        // REDHAT-FIX-H3: product seed leaves an open belief for HT-1→HT-2 continuity
        expect(payload.beliefId).toBeTruthy();
        expect(payload.passageIds).toHaveLength(2);
        expect(payload.relationIds).toHaveLength(2);

        const { createSql } = await import('../../../services/platform/src/db/client');
        const sql = createSql(DEFAULT_DATABASE_URL);
        try {
          const sources = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count FROM sources
          `;
          const passages = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count FROM passages
          `;
          const claims = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count FROM claims
          `;
          const scRels = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM relations
            WHERE relation_type IN ('supports', 'contradicts')
          `;
          // Bi-temporal readiness: open supports/contradicts edges have tx_from and open tx_to.
          // (sources/passages are corpus tables without tx_* columns by design — relations carry ledger time.)
          const openSc = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM relations
            WHERE relation_type IN ('supports', 'contradicts')
              AND tx_from IS NOT NULL
              AND tx_to IS NULL
          `;
          const openBeliefs = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE claim_id = ${payload.claimId as string}
              AND tx_to IS NULL
          `;
          const stances = await sql<{ relation_type: string; text: string }[]>`
            SELECT r.relation_type, p.text
            FROM relations r
            JOIN passages p ON p.id::text = r.subject_id
            WHERE r.relation_type IN ('supports', 'contradicts')
            ORDER BY r.relation_type
          `;

          const must_observe = {
            'sources COUNT': Number(sources[0]?.count ?? 0),
            'passages COUNT': Number(passages[0]?.count ?? 0),
            'claims COUNT': Number(claims[0]?.count ?? 0),
            "relations COUNT WHERE relationType IN ('supports','contradicts')": Number(
              scRels[0]?.count ?? 0
            ),
            'open supports/contradicts with tx_from IS NOT NULL AND tx_to IS NULL': Number(
              openSc[0]?.count ?? 0
            ),
            'open beliefs for claim': Number(openBeliefs[0]?.count ?? 0),
            beliefId: payload.beliefId,
            stances: stances.map((s) => ({
              relationType: s.relation_type,
              textPreview: s.text.slice(0, 80),
            })),
          };

          writeEvidenceArtifact('AC-1-green.txt', {
            seed: payload,
            must_observe,
          });

          expect(must_observe['sources COUNT']).toBe(1);
          expect(must_observe['passages COUNT']).toBe(2);
          expect(must_observe['claims COUNT']).toBe(1);
          expect(
            must_observe["relations COUNT WHERE relationType IN ('supports','contradicts')"]
          ).toBe(2);
          expect(
            must_observe['open supports/contradicts with tx_from IS NOT NULL AND tx_to IS NULL']
          ).toBe(2);
          expect(must_observe['open beliefs for claim']).toBe(1);
          expect(stances.some((s) => s.relation_type === 'supports')).toBe(true);
          expect(stances.some((s) => s.relation_type === 'contradicts')).toBe(true);
          expect(stances.some((s) => /SUPPORTS|grew 12%/i.test(s.text))).toBe(true);
          expect(stances.some((s) => /CONTRADICTS|declined 3%/i.test(s.text))).toBe(true);
        } finally {
          await sql.end({ timeout: 5 });
        }
      });
    }
  );
});
