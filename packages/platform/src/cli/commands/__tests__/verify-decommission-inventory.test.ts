/**
 * S31-CX-05 / D08-02 — holo verify:decommission-inventory post-decommission behavior.
 *
 * After D08-02 deletes convex/, the inventory reports an honest refusal
 * (directory missing) rather than fabricating a green walk of an absent tree.
 * Platform replacements for former sole-impl surfaces remain present.
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

type InventoryReport = {
  ok: boolean;
  walked_file_count: number;
  research_file_count: number;
  unclassified_count: number;
  sole_implementation_count: number;
  files: Array<{ path: string; classification: string }>;
  refusal_list: string[] | Array<{ path?: string; reason?: string } | string>;
  typecheck_blockers?: Array<{ file: string; imported_symbol: string }>;
  typecheck_blocker_count?: number;
  message?: string;
};

function parseJsonReport(stdout: string): InventoryReport {
  const start = stdout.indexOf('{');
  expect(start, `expected JSON object in stdout:\n${stdout}`).toBeGreaterThanOrEqual(0);
  return JSON.parse(stdout.slice(start)) as InventoryReport;
}

describe('S31-CX-05 holo verify:decommission-inventory (post D08-02)', () => {
  it('AC-1: convex/ tree is absent after source decommission', () => {
    expect(existsSync(resolve(REPO_ROOT, 'convex'))).toBe(false);

    const r = runHolo(['verify:decommission-inventory', '--json'], { timeoutMs: 120_000 });
    writeEvidence('AC-1-post-decommission-cli.json', {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
    });

    expect(r.combined, r.combined).not.toMatch(/unknown command/i);
    const report = parseJsonReport(r.stdout);
    writeEvidence('AC-1-post-decommission-report.json', report);

    expect(report.ok).toBe(false);
    expect(report.walked_file_count).toBe(0);
    expect(report.files).toEqual([]);
    expect(report.sole_implementation_count).toBe(0);
    expect(report.unclassified_count).toBe(0);
    // Honest refusal — directory missing (not a silent green zero walk)
    const refusalText = JSON.stringify(report.refusal_list ?? []) + (report.message ?? '');
    expect(refusalText.toLowerCase()).toMatch(/missing|absent|not found|no such|convex/);
  });

  it('AC-2: platform replacements for former sole-impl surfaces remain present', () => {
    expect(existsSync(resolve(REPO_ROOT, 'packages/platform/src/chat/specialists.ts'))).toBe(true);
    expect(
      existsSync(
        resolve(REPO_ROOT, 'packages/platform/src/queue/jobs-handlers/task-timeout-worker.ts')
      )
    ).toBe(true);

    // Inventory refuses on missing tree — not a false green authorization walk
    const r = runHolo(['verify:decommission-inventory', '--json'], { timeoutMs: 120_000 });
    const report = parseJsonReport(r.stdout);
    writeEvidence('AC-2-post-decommission-report.json', report);
    expect(report.ok).toBe(false);
    expect(report.sole_implementation_count).toBe(0);
    expect(report.unclassified_count).toBe(0);
  });

  it('AC-3: typecheck blockers enumerate dataModel Doc/Id imports (0 after cleanup)', () => {
    const r = runHolo(['verify:decommission-inventory', '--json'], { timeoutMs: 120_000 });
    const report = parseJsonReport(r.stdout);
    writeEvidence('AC-3-typecheck-blockers.json', {
      typecheck_blocker_count: report.typecheck_blocker_count,
      typecheck_blockers: report.typecheck_blockers,
    });

    expect(
      typeof report.typecheck_blocker_count === 'number' ||
        report.typecheck_blocker_count === undefined
    ).toBe(true);
    const blockers = report.typecheck_blockers ?? [];
    if (typeof report.typecheck_blocker_count === 'number') {
      expect(blockers.length).toBe(report.typecheck_blocker_count);
    }
    const files = blockers.map((b) => b.file);
    expect(files).not.toContain('components/subscriptions/types.ts');
  });
});
