/** Sprint 14 FK / NULL audit over migrated legacy-id relationships. */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from '../db/client.ts';
import { loadLatestRunContext } from './latest-run.ts';
import { loadTableColumns, resolveTargetColumnName, type TableColumns } from './metadata.ts';
import {
  classifyEdgeConstraintEligibility,
  DEFAULT_REFERENTIAL_EDGES_ARTIFACT,
  type EdgeConstraintExclusionReason,
  extractReferentialEdges,
  loadReferentialEdgesArtifact,
  type ReferentialEdge,
  type ReferentialEdgesReport,
} from './referential-edges.ts';

export interface FkAuditIssue {
  table: string;
  legacyId: string;
  column: string;
  expected: string;
  actual: string | null;
  reason: 'missing_id_map' | 'mismatch';
}

export type UnenforcedEdge = {
  sourceTable: string;
  sourceField: string;
  referencedTable: string;
  target: string;
};

/** Schema edges that cannot host ordinary Postgres FK constraints. */
export type ExcludedEdge = UnenforcedEdge & {
  reason: EdgeConstraintExclusionReason;
};

export interface FkAuditReport {
  ok: boolean;
  orphans: number;
  checkedRelationships: number;
  enforcedForeignKeys: number;
  /** Constraint-eligible edges lacking a matching DB FK constraint. */
  unenforcedEdges: UnenforcedEdge[];
  /**
   * Edges excluded from FK enforcement (storage refs, nested JSONB, array ids)
   * with an explicit reason so the gate stays honest without being impossible.
   */
  excludedFromEnforcement: ExcludedEdge[];
  edgeCount: number;
  issues: FkAuditIssue[];
}

async function getColumnsCached(
  sql: Sql,
  cache: Map<string, TableColumns>,
  tableName: string
): Promise<TableColumns> {
  const cached = cache.get(tableName);
  if (cached) return cached;
  const loaded = await loadTableColumns(sql, tableName);
  cache.set(tableName, loaded);
  return loaded;
}

async function fetchActualValue(
  sql: Sql,
  tableName: string,
  column: string,
  rowId: string
): Promise<string | null> {
  const rows = await sql.unsafe<Array<{ value: string | null }>>(
    `SELECT "${column.replace(/"/g, '""')}"::text AS value FROM "${tableName.replace(/"/g, '""')}" WHERE "id" = $1::uuid`,
    [rowId]
  );
  return rows[0]?.value ?? null;
}

async function loadEnforcedFkColumns(sql: Sql): Promise<Set<string>> {
  const rows = await sql<Array<{ table_name: string; column_name: string }>>`
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
  `;
  return new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
}

function loadEdgeSet(options?: {
  catalogPath?: string;
  edgesArtifactPath?: string;
  repoRoot?: string;
}): ReferentialEdgesReport {
  const repoRoot = resolve(options?.repoRoot ?? process.cwd());
  const schemaPath = resolve(repoRoot, 'convex/schema.ts');
  const artifactPath = resolve(
    options?.edgesArtifactPath ?? resolve(repoRoot, DEFAULT_REFERENTIAL_EDGES_ARTIFACT)
  );

  // Prefer live schema extract when convex/schema.ts is present so a planted
  // empty/stub artifact cannot collapse the gate to edgeCount:0 / ok:true.
  if (existsSync(schemaPath)) {
    try {
      return extractReferentialEdges({
        catalogPath: options?.catalogPath,
        repoRoot,
        schemaPath,
      });
    } catch {
      // fall through to durable artifact (post-decommission / schema unreadable)
    }
  }

  if (existsSync(artifactPath)) {
    // Integrity checks throw on empty/mismatched/non-derived artifacts (fail-closed).
    return loadReferentialEdgesArtifact(artifactPath);
  }

  return extractReferentialEdges({
    catalogPath: options?.catalogPath,
    repoRoot,
  });
}

function partitionEdgesForEnforcement(edges: readonly ReferentialEdge[]): {
  eligible: ReferentialEdge[];
  excluded: ExcludedEdge[];
} {
  const eligible: ReferentialEdge[] = [];
  const excluded: ExcludedEdge[] = [];
  const seenExcluded = new Set<string>();
  for (const edge of edges) {
    const classification = classifyEdgeConstraintEligibility(edge);
    if (classification.eligible) {
      eligible.push(edge);
      continue;
    }
    const key = `${edge.target}:${classification.reason}`;
    if (seenExcluded.has(key)) continue;
    seenExcluded.add(key);
    excluded.push({
      sourceTable: edge.sourceTable,
      sourceField: edge.sourceField,
      referencedTable: edge.referencedTable,
      target: edge.target,
      reason: classification.reason ?? 'nested_jsonb',
    });
  }
  return { eligible, excluded };
}

function computeUnenforcedEdges(
  edges: readonly ReferentialEdge[],
  enforcedColumns: Set<string>
): UnenforcedEdge[] {
  const seen = new Set<string>();
  const unenforced: UnenforcedEdge[] = [];
  for (const edge of edges) {
    const key = edge.target;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!enforcedColumns.has(key)) {
      unenforced.push({
        sourceTable: edge.sourceTable,
        sourceField: edge.sourceField,
        referencedTable: edge.referencedTable,
        target: edge.target,
      });
    }
  }
  return unenforced;
}

