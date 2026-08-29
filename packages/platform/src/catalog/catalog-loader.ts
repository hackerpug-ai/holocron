/**
 * Parse + type the committed Convex source catalog YAML into a validated model.
 * Shared by catalog:verify / coverage / merges / reconcile / assets.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const APPROVED_DISPOSITIONS = [
  'preserve',
  'merge',
  'drop',
  'regenerate',
  'archive',
] as const;

export type Disposition = (typeof APPROVED_DISPOSITIONS)[number];

export interface CatalogFieldEntry {
  disposition: Disposition;
  target: string | null;
  transform: string;
  expected_target_formula: string;
  owner: string;
  approval: string;
  fk_rewrites: unknown[];
  exclusions: unknown[];
  checksum_or_sample: string | null;
  frozen_fixture?: string;
  reason?: string;
}

export interface CatalogTableEntry {
  disposition: Disposition;
  target: string | null;
  transform: string;
  expected_target_formula: string;
  owner: string;
  approval: string;
  reason?: string;
  fk_rewrites: unknown[];
  exclusions: unknown[];
  checksum_or_sample: string | null;
  frozen_fixture?: string;
  discriminator_field?: string;
  discriminator_value?: string;
  fields: Record<string, CatalogFieldEntry>;
}

export interface CatalogStorageRef {
  disposition: Disposition;
  target: string | null;
  transform: string;
  expected_target_formula: string;
  reason?: string;
  owner: string;
  approval: string;
  checksum_or_sample: string | null;
  frozen_fixture?: string;
  fk_rewrites: unknown[];
  exclusions: unknown[];
}

export interface SystemExclusion {
  name: string;
  disposition: Disposition;
  reason: string;
  approval: string;
  owner: string;
}

export interface MergeGroup {
  description: string;
  sources: string[];
  targets: string[];
  discriminators: Record<string, string>;
  approval: string;
}

export interface SourceCatalog {
  version: string;
  catalog_id: string;
  owner_default: string;
  approval_default: string;
  table_count_expected: number;
  storage_ref_count_expected: number;
  system_exclusions: SystemExclusion[];
  merges: {
    business: MergeGroup;
    research: MergeGroup;
  };
  storage_refs: Record<string, CatalogStorageRef>;
  tables: Record<string, CatalogTableEntry>;
}

export function defaultCatalogPath(cwd = process.cwd()): string {
  return resolve(
    cwd,
    '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
  );
}

function isDisposition(value: unknown): value is Disposition {
  return typeof value === 'string' && (APPROVED_DISPOSITIONS as readonly string[]).includes(value);
}

function assertNonEmpty(value: unknown, label: string): string {
  // YAML may parse bare 0 as a number — coerce formulas/approvals carefully.
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`catalog validation: ${label} must be a non-empty string`);
  }
  return value;
}

/**
 * Load and validate a source catalog YAML from disk.
 * Parses with the `yaml` package (real file I/O — never a canned map).
 */
