/**
 * catalog:merges — prove business 12→3 and research 5→3 with no per-domain shells.
 */
import type { SourceCatalog } from './catalog-loader';

const FORBIDDEN_SHELL_PATTERNS = [
  /^revenue_validation_/,
  /^competitive_analysis_/,
  /^ai_roi_/,
  /^deep_research_/,
  /^flights_sessions$/,
  /^revenue_validation_sessions$/,
  /^deep_research_sessions$/,
];

export interface MergesReport {
  business: {
    source_count: number;
    target_count: number;
    sources: string[];
    targets: string[];
    discriminators: Record<string, string>;
  };
  research: {
    source_count: number;
    target_count: number;
    sources: string[];
    targets: string[];
    discriminators: Record<string, string>;
  };
  per_domain_shell_targets: string[];
  ok: boolean;
  issues: string[];
}

export function buildMergesReport(catalog: SourceCatalog): MergesReport {
  const issues: string[] = [];
  const business = catalog.merges.business;
  const research = catalog.merges.research;

  if (business.sources.length !== 12) {
    issues.push(`business sources expected 12, got ${business.sources.length}`);
  }
  if (business.targets.length !== 3) {
    issues.push(`business targets expected 3 analysis_*, got ${business.targets.length}`);
  }
  if (research.sources.length !== 5) {
    issues.push(`research sources expected 5, got ${research.sources.length}`);
  }
  if (research.targets.length !== 3) {
    issues.push(`research targets expected 3 research_*, got ${research.targets.length}`);
  }

  // Verify each merge source has disposition=merge and a discriminator
  for (const src of [...business.sources, ...research.sources]) {
    const entry = catalog.tables[src];
    if (!entry) {
      issues.push(`merge source ${src} missing from catalog tables`);
      continue;
    }
    if (entry.disposition !== 'merge') {
      issues.push(`merge source ${src} disposition=${entry.disposition}, expected merge`);
    }
    if (!entry.discriminator_field || !entry.discriminator_value) {
      issues.push(`merge source ${src} missing discriminator`);
    }
  }

  // Collect all targets from merge sources + merges block
  const allTargets = new Set<string>();
  for (const t of business.targets) allTargets.add(t);
  for (const t of research.targets) allTargets.add(t);
  for (const src of [...business.sources, ...research.sources]) {
    const entry = catalog.tables[src];
    if (entry?.target) allTargets.add(entry.target);
  }

  const shellTargets: string[] = [];
  for (const t of allTargets) {
    for (const re of FORBIDDEN_SHELL_PATTERNS) {
      if (re.test(t)) {
        shellTargets.push(t);
        issues.push(`per-domain shell target survives: ${t}`);
      }
    }
  }

  // analysis_* / research_* counts
  const analysisTargets = [...allTargets].filter((t) => t.startsWith('analysis_'));
  const researchTargets = [...allTargets].filter((t) => t.startsWith('research_'));
  if (analysisTargets.length > 3) {
    issues.push(`more than 3 analysis_* targets: ${analysisTargets.join(',')}`);
  }
  if (researchTargets.length > 3) {
    issues.push(`more than 3 research_* targets: ${researchTargets.join(',')}`);
  }

  // research must use system discriminator
  if (research.discriminators.research_sessions !== 'system') {
    issues.push('research_sessions discriminator must be system');
  }

  const ok =
    issues.length === 0 &&
    shellTargets.length === 0 &&
    business.sources.length === 12 &&
    business.targets.length === 3 &&
    research.sources.length === 5 &&
    research.targets.length === 3;

  return {
    business: {
      source_count: business.sources.length,
      target_count: business.targets.length,
      sources: business.sources,
      targets: business.targets,
      discriminators: business.discriminators,
    },
    research: {
      source_count: research.sources.length,
      target_count: research.targets.length,
      sources: research.sources,
      targets: research.targets,
      discriminators: research.discriminators,
    },
    per_domain_shell_targets: shellTargets,
    ok,
    issues,
  };
}

export function formatMergesText(report: MergesReport): string {
  const lines: string[] = [
    '# catalog:merges',
    `business: ${report.business.source_count} → ${report.business.target_count} (${report.business.targets.join(', ')})`,
    `research: ${report.research.source_count} → ${report.research.target_count} (system discriminator)`,
    `per_domain_shell_targets: ${report.per_domain_shell_targets.length}`,
    '',
    '## business sources → targets',
  ];
  for (const s of report.business.sources) {
    lines.push(`- ${s}`);
  }
  lines.push(`targets: ${report.business.targets.join(', ')}`);
  lines.push(`discriminators: ${JSON.stringify(report.business.discriminators)}`);
  lines.push('');
  lines.push('## research sources → targets');
  for (const s of report.research.sources) {
    lines.push(`- ${s}`);
  }
  lines.push(`targets: ${report.research.targets.join(', ')}`);
  lines.push(`discriminators: ${JSON.stringify(report.research.discriminators)}`);
  if (report.issues.length) {
    lines.push('');
    lines.push('## issues');
    for (const i of report.issues) lines.push(`- ${i}`);
  }
  lines.push('');
  lines.push(report.ok ? 'status: OK' : 'status: FAIL');
  return lines.join('\n');
}
