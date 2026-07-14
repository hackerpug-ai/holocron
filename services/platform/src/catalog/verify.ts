/**
 * Coverage build-gate: catalog:verify fails closed on any unmapped table/field/storage ref.
 * Cross-checks the catalog against the export's actual surface (not a self-referential key count).
 */
import { APPROVED_DISPOSITIONS, type SourceCatalog } from './catalog-loader';
import type { ConvexExport } from './export-reader';

export interface VerifyIssue {
  kind: 'table' | 'field' | 'storage_ref' | 'export_unaccounted' | 'system';
  surface: string;
  message: string;
}

export interface VerifyReport {
  tables_approved: number;
  tables_total: number;
  storage_refs_approved: number;
  storage_refs_total: number;
  fields_mapped: number;
  fields_total: number;
  export_tables_unaccounted: string[];
  issues: VerifyIssue[];
  per_table: Array<{
    table: string;
    disposition: string;
    expected_target_formula: string;
    owner: string;
    approval: string;
  }>;
  ok: boolean;
}

/** Canonical 6 storage refs from convex/schema.ts — gate fails if any is absent. */
export const REQUIRED_STORAGE_REFS = [
  'audioSegments.storageId',
  'videoTranscripts.storageId',
  'audioTranscripts.storageId',
  'improvementImages.storageId',
  'voiceSessions.audioStorageId',
  'audioTranscriptJobs.audioStorageId',
] as const;

