/**
 * S31-CX-05 — holo verify:decommission-inventory
 *
 * AC-1: whole convex/ walk with per-file verdict (supersedes 11-file no-shells set)
 * AC-2: fail-closed refusal listing sole-implementation files
 * AC-3: RN typecheck blockers for convex/_generated dataModel imports
 *
 * Real filesystem + real CLI — no mocks.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, runHolo } from '../../__tests__/fixtures/harness';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-CX-05');

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, payload: unknown): void {
  ensureEvidenceDir();
  const body = typeof payload === 'string' ? payload : `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(join(EVIDENCE_DIR, name), body, 'utf8');
}

type InventoryFile = {
  path: string;
  classification: string;
  reason?: string;
  imported_symbol?: string;
};

type InventoryReport = {
  ok: boolean;
  walked_file_count: number;
  research_file_count: number;
  unclassified_count: number;
  sole_implementation_count: number;
  files: InventoryFile[];
  refusal_list: string[];
  typecheck_blockers?: Array<{
    file: string;
    imported_symbol: string;
    line?: number;
  }>;
  typecheck_blocker_count?: number;
  message?: string;
};

function parseJsonReport(stdout: string): InventoryReport {
  const start = stdout.indexOf('{');
  expect(start, `expected JSON object in stdout:\n${stdout}`).toBeGreaterThanOrEqual(0);
  return JSON.parse(stdout.slice(start)) as InventoryReport;
}

describe('S31-CX-05 holo verify:decommission-inventory', () => {
  it('AC-1: --json walks whole convex/ tree incl. research/ with per-file verdicts', () => {
    expect(existsSync(resolve(REPO_ROOT, 'convex'))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, 'convex/research'))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, 'convex/chat/specialists.ts'))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, 'convex/taskCrons.ts'))).toBe(true);

    const r = runHolo(['verify:decommission-inventory', '--json'], { timeoutMs: 120_000 });
    writeEvidence('AC-1-cli-stdout.json', {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
    });

    expect(r.combined, r.combined).not.toMatch(/unknown command/i);
    expect(r.status, `CLI must run (non-crash): ${r.combined}`).not.toBeNull();

    const report = parseJsonReport(r.stdout);
    writeEvidence('AC-1-inventory-report.json', report);

    // Whole tree, not the 11-file no-shells scan set
    expect(report.walked_file_count).toBeGreaterThanOrEqual(246);
    expect(report.files.length).toBe(report.walked_file_count);

    // convex/research/ must appear (verify:no-shells excludes it)
    const researchFiles = report.files.filter((f) => f.path.startsWith('convex/research/'));
    expect(researchFiles.length).toBe(report.research_file_count);
    expect(report.research_file_count).toBeGreaterThanOrEqual(34);

    // Every walked file carries a classification string (no silent omission)
    for (const f of report.files) {
      expect(f.path, 'file path required').toMatch(/^convex\//);
      expect(typeof f.classification).toBe('string');
      expect(f.classification.length).toBeGreaterThan(0);
    }

    // Green condition is unclassified_count === 0; Sprint 31 may still be non-zero,
    // but the field must be present and honest (not a default "classified" stamp).
    expect(typeof report.unclassified_count).toBe('number');
    expect(report.unclassified_count).toBeGreaterThanOrEqual(0);
    const unclassified = report.files.filter((f) => f.classification === 'unclassified');
    expect(unclassified.length).toBe(report.unclassified_count);

    // Must not apply a default 'classified' verdict with no resolving replacement
    const fakeClassified = report.files.filter((f) => f.classification === 'classified');
    expect(fakeClassified).toEqual([]);
  });

  it('AC-2: refusal exit 1 lists sole-implementation specialists + taskCrons', () => {
    const r = runHolo(['verify:decommission-inventory'], { timeoutMs: 120_000 });
    writeEvidence('AC-2-cli-stdout.txt', {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      combined: r.combined,
    });

    // Fail closed while sole-implementation files exist
    expect(r.status, `expected non-zero refusal: ${r.combined}`).toBe(1);

    const json = runHolo(['verify:decommission-inventory', '--json'], { timeoutMs: 120_000 });
    const report = parseJsonReport(json.stdout);
    writeEvidence('AC-2-inventory-report.json', report);

    expect(report.ok).toBe(false);
    expect(report.sole_implementation_count).toBeGreaterThanOrEqual(2);
    expect(report.refusal_list).toEqual(
      expect.arrayContaining(['convex/chat/specialists.ts', 'convex/taskCrons.ts'])
    );

    const sole = report.files.filter((f) => f.classification === 'sole-implementation');
    expect(sole.map((f) => f.path)).toEqual(
      expect.arrayContaining(['convex/chat/specialists.ts', 'convex/taskCrons.ts'])
    );

    // taskCrons must NOT be marked migrated-stub without the marker
    const taskCrons = report.files.find((f) => f.path === 'convex/taskCrons.ts');
    expect(taskCrons).toBeDefined();
    expect(taskCrons!.classification).not.toBe('migrated-stub');
    expect(taskCrons!.classification).toBe('sole-implementation');

    // Text mode surfaces the refusal list
    expect(r.combined).toMatch(/convex\/chat\/specialists\.ts/);
    expect(r.combined).toMatch(/convex\/taskCrons\.ts/);
    expect(r.combined).toMatch(/sole-implementation/i);
  });

  it('AC-3: typecheck blockers enumerate dataModel Doc/Id imports (0 after client residue cleanup)', () => {
    const r = runHolo(['verify:decommission-inventory', '--json'], { timeoutMs: 120_000 });
    const report = parseJsonReport(r.stdout);
    writeEvidence('AC-3-typecheck-blockers.json', {
      typecheck_blocker_count: report.typecheck_blocker_count,
      typecheck_blockers: report.typecheck_blockers,
    });

    // Scanner must always report a finite count that matches the blockers array
    // (even when the RN tree is clean). S31-FE-05 removed residual RN dataModel
    // Doc/Id imports, so the inventory may honestly report 0 — do not hard-code
    // a stale residual of 3.
    expect(typeof report.typecheck_blocker_count).toBe('number');
    expect(report.typecheck_blockers).toBeDefined();
    expect(Array.isArray(report.typecheck_blockers)).toBe(true);
    expect(report.typecheck_blockers!.length).toBe(report.typecheck_blocker_count);

    // Historical S31-CX-05 fixture expected subscriptions/types among 3 blockers;
    // that surface is now concrete string types (no dataModel imports). Inventory
    // must reflect current tree truth — not invent residual Doc/Id imports.
    const files = report.typecheck_blockers!.map((b) => b.file);
    expect(files).not.toContain('components/subscriptions/types.ts');

    for (const b of report.typecheck_blockers!) {
      expect(['Doc', 'Id']).toContain(b.imported_symbol);
      expect(b.file.length).toBeGreaterThan(0);
    }
  });
});
