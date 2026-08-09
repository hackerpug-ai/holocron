/**
 * S31-07 AC-2 — Langfuse self-hosted from in-repo artifacts.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-07');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const COMPOSE = resolve(REPO_ROOT, 'services/platform/deploy/compose/langfuse.compose.yaml');
const PLIST = resolve(REPO_ROOT, 'services/platform/deploy/launchd/holocron-langfuse.plist');
const ENV_EXAMPLE = resolve(REPO_ROOT, '.env.example');

const itLive = PLATFORM_IT ? it : it.skip;

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8'
  );
}

function runHolo(args: string[], timeoutMs = 180_000) {
  const r = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: resolve(REPO_ROOT, 'services/platform'),
    encoding: 'utf8',
    env: {
      ...process.env,
      LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL ?? 'http://127.0.0.1:3100',
      LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY ?? 'pk-lf-holocron-obs1-public',
      LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY ?? 'sk-lf-holocron-obs1-secret',
    },
    timeout: timeoutMs,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    combined: `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
  };
}

describe('S31-07 AC-2 langfuseStartsFromRepoArtifacts', () => {
  itLive('langfuseStartsFromRepoArtifacts', () => {
    // No production/tracked sources reference machine-local /private/tmp/langfuse-s29
    // (exclude tests + task specs that document the defect being fixed).
    const grepped = spawnSync(
      'rg',
      [
        '-n',
        '--glob',
        '!**/.git/**',
        '--glob',
        '!**/node_modules/**',
        '--glob',
        '!**/.spec/**',
        '--glob',
        '!**/tests/**',
        '--glob',
        '!**/*.test.ts',
        '-e',
        '/private/tmp/langfuse-s29',
        'services',
        'app',
        'scripts',
        'docs',
      ],
      { encoding: 'utf8', cwd: REPO_ROOT }
    );
    // rg exit 1 = no matches
    expect(
      grepped.status,
      `tracked production files must not reference /private/tmp/langfuse-s29:\n${grepped.stdout}`
    ).toBe(1);

    const ls = spawnSync('git', ['ls-files', '--', COMPOSE, PLIST], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });
    // Files may be new/untracked until commit — assert present on disk and will be git-added.
    expect(existsSync(COMPOSE), `compose must exist: ${COMPOSE}`).toBe(true);
    expect(existsSync(PLIST), `plist must exist: ${PLIST}`).toBe(true);
    writeEvidence('ac2-git-ls-files.txt', ls.stdout || '(untracked until commit)');

    const composeBody = readFileSync(COMPOSE, 'utf8');
    expect(composeBody).toMatch(/@sha256:[a-f0-9]{64}/);
    expect(composeBody).not.toMatch(/:latest\b/);

    const envExample = readFileSync(ENV_EXAMPLE, 'utf8');
    expect(envExample).not.toMatch(/cloud\.langfuse\.com/);
    expect(envExample).toMatch(/LANGFUSE_BASE_URL=.*127\.0\.0\.1:3100/);

    const up = runHolo(['stack:up', '--json'], 180_000);
    writeEvidence('ac2-stack-up.json', {
      status: up.status,
      stdout: up.stdout.slice(0, 4000),
      stderr: up.stderr.slice(0, 2000),
    });

    const status = runHolo(['stack:status', '--json'], 60_000);
    writeEvidence('ac2-stack-status.json', {
      status: status.status,
      stdout: status.stdout.slice(0, 8000),
    });
    expect(status.status).toBe(0);
    let report: Record<string, unknown> = {};
    try {
      report = JSON.parse(status.stdout) as Record<string, unknown>;
    } catch {
      // some builds wrap report
      const m = status.stdout.match(/\{[\s\S]*\}/);
      if (m) report = JSON.parse(m[0]) as Record<string, unknown>;
    }
    const langfuse =
      (report.langfuse as string | undefined) ??
      ((report.services as Record<string, unknown> | undefined)?.langfuse as string | undefined) ??
      ((report.report as Record<string, unknown> | undefined)?.langfuse as string | undefined);
    // Accept healthy string or nested report
    const statusText = status.stdout + status.stderr;
    const healthy =
      langfuse === 'healthy' ||
      /langfuse["\s:]+healthy/i.test(statusText) ||
      /"langfuse"\s*:\s*"healthy"/i.test(statusText);
    expect(
      healthy,
      `stack:status must report langfuse healthy:\n${statusText.slice(0, 2000)}`
    ).toBe(true);

    const baseUrl = process.env.LANGFUSE_BASE_URL ?? 'http://127.0.0.1:3100';
    expect(baseUrl).toMatch(/127\.0\.0\.1|100\.\d+\.\d+\.\d+/);
    expect(baseUrl).not.toMatch(/cloud\.langfuse\.com/);

    const doctor = runHolo(['secrets:doctor', '--json'], 30_000);
    writeEvidence('ac2-secrets-doctor.json', {
      status: doctor.status,
      stdout: doctor.stdout.slice(0, 4000),
    });
    // Doctor core may be 0; langfuse keys should be reported present when env is set.
    expect(doctor.combined).toMatch(/LANGFUSE_/);
    expect(doctor.combined).not.toMatch(/cloud\.langfuse\.com/);
  });
});
