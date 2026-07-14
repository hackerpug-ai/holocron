/**
 * db:verify — merge collapse, indexes (HNSW/GIN/btree), schema integrity
 * checks against live Postgres.
 */
import { createSql } from './client';
import { resolveDatabaseUrl } from './index';
import { COVERING_BTREE_INDEXES, FTS_SEARCH_VECTOR_TARGETS, HNSW_INDEXES } from './indexes';
import { ANALYSIS_TRIO, FORBIDDEN_SHELL_TABLES, RESEARCH_TRIO } from './schema';

export interface MergesVerifyResult {
  ok: boolean;
  analysisTables: string[];
  researchTables: string[];
  shellTablesFound: string[];
  analysisHasTypeDiscriminator: boolean;
  researchHasSystemDiscriminator: boolean;
  analysisItemsHasKind: boolean;
  analysisEvidenceHasKind: boolean;
  messages: string[];
  errors: string[];
}

export interface IndexesVerifyResult {
  ok: boolean;
  hnsw: Array<{
    name: string;
    table: string;
    column: string;
    accessMethod: string;
    ops: string;
    found: boolean;
  }>;
  fts: Array<{
    table: string;
    searchVector: boolean;
    generated: boolean;
    ginIndex: string;
    ginFound: boolean;
  }>;
  covering: Array<{ name: string; table: string; accessMethod: string; found: boolean }>;
  ivfflatFound: string[];
  messages: string[];
  errors: string[];
}

