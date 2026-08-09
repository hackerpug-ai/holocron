/**
 * S31-OPS-06 — freeze-state config split-brain reconciliation.
 *
 * AC-1 [PRIMARY]: fenceStatusReportsPerSource
 * AC-2: fenceSplitBrainFailsClosed
 * AC-3: secretsExampleDocumentsFreezeKeys
 * AC-4: fenceStatusReadsConvexWhenCredsPresent
 *
 * NEGATIVE_CONTROL (would fail if):
 * - hardcoded aligned true / empty report / mock always-ok
 * - split-brain exits 0 / disagreement ignored
 * - secrets.example missing freeze keys or documents thaw
 * - convex missing credentials treated as aligned without convex_unreachable
 *
 * Run:
 *   PLATFORM_IT=1 pnpm test:integration \
 *     services/platform/tests/integration/sprint31-ops-06-fence-status.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const SECRETS_EXAMPLE = resolve(REPO_ROOT, 'services/platform/config/secrets.example.yaml');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/S31-OPS-06');
const DISPOSABLE_SECRETS = resolve(EVIDENCE, 'secrets.yaml');

const PLATFORM_IT = process.env.PLATFORM_IT === '1';

if (!PLATFORM_IT) {
  throw new Error('sprint31-ops-06-fence-status requires PLATFORM_IT=1');
}

function ensureEvidence(): void {
  mkdirSync(EVIDENCE, { recursive: true });
}

function writeEvidence(name: string, body: unknown): void {
  ensureEvidence();
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function seedSecrets(opts: {
  migrationReadOnly: '0' | '1';
  schedulesDisabled?: '0' | '1';
}): string {
  ensureEvidence();
  const schedules = opts.schedulesDisabled ?? '0';
  writeFileSync(
    DISPOSABLE_SECRETS,
    [
      '# S31-OPS-06 disposable fence secrets — never production soak control plane',
      `HOLO_MIGRATION_READ_ONLY: "${opts.migrationReadOnly}"`,
      `HOLO_CUTOVER_SCHEDULES_DISABLED: "${schedules}"`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  return DISPOSABLE_SECRETS;
}

function runFenceStatus(
  env: NodeJS.ProcessEnv,
  extraArgs: string[] = []
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('bun', [HOLO, 'cutover:fence-status', '--json', ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function parseJsonStdout(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  // Prefer whole-stdout parse (pretty-printed multi-line JSON from --json).
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // fall through
  }
  // Bracket-scan for first complete JSON object.
  const start = trimmed.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1)) as Record<string, unknown>;
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error(`no JSON object in fence-status stdout:\n${stdout}`);
}

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
    HOLOCRON_SECRETS_PATH: DISPOSABLE_SECRETS,
    ...overrides,
  };
}

afterEach(() => {
  // Leave evidence artifacts for review; disposable secrets rewritten per test.
});

describe('S31-OPS-06 freeze-state fence-status split-brain', () => {
  it('fenceStatusReportsPerSource (AC-1 PRIMARY)', () => {
    seedSecrets({ migrationReadOnly: '1', schedulesDisabled: '1' });
    const env = baseEnv({
      HOLO_MIGRATION_READ_ONLY: '1',
      HOLO_CUTOVER_SCHEDULES_DISABLED: '1',
      // Force offline Convex so hermetic hosts still prove secrets+env shape.
      // Live convex path is AC-4 when credentials exist.
    });
    // Hermetic secrets+env shape with explicit offline Convex (still labels unreachable).
    const result = runFenceStatus(env, ['--offline', '--allow-convex-unreachable']);
    writeEvidence('ac1-fence-status.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.stdout.trim().length, 'empty report').toBeGreaterThan(0);
    const report = parseJsonStdout(result.stdout);

    expect(report).toHaveProperty('secrets');
    expect(report).toHaveProperty('env');
    expect(report).toHaveProperty('convex');
    expect(typeof report.aligned).toBe('boolean');

    const secrets = report.secrets as Record<string, unknown>;
    const envSrc = report.env as Record<string, unknown>;
    const convex = report.convex as Record<string, unknown>;

    expect(secrets).toHaveProperty('HOLO_MIGRATION_READ_ONLY');
    expect(envSrc).toHaveProperty('HOLO_MIGRATION_READ_ONLY');
    expect(secrets.HOLO_MIGRATION_READ_ONLY).toBe('1');
    expect(envSrc.HOLO_MIGRATION_READ_ONLY).toBe('1');

    // Convex key present; offline path must label convex_unreachable (never silent).
    expect(convex).toBeTruthy();
    expect(convex.source).toBe('convex_unreachable');
    // Must not claim full three-way aligned while Convex is unreadable.
    expect(report.aligned).toBe(false);
    // secrets+env agree + allow flag → exit 0
    expect(result.status).toBe(0);
  });

  it('fenceSplitBrainFailsClosed (AC-2)', () => {
    // secrets=1, env=0 → split-brain
    seedSecrets({ migrationReadOnly: '1', schedulesDisabled: '0' });
    const env = baseEnv({
      HOLO_MIGRATION_READ_ONLY: '0',
      HOLO_CUTOVER_SCHEDULES_DISABLED: '0',
    });
    // Offline so live Convex cannot mask secrets/env disagreement.
    const result = runFenceStatus(env, ['--offline', '--allow-convex-unreachable']);
    writeEvidence('ac2-split-brain.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status, 'split-brain must exit non-zero').not.toBe(0);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(/FENCE_SPLIT_BRAIN/);

    const report = parseJsonStdout(result.stdout);
    expect(report.aligned).toBe(false);
    expect(report.code === 'FENCE_SPLIT_BRAIN' || combined.includes('FENCE_SPLIT_BRAIN')).toBe(
      true
    );

    const secrets = report.secrets as Record<string, unknown>;
    const envSrc = report.env as Record<string, unknown>;
    expect(secrets.HOLO_MIGRATION_READ_ONLY).toBe('1');
    expect(envSrc.HOLO_MIGRATION_READ_ONLY).toBe('0');
  });

  it('secretsExampleDocumentsFreezeKeys (AC-3)', () => {
    expect(existsSync(SECRETS_EXAMPLE), 'secrets.example.yaml missing').toBe(true);
    const text = readFileSync(SECRETS_EXAMPLE, 'utf8');
    writeEvidence('ac3-secrets-example-excerpt.txt', text);

    expect(text).toMatch(/HOLO_MIGRATION_READ_ONLY/);
    expect(text).toMatch(/HOLO_CUTOVER_SCHEDULES_DISABLED/);
    // Documents the no-thaw rule (01-scope); reject imperative thaw instructions.
    expect(text).toMatch(/no thaw|never thaw|one-way|no product thaw|does not thaw/i);
    // May mention "no cutover:thaw" as a prohibition — reject "run cutover:thaw" style.
    expect(text.toLowerCase()).not.toMatch(
      /\b(run|use|call|execute|invoke)\s+(holo\s+)?cutover:thaw\b/
    );
    expect(text).toMatch(/no[\s\S]{0,40}cutover:thaw|cutover:thaw[\s\S]{0,20}(not|never|no)/i);
  });

  it('fenceStatusReadsConvexWhenCredsPresent (AC-4)', () => {
    const convexUrl =
      process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ||
      process.env.CONVEX_URL?.trim() ||
      process.env.VITE_CONVEX_HTTP_URL?.trim() ||
      '';

    seedSecrets({ migrationReadOnly: '1', schedulesDisabled: '1' });
    const env = baseEnv({
      HOLO_MIGRATION_READ_ONLY: '1',
      HOLO_CUTOVER_SCHEDULES_DISABLED: '1',
    });

    if (!convexUrl) {
      // Credentials absent: must label convex_unreachable, never silent align.
      const result = runFenceStatus(env);
      writeEvidence('ac4-no-creds-unreachable.json', {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      const report = parseJsonStdout(result.stdout);
      const convex = report.convex as Record<string, unknown>;
      expect(convex.source).toBe('convex_unreachable');
      // Without allow flag, unreachable is fail-closed (exit != 0) even if secrets/env agree.
      expect(result.status).not.toBe(0);
      expect(report.aligned).not.toBe(true);
      return;
    }

    // Live path — real fence client read (no mock).
    const result = runFenceStatus(env);
    writeEvidence('ac4-convex-live.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    const report = parseJsonStdout(result.stdout);
    const convex = report.convex as Record<string, unknown>;

    // If deployment is temporarily unreachable, label honestly.
    if (convex.source === 'convex_unreachable') {
      expect(result.status).not.toBe(0);
      expect(report.aligned).not.toBe(true);
      return;
    }

    expect(convex.source).toBe('convex_env');
    const value = String(convex.value ?? convex.HOLO_MIGRATION_READ_ONLY ?? '');
    expect(['0', '1', 'true', 'false', '']).toContain(value);
    // When live value is present as 0|1|true|false (empty allowed only as unset)
    if (value !== '') {
      expect(['0', '1', 'true', 'false']).toContain(value);
    }
  });
});
