/**
 * S31-08 — Machine-readable registry of cutover/migration verifiers.
 *
 * Every registered verifier carries a committed negative_control fixture path
 * so human-gate step 8 (and the sprint31-verifier-teeth suite) can seed one
 * synthetic violation and prove the command exits non-zero with a named reason.
 *
 * A gate that cannot fail is theatre, not a gate.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type GateRegistryEntry = {
  /** Stable id — unique across the registry. */
  id: string;
  /** holo CLI command token (e.g. catalog:assets). */
  command: string;
  /** Human-readable purpose. */
  description: string;
  /** Named violation class the negative control must surface. */
  violation_class: string;
  /**
   * Repo-relative path to the committed negative-control fixture directory.
   * Must exist on disk; the integration suite materializes the seed from it.
   */
  negative_control: string;
};

export type GateRegistryReport = {
  ok: boolean;
  entries: Array<
    GateRegistryEntry & {
      negative_control_abs: string;
      fixture_exists: boolean;
    }
  >;
  issues: string[];
};

/** Canonical cutover verifier set — extend, never silently drop. */
export const GATE_REGISTRY: readonly GateRegistryEntry[] = [
  {
    id: 'catalog-assets',
    command: 'catalog:assets',
    description: 'Per-object retained storage inventory (sha256/bytes/mime on disk)',
    violation_class: 'MISSING_BLOB',
    negative_control: 'packages/platform/tests/fixtures/verifier-teeth/assets_missing_blob',
  },
  {
    id: 'mcp-verify-rehost',
    command: 'mcp:verify-rehost',
    description: 'Postgres MCP registry parity + zero throw-only executor cases',
    violation_class: 'THROW_ONLY_CASE',
    negative_control: 'packages/platform/tests/fixtures/verifier-teeth/rehost_throw_only',
  },
  {
    id: 'catalog-reconcile',
    command: 'catalog:reconcile',
    description: 'Per-table source vs expected-target; zero unexplained variance',
    violation_class: 'UNEXPLAINED_VARIANCE',
    negative_control: 'packages/platform/tests/fixtures/verifier-teeth/reconcile_planted_variance',
  },
  {
    id: 'verify-no-shells',
    command: 'verify:no-shells',
    description: 'Prove per-domain pipeline shells are gone',
    violation_class: 'SHELL_RESIDUE',
    negative_control: 'packages/platform/tests/fixtures/verifier-teeth/no_shells_residue',
  },
  {
    id: 'etl-fk-audit',
    command: 'etl:fk-audit',
    description: 'Migrated relationship + referential-edge constraint audit',
    violation_class: 'UNENFORCED_EDGES',
    negative_control: 'packages/platform/tests/fixtures/verifier-teeth/fk_audit_zero_constraints',
  },
] as const;

export function listGateRegistry(): readonly GateRegistryEntry[] {
  return GATE_REGISTRY;
}

export function buildGateRegistryReport(options?: { repoRoot?: string }): GateRegistryReport {
  const repoRoot = resolve(options?.repoRoot ?? process.cwd());
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const seenCommands = new Set<string>();

  const entries = GATE_REGISTRY.map((entry) => {
    if (seenIds.has(entry.id)) {
      issues.push(`duplicate registry id: ${entry.id}`);
    }
    seenIds.add(entry.id);
    if (seenCommands.has(entry.command)) {
      issues.push(`duplicate command: ${entry.command}`);
    }
    seenCommands.add(entry.command);

    const negative_control_abs = resolve(repoRoot, entry.negative_control);
    const fixture_exists = existsSync(negative_control_abs);
    if (!fixture_exists) {
      issues.push(`missing negative_control fixture: ${entry.negative_control}`);
    }
    if (!entry.violation_class?.trim()) {
      issues.push(`empty violation_class for ${entry.id}`);
    }
    return { ...entry, negative_control_abs, fixture_exists };
  });

  if (entries.length === 0) {
    issues.push('gate registry is empty');
  }

  return {
    ok: issues.length === 0,
    entries,
    issues,
  };
}
