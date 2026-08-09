/**
 * S31-FE-07 AC-6 — Offline contract scope honesty.
 *
 * Reads the real runbook + evidence tree. Claims exactly one of the five
 * UC-SYNC-01 AC-5 conjuncts (airplane-mode reads); the other four cite R23.
 * No mocks — filesystem artifacts only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const RUNBOOK = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/runbooks/offline-contract-airplane-reads.md'
);
const FLOW = join(REPO_ROOT, '.maestro/reactive/offline-contract-airplane-reads.yml');
const HARNESS = join(REPO_ROOT, '.maestro/reactive/run-offline-contract-airplane-reads.sh');
const EVIDENCE_DIR = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence'
);

const FIVE_CONJUNCTS = [
  'airplane-mode reads',
  'queued writes',
  'rejection rollback',
  'duplicate replay',
  'concurrent-edit',
] as const;

const runPlatform = process.env.PLATFORM_IT === '1';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function listEvidenceFiles(): string[] {
  if (!existsSync(EVIDENCE_DIR)) return [];
  return readdirSync(EVIDENCE_DIR).filter((name) => {
    const full = join(EVIDENCE_DIR, name);
    return statSync(full).isFile();
  });
}

describe('S31-FE-07 offline contract scope (AC-6)', () => {
  it.skipIf(!runPlatform)('runbook claims exactly one conjunct', () => {
    expect(existsSync(RUNBOOK), `missing runbook: ${RUNBOOK}`).toBe(true);
    expect(existsSync(FLOW), `missing flow: ${FLOW}`).toBe(true);
    expect(existsSync(HARNESS), `missing harness: ${HARNESS}`).toBe(true);

    const runbook = read(RUNBOOK);
    const lower = runbook.toLowerCase();

    // All five UC-SYNC-01 AC-5 second-conjunct behaviours named.
    for (const conjunct of FIVE_CONJUNCTS) {
      expect(lower, `runbook must name conjunct: ${conjunct}`).toContain(conjunct.toLowerCase());
    }

    // Exactly one proven: airplane-mode reads.
    expect(runbook).toMatch(/airplane-mode reads[^\n]*proven/i);
    // Allow markdown emphasis around R23 (e.g. risk **R23**).
    expect(runbook).toMatch(/risk\s+\*{0,2}R23\*{0,2}/i);

    // Proven pointer to flow + video evidence path.
    expect(runbook).toMatch(/offline-contract-airplane-reads\.yml/);
    expect(runbook).toMatch(/S31-FE-07-segment-1\.mp4/);

    // Honesty markers: forbid claiming all five proven; require "exactly one".
    expect(runbook).not.toMatch(/all five conjuncts (are |have been )?proven/i);
    expect(runbook).toMatch(/do not claim[^\n]*fully satisfied/i);
    expect(runbook).toMatch(/exactly one/i);

    // Four uncovered conjuncts explicitly marked not covered / R23.
    for (const uncovered of [
      'queued writes',
      'rejection rollback',
      'duplicate replay',
      'concurrent-edit',
    ] as const) {
      // Each uncovered name appears near "not covered" or "R23" in the scope section.
      const idx = lower.indexOf(uncovered.toLowerCase());
      expect(idx, `conjunct missing: ${uncovered}`).toBeGreaterThan(-1);
      const window = lower.slice(Math.max(0, idx - 80), idx + uncovered.length + 120);
      expect(
        /not covered|uncovered|r23|design intent/i.test(window),
        `${uncovered} must be marked not covered / R23 near its mention`
      ).toBe(true);
    }

    // Evidence artifacts for the claimed-proven conjunct must exist.
    const evidence = listEvidenceFiles();
    expect(
      evidence.some((f) => f.includes('S31-FE-07-segment-1')),
      'segment-1 evidence (video or screenshot) must exist under .gate-evidence'
    ).toBe(true);

    // No Android / emulator / adb in flow or runbook (iOS Simulator only).
    const flow = read(FLOW);
    expect(flow).not.toMatch(/android|emulator|\badb\b/i);
    expect(runbook).not.toMatch(/android|emulator|\badb\b/i);
  });
});
