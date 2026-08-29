/**
 * catalog:coverage — per-field + per-storage-ref mapping with owner + approval.
 */
import type { SourceCatalog } from './catalog-loader';
import { REQUIRED_STORAGE_REFS } from './verify';

export interface CoverageFieldRow {
  surface: string;
  disposition: string;
  target: string | null;
  owner: string;
  approval: string;
}

export interface CoverageReport {
  fields: CoverageFieldRow[];
  storage_refs: CoverageFieldRow[];
  unmapped: string[];
  ok: boolean;
}

export function buildCoverageReport(catalog: SourceCatalog): CoverageReport {
  const fields: CoverageFieldRow[] = [];
  const storage_refs: CoverageFieldRow[] = [];
  const unmapped: string[] = [];

  for (const [tname, entry] of Object.entries(catalog.tables)) {
    for (const [fname, fentry] of Object.entries(entry.fields ?? {})) {
      const surface = `${tname}.${fname}`;
      const row: CoverageFieldRow = {
        surface,
        disposition: fentry.disposition,
        target: fentry.target,
        owner: fentry.owner,
        approval: fentry.approval,
      };
      fields.push(row);
      if (!fentry.disposition || !fentry.owner?.trim() || !fentry.approval?.trim()) {
        unmapped.push(surface);
      }
    }
  }

  for (const required of REQUIRED_STORAGE_REFS) {
    const entry = catalog.storage_refs[required];
    if (!entry) {
      unmapped.push(required);
      storage_refs.push({
        surface: required,
        disposition: '',
        target: null,
        owner: '',
        approval: '',
      });
      continue;
    }
    const row: CoverageFieldRow = {
      surface: required,
      disposition: entry.disposition,
      target: entry.target,
      owner: entry.owner,
      approval: entry.approval,
    };
    storage_refs.push(row);
    if (!entry.disposition || !entry.owner?.trim() || !entry.approval?.trim()) {
      unmapped.push(required);
    }
    if (entry.disposition !== 'drop' && !entry.checksum_or_sample) {
      unmapped.push(`${required} (missing checksum_or_sample)`);
    }
  }
  // include any additional storage_refs present in catalog
  for (const [ref, entry] of Object.entries(catalog.storage_refs)) {
    if ((REQUIRED_STORAGE_REFS as readonly string[]).includes(ref)) continue;
    storage_refs.push({
      surface: ref,
      disposition: entry.disposition,
      target: entry.target,
      owner: entry.owner,
      approval: entry.approval,
    });
  }

  // sort for stable output
  fields.sort((a, b) => a.surface.localeCompare(b.surface));
  storage_refs.sort((a, b) => a.surface.localeCompare(b.surface));

  return {
    fields,
    storage_refs,
    unmapped,
    ok: unmapped.length === 0 && storage_refs.length >= 6,
  };
}

export function formatCoverageText(report: CoverageReport): string {
  const lines: string[] = [
    '# catalog:coverage',
    `fields_mapped: ${report.fields.length}`,
    `storage_refs: ${report.storage_refs.length}/6`,
    '',
    '## fields',
  ];
  for (const f of report.fields) {
    lines.push(`${f.surface} → ${f.disposition} owner=${f.owner} approval=${f.approval}`);
  }
  lines.push('');
  lines.push('## storage_refs');
  for (const s of report.storage_refs) {
    lines.push(
      `${s.surface} → ${s.disposition} owner=${s.owner} approval=${s.approval} target=${s.target ?? 'null'}`
    );
  }
  if (report.unmapped.length) {
    lines.push('');
    lines.push('## unmapped');
    for (const u of report.unmapped) {
      lines.push(`- unmapped: ${u}`);
    }
  }
  lines.push('');
  lines.push(report.ok ? 'status: OK' : 'status: FAIL');
  return lines.join('\n');
}
