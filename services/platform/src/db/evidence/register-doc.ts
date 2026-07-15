/**
 * evidence:register-doc — register an internal holocron document as a self-sourced
 * canonical source whose retrieval chunks are the existing passages rows (no corpus split).
 *
 * Domain concept "holocron_internal" maps to schema source_kind = 'self_sourced'
 * (CHECK constraint + sourceKindValues). Metadata records the internal alias.
 *
 * T-DATA-007 / T-DATA-022 / UC-DATA-02.
 */
import { createSql } from '../client';
import { resolveProductDatabaseUrl } from './roles';

/** Schema-legal source_kind for internal holocron documents. */
export const HOLOCRON_INTERNAL_SOURCE_KIND = 'self_sourced' as const;

/** Domain alias used in product language for self-sourced holocron docs. */
export const HOLOCRON_INTERNAL_ALIAS = 'holocron_internal' as const;

export interface RegisterDocResult {
  ok: boolean;
  documentId: string;
  sourceId: string | null;
  sourceKind: typeof HOLOCRON_INTERNAL_SOURCE_KIND;
  /** Domain alias (holocron_internal) — same as self_sourced under the CHECK constraint. */
  sourceKindAlias: typeof HOLOCRON_INTERNAL_ALIAS;
  passageIds: string[];
  passageCountBefore: number;
  passageCountAfter: number;
  passagesCreated: number;
  reusedExistingSource: boolean;
  /** Session role observed on the product connection (must be holocron_app). */
  sessionRole: string | null;
  messages: string[];
  errors: string[];
}

/**
 * Register documentId as a self-sourced source and link existing passages
 * (matched by passages.document_id) without inserting new passage rows.
 */
