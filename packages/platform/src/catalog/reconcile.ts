/**
 * Reconciliation report: per-table source count, expected-target formula, approved exceptions, variance.
 * Green only at zero unexplained variance.
 */
import type { SourceCatalog } from './catalog-loader';
import type { ConvexExport } from './export-reader';

export interface ReconcileTableRow {
  table: string;
  source_count: number;
  expected_target: number;
  expected_target_formula: string;
  variance: number;
  disposition: string;
  approved_exception: boolean;
  exception_reason?: string;
  unexplained: boolean;
}

export interface ReconcileException {
  kind: 'merge' | 'drop' | 'regenerate' | 'archive' | 'unmapped_export_table';
  name: string;
  approved: boolean;
  detail: string;
}

export interface ReconcileReport {
  tables: ReconcileTableRow[];
  exceptions: ReconcileException[];
  unexplained_variance: number;
  merge_targets: {
    analysis_sessions_expected: number;
    research_sessions_expected: number;
  };
  ok: boolean;
}

function evalFormula(formula: string, sourceCount: number): number {
  const f = formula.trim().replace(/^["']|["']$/g, '');
  if (f === 'count(source)' || f === 'source_count' || f === 'count(*)') {
    return sourceCount;
  }
  if (f === '0') return 0;
  if (f === 'count(source_objects)') return sourceCount;
  if (/^\d+$/.test(f)) return Number(f);
  // default: identity
  return sourceCount;
}

export function buildReconcileReport(catalog: SourceCatalog, exp: ConvexExport): ReconcileReport {
  const exceptions: ReconcileException[] = [];
  const rows: ReconcileTableRow[] = [];
  let unexplained = 0;

  // Approved merge exceptions
  exceptions.push({
    kind: 'merge',
    name: 'business 12→3 analysis_*',
    approved: true,
    detail: `sources=${catalog.merges.business.sources.join(',')} targets=${catalog.merges.business.targets.join(',')} approval=${catalog.merges.business.approval}`,
  });
  exceptions.push({
    kind: 'merge',
    name: 'research 5→3 research_*',
    approved: true,
    detail: `sources=${catalog.merges.research.sources.join(',')} targets=${catalog.merges.research.targets.join(',')} approval=${catalog.merges.research.approval}`,
  });

  const catalogTables = new Set(Object.keys(catalog.tables));
  const systemExcluded = new Set(catalog.system_exclusions.map((e) => e.name));

  for (const [name, entry] of Object.entries(catalog.tables)) {
    const sourceCount = exp.tables[name]?.rowCount ?? 0;
    const expected = evalFormula(entry.expected_target_formula, sourceCount);
    const rawVariance = sourceCount - expected;
    const isApprovedDrop =
      entry.disposition === 'drop' ||
      entry.disposition === 'regenerate' ||
      entry.disposition === 'archive';
    const isApprovedMerge = entry.disposition === 'merge';
    const approved_exception = isApprovedDrop || isApprovedMerge;
    // For drop: expected is 0, rawVariance = sourceCount — approved, not unexplained
    // For preserve/merge with identity formula: variance 0
    let unexpl = false;
    let variance = rawVariance;
    if (isApprovedDrop) {
      variance = 0; // approved exception folds loss out of unexplained
      exceptions.push({
        kind:
          entry.disposition === 'drop'
            ? 'drop'
            : entry.disposition === 'regenerate'
              ? 'regenerate'
              : 'archive',
        name,
        approved: true,
        detail: `disposition=${entry.disposition} approval=${entry.approval} source_count=${sourceCount} expected_target=0`,
      });
    } else if (isApprovedMerge) {
      // merge members: expected = source_count via identity formula; variance 0
      variance = sourceCount - expected;
      if (variance !== 0) {
        unexpl = true;
        unexplained += Math.abs(variance);
      }
    } else {
      if (variance !== 0) {
        unexpl = true;
        unexplained += Math.abs(variance);
      }
    }

    rows.push({
      table: name,
      source_count: sourceCount,
      expected_target: isApprovedDrop ? 0 : expected,
      expected_target_formula: entry.expected_target_formula,
      variance,
      disposition: entry.disposition,
      approved_exception,
      exception_reason: approved_exception ? (entry.reason ?? entry.disposition) : undefined,
      unexplained: unexpl,
    });
  }

  // Export tables not in catalog and not system-excluded → unexplained variance
  for (const [name, table] of Object.entries(exp.tables)) {
    if (catalogTables.has(name)) continue;
    if (systemExcluded.has(name)) continue;
    const sourceCount = table.rowCount;
    unexplained += sourceCount;
    exceptions.push({
      kind: 'unmapped_export_table',
      name,
      approved: false,
      detail: `export table ${name} has ${sourceCount} rows with no catalog entry (unexplained)`,
    });
    rows.push({
      table: name,
      source_count: sourceCount,
      expected_target: 0,
      expected_target_formula: '0',
      variance: sourceCount,
      disposition: 'unmapped',
      approved_exception: false,
      exception_reason: undefined,
      unexplained: true,
    });
  }

  // Merge target expected sums
  const sumSources = (names: string[]) =>
    names.reduce((acc, n) => acc + (exp.tables[n]?.rowCount ?? 0), 0);

  const analysisSessionsSources = catalog.merges.business.sources.filter((s) =>
    /Sessions$/.test(s)
  );
  // Prefer the 4 session tables explicitly
  const session4 = [
    'revenueValidationSessions',
    'competitiveAnalysisSessions',
    'aiRoiSessions',
    'flightsSessions',
  ];
  const researchSession2 = ['researchSessions', 'deepResearchSessions'];

  return {
    tables: rows.sort((a, b) => a.table.localeCompare(b.table)),
    exceptions,
    unexplained_variance: unexplained,
    merge_targets: {
      analysis_sessions_expected: sumSources(
        analysisSessionsSources.length ? analysisSessionsSources : session4
      ),
      research_sessions_expected: sumSources(researchSession2),
    },
    ok: unexplained === 0,
  };
}

export function formatReconcileText(report: ReconcileReport): string {
  const lines: string[] = ['# catalog:reconcile', ''];
  for (const row of report.tables) {
    const flag = row.unexplained
      ? ` variance=${row.variance} (unexplained)`
      : ` variance=${row.variance}`;
    lines.push(
      `${row.table}: source=${row.source_count} expected=${row.expected_target}${flag} disposition=${row.disposition}${row.approved_exception ? ' approved_exception' : ''}`
    );
  }
  lines.push('');
  lines.push('## approved exceptions');
  for (const ex of report.exceptions.filter((e) => e.approved)) {
    lines.push(`- [${ex.kind}] ${ex.name}: ${ex.detail}`);
  }
  const unapproved = report.exceptions.filter((e) => !e.approved);
  if (unapproved.length) {
    lines.push('');
    lines.push('## unapproved / unexplained');
    for (const ex of unapproved) {
      lines.push(`- [${ex.kind}] ${ex.name}: ${ex.detail}`);
    }
  }
  lines.push('');
  lines.push(`analysis_sessions expected=${report.merge_targets.analysis_sessions_expected}`);
  lines.push(`research_sessions expected=${report.merge_targets.research_sessions_expected}`);
  lines.push(`unexplained_variance: ${report.unexplained_variance}`);
  lines.push(report.ok ? 'status: OK' : 'status: FAIL');
  return lines.join('\n');
}