export function loadCatalog(catalogPath: string): SourceCatalog {
  const abs = resolve(catalogPath);
  const raw = readFileSync(abs, 'utf8');
  const parsed = (parseYaml(raw) ?? {}) as Record<string, unknown>;

  if (!parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error(`catalog validation: missing tables map in ${abs}`);
  }
  if (!parsed.storage_refs || typeof parsed.storage_refs !== 'object') {
    throw new Error(`catalog validation: missing storage_refs map in ${abs}`);
  }
  if (!parsed.merges || typeof parsed.merges !== 'object') {
    throw new Error(`catalog validation: missing merges in ${abs}`);
  }

  const tables: Record<string, CatalogTableEntry> = {};
  for (const [name, entry] of Object.entries(
    parsed.tables as Record<string, Record<string, unknown>>
  )) {
    if (!isDisposition(entry.disposition)) {
      throw new Error(
        `catalog validation: table ${name} has invalid disposition ${String(entry.disposition)}`
      );
    }
    const owner = assertNonEmpty(entry.owner, `table ${name}.owner`);
    const approval = assertNonEmpty(entry.approval, `table ${name}.approval`);
    const formula = assertNonEmpty(
      entry.expected_target_formula,
      `table ${name}.expected_target_formula`
    );
    const fieldsIn = (entry.fields ?? {}) as Record<string, Record<string, unknown>>;
    const fields: Record<string, CatalogFieldEntry> = {};
    for (const [fname, fentry] of Object.entries(fieldsIn)) {
      if (!isDisposition(fentry.disposition)) {
        throw new Error(`catalog validation: field ${name}.${fname} has invalid disposition`);
      }
      fields[fname] = {
        disposition: fentry.disposition,
        target: (fentry.target as string | null) ?? null,
        transform: String(fentry.transform ?? 'identity'),
        expected_target_formula: assertNonEmpty(
          fentry.expected_target_formula,
          `field ${name}.${fname}.expected_target_formula`
        ),
        owner: assertNonEmpty(fentry.owner, `field ${name}.${fname}.owner`),
        approval: assertNonEmpty(fentry.approval, `field ${name}.${fname}.approval`),
        fk_rewrites: (fentry.fk_rewrites as unknown[]) ?? [],
        exclusions: (fentry.exclusions as unknown[]) ?? [],
        checksum_or_sample: (fentry.checksum_or_sample as string | null) ?? null,
        frozen_fixture: fentry.frozen_fixture as string | undefined,
        reason: fentry.reason as string | undefined,
      };
    }
    tables[name] = {
      disposition: entry.disposition,
      target: (entry.target as string | null) ?? null,
      transform: String(entry.transform ?? 'identity'),
      expected_target_formula: formula,
      owner,
      approval,
      reason: entry.reason as string | undefined,
      fk_rewrites: (entry.fk_rewrites as unknown[]) ?? [],
      exclusions: (entry.exclusions as unknown[]) ?? [],
      checksum_or_sample: (entry.checksum_or_sample as string | null) ?? null,
      frozen_fixture: entry.frozen_fixture as string | undefined,
      discriminator_field: entry.discriminator_field as string | undefined,
      discriminator_value: entry.discriminator_value as string | undefined,
      fields,
    };
  }

  const storage_refs: Record<string, CatalogStorageRef> = {};
  for (const [ref, entry] of Object.entries(
    parsed.storage_refs as Record<string, Record<string, unknown>>
  )) {
    if (!isDisposition(entry.disposition)) {
      throw new Error(`catalog validation: storage ref ${ref} invalid disposition`);
    }
    storage_refs[ref] = {
      disposition: entry.disposition,
      target: (entry.target as string | null) ?? null,
      transform: String(entry.transform ?? 'identity'),
      expected_target_formula: assertNonEmpty(
        entry.expected_target_formula,
        `storage_refs.${ref}.expected_target_formula`
      ),
      reason: entry.reason as string | undefined,
      owner: assertNonEmpty(entry.owner, `storage_refs.${ref}.owner`),
      approval: assertNonEmpty(entry.approval, `storage_refs.${ref}.approval`),
      checksum_or_sample: (entry.checksum_or_sample as string | null) ?? null,
      frozen_fixture: entry.frozen_fixture as string | undefined,
      fk_rewrites: (entry.fk_rewrites as unknown[]) ?? [],
      exclusions: (entry.exclusions as unknown[]) ?? [],
    };
  }

  const mergesRaw = parsed.merges as Record<string, Record<string, unknown>>;
  const loadMerge = (key: string): MergeGroup => {
    const m = mergesRaw[key];
    if (!m) throw new Error(`catalog validation: missing merges.${key}`);
    return {
      description: String(m.description ?? ''),
      sources: (m.sources as string[]) ?? [],
      targets: (m.targets as string[]) ?? [],
      discriminators: (m.discriminators as Record<string, string>) ?? {},
      approval: assertNonEmpty(m.approval, `merges.${key}.approval`),
    };
  };

  const system_exclusions = ((parsed.system_exclusions as SystemExclusion[]) ?? []).map((e) => ({
    name: assertNonEmpty(e.name, 'system_exclusion.name'),
    disposition: isDisposition(e.disposition) ? e.disposition : ('archive' as Disposition),
    reason: String(e.reason ?? ''),
    approval: assertNonEmpty(e.approval, `system_exclusion ${e.name}.approval`),
    owner: assertNonEmpty(e.owner, `system_exclusion ${e.name}.owner`),
  }));

  return {
    version: String(parsed.version ?? '1'),
    catalog_id: String(parsed.catalog_id ?? '12-convex-source-catalog'),
    owner_default: String(parsed.owner_default ?? ''),
    approval_default: String(parsed.approval_default ?? ''),
    table_count_expected: Number(parsed.table_count_expected ?? 60),
    storage_ref_count_expected: Number(parsed.storage_ref_count_expected ?? 6),
    system_exclusions,
    merges: {
      business: loadMerge('business'),
      research: loadMerge('research'),
    },
    storage_refs,
    tables,
  };
}

export function listTableNames(catalog: SourceCatalog): string[] {
  return Object.keys(catalog.tables).sort();
}