export function buildVerifyReport(catalog: SourceCatalog, exp: ConvexExport | null): VerifyReport {
  const issues: VerifyIssue[] = [];
  const per_table: VerifyReport['per_table'] = [];
  const catalogTableNames = Object.keys(catalog.tables);
  const expectedTableTotal = catalog.table_count_expected || 60;

  let tablesApproved = 0;
  let fieldsMapped = 0;
  let fieldsTotal = 0;

  for (const name of catalogTableNames.sort()) {
    const entry = catalog.tables[name];
    if (!entry) continue;
    const dispositionOk = (APPROVED_DISPOSITIONS as readonly string[]).includes(entry.disposition);
    const ownerOk = Boolean(entry.owner?.trim());
    const approvalOk = Boolean(entry.approval?.trim());
    const formulaOk = Boolean(entry.expected_target_formula?.trim());
    if (!dispositionOk) {
      issues.push({
        kind: 'table',
        surface: name,
        message: `table ${name}: invalid or missing disposition`,
      });
    }
    if (!ownerOk) {
      issues.push({
        kind: 'table',
        surface: name,
        message: `table ${name}: blank owner`,
      });
    }
    if (!approvalOk) {
      issues.push({
        kind: 'table',
        surface: name,
        message: `table ${name}: blank approval`,
      });
    }
    if (!formulaOk) {
      issues.push({
        kind: 'table',
        surface: name,
        message: `table ${name}: missing expected-target formula`,
      });
    }
    if (dispositionOk && ownerOk && approvalOk && formulaOk) {
      tablesApproved += 1;
    }
    per_table.push({
      table: name,
      disposition: entry.disposition,
      expected_target_formula: entry.expected_target_formula,
      owner: entry.owner,
      approval: entry.approval,
    });

    for (const [fname, fentry] of Object.entries(entry.fields ?? {})) {
      fieldsTotal += 1;
      const fOk =
        (APPROVED_DISPOSITIONS as readonly string[]).includes(fentry.disposition) &&
        Boolean(fentry.owner?.trim()) &&
        Boolean(fentry.approval?.trim());
      if (!fOk) {
        issues.push({
          kind: 'field',
          surface: `${name}.${fname}`,
          message: `unmapped field: ${name}.${fname} (missing disposition/owner/approval)`,
        });
      } else {
        fieldsMapped += 1;
      }
    }
  }

  // Storage refs — require the canonical 6, not merely "whatever is present"
  const storageEntries = Object.entries(catalog.storage_refs);
  let storageApproved = 0;
  for (const required of REQUIRED_STORAGE_REFS) {
    const entry = catalog.storage_refs[required];
    if (!entry) {
      issues.push({
        kind: 'storage_ref',
        surface: required,
        message: `unmapped storage ref: ${required}`,
      });
      continue;
    }
    const ok =
      (APPROVED_DISPOSITIONS as readonly string[]).includes(entry.disposition) &&
      Boolean(entry.owner?.trim()) &&
      Boolean(entry.approval?.trim());
    if (!ok) {
      issues.push({
        kind: 'storage_ref',
        surface: required,
        message: `unmapped storage ref: ${required}`,
      });
      continue;
    }
    if (entry.disposition !== 'drop' && !entry.checksum_or_sample) {
      issues.push({
        kind: 'storage_ref',
        surface: required,
        message: `retained storage ref ${required} missing checksum_or_sample`,
      });
      continue;
    }
    storageApproved += 1;
  }
  // Any extra storage_refs with blank disposition still fail
  for (const [ref, entry] of storageEntries) {
    if ((REQUIRED_STORAGE_REFS as readonly string[]).includes(ref)) continue;
    if (
      !(APPROVED_DISPOSITIONS as readonly string[]).includes(entry.disposition) ||
      !entry.owner?.trim() ||
      !entry.approval?.trim()
    ) {
      issues.push({
        kind: 'storage_ref',
        surface: ref,
        message: `unmapped storage ref: ${ref}`,
      });
    }
  }

  // Cross-check export surface
  const exportUnaccounted: string[] = [];
  if (exp) {
    const catalogSet = new Set(catalogTableNames);
    const systemExcluded = new Set(catalog.system_exclusions.map((e) => e.name));
    for (const tname of Object.keys(exp.tables)) {
      if (!catalogSet.has(tname) && !systemExcluded.has(tname)) {
        exportUnaccounted.push(tname);
        issues.push({
          kind: 'export_unaccounted',
          surface: tname,
          message: `unmapped table: ${tname}`,
        });
      }
    }
    // System dirs must be excluded or dispositioned
    for (const sys of exp.systemDirs) {
      if (!systemExcluded.has(sys) && !catalogSet.has(sys)) {
        // _storage is expected as system exclusion
        issues.push({
          kind: 'system',
          surface: sys,
          message: `export system dir ${sys} has no versioned exclusion`,
        });
        exportUnaccounted.push(sys);
      }
    }
  }

  // Catalog tables missing when export present: if export has the table set as
  // completeness surface, every catalog table is still "approved" as a design
  // entry; verify also fails if export has tables the catalog lacks (above).
  // If a catalog table is deleted, tablesApproved drops and/or export tables
  // that remain still map — the missing entry is detected by count < expected
  // AND by any export table whose catalog entry was removed:
  if (exp) {
    for (const tname of Object.keys(exp.tables)) {
      if (!catalog.tables[tname] && !catalog.system_exclusions.some((e) => e.name === tname)) {
        // already recorded as unaccounted
      }
    }
  }

  // Fail if we don't have the expected table count approved
  if (tablesApproved < expectedTableTotal) {
    // identify catalog holes vs expected 60 by comparing to export when available
    if (exp) {
      for (const tname of Object.keys(exp.tables).sort()) {
        if (!catalog.tables[tname]) {
          // already in exportUnaccounted
        }
      }
    }
  }

  const storageExpected = catalog.storage_ref_count_expected || 6;
  const ok =
    issues.length === 0 &&
    tablesApproved >= expectedTableTotal &&
    storageApproved >= storageExpected &&
    exportUnaccounted.length === 0 &&
    fieldsMapped === fieldsTotal;

  return {
    tables_approved: tablesApproved,
    tables_total: expectedTableTotal,
    storage_refs_approved: storageApproved,
    storage_refs_total: storageExpected,
    fields_mapped: fieldsMapped,
    fields_total: fieldsTotal,
    export_tables_unaccounted: exportUnaccounted,
    issues,
    per_table,
    ok,
  };
}

export function formatVerifyText(report: VerifyReport): string {
  const lines: string[] = [
    '# catalog:verify',
    `tables: ${report.tables_approved}/${report.tables_total} approved`,
    `storage refs: ${report.storage_refs_approved}/${report.storage_refs_total} approved`,
    `fields: ${report.fields_mapped}/${report.fields_total} mapped`,
    `export tables unaccounted: ${report.export_tables_unaccounted.length}`,
    '',
  ];
  for (const t of report.per_table) {
    lines.push(
      `${t.table}: disposition=${t.disposition} formula=${t.expected_target_formula} owner=${t.owner} approval=${t.approval}`
    );
  }
  if (report.issues.length) {
    lines.push('');
    lines.push('## issues');
    for (const issue of report.issues) {
      lines.push(`- ${issue.message}`);
    }
  }
  lines.push('');
  lines.push(
    report.ok
      ? `${report.tables_approved}/${report.tables_total} tables approved`
      : `FAIL: ${report.tables_approved}/${report.tables_total} tables approved; ${report.export_tables_unaccounted.length} export tables unaccounted`
  );
  if (report.export_tables_unaccounted.length === 0 && report.ok) {
    lines.push('0 export tables unaccounted');
  }
  return lines.join('\n');
}
