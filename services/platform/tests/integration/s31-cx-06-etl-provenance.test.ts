/**
 * S31-CX-06 — Restate ETL provenance truthfully (Sprint 29 full-corpus, not Sprint 14 fixture).
 *
 * AC-1: Sprint 14 gate records restated as fixture-scope mechanism proof; UC-DATA-05 AC-1
 *        primary evidence points at surviving Sprint 29 artifacts (13801 rows, parityHash).
 * AC-2: holo verify:etl-provenance --json fails closed when a gate cites an absent artifact.
 *
 * verification_service: filesystem — no PLATFORM_IT / Postgres required.
 *
 * Run:
 *   pnpm vitest run services/platform/tests/integration/s31-cx-06-etl-provenance.test.ts
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT, runHolo } from '../../src/cli/__tests__/fixtures/harness.ts';

const S14_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage'
);
const S14_GATE_RESULTS = join(S14_DIR, 'gate-results.json');
const S14_GATE_RESULTS_MD = join(S14_DIR, 'GATE-RESULTS.md');
const S14_GATE_PLAN = join(S14_DIR, 'gate-plan.json');
const S14_GATE_VERIFICATION = join(S14_DIR, 'gate-verification.json');

/** Canonical UC-DATA-05 AC-1 primary-evidence pointer written by this task. */
const UC_DATA_05_PRIMARY = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/uc-data-05-ac1-primary-evidence.json'
);

const S29_STEP6 = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260805T185338Z/step6.log'
);

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('S31-CX-06 AC-1: restate Sprint 14 + re-point UC-DATA-05 AC-1 to Sprint 29', () => {
  it('restates Sprint 14 as fixture-scope mechanism proof (104 rows) and cites Sprint 29 full-corpus evidence', () => {
    // Sprint 14 gate trio must still exist (restated, not deleted).
    const s14Files = [S14_GATE_RESULTS, S14_GATE_RESULTS_MD, S14_GATE_PLAN].filter((p) =>
      existsSync(p)
    );
    // Prefer verification file when present so count stays ≥3.
    if (existsSync(S14_GATE_VERIFICATION)) s14Files.push(S14_GATE_VERIFICATION);
    const unique = [...new Set(s14Files)];
    expect(
      unique.length,
      'Sprint 14 gate files must remain present (restated, not deleted)'
    ).toBeGreaterThanOrEqual(3);

    const gateJson = readText(S14_GATE_RESULTS);
    const gateMd = readText(S14_GATE_RESULTS_MD);
    const combined = `${gateJson}\n${gateMd}`;

    // stageRowCount 104 as fixture-scope (not full-corpus).
    expect(combined).toMatch(/stageRowCount[=:\s]*104|104\s+staged/i);
    expect(combined.toLowerCase()).toMatch(/fixture-scope|fixture scope/);
    // Phrase "mechanism" scoping required by the contract.
    expect(combined.toLowerCase()).toMatch(/mechanism/);
    // Must not still claim a production-corpus / full-corpus export as what was proven.
    expect(combined.toLowerCase()).not.toMatch(
      /full[- ]corpus\s+(export|load|etl)\s+(pass|proven|proved)|production-corpus export/
    );
    // Restatement body must be non-empty / non-placeholder.
    expect(combined.trim().length).toBeGreaterThan(200);
    expect(combined.toLowerCase()).not.toMatch(/todo:\s*restate|placeholder restatement/);

    // UC-DATA-05 AC-1 primary evidence pointer → Sprint 29 surviving artifact.
    expect(
      existsSync(UC_DATA_05_PRIMARY),
      `missing primary evidence pointer: ${UC_DATA_05_PRIMARY}`
    ).toBe(true);
    const primary = JSON.parse(readText(UC_DATA_05_PRIMARY)) as {
      use_case?: string;
      acceptance_criterion?: string;
      primary_evidence_path?: string;
      cited_row_count?: number;
      parity_hash_prefix?: string;
      scope?: string;
    };
    expect(primary.use_case).toBe('UC-DATA-05');
    expect(primary.acceptance_criterion).toBe('AC-1');
    expect(primary.primary_evidence_path, 'evidence path must be non-empty').toBeTruthy();

    const evidenceAbs = resolve(REPO_ROOT, primary.primary_evidence_path as string);
    expect(
      existsSync(evidenceAbs),
      `UC-DATA-05 AC-1 evidence path must resolve on disk: ${evidenceAbs}`
    ).toBe(true);
    // Must point into Sprint 29 evidence tree.
    expect(primary.primary_evidence_path).toMatch(
      /sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/
    );

    const evidenceBody = readText(evidenceAbs);
    expect(primary.cited_row_count).toBe(13801);
    // Cited artifact must contain the parity hash prefix from the surviving reconcile report.
    expect(evidenceBody).toMatch(/0a12d2059b/);
    expect(primary.parity_hash_prefix ?? '').toMatch(/^0a12d2059b/);

    // Sanity: surviving Sprint 29 step6 still matches the cited corpus size.
    expect(existsSync(S29_STEP6)).toBe(true);
    const step6 = readText(S29_STEP6);
    expect(step6).toMatch(/"documents"\s*:\s*1623/);
    expect(step6).toMatch(/0a12d2059b/);
  });
});

describe('S31-CX-06 AC-2: holo verify:etl-provenance fails closed on absent artifacts', () => {
  it('exits 1 naming the missing artifact path when a gate record cites an absent file', () => {
    const dir = mkdtempSync(join(tmpdir(), 's31-cx-06-provenance-'));
    tmpDirs.push(dir);
    const missingRel = '.tmp/s31-cx-06-does-not-exist/convex-prod-export.zip';
    const gatePath = join(dir, 'gate-results.json');
    writeFileSync(
      gatePath,
      JSON.stringify(
        {
          sprint: 's31-cx-06-negative',
          verdict: 'pass',
          stageRowCount: 104,
          evidence: [missingRel],
          claims: [
            {
              kind: 'full_corpus_etl',
              stageRowCount: 104,
              evidence_path: missingRel,
            },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    // Ensure the cited path is truly absent relative to repo root.
    expect(existsSync(resolve(REPO_ROOT, missingRel))).toBe(false);

    const r = runHolo(['verify:etl-provenance', '--json', '--gate', gatePath], {
      env: { HOLO_REPO_ROOT: REPO_ROOT },
      timeoutMs: 60_000,
    });

    expect(r.status, `must fail closed:\n${r.combined}`).toBe(1);
    expect(r.combined).toMatch(/convex-prod-export\.zip|s31-cx-06-does-not-exist/);
    expect(r.combined.toLowerCase()).not.toMatch(/default pass|status:\s*ok\b/);

    const body = r.stdout.includes('{') ? r.stdout.slice(r.stdout.indexOf('{')) : r.stdout;
    const report = JSON.parse(body) as {
      ok?: boolean;
      records_inspected?: number;
      violations?: Array<{ path?: string; reason?: string }>;
    };
    expect(report.ok).toBe(false);
    expect(report.records_inspected ?? 0).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.violations)).toBe(true);
    expect(report.violations?.length).toBeGreaterThanOrEqual(1);
    const joined = JSON.stringify(report.violations);
    expect(joined).toMatch(/convex-prod-export\.zip|s31-cx-06-does-not-exist/);
  });
});