export async function registerDoc(options: {
  documentId: string;
  databaseUrl?: string;
  title?: string | null;
}): Promise<RegisterDocResult> {
  // Product path: bind to holocron_app unless caller supplies an explicit URL override.
  const databaseUrl = options.databaseUrl ?? resolveProductDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const documentId = options.documentId.trim();
  const messages: string[] = [];
  const errors: string[] = [];
  let sessionRole: string | null = null;

  if (!documentId) {
    return {
      ok: false,
      documentId,
      sourceId: null,
      sourceKind: HOLOCRON_INTERNAL_SOURCE_KIND,
      sourceKindAlias: HOLOCRON_INTERNAL_ALIAS,
      passageIds: [],
      passageCountBefore: 0,
      passageCountAfter: 0,
      passagesCreated: 0,
      reusedExistingSource: false,
      sessionRole: null,
      messages,
      errors: ['documentId is required'],
    };
  }

  try {
    const who = await sql<{ current_user: string }[]>`SELECT current_user::text`;
    sessionRole = who[0]?.current_user ?? null;
    messages.push(`current_user: ${sessionRole ?? ''}`);

    const beforeRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM passages
    `;
    const passageCountBefore = Number(beforeRows[0]?.count ?? 0);

    const existingPassages = await sql<{ id: string; source_id: string }[]>`
      SELECT id::text AS id, source_id
      FROM passages
      WHERE document_id = ${documentId}
      ORDER BY ordinal NULLS LAST, created_at, id
    `;
    const passageIds = existingPassages.map((p) => p.id);
    messages.push(`passages for document_id=${documentId}: ${passageIds.length}`);

    if (passageIds.length === 0) {
      errors.push(
        `no passages found for document_id=${documentId}; register-doc requires existing corpus chunks`
      );
      return {
        ok: false,
        documentId,
        sourceId: null,
        sourceKind: HOLOCRON_INTERNAL_SOURCE_KIND,
        sourceKindAlias: HOLOCRON_INTERNAL_ALIAS,
        passageIds: [],
        passageCountBefore,
        passageCountAfter: passageCountBefore,
        passagesCreated: 0,
        reusedExistingSource: false,
        sessionRole,
        messages,
        errors,
      };
    }

    // Prefer an existing self-sourced source for this document (idempotent).
    const existingSources = await sql<{ id: string; source_kind: string }[]>`
      SELECT id::text AS id, source_kind
      FROM sources
      WHERE document_id = ${documentId}
        AND source_kind = ${HOLOCRON_INTERNAL_SOURCE_KIND}
      ORDER BY created_at
      LIMIT 1
    `;

    let sourceId: string | null = existingSources[0]?.id ?? null;
    let reusedExistingSource = false;

    if (sourceId) {
      reusedExistingSource = true;
      messages.push(`reusing self-sourced source: ${sourceId}`);
    } else {
      const contentHash = `holocron-internal-doc:${documentId}`;
      const title = options.title ?? `Holocron internal document ${documentId}`;
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO sources (
          source_kind, document_id, content_hash, title, url, metadata_json
        )
        VALUES (
          ${HOLOCRON_INTERNAL_SOURCE_KIND},
          ${documentId},
          ${contentHash},
          ${title},
          ${`holocron://internal/doc/${documentId}`},
          ${sql.json({
            sourceKindAlias: HOLOCRON_INTERNAL_ALIAS,
            holocron_internal: true,
            task: 'ledger-3',
            documentId,
          })}
        )
        ON CONFLICT (content_hash) DO UPDATE
          SET document_id = EXCLUDED.document_id,
              source_kind = EXCLUDED.source_kind
        RETURNING id::text AS id
      `;
      sourceId = inserted[0]?.id ?? null;
      if (!sourceId) {
        // Race: another session may have created it via content_hash unique.
        const again = await sql<{ id: string }[]>`
          SELECT id::text AS id FROM sources WHERE content_hash = ${contentHash} LIMIT 1
        `;
        sourceId = again[0]?.id ?? null;
        reusedExistingSource = true;
      }
      if (!sourceId) {
        errors.push('failed to insert or locate self-sourced source row');
        return {
          ok: false,
          documentId,
          sourceId: null,
          sourceKind: HOLOCRON_INTERNAL_SOURCE_KIND,
          sourceKindAlias: HOLOCRON_INTERNAL_ALIAS,
          passageIds,
          passageCountBefore,
          passageCountAfter: passageCountBefore,
          passagesCreated: 0,
          reusedExistingSource: false,
          sessionRole,
          messages,
          errors,
        };
      }
      messages.push(`source inserted: ${sourceId} (source_kind=${HOLOCRON_INTERNAL_SOURCE_KIND})`);
    }

    // Link passages to the registered source without creating new passage rows.
    await sql`
      UPDATE passages
      SET source_id = ${sourceId}
      WHERE document_id = ${documentId}
        AND source_id IS DISTINCT FROM ${sourceId}
    `;
    messages.push(`linked passages → source_id=${sourceId}`);

    const afterRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM passages
    `;
    const passageCountAfter = Number(afterRows[0]?.count ?? 0);
    const passagesCreated = passageCountAfter - passageCountBefore;

    // Verify linked passage IDs are unchanged.
    const linked = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM passages
      WHERE document_id = ${documentId} AND source_id = ${sourceId}
      ORDER BY ordinal NULLS LAST, created_at, id
    `;
    const linkedIds = linked.map((r) => r.id);
    const sameIds =
      linkedIds.length === passageIds.length && linkedIds.every((id, i) => id === passageIds[i]);

    if (!sameIds) {
      errors.push('passage ID set changed after register-doc (corpus must not duplicate)');
    }
    if (passagesCreated !== 0) {
      errors.push(`register-doc created ${passagesCreated} passages (must be 0)`);
    }

    const sourceCheck = await sql<{ source_kind: string }[]>`
      SELECT source_kind FROM sources WHERE id = ${sourceId}::uuid
    `;
    const kind = sourceCheck[0]?.source_kind;
    if (kind !== HOLOCRON_INTERNAL_SOURCE_KIND) {
      errors.push(`expected source_kind=${HOLOCRON_INTERNAL_SOURCE_KIND}, got ${kind}`);
    }

    const ok = errors.length === 0 && sourceId !== null && passagesCreated === 0;

    return {
      ok,
      documentId,
      sourceId,
      sourceKind: HOLOCRON_INTERNAL_SOURCE_KIND,
      sourceKindAlias: HOLOCRON_INTERNAL_ALIAS,
      passageIds: linkedIds,
      passageCountBefore,
      passageCountAfter,
      passagesCreated,
      reusedExistingSource,
      sessionRole,
      messages,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return {
      ok: false,
      documentId,
      sourceId: null,
      sourceKind: HOLOCRON_INTERNAL_SOURCE_KIND,
      sourceKindAlias: HOLOCRON_INTERNAL_ALIAS,
      passageIds: [],
      passageCountBefore: 0,
      passageCountAfter: 0,
      passagesCreated: 0,
      reusedExistingSource: false,
      sessionRole,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
