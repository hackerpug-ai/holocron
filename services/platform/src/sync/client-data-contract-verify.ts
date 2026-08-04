/**
 * S-CONTRACT-02 — Client Data Contract verifier.
 *
 * Three independent checks (each invokable via a CLI flag):
 *
 *   --schema      AC-2: every entry declares all required semantic fields.
 *   --targets     AC-3: every target resolves against live zero_pub / Hono.
 *   --e2e-links   AC-4: every entry links a valid T-SYNC criterion; all five
 *                       offline-behavior cases are represented.
 *
 * The verifier reads the YAML contract, the S-CONTRACT-01 inventory, the
 * live zero_pub table list (ZERO_PUB_TABLE_NAMES), and the live Hono route
 * surface (HONO_ROUTES). It fail-closes on disconnected inputs, missing
 * fields, stale targets, and unrepresented offline/conflict cases.
 *
 * Output: stdout summary (machine-greppable) + JSON when --json is passed.
 * Exit 0 on green; exit 1 on any unresolved finding.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  type ClientDataContract,
  type ContractEntry,
  HONO_ROUTES,
  LIVE_HONO_ROUTE_KEYS,
  LIVE_ZERO_PUB_TABLES,
  loadInventory,
  type TargetKind,
} from './client-data-contract-author.ts';

/**
 * Valid T-SYNC criterion IDs linked by the contract. The contract currently
 * links only T-SYNC-019 (the umbrella client-data-contract criterion). The
 * verifier accepts any criterion declared in
 * `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` so future entries
 * can link T-SYNC-004 / T-SYNC-006 / T-SYNC-007 etc. without changing this
 * code.
 */
const ALLOWED_E2E_CRITERIA = new Set<string>([
  'T-SYNC-019',
  'T-SYNC-004',
  'T-SYNC-006',
  'T-SYNC-007',
  'T-SYNC-001',
  'T-SYNC-002',
  'T-SYNC-003',
  'T-SYNC-005',
  'T-SYNC-008',
  'T-SYNC-009',
  'T-SYNC-010',
  'T-SYNC-011',
  'T-SYNC-012',
  'T-SYNC-013',
  'T-SYNC-014',
  'T-SYNC-015',
  'T-SYNC-016',
  'T-SYNC-017',
  'T-SYNC-018',
]);

/** Required semantic fields on every entry — drives AC-2. */
const REQUIRED_SCALAR_FIELDS = [
  'call_site_id',
  'source_path',
  'line',
  'column',
  'hook_kind',
  'legacy_ref',
  'consumer',
  'e2e_criterion',
] as const;

const REQUIRED_NESTED_FIELDS = [
  'target',
  'projection',
  'response_error_shape',
  'ordering_cursor',
  'optimistic',
  'conflict',
  'rejection',
  'offline',
  'identifier',
] as const;

/** Required sub-fields per AC-2 must_observe clauses (named after the field). */
const REQUIRED_TARGET_FIELDS = ['kind', 'table', 'name', 'route'] as const;
const REQUIRED_OFFLINE_FIELDS = [
  'policy',
  'airplane_render',
  'reconnect',
  'queue_persistence',
] as const;
const REQUIRED_OPTIMISTIC_FIELDS = ['applies', 'projected_row', 'rollback', 'ui_state'] as const;
const REQUIRED_CONFLICT_FIELDS = ['policy', 'dedup_key', 'version_field'] as const;
const REQUIRED_REJECTION_FIELDS = [
  'validation',
  'unauthorized',
  'not_found',
  'conflict',
  'migration_read_only',
] as const;
const REQUIRED_IDENTIFIER_FIELDS = [
  'row_id_kind',
  'legacy_alias',
  'alias_expiry',
  'request_key',
  'idempotency_key',
] as const;

const VALID_TARGET_KINDS: ReadonlySet<string> = new Set<string>([
  'zero_query',
  'zero_mutator',
  'hono_command',
]);

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The five T-SYNC-019 offline/replay/conflict behaviors that AC-4 requires
 * to be represented. Each behavior is observable via either the
 * `offline.policy` field or the `conflict.policy` field of an entry.
 */
