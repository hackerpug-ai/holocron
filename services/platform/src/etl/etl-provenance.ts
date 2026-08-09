/**
 * S31-CX-06 — Fail-closed ETL provenance verifier.
 *
 * Reads gate records from disk, extracts claimed evidence paths and row counts,
 * and refuses (ok:false) when any required surviving artifact is absent.
 *
 * Never hardcodes a pass list: every claim is opened and checked on the filesystem.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';

export type EtlProvenanceViolation = {
  path: string;
  reason: string;
  gate: string;
};

export type EtlProvenanceRecordSummary = {
  gate_path: string;
  claimed_paths: string[];
  claimed_stage_row_count: number | null;
  missing_paths: string[];
};

export type EtlProvenanceReport = {
  ok: boolean;
  records_inspected: number;
  violations: EtlProvenanceViolation[];
  records: EtlProvenanceRecordSummary[];
  message: string;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Resolve a gate-relative or repo-relative path against the repo root. */
export function resolveEvidencePath(repoRoot: string, raw: string): string {
  if (isAbsolute(raw)) return raw;
  return resolve(repoRoot, raw);
}

/**
 * Collect evidence paths that a gate record claims must exist.
 * Reads from:
 *   - evidence[] (string entries)
 *   - evidence.required_surviving_artifacts[]
 *   - claims[].evidence_path
 *   - steps[].evidence / steps[].log (string)
 *   - primary_evidence_path
 *   - real_archive
 * Explicitly skips evidence.ephemeral_not_retained (honest absence).
 */
export function extractClaimedEvidencePaths(gate: unknown): string[] {
  if (!isObject(gate)) return [];
  const out = new Set<string>();

  const push = (raw: unknown) => {
    const s = asString(raw);
    if (s) out.add(s);
  };

  // Top-level evidence array (legacy Sprint 14 shape) — treated as required claims
  // unless the restatement moved them under ephemeral_not_retained.
  if (Array.isArray(gate.evidence)) {
    for (const entry of gate.evidence) push(entry);
  } else if (isObject(gate.evidence)) {
    const required = gate.evidence.required_surviving_artifacts;
    if (Array.isArray(required)) {
      for (const entry of required) push(entry);
    }
    // Do not treat ephemeral_not_retained as required.
    // surviving_committed are in-sprint relative filenames; only check if they look like paths with separators
    // or are absolute — local basenames like gate-results.json live next to the gate and are not corpus artifacts.
  }

  if (Array.isArray(gate.claims)) {
    for (const claim of gate.claims) {
      if (!isObject(claim)) continue;
      push(claim.evidence_path);
      push(claim.evidence);
      push(claim.path);
    }
  }

  if (Array.isArray(gate.steps)) {
    for (const step of gate.steps) {
      if (!isObject(step)) continue;
      push(step.evidence);
      push(step.log);
      // Multi-path evidence strings separated by "; " (Sprint 14 plan style)
      const e = asString(step.evidence);
      if (e?.includes(';')) {
        for (const part of e.split(';')) push(part.trim());
      }
    }
  }

  push(gate.primary_evidence_path);
  push(gate.real_archive);

  if (isObject(gate.restatement) && isObject(gate.restatement.full_corpus_primary)) {
    push(gate.restatement.full_corpus_primary.evidence_pointer);
  }

  return [...out];
}

/** Best-effort read of stageRowCount / claimed counts from the gate JSON body. */
export function extractClaimedStageRowCount(gate: unknown): number | null {
  if (!isObject(gate)) return null;
  const direct =
    asNumber(gate.stageRowCount) ??
    asNumber(gate.stage_row_count) ??
    (isObject(gate.restatement) ? asNumber(gate.restatement.stageRowCount) : null);
  if (direct !== null) return direct;

  // Fall back to parsing step summaries: stageRowCount=104
  if (Array.isArray(gate.steps)) {
    for (const step of gate.steps) {
      if (!isObject(step)) continue;
      const summary = asString(step.summary) ?? '';
      const m = summary.match(/stageRowCount\s*=\s*(\d+)/i);
      if (m?.[1]) return Number(m[1]);
    }
  }
  return null;
}

