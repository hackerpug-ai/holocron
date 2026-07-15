/**
 * AC-3 / TC-3 (T-DATA-007, T-DATA-022): register internal doc as self-sourced source.
 *
 * GIVEN Existing passages for doc-123
 * WHEN holo evidence:register-doc doc-123
 * THEN New sources row with source_kind=self_sourced (holocron_internal alias),
 *      no new passages (same passage IDs)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-register-doc.test.ts
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

describe('AC-3: register internal doc as self-sourced source (no duplicate corpus)', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('evidence:register-doc links existing passages without creating new ones', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const documentId = 'doc-123';

        // Provisional source so passages.source_id NOT NULL is satisfied pre-register.
        const provisional = await sql<{ id: string }[]>`
          INSERT INTO sources (source_kind, content_hash, title, metadata_json)
          VALUES (
            'document',
            ${`provisional-${documentId}-${Date.now()}`},
            'Provisional corpus for doc-123',
            ${sql.json({ provisional: true, documentId })}
          )
          RETURNING id::text AS id
        `;
        const provisionalSourceId = provisional[0]?.id;
        expect(provisionalSourceId).toBeTruthy();

        const passageIds: string[] = [];
        for (let i = 0; i < 5; i++) {
          const rows = await sql<{ id: string }[]>`
            INSERT INTO passages (source_id, document_id, ordinal, text, metadata_json)
            VALUES (
              ${provisionalSourceId},
              ${documentId},
              ${i},
              ${`Passage chunk ${i} for ${documentId}`},
              ${sql.json({ chunk: i, documentId })}
            )
            RETURNING id::text AS id
          `;
          const id = rows[0]?.id;
          if (id) passageIds.push(id);
        }
        expect(passageIds).toHaveLength(5);

        const beforePassages = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM passages
        `;
        const beforeCount = Number(beforePassages[0]?.count ?? 0);

        writeArtifact('AC-3-red-against-start.json', {
          documentId,
          provisionalSourceId,
          passageIds,
          beforeCount,
          note: 'register-doc must not insert new passages; must create self_sourced source',
        });

        const cli = runHolo(['evidence:register-doc', documentId, '--json']);
        const out = `${cli.stdout}\n${cli.stderr}`;
        expect(cli.status, `register-doc must exit 0:\n${out}`).toBe(0);

        const payload = parseJsonObject(cli.stdout);
        const sourceId = payload.sourceId as string | null;
        const sourceKind = payload.sourceKind as string | undefined;
        const sourceKindAlias = payload.sourceKindAlias as string | undefined;
        const returnedPassageIds = (payload.passageIds as string[] | undefined) ?? [];
        const passagesCreated = payload.passagesCreated as number | undefined;

        expect(sourceId).toBeTruthy();
        // Schema CHECK: self_sourced is the legal value; holocron_internal is domain alias.
        expect(sourceKind).toBe('self_sourced');
        expect(sourceKindAlias).toBe('holocron_internal');
        expect(passagesCreated).toBe(0);
        expect(returnedPassageIds.sort()).toEqual([...passageIds].sort());

        const afterPassages = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM passages
        `;
        const afterCount = Number(afterPassages[0]?.count ?? 0);
        expect(afterCount).toBe(beforeCount);

        const sourceRow = await sql<{ source_kind: string; document_id: string | null }[]>`
          SELECT source_kind, document_id
          FROM sources
          WHERE id = ${sourceId}::uuid
        `;
        expect(sourceRow[0]?.source_kind).toBe('self_sourced');
        expect(sourceRow[0]?.document_id).toBe(documentId);

        const linked = await sql<{ id: string; source_id: string }[]>`
          SELECT id::text AS id, source_id
          FROM passages
          WHERE document_id = ${documentId}
          ORDER BY ordinal
        `;
        expect(linked).toHaveLength(5);
        for (const row of linked) {
          expect(row.source_id).toBe(sourceId);
          expect(passageIds).toContain(row.id);
        }

        // Idempotent re-register: same source, still no new passages.
        const again = runHolo(['evidence:register-doc', documentId, '--json']);
        expect(again.status).toBe(0);
        const againPayload = parseJsonObject(again.stdout);
        expect(againPayload.sourceId).toBe(sourceId);
        expect(againPayload.passagesCreated).toBe(0);

        const finalCount = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM passages
        `;
        expect(Number(finalCount[0]?.count ?? 0)).toBe(beforeCount);

        writeArtifact('AC-3-green.json', {
          sourceId,
          sourceKind,
          sourceKindAlias,
          passageIds,
          beforeCount,
          afterCount,
          linked: linked.map((r) => r.id),
          idempotentSourceId: againPayload.sourceId,
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