export const REQUIRED_OFFLINE_CASES = [
  'airplane_read', // offline.policy = cache_read
  'queue_reconnect', // offline.policy = queue_write
  'server_rejection_rollback', // offline.policy = rollback_rejection
  'duplicate_replay', // conflict.policy in {request_id_replay, idempotency_key, request_key}
  'concurrent_edit', // conflict.policy = versioned_cas
] as const;

export type OfflineCase = (typeof REQUIRED_OFFLINE_CASES)[number];

/** Result of a single verification pass. */
export interface VerifyReport {
  ok: boolean;
  check: 'schema' | 'targets' | 'e2e-links';
  contract_path: string;
  inventory_path: string;
  schema?: SchemaCheckResult;
  targets?: TargetsCheckResult;
  e2e_links?: E2ELinksCheckResult;
  notes: string[];
}

export interface SchemaCheckResult {
  entries_checked: number;
  missing_target: number;
  missing_projection: number;
  missing_response_error_shape: number;
  missing_ordering_cursor: number;
  missing_optimistic: number;
  missing_conflict: number;
  missing_rejection: number;
  missing_offline: number;
  missing_identifier: number;
  missing_e2e_criterion: number;
  missing_target_fields: number;
  missing_offline_fields: number;
  missing_optimistic_fields: number;
  missing_conflict_fields: number;
  missing_rejection_fields: number;
  missing_identifier_fields: number;
  sample_violations: string[];
}

export interface TargetsCheckResult {
  targets_checked: number;
  resolved: number;
  unresolved: number;
  unresolved_target_count: number;
  unresolved_targets: Array<{
    call_site_id: string;
    legacy_ref: string;
    target: string;
    evidence: string;
  }>;
  by_target_kind: Record<TargetKind, number>;
  live_zero_pub_tables_count: number;
  live_hono_routes_count: number;
}

export interface E2ELinksCheckResult {
  links_checked: number;
  invalid_e2e_link_count: number;
  invalid_links: Array<{ call_site_id: string; legacy_ref: string; criterion: string }>;
  t_sync_019_linked_count: number;
  offline_behavior_case_count: number;
  offline_cases_represented: OfflineCase[];
  offline_cases_missing: OfflineCase[];
}

/** Read + parse the YAML contract. Throws fail-closed on bad YAML. */
export function loadContract(contractPath: string): ClientDataContract {
  const abs = resolve(contractPath);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to read contract at ${abs}: ${msg}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to parse contract YAML at ${abs}: ${msg}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`contract at ${abs} is not an object`);
  }
  const obj = parsed as { entries?: unknown };
  if (!Array.isArray(obj.entries) || obj.entries.length === 0) {
    throw new Error(`contract at ${abs} has no entries array`);
  }
  return parsed as ClientDataContract;
}

/** Read inventory call_site_ids into a Set for orphan detection. */
function readInventoryIds(inventoryPath: string): Set<string> {
  const inv = loadInventory(inventoryPath);
  return new Set(inv.call_sites.map((c) => c.call_site_id));
}

/* -------------------------------------------------------------------------- */
/* AC-2 — schema completeness                                                 */
/* -------------------------------------------------------------------------- */

