/**
 * S31-OPS-05 — ci-fast green + ci-integration schedulable.
 *
 * AC-1 [PRIMARY]: localCiFastCommandsExitZero — pnpm typecheck/lint/test:unit exit 0
 * AC-2: ciFastWorkflowHasQualitySteps — ci-fast.yml invokes the three commands
 * AC-3: ciIntegrationSchedulable — workflow_dispatch and/or schedule present
 * AC-4: forkSafetyFailClosed — fork PRs hit a job that exits 1
 *
 * NEGATIVE_CONTROL (would fail if):
 * - typecheck/lint disabled or skipped to force green
 * - ci-integration only has pull_request (no dispatch/schedule)
 * - fork-safety job removed or exit 0 for forks
 * - hardcoded pass without reading workflow YAML
 *
 * Run:
 *   PLATFORM_IT=1 pnpm test:integration \
 *     services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts
 *   (static ACs also run without PLATFORM_IT; AC-1 is pure local CLI)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const CI_FAST = resolve(REPO_ROOT, '.github/workflows/ci-fast.yml');
const CI_INTEGRATION = resolve(REPO_ROOT, '.github/workflows/ci-integration.yml');

const PLATFORM_IT = process.env.PLATFORM_IT === '1';

function loadWorkflow(path: string): Record<string, unknown> {
  const text = readFileSync(path, 'utf8');
  const doc = parseYaml(text) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') {
    throw new Error(`workflow is not a YAML object: ${path}`);
  }
  return doc;
}

function jobIf(job: Record<string, unknown> | undefined): string {
  return String(job?.if ?? '');
}

function stepRuns(job: Record<string, unknown> | undefined): string[] {
  const steps = (job?.steps ?? []) as Array<Record<string, unknown>>;
  return steps.map((s) => String(s.run ?? ''));
}

/**
 * Env for subprocesses that mirror ci-fast.yml quality job.
 * Strip PLATFORM_IT so nested unit lane does not un-skip live itLive tests
 * (ci-fast does not set PLATFORM_IT; secrets/doctor live suite belongs in integration).
 */
function ciFastChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PLATFORM_IT;
  return env;
}

function runPnpm(
  script: string,
  timeoutMs: number
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('pnpm', [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: ciFastChildEnv(),
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

describe('S31-OPS-05 ci-fast green + ci-integration schedulable', () => {
  it('localCiFastCommandsExitZero (AC-1 PRIMARY)', () => {
    // When this suite is invoked under PLATFORM_IT=1 (ci-integration), still
    // execute the primary proof — do not skip. Child env strips PLATFORM_IT
    // so nested unit matches the ci-fast quality job contract.
    if (PLATFORM_IT) {
      expect(process.env.PLATFORM_IT).toBe('1');
    }

    const typecheck = runPnpm('typecheck', 180_000);
    expect(typecheck.status, `typecheck failed:\n${typecheck.stdout}\n${typecheck.stderr}`).toBe(0);

    const lint = runPnpm('lint', 180_000);
    expect(lint.status, `lint failed:\n${lint.stdout}\n${lint.stderr}`).toBe(0);

    // Match ci-fast.yml unit step args for parity with the workflow quality job.
    const unit = spawnSync('pnpm', ['test:unit', '--', '--passWithNoTests'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 300_000,
      env: ciFastChildEnv(),
    });
    expect(unit.status ?? 1, `test:unit failed:\n${unit.stdout ?? ''}\n${unit.stderr ?? ''}`).toBe(
      0
    );
  }, 600_000);

  it('ciFastWorkflowHasQualitySteps (AC-2)', () => {
    const doc = loadWorkflow(CI_FAST);
    const jobs = (doc.jobs ?? {}) as Record<string, Record<string, unknown>>;
    const quality = jobs.quality;
    expect(quality, 'quality job missing').toBeTruthy();

    const runs = stepRuns(quality).join('\n');
    expect(runs, 'typecheck step').toMatch(/pnpm\s+typecheck/);
    expect(runs, 'lint step').toMatch(/pnpm\s+lint/);
    expect(runs, 'unit test step').toMatch(/pnpm\s+test:unit/);

    // ci-fast must still trigger on push/PR (fast lane contract).
    const on = doc.on as Record<string, unknown> | string[] | null;
    if (Array.isArray(on)) {
      expect(on).toEqual(expect.arrayContaining(['push', 'pull_request']));
    } else {
      expect(on, 'on: missing').toBeTruthy();
      expect(Object.keys(on as object)).toEqual(expect.arrayContaining(['push', 'pull_request']));
    }
  });

  it('ciIntegrationSchedulable (AC-3)', () => {
    const doc = loadWorkflow(CI_INTEGRATION);
    const on = doc.on as Record<string, unknown> | null;
    expect(on, 'on: missing').toBeTruthy();
    const triggers = Object.keys(on as object);
    expect(triggers, 'pull_request retained').toContain('pull_request');
    const schedulable = triggers.includes('workflow_dispatch') || triggers.includes('schedule');
    expect(schedulable, 'ci-integration must have workflow_dispatch and/or schedule').toBe(true);
  });

  it('forkSafetyFailClosed (AC-4)', () => {
    const text = readFileSync(CI_INTEGRATION, 'utf8');
    const doc = loadWorkflow(CI_INTEGRATION);
    const jobs = (doc.jobs ?? {}) as Record<string, Record<string, unknown>>;

    const forkJob =
      jobs['fork-safety'] ??
      Object.values(jobs).find((j) =>
        jobIf(j).includes('head.repo.full_name != github.repository')
      );
    expect(forkJob, 'fork-safety job missing').toBeTruthy();

    const ifExpr = jobIf(forkJob);
    expect(ifExpr).toMatch(/head\.repo\.full_name\s*!=\s*github\.repository/);
    // Only fire on pull_request so schedule/dispatch do not false-fail.
    expect(ifExpr).toMatch(/pull_request/);

    const runs = stepRuns(forkJob).join('\n');
    expect(runs).toMatch(/exit\s+1/);
    expect(runs).toMatch(/fail closed/i);

    // Integration job must not run for fork PRs; must allow dispatch/schedule.
    const integration = jobs.integration;
    expect(integration, 'integration job missing').toBeTruthy();
    const integIf = jobIf(integration);
    expect(integIf).toMatch(
      /head\.repo\.full_name\s*==\s*github\.repository|workflow_dispatch|schedule/
    );

    // Standing ban: pull_request_target would grant base-repo secrets to forks.
    expect(text).not.toMatch(/pull_request_target/);
  });
});
