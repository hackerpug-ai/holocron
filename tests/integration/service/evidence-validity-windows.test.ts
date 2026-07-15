/**
 * AC-3 / TC-3 (T-DATA-008): relations supports/contradicts edges carry validity
 * windows (valid_from/valid_to) and as-of queries filter correctly.
 *
 * NEGATIVE CONTROL (would fail if):
 * - validFrom/validTo ignored (treated as NULL/unbounded)
 * - query omits validity window filter
 * - relationType enum lacks supports/contradicts
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-validity-windows.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  truncateEvidenceTables,
  withEvidenceLock,
  writeEvidenceArtifact,
} from './evidence-harness';

describe('AC-3: relations validity windows filter covered vs uncovered as-of', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('supports edge returned at 2024-03-01 and excluded at 2024-07-01', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      const subjectId = 'claim-1';
      const objectId = 'claim-2';

      try {
        const before = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM relations WHERE subject_id = ${subjectId}
        `;
        writeEvidenceArtifact('AC-3-red-against-start.txt', {
          relations_for_subject_before: Number(before[0]?.count ?? 0),
        });
        expect(Number(before[0]?.count ?? 0)).toBe(0);

        await sql`
          INSERT INTO relations (
            relation_type, subject_id, object_id,
            valid_from, valid_to, tx_from, tx_to
          )
          VALUES (
            'supports',
            ${subjectId},
            ${objectId},
            '2024-01-01'::timestamptz,
            '2024-06-01'::timestamptz,
            now(),
            NULL
          )
        `;

        const { queryRelationValidityWindows } = await import(
          '../../../services/platform/src/db/evidence/index'
        );
        const result = await queryRelationValidityWindows({
          subjectId,
          coveredAsOf: '2024-03-01',
          uncoveredAsOf: '2024-07-01',
          databaseUrl: DEFAULT_DATABASE_URL,
        });

        const sample = await sql<
          {
            valid_from: string;
            valid_to: string;
            relation_type: string;
          }[]
        >`
          SELECT valid_from::date::text AS valid_from,
                 valid_to::date::text AS valid_to,
                 relation_type
          FROM relations
          WHERE subject_id = ${subjectId} AND tx_to IS NULL
        `;

        const green = {
          must_observe: {
            'covered as-of (2024-03-01) COUNT': result.coveredCount,
            'uncovered as-of (2024-07-01) COUNT': result.uncoveredCount,
            'all relations COUNT': result.allOpenCount,
            "R1 has validFrom = '2024-01-01'": sample[0]?.valid_from,
            "R1 has validTo = '2024-06-01'": sample[0]?.valid_to,
            relationType: sample[0]?.relation_type,
          },
        };
        writeEvidenceArtifact('AC-3-green.txt', green);

        expect(result.coveredCount).toBe(1);
        expect(result.uncoveredCount).toBe(0);
        expect(result.allOpenCount).toBe(1);
        expect(sample[0]?.valid_from).toBe('2024-01-01');
        expect(sample[0]?.valid_to).toBe('2024-06-01');
        expect(sample[0]?.relation_type).toBe('supports');
        // must_not_observe: both queries same count
        expect(result.coveredCount).not.toBe(result.uncoveredCount);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