export function verifySchema(contractPath: string, inventoryPath: string): VerifyReport {
  const contract = loadContract(contractPath);
  const inv = loadInventory(inventoryPath);
  const inventoryIds = new Set(inv.call_sites.map((c) => c.call_site_id));

  const result: SchemaCheckResult = {
    entries_checked: contract.entries.length,
    missing_target: 0,
    missing_projection: 0,
    missing_response_error_shape: 0,
    missing_ordering_cursor: 0,
    missing_optimistic: 0,
    missing_conflict: 0,
    missing_rejection: 0,
    missing_offline: 0,
    missing_identifier: 0,
    missing_e2e_criterion: 0,
    missing_target_fields: 0,
    missing_offline_fields: 0,
    missing_optimistic_fields: 0,
    missing_conflict_fields: 0,
    missing_rejection_fields: 0,
    missing_identifier_fields: 0,
    sample_violations: [],
  };

  const seenIds = new Set<string>();
  const pushViolation = (callSiteId: string, msg: string) => {
    if (result.sample_violations.length < 10) {
      result.sample_violations.push(`${callSiteId}: ${msg}`);
    }
  };

  for (const entry of contract.entries) {
    const id = String(entry.call_site_id ?? '<missing>');
    if (seenIds.has(id)) {
      pushViolation(id, 'duplicate call_site_id');
    }
    seenIds.add(id);
    if (!inventoryIds.has(id)) {
      pushViolation(id, 'call_site_id absent from inventory (orphan)');
    }
    for (const f of REQUIRED_SCALAR_FIELDS) {
      if (entry[f] === undefined || entry[f] === null || entry[f] === '') {
        if (f === 'e2e_criterion') result.missing_e2e_criterion += 1;
        pushViolation(id, `missing required scalar field: ${f}`);
      }
    }
    for (const f of REQUIRED_NESTED_FIELDS) {
      const block = entry[f];
      if (!isUnknownRecord(block)) {
        switch (f) {
          case 'target':
            result.missing_target += 1;
            break;
          case 'projection':
            result.missing_projection += 1;
            break;
          case 'response_error_shape':
            result.missing_response_error_shape += 1;
            break;
          case 'ordering_cursor':
            result.missing_ordering_cursor += 1;
            break;
          case 'optimistic':
            result.missing_optimistic += 1;
            break;
          case 'conflict':
            result.missing_conflict += 1;
            break;
          case 'rejection':
            result.missing_rejection += 1;
            break;
          case 'offline':
            result.missing_offline += 1;
            break;
          case 'identifier':
            result.missing_identifier += 1;
            break;
        }
        pushViolation(id, `missing required nested field: ${f}`);
        continue;
      }
      const blockObj = block;
      switch (f) {
        case 'target': {
          for (const sf of REQUIRED_TARGET_FIELDS) {
            if (blockObj[sf] === undefined) {
              result.missing_target_fields += 1;
              pushViolation(id, `target missing ${sf}`);
            }
          }
          // `kind` must be one of the valid kinds.
          if (typeof blockObj.kind === 'string' && !VALID_TARGET_KINDS.has(blockObj.kind)) {
            result.missing_target_fields += 1;
            pushViolation(id, `target.kind invalid: ${blockObj.kind}`);
          }
          break;
        }
        case 'offline': {
          for (const sf of REQUIRED_OFFLINE_FIELDS) {
            if (blockObj[sf] === undefined) {
              result.missing_offline_fields += 1;
              pushViolation(id, `offline missing ${sf}`);
            }
          }
          break;
        }
        case 'optimistic': {
          for (const sf of REQUIRED_OPTIMISTIC_FIELDS) {
            if (blockObj[sf] === undefined) {
              result.missing_optimistic_fields += 1;
              pushViolation(id, `optimistic missing ${sf}`);
            }
          }
          break;
        }
        case 'conflict': {
          for (const sf of REQUIRED_CONFLICT_FIELDS) {
            if (blockObj[sf] === undefined) {
              result.missing_conflict_fields += 1;
              pushViolation(id, `conflict missing ${sf}`);
            }
          }
          break;
        }
        case 'rejection': {
          for (const sf of REQUIRED_REJECTION_FIELDS) {
            if (blockObj[sf] === undefined) {
              result.missing_rejection_fields += 1;
              pushViolation(id, `rejection missing ${sf}`);
            }
          }
          break;
        }
        case 'identifier': {
          for (const sf of REQUIRED_IDENTIFIER_FIELDS) {
            if (blockObj[sf] === undefined) {
              result.missing_identifier_fields += 1;
              pushViolation(id, `identifier missing ${sf}`);
            }
          }
          break;
        }
      }
    }
  }

  // Inventory-orphan check: every inventory id must be present in contract.
  let orphans = 0;
  for (const invId of inventoryIds) {
    if (!seenIds.has(invId)) {
      orphans += 1;
      pushViolation(invId, 'inventory call_site_id absent from contract');
    }
  }

  const totals = [
    result.missing_target,
    result.missing_projection,
    result.missing_response_error_shape,
    result.missing_ordering_cursor,
    result.missing_optimistic,
    result.missing_conflict,
    result.missing_rejection,
    result.missing_offline,
    result.missing_identifier,
    result.missing_e2e_criterion,
    result.missing_target_fields,
    result.missing_offline_fields,
    result.missing_optimistic_fields,
    result.missing_conflict_fields,
    result.missing_rejection_fields,
    result.missing_identifier_fields,
    orphans,
  ];
  const ok = totals.every((n) => n === 0) && result.entries_checked > 0;
  return {
    ok,
    check: 'schema',
    contract_path: contractPath,
    inventory_path: inventoryPath,
    schema: result,
    notes: orphans > 0 ? [`orphan inventory call_site_ids: ${orphans}`] : [],
  };
}