export async function verifyMerges(options?: {
  databaseUrl?: string;
}): Promise<MergesVerifyResult> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];

  try {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const tables = rows.map((r) => r.table_name);
    const analysisTables = tables.filter((t) => t.startsWith('analysis_'));
    const researchTables = tables.filter((t) => t.startsWith('research_'));
    const shellTablesFound = FORBIDDEN_SHELL_TABLES.filter((t) => tables.includes(t));

    messages.push(`analysis tables: ${analysisTables.join(', ') || '(none)'}`);
    messages.push(`research tables: ${researchTables.join(', ') || '(none)'}`);
    messages.push(`per-domain shells found: ${shellTablesFound.length}`);

    for (const expected of ANALYSIS_TRIO) {
      if (!analysisTables.includes(expected)) {
        errors.push(`missing analysis target: ${expected}`);
      }
    }
    for (const expected of RESEARCH_TRIO) {
      if (!researchTables.includes(expected)) {
        errors.push(`missing research target: ${expected}`);
      }
    }
    if (analysisTables.length !== 3) {
      errors.push(`expected exactly 3 analysis_* tables, got ${analysisTables.length}`);
    }
    if (researchTables.length !== 3) {
      errors.push(`expected exactly 3 research_* tables, got ${researchTables.length}`);
    }
    if (shellTablesFound.length > 0) {
      errors.push(`per-domain shell tables exist: ${shellTablesFound.join(', ')}`);
    }

    // Discriminator columns
    const cols = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'analysis_sessions', 'analysis_items', 'analysis_evidence',
          'research_sessions', 'research_iterations', 'research_findings'
        )
    `;
    const has = (table: string, col: string) =>
      cols.some((c) => c.table_name === table && c.column_name === col);

    const analysisHasTypeDiscriminator = has('analysis_sessions', 'type');
    const analysisItemsHasKind = has('analysis_items', 'kind');
    const analysisEvidenceHasKind = has('analysis_evidence', 'kind');
    const researchHasSystemDiscriminator =
      has('research_sessions', 'system') &&
      has('research_iterations', 'system') &&
      has('research_findings', 'system');

    messages.push(`analysis_sessions.type: ${analysisHasTypeDiscriminator}`);
    messages.push(`analysis_items.kind: ${analysisItemsHasKind}`);
    messages.push(`analysis_evidence.kind: ${analysisEvidenceHasKind}`);
    messages.push(`research_*.system: ${researchHasSystemDiscriminator}`);

    if (!analysisHasTypeDiscriminator) errors.push('analysis_sessions missing type discriminator');
    if (!analysisItemsHasKind) errors.push('analysis_items missing kind discriminator');
    if (!analysisEvidenceHasKind) errors.push('analysis_evidence missing kind discriminator');
    if (!researchHasSystemDiscriminator)
      errors.push('research tables missing system discriminator');

    // payload jsonb on analysis trio
    for (const t of ANALYSIS_TRIO) {
      if (!has(t, 'payload')) {
        errors.push(`${t} missing payload jsonb column`);
      }
    }

    const ok = errors.length === 0;
    if (ok) {
      messages.push('analysis_sessions, analysis_items, analysis_evidence');
      messages.push('research_sessions, research_iterations, research_findings');
      messages.push('no per-domain shells');
    }

    return {
      ok,
      analysisTables,
      researchTables,
      shellTablesFound: [...shellTablesFound],
      analysisHasTypeDiscriminator,
      researchHasSystemDiscriminator,
      analysisItemsHasKind,
      analysisEvidenceHasKind,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Live verify of HNSW + GIN search_vector + covering btree indexes.
 * Fails closed if any declared index is missing, wrong AM, or IVFFlat present.
 */
export async function verifyIndexes(options?: {
  databaseUrl?: string;
}): Promise<IndexesVerifyResult> {
  const databaseUrl = options?.databaseUrl ?? resolveDatabaseUrl({ preferHolocron: true });
  const sql = createSql(databaseUrl);
  const messages: string[] = [];
  const errors: string[] = [];

  try {
    // Index catalog: name → access method + definition
    const indexRows = await sql<
      { indexname: string; tablename: string; indexdef: string; amname: string }[]
    >`
      SELECT
        i.relname AS indexname,
        t.relname AS tablename,
        pg_get_indexdef(i.oid) AS indexdef,
        am.amname AS amname
      FROM pg_class i
      JOIN pg_index ix ON ix.indexrelid = i.oid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'public'
        AND i.relkind = 'i'
      ORDER BY i.relname
    `;

    const byName = new Map(indexRows.map((r) => [r.indexname, r]));

    // Forbidden: any IVFFlat
    const ivfflatFound = indexRows
      .filter((r) => r.amname === 'ivfflat' || /ivfflat/i.test(r.indexdef))
      .map((r) => r.indexname);

    if (ivfflatFound.length > 0) {
      errors.push(`IVFFlat index present: ${ivfflatFound.join(', ')}`);
      messages.push(`access method: ivfflat (FORBIDDEN)`);
    } else {
      messages.push('no IVFFlat indexes');
    }

    // ── HNSW ───────────────────────────────────────────────────────────────
    const hnsw: IndexesVerifyResult['hnsw'] = [];
    for (const expected of HNSW_INDEXES) {
      const row = byName.get(expected.name);
      const accessMethod = row?.amname ?? 'missing';
      const ops = row && /vector_cosine_ops/.test(row.indexdef) ? 'vector_cosine_ops' : 'missing';
      const found =
        !!row &&
        row.amname === 'hnsw' &&
        row.tablename === expected.table &&
        /vector_cosine_ops/.test(row.indexdef);

      hnsw.push({
        name: expected.name,
        table: expected.table,
        column: expected.column,
        accessMethod,
        ops,
        found,
      });

      if (!row) {
        errors.push(`no HNSW index found: ${expected.name}`);
        messages.push(`Index not found: ${expected.name}`);
      } else if (row.amname !== 'hnsw') {
        errors.push(
          `${expected.name}: expected access method: hnsw, got access method: ${row.amname}`
        );
      } else if (!/vector_cosine_ops/.test(row.indexdef)) {
        errors.push(`${expected.name}: vector_cosine_ops not used`);
      } else if (row.tablename !== expected.table) {
        errors.push(`${expected.name}: expected table ${expected.table}, got ${row.tablename}`);
      } else {
        messages.push(
          `${expected.name}: access method: hnsw; vector_cosine_ops; table=${expected.table}`
        );
      }
    }

    const hnswOk = hnsw.filter((h) => h.found).length;
    messages.push(`HNSW indexes found: ${hnswOk}/${HNSW_INDEXES.length}`);
    if (hnswOk < HNSW_INDEXES.length) {
      errors.push(`Index count less than ${HNSW_INDEXES.length} HNSW`);
      errors.push('Missing HNSW index');
    }

    // ── FTS search_vector + GIN ────────────────────────────────────────────
    const fts: IndexesVerifyResult['fts'] = [];
    for (const target of FTS_SEARCH_VECTOR_TARGETS) {
      const colRows = await sql<
        {
          column_name: string;
          data_type: string;
          is_generated: string;
          generation_expression: string | null;
        }[]
      >`
        SELECT column_name, data_type, is_generated, generation_expression
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${target.table}
          AND column_name = 'search_vector'
      `;
      const col = colRows[0];
      const searchVector = !!col;
      const generated =
        !!col &&
        (col.is_generated === 'ALWAYS' ||
          (col.generation_expression !== null && col.generation_expression.length > 0));
      const ginRow = byName.get(target.ginIndex);
      const ginFound = !!ginRow && ginRow.amname === 'gin';

      fts.push({
        table: target.table,
        searchVector,
        generated,
        ginIndex: target.ginIndex,
        ginFound,
      });

      if (!searchVector) {
        errors.push(`Missing search_vector column on ${target.table}`);
      } else if (!generated) {
        errors.push(`search_vector not generated on ${target.table}`);
      } else {
        messages.push(
          `${target.table}.search_vector: generated: true; type=${col?.data_type ?? 'tsvector'}`
        );
      }

      if (!ginFound) {
        errors.push(`no GIN index: ${target.ginIndex}`);
      } else {
        messages.push(`${target.ginIndex}: gin index exists`);
      }
    }

    // ── Covering btree ─────────────────────────────────────────────────────
    const covering: IndexesVerifyResult['covering'] = [];
    for (const expected of COVERING_BTREE_INDEXES) {
      const row = byName.get(expected.name);
      const found = !!row && (row.amname === 'btree' || row.amname === 'gin');
      covering.push({
        name: expected.name,
        table: expected.table,
        accessMethod: row?.amname ?? 'missing',
        found,
      });
      if (!row) {
        errors.push(`covering index not found: ${expected.name}`);
      } else if (row.tablename !== expected.table) {
        errors.push(`${expected.name}: expected table ${expected.table}, got ${row.tablename}`);
      } else {
        messages.push(`${expected.name}: access method: ${row.amname}`);
      }
    }

    const ok = errors.length === 0;
    if (ok) {
      messages.push('all HNSW/GIN/btree indexes found');
      messages.push('passages_embedding_hnsw');
      for (const h of HNSW_INDEXES) {
        if (h.name !== 'passages_embedding_hnsw') messages.push(h.name);
      }
      messages.push('documents_search_vector_gin');
      messages.push('sources_search_vector_gin');
    }

    return {
      ok,
      hnsw,
      fts,
      covering,
      ivfflatFound,
      messages,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