export async function runFkAudit(options?: {
  databaseUrl?: string;
  exportDir?: string | null;
  catalogPath?: string;
  sql?: Sql;
  edgesArtifactPath?: string;
  repoRoot?: string;
}): Promise<FkAuditReport> {
  if (options?.sql) {
    throw new Error('runFkAudit does not accept caller-owned sql yet');
  }
  const ctx = await loadLatestRunContext({
    databaseUrl: options?.databaseUrl,
    exportDir: options?.exportDir,
    catalogPath: options?.catalogPath,
  });
  const { sql, catalog, archive } = ctx;
  try {
    const mapRows = await sql<Array<{ old_id: string; new_id: string }>>`
      SELECT old_id, new_id FROM convex_id_map
    `;
    const idMap = new Map(mapRows.map((row) => [row.old_id, row.new_id]));
    const sourceLegacyIds = new Set(archive.rows.map((row) => row.legacyId));
    const columnCache = new Map<string, TableColumns>();
    const issues: FkAuditIssue[] = [];
    let checkedRelationships = 0;

    for (const row of archive.rows) {
      const entry = catalog.tables[row.sourceTable];
      if (!entry?.target) continue;
      const rowId = idMap.get(row.legacyId);
      if (!rowId) {
        issues.push({
          table: entry.target,
          legacyId: row.legacyId,
          column: 'id',
          expected: row.legacyId,
          actual: null,
          reason: 'missing_id_map',
        });
        continue;
      }
      const columns = await getColumnsCached(sql, columnCache, entry.target);

      for (const [sourceField, fieldEntry] of Object.entries(entry.fields)) {
        const rawValue = row.rowJson[sourceField];
        if (sourceField === '_id' || sourceField === '_creationTime') continue;
        if (typeof rawValue !== 'string' || rawValue.length === 0) continue;
        if (!fieldEntry.target || fieldEntry.target.startsWith('content_addressed_blobs.')) {
          continue;
        }

        const [, rawTargetColumn] = fieldEntry.target.split('.', 2);
        if (!rawTargetColumn) {
          throw new Error(
            `etl: malformed target for ${row.sourceTable}.${sourceField}: ${fieldEntry.target}`
          );
        }
        const resolvedColumn = resolveTargetColumnName(columns, rawTargetColumn, sourceField);
        if (!resolvedColumn || resolvedColumn === 'legacy_convex_id') continue;

        const column = columns.get(resolvedColumn);
        const isUuidColumn = column?.udtName === 'uuid' || column?.dataType === 'uuid';
        const nameLooksLikeReference =
          sourceField.endsWith('Id') ||
          rawTargetColumn.endsWith('Id') ||
          rawTargetColumn.endsWith('_id') ||
          resolvedColumn.endsWith('Id') ||
          resolvedColumn.endsWith('_id');
        const refersToKnownLegacyId = sourceLegacyIds.has(rawValue) || idMap.has(rawValue);
        const looksLikeLegacyReference =
          ((fieldEntry.fk_rewrites as unknown[])?.length ?? 0) > 0 ||
          (nameLooksLikeReference && (isUuidColumn || refersToKnownLegacyId));
        if (!looksLikeLegacyReference) continue;

        checkedRelationships += 1;
        const expected = idMap.get(rawValue);
        if (!expected) {
          issues.push({
            table: entry.target,
            legacyId: row.legacyId,
            column: resolvedColumn,
            expected: rawValue,
            actual: null,
            reason: 'missing_id_map',
          });
          continue;
        }

        const actual = await fetchActualValue(sql, entry.target, resolvedColumn, rowId);
        if (actual !== expected) {
          issues.push({
            table: entry.target,
            legacyId: row.legacyId,
            column: resolvedColumn,
            expected,
            actual,
            reason: 'mismatch',
          });
        }
      }
    }

    const fkRows = await sql<Array<{ count: string }>>`
      SELECT count(*)::text AS count
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'
    `;
    const enforcedForeignKeys = Number(fkRows[0]?.count ?? 0);

    // S31-CX-04: gate ok on the schema-derived edge set, not issues.length alone.
    const edgeReport = loadEdgeSet({
      catalogPath: options?.catalogPath,
      edgesArtifactPath: options?.edgesArtifactPath,
      repoRoot: options?.repoRoot,
    });
    if (edgeReport.edgeCount === 0 || edgeReport.edges.length === 0) {
      throw new Error('fk-audit: referential edge set is empty — refuse closed');
    }
    const enforcedColumns = await loadEnforcedFkColumns(sql);
    const { eligible, excluded } = partitionEdgesForEnforcement(edgeReport.edges);
    const unenforcedEdges = computeUnenforcedEdges(eligible, enforcedColumns);

    return {
      ok: issues.length === 0 && unenforcedEdges.length === 0,
      orphans: issues.length,
      checkedRelationships,
      enforcedForeignKeys,
      unenforcedEdges,
      excludedFromEnforcement: excluded,
      edgeCount: edgeReport.edgeCount,
      issues,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