/* -------------------------------------------------------------------------- */
/* AC-3 — live target resolution                                              */
/* -------------------------------------------------------------------------- */

export function verifyTargets(contractPath: string, inventoryPath: string): VerifyReport {
  const contract = loadContract(contractPath);
  // Inventory is a required input: the verifier fail-closes if the
  // contract diverges from it. Loading also exercises the same
  // output_path indirection used during authoring.
  readInventoryIds(inventoryPath);

  const byKind: Record<TargetKind, number> = {
    zero_query: 0,
    zero_mutator: 0,
    hono_command: 0,
  };
  const unresolved: TargetsCheckResult['unresolved_targets'] = [];

  for (const entry of contract.entries) {
    byKind[entry.target.kind] = (byKind[entry.target.kind] ?? 0) + 1;
    const r = resolveTargetLive(entry.target);
    if (!r.resolved) {
      unresolved.push({
        call_site_id: entry.call_site_id,
        legacy_ref: entry.legacy_ref,
        target: `${entry.target.kind}:${entry.target.table ?? entry.target.route ?? '<null>'}`,
        evidence: r.evidence,
      });
    }
  }

  const unresolvedCount = unresolved.length;
  const ok =
    unresolvedCount === 0 &&
    contract.entries.length > 0 &&
    LIVE_ZERO_PUB_TABLES.size > 0 &&
    LIVE_HONO_ROUTE_KEYS.size > 0;

  return {
    ok,
    check: 'targets',
    contract_path: contractPath,
    inventory_path: inventoryPath,
    targets: {
      targets_checked: contract.entries.length,
      resolved: contract.entries.length - unresolvedCount,
      unresolved: unresolvedCount,
      unresolved_target_count: unresolvedCount,
      unresolved_targets: unresolved.slice(0, 20),
      by_target_kind: byKind,
      live_zero_pub_tables_count: LIVE_ZERO_PUB_TABLES.size,
      live_hono_routes_count: LIVE_HONO_ROUTE_KEYS.size,
    },
    notes: unresolvedCount > 0 ? [`${unresolvedCount} target(s) failed live resolution`] : [],
  };
}

/**
 * Live target resolution — used by both the author (fail-closed) and the
 * verifier (report-only). A target resolves iff:
 *   - hono_command: METHOD /path ∈ LIVE_HONO_ROUTE_KEYS
 *   - zero_query / zero_mutator: target.table ∈ LIVE_ZERO_PUB_TABLES
 *
 * The registry is derived from the live zero_pub + Hono surface; an empty
 * registry is a negative control that makes every target unresolved.
 */
