/**
 * db:verify — merge collapse and schema integrity checks against live Postgres.
 */
import { createSql } from './client';
import { resolveDatabaseUrl } from './index';
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
