/**
 * REDHAT-FIX-H4 — D03-06 fork-safety / trust-boundary regression test.
 *
 * A standing, replayable check of the ci-e2e.yml trust boundary that does not
 * depend on actionlint being installed (actionlint is unavailable in this env;
 * this structural fail-closed check is the contractually-accepted equivalent).
 *
 *   AC-1 [PRIMARY]: parses .github/workflows/ci-e2e.yml and asserts the
 *     trust-boundary guards: permissions: contents: read, a concurrency group,
 *     the fork-rejection guard, the same-repo/workflow_dispatch gate on the e2e
 *     job, the self-hosted runner label, and the always() artifact upload.
 *   AC-2: RED-then-GREEN — against a deliberately weakened fixture (guard
 *     removed) the test FAILS naming the missing guard; against the real
 *     ci-e2e.yml it PASSES — proving the test is not a stub.
 *   AC-3: the structural check itself is the captured actionlint-equivalent
 *     evidence recorded in docs/ci/D03-06-adversarial-review.md.
 *
 *   PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts
 *   (also runs un-gated in the CI fast lane)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// js-yaml ships no bundled type declarations in this workspace; the structural
// audit treats the parsed object as a plain record.
// @ts-expect-error TS7016 — no declaration file for 'js-yaml'
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'ci-e2e.yml');

interface GuardReport {
  ok: boolean;
  missing: string[];
  details: Record<string, unknown>;
}

/** The structural trust-boundary audit. Accepts a workflow path so AC-2 can feed a fixture. */
function auditWorkflow(path: string): GuardReport {
  const text = readFileSync(path, 'utf8');
  const doc = loadYaml(text) as Record<string, unknown> | undefined;
  const missing: string[] = [];
  const details: Record<string, unknown> = {};

  if (!doc || typeof doc !== 'object') {
    return { ok: false, missing: ['workflow is not valid YAML'], details };
  }

  // 1. Least privilege: permissions: contents: read only.
  const perms = doc.permissions as Record<string, string> | string | undefined;
  const permsOk =
    perms === 'read' || (typeof perms === 'object' && perms !== null && perms.contents === 'read');
  if (!permsOk) missing.push('permissions.contents:read');
  details.permissions = perms;

  // 2. Concurrency group present (no simultaneous self-hosted runner clobbering).
  if (!doc.concurrency) missing.push('concurrency group');
  details.concurrency = !!doc.concurrency;

  const jobs = (doc.jobs ?? {}) as Record<string, Record<string, unknown>>;
  details.jobNames = Object.keys(jobs);

  // 3. A fork-rejection guard must exist (a job whose `if` references
  //    head.repo.full_name != repository), so fork PRs can never reach the
  //    self-hosted lane / secrets. (pull_request_target is NOT required as long
  //    as a same-repo gate + fork-rejection gate exist; this workflow uses the
  //    latter pair.)
  const ifText = (j: Record<string, unknown>) => String(j.if ?? '');
  const hasForkReject = Object.values(jobs).some((j) =>
    ifText(j).includes('head.repo.full_name != github.repository')
  );
  if (!hasForkReject)
    missing.push('fork-rejection guard (head.repo.full_name != github.repository)');

  // 4. The e2e job must gate on same-repo OR workflow_dispatch (never fork).
  const e2eJob = Object.values(jobs).find((j) => {
    const runs = j['runs-on'];
    return Array.isArray(runs) && runs.includes('e2e');
  });
  if (!e2eJob) {
    missing.push('self-hosted e2e runner job ([self-hosted, holocron, e2e])');
  } else {
    const e2eIf = ifText(e2eJob);
    const sameRepoOrDispatch =
      e2eIf.includes('head.repo.full_name == github.repository') ||
      e2eIf.includes('workflow_dispatch');
    if (!sameRepoOrDispatch) missing.push('e2e job same-repo/workflow_dispatch gate');
    // 5. The e2e job must run on the self-hosted holocron/e2e runner.
    const runsOn = e2eJob['runs-on'] as unknown[];
    if (!runsOn || !runsOn.includes('holocron') || !runsOn.includes('e2e')) {
      missing.push('self-hosted [holocron, e2e] runner label');
    }
    // 6. The artifact upload must use always() so evidence is preserved on failure.
    const steps = (e2eJob.steps ?? []) as Array<Record<string, unknown>>;
    const hasAlwaysUpload = steps.some((s) => String(s.if ?? '').includes('always()'));
    if (!hasAlwaysUpload) missing.push('always() artifact upload');
  }

  // 7. No pull_request_target (which would run in the base-repo context and
  //    silently grant secrets). Either pull_request (this workflow) or
  //    workflow_dispatch only.
  const triggers = Object.keys((doc.on ?? {}) as Record<string, unknown>);
  if (triggers.includes('pull_request_target')) {
    missing.push('pull_request_target must NOT be used (secrets-exposing trigger)');
  }

  return { ok: missing.length === 0, missing, details };
}

describe('REDHAT-FIX-H4 — D03-06 fork-safety / trust-boundary', () => {
  it('AC-1 [PRIMARY]: real ci-e2e.yml satisfies every trust-boundary guard', () => {
    const report = auditWorkflow(WORKFLOW);
    expect(report.ok, `missing guards: ${report.missing.join(', ')}`).toBe(true);
    // Spot-check the documented guards are genuinely present.
    expect(report.details.concurrency).toBe(true);
    expect((report.details.jobNames as string[]).length).toBeGreaterThan(0);
  });

  it('AC-2: a weakened fixture (guard removed) FAILS, naming the missing guard', () => {
    const real = readFileSync(WORKFLOW, 'utf8');
    // Weaken: drop the fork-rejection guard line + the same-repo gate.
    const weakened = real
      .replace(/head\.repo\.full_name != github\.repository/g, 'true')
      .replace(/head\.repo\.full_name == github\.repository/g, 'true');
    const dir = mkdtempSync(join(tmpdir(), 'fork-safety-fixture-'));
    const fixture = join(dir, 'ci-e2e-weakened.yml');
    writeFileSync(fixture, weakened);
    try {
      const report = auditWorkflow(fixture);
      expect(report.ok, 'weakened fixture must NOT pass').toBe(false);
      // The fork-rejection guard must be among the named missing guards.
      expect(report.missing.join(' '), 'must name the fork-rejection guard').toContain(
        'fork-rejection'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('AC-2 (GREEN): the real workflow is the GREEN counterpart to the RED fixture', () => {
    const report = auditWorkflow(WORKFLOW);
    expect(report.ok).toBe(true);
  });

  it('AC-3: the adversarial review doc exists and records this structural check', () => {
    const docPath = join(REPO_ROOT, 'docs', 'ci', 'D03-06-adversarial-review.md');
    const text = readFileSync(docPath, 'utf8');
    expect(text, 'review doc must mention actionlint').toMatch(/actionlint/i);
    expect(text, 'review doc must record the trust-boundary conclusion').toMatch(
      /trust[- ]boundary/i
    );
    expect(text, 'review doc must name the fork-safety test').toMatch(/fork-safety/);
  });
});