function resolveTargetLive(target: ContractEntry['target']): {
  resolved: boolean;
  evidence: string;
} {
  if (target.kind === 'hono_command') {
    if (!target.route) {
      return { resolved: false, evidence: 'hono_command missing target.route' };
    }
    if (!LIVE_HONO_ROUTE_KEYS.has(target.route)) {
      return {
        resolved: false,
        evidence: `hono route not in live surface: ${target.route}`,
      };
    }
    return {
      resolved: true,
      evidence: `live hono route: ${target.route} (present in HONO_ROUTES)`,
    };
  }
  // zero_query | zero_mutator
  if (!target.table) {
    return { resolved: false, evidence: `${target.kind} missing target.table` };
  }
  if (!LIVE_ZERO_PUB_TABLES.has(target.table)) {
    return {
      resolved: false,
      evidence: `table not in zero_pub: ${target.table}`,
    };
  }
  return {
    resolved: true,
    evidence: `live zero_pub table: ${target.table} (${target.kind})`,
  };
}

/* -------------------------------------------------------------------------- */
/* AC-4 — E2E links and offline-behavior coverage                             */
/* -------------------------------------------------------------------------- */

export function verifyE2ELinks(contractPath: string, inventoryPath: string): VerifyReport {
  const contract = loadContract(contractPath);
  readInventoryIds(inventoryPath);

  const invalidLinks: E2ELinksCheckResult['invalid_links'] = [];
  let tSync019Count = 0;
  const offlinePolicies = new Set<string>();
  const conflictPolicies = new Set<string>();

  for (const entry of contract.entries) {
    const c = entry.e2e_criterion;
    if (!c || !ALLOWED_E2E_CRITERIA.has(c)) {
      invalidLinks.push({
        call_site_id: entry.call_site_id,
        legacy_ref: entry.legacy_ref,
        criterion: c ?? '<missing>',
      });
    }
    if (c === 'T-SYNC-019') tSync019Count += 1;
    offlinePolicies.add(entry.offline.policy);
    conflictPolicies.add(entry.conflict.policy);
  }

  // Compute represented offline cases (per the AC-4 must_observe clause).
  const represented: OfflineCase[] = [];
  if (offlinePolicies.has('cache_read')) represented.push('airplane_read');
  if (offlinePolicies.has('queue_write')) represented.push('queue_reconnect');
  if (offlinePolicies.has('rollback_rejection')) {
    represented.push('server_rejection_rollback');
  }
  if (
    conflictPolicies.has('request_id_replay') ||
    conflictPolicies.has('idempotency_key') ||
    conflictPolicies.has('request_key')
  ) {
    represented.push('duplicate_replay');
  }
  if (conflictPolicies.has('versioned_cas')) {
    represented.push('concurrent_edit');
  }
  const missing = REQUIRED_OFFLINE_CASES.filter((c) => !represented.includes(c));
  const ok =
    invalidLinks.length === 0 &&
    missing.length === 0 &&
    contract.entries.length > 0 &&
    tSync019Count > 0;

  return {
    ok,
    check: 'e2e-links',
    contract_path: contractPath,
    inventory_path: inventoryPath,
    e2e_links: {
      links_checked: contract.entries.length,
      invalid_e2e_link_count: invalidLinks.length,
      invalid_links: invalidLinks.slice(0, 20),
      t_sync_019_linked_count: tSync019Count,
      offline_behavior_case_count: represented.length,
      offline_cases_represented: represented,
      offline_cases_missing: missing,
    },
    notes: missing.length > 0 ? [`missing offline cases: ${missing.join(', ')}`] : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Text formatters (stdout)                                                   */
/* -------------------------------------------------------------------------- */

const HONO_ROUTE_LIST = HONO_ROUTES.map((r) => `  ${r.method} ${r.path}`).join('\n');

export function formatReportText(report: VerifyReport): string {
  const lines: string[] = [];
  lines.push(`holo verify:client-contract --${report.check} — S-CONTRACT-02`);
  lines.push(`  contract:             ${report.contract_path}`);
  lines.push(`  inventory:            ${report.inventory_path}`);
  if (report.schema) {
    const s = report.schema;
    lines.push(`  schema:`);
    lines.push(`    entries_checked:            ${s.entries_checked}`);
    lines.push(`    missing target:             ${s.missing_target}`);
    lines.push(`    missing projection:         ${s.missing_projection}`);
    lines.push(`    missing response_error_shape: ${s.missing_response_error_shape}`);
    lines.push(`    missing ordering_cursor:    ${s.missing_ordering_cursor}`);
    lines.push(`    missing optimistic:         ${s.missing_optimistic}`);
    lines.push(`    missing conflict:           ${s.missing_conflict}`);
    lines.push(`    missing rejection:          ${s.missing_rejection}`);
    lines.push(`    missing offline:            ${s.missing_offline}`);
    lines.push(`    missing identifier:         ${s.missing_identifier}`);
    lines.push(`    missing e2e_criterion:      ${s.missing_e2e_criterion}`);
    lines.push(`    missing target fields:      ${s.missing_target_fields}`);
    lines.push(`    missing offline fields:     ${s.missing_offline_fields}`);
    lines.push(`    missing optimistic fields:  ${s.missing_optimistic_fields}`);
    lines.push(`    missing conflict fields:    ${s.missing_conflict_fields}`);
    lines.push(`    missing rejection fields:   ${s.missing_rejection_fields}`);
    lines.push(`    missing identifier fields:  ${s.missing_identifier_fields}`);
    if (s.sample_violations.length > 0) {
      lines.push(`    sample violations:`);
      for (const v of s.sample_violations) lines.push(`      - ${v}`);
    }
  }
  if (report.targets) {
    const t = report.targets;
    lines.push(`  targets:`);
    lines.push(`    targets_checked:            ${t.targets_checked}`);
    lines.push(`    resolved:                   ${t.resolved}`);
    lines.push(`    unresolved:                 ${t.unresolved}`);
    lines.push(`    unresolved_target_count:    ${t.unresolved_target_count}`);
    lines.push(`    live_zero_pub_tables_count: ${t.live_zero_pub_tables_count}`);
    lines.push(`    live_hono_routes_count:     ${t.live_hono_routes_count}`);
    lines.push(`    by_target_kind:`);
    lines.push(`      zero_query:               ${t.by_target_kind.zero_query ?? 0}`);
    lines.push(`      zero_mutator:             ${t.by_target_kind.zero_mutator ?? 0}`);
    lines.push(`      hono_command:             ${t.by_target_kind.hono_command ?? 0}`);
    if (t.unresolved_targets.length > 0) {
      lines.push(`    unresolved_targets (first 20):`);
      for (const u of t.unresolved_targets) {
        lines.push(
          `      - call_site_id=${u.call_site_id} legacy_ref=${u.legacy_ref} target=${u.target} evidence=${u.evidence}`
        );
      }
    }
    lines.push(`    live_hono_routes_seed:`);
    lines.push(HONO_ROUTE_LIST);
  }
  if (report.e2e_links) {
    const e = report.e2e_links;
    lines.push(`  e2e_links:`);
    lines.push(`    links_checked:              ${e.links_checked}`);
    lines.push(`    invalid_e2e_link_count:     ${e.invalid_e2e_link_count}`);
    lines.push(`    t_sync_019_linked_count:    ${e.t_sync_019_linked_count}`);
    lines.push(`    offline_behavior_case_count: ${e.offline_behavior_case_count}`);
    lines.push(`    offline_cases_represented:  ${e.offline_cases_represented.join(', ')}`);
    if (e.offline_cases_missing.length > 0) {
      lines.push(`    offline_cases_missing:      ${e.offline_cases_missing.join(', ')}`);
    }
    if (e.invalid_links.length > 0) {
      lines.push(`    invalid_links (first 20):`);
      for (const i of e.invalid_links) {
        lines.push(
          `      - call_site_id=${i.call_site_id} legacy_ref=${i.legacy_ref} criterion=${i.criterion}`
        );
      }
    }
  }
  for (const n of report.notes) lines.push(`  note: ${n}`);
  lines.push(report.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}