export function inspectGateRecord(options: {
  gatePath: string;
  repoRoot?: string;
}): EtlProvenanceRecordSummary & { violations: EtlProvenanceViolation[] } {
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const gatePath = resolve(options.gatePath);
  if (!existsSync(gatePath)) {
    return {
      gate_path: gatePath,
      claimed_paths: [],
      claimed_stage_row_count: null,
      missing_paths: [],
      violations: [
        {
          path: gatePath,
          reason: 'gate record file itself is absent',
          gate: gatePath,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(gatePath, 'utf8')) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      gate_path: gatePath,
      claimed_paths: [],
      claimed_stage_row_count: null,
      missing_paths: [],
      violations: [
        {
          path: gatePath,
          reason: `gate record is not valid JSON: ${msg}`,
          gate: gatePath,
        },
      ],
    };
  }

  const claimed = extractClaimedEvidencePaths(parsed);
  const stageRowCount = extractClaimedStageRowCount(parsed);
  const missing: string[] = [];
  const violations: EtlProvenanceViolation[] = [];

  for (const raw of claimed) {
    // Relative basenames without a path separator refer to sibling gate docs — resolve next to gate.
    const abs =
      !raw.includes('/') && !raw.includes('\\')
        ? resolve(gatePath, '..', raw)
        : resolveEvidencePath(repoRoot, raw);

    if (!existsSync(abs)) {
      missing.push(raw);
      violations.push({
        path: raw,
        reason: `missing artifact (resolved: ${abs})`,
        gate: gatePath,
      });
      continue;
    }
    // Open the artifact (file or directory) so the check is not a path-string stub.
    try {
      statSync(abs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      missing.push(raw);
      violations.push({
        path: raw,
        reason: `artifact unreadable: ${msg}`,
        gate: gatePath,
      });
    }
  }

  return {
    gate_path: gatePath,
    claimed_paths: claimed,
    claimed_stage_row_count: stageRowCount,
    missing_paths: missing,
    violations,
  };
}

/**
 * Verify one or more gate records. Fail-closed: any missing claimed artifact ⇒ ok:false.
 * Empty gate list ⇒ ok:false (empty verifier is a violation of the negative control).
 */
export function verifyEtlProvenance(options?: {
  repoRoot?: string;
  gatePaths?: string[];
}): EtlProvenanceReport {
  const repoRoot = options?.repoRoot ?? resolveRepoRoot();
  const gatePaths = options?.gatePaths ?? [];

  if (gatePaths.length === 0) {
    return {
      ok: false,
      records_inspected: 0,
      violations: [
        {
          path: '',
          reason: 'no gate records provided — refuse empty verification',
          gate: '',
        },
      ],
      records: [],
      message: 'holo verify:etl-provenance — FAIL (0 gate records inspected)',
    };
  }

  const records: EtlProvenanceRecordSummary[] = [];
  const violations: EtlProvenanceViolation[] = [];

  for (const gatePath of gatePaths) {
    const inspected = inspectGateRecord({ gatePath, repoRoot });
    records.push({
      gate_path: inspected.gate_path,
      claimed_paths: inspected.claimed_paths,
      claimed_stage_row_count: inspected.claimed_stage_row_count,
      missing_paths: inspected.missing_paths,
    });
    violations.push(...inspected.violations);
  }

  const ok = violations.length === 0;
  return {
    ok,
    records_inspected: records.length,
    violations,
    records,
    message: ok
      ? `holo verify:etl-provenance — OK (${records.length} gate record(s))`
      : `holo verify:etl-provenance — FAIL (${violations.length} violation(s); ${records.length} record(s) inspected)`,
  };
}

export function formatEtlProvenanceText(report: EtlProvenanceReport): string {
  const lines: string[] = [report.message, `  records_inspected: ${report.records_inspected}`];
  for (const rec of report.records) {
    lines.push(`  gate: ${rec.gate_path}`);
    lines.push(`    claimed_paths: ${rec.claimed_paths.length}`);
    if (rec.claimed_stage_row_count !== null) {
      lines.push(`    claimed_stage_row_count: ${rec.claimed_stage_row_count}`);
    }
    for (const m of rec.missing_paths) {
      lines.push(`    MISSING: ${m}`);
    }
  }
  for (const v of report.violations) {
    lines.push(`  violation: ${v.path} — ${v.reason}`);
  }
  lines.push(`  status: ${report.ok ? 'OK' : 'FAIL'}`);
  return lines.join('\n');
}
