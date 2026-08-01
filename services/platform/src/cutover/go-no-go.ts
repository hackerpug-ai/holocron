/**
 * D06-02 / CAP-CUT-01 / T-SYNC-008 — pre-cutover go/no-go harness suite.
 *
 * Spawns the eight named gates as real child processes, parses vitest
 * collectedTests from real output (never hardcoded), and emits a durable
 * go-no-go-report.json. overall.ok is the AND of every gate.pass; vitest
 * gates fail closed when collectedTests === 0 even if exit code is 0.
 *
 * Operator:
 *   bun services/platform/src/cli/holo.ts cutover:go-no-go [--json]
 *   bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/D06-02/go-no-go-report.json
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';

export const GO_NO_GO_GATE_NAMES = [
  'lint',
  'typecheck',
  'unit',
  'integration',
  'live',
  'lanes',
  'no-convex-client',
  'no-convex-env',
] as const;

export type GoNoGoGateName = (typeof GO_NO_GO_GATE_NAMES)[number];

export type GateKind = 'plain' | 'vitest';

/** Spec for one named gate — real argv + reportable command string. */
export type GateSpec = {
  name: GoNoGoGateName;
  /** Exact command string persisted in the report (operator-greppable). */
  command: string;
  /** argv[0] is the binary; remainder are args. Never shell-joined. */
  argv: readonly [string, ...string[]];
  kind: GateKind;
};

/**
 * The eight production gates. commands[0] MUST start with `pnpm biome check`
 * (AC-4 / TC-6 contract).
 */
export const DEFAULT_GATE_SPECS: readonly GateSpec[] = [
  {
    name: 'lint',
    command: 'pnpm biome check .',
    argv: ['pnpm', 'biome', 'check', '.'],
    kind: 'plain',
  },
  {
    // Platform project scope — root tsconfig excludes services/platform/**.
    // Dotfile fixtures (AC-2 `.tmp-gate-fixture.ts`) are invisible to `**/*.ts`
    // globs, so the gate shell also typechecks the fixture path when present.
    name: 'typecheck',
    command: 'pnpm tsgo --noEmit -p services/platform/tsconfig.json',
    argv: [
      'sh',
      '-c',
      [
        'status=0',
        'pnpm tsgo --noEmit -p services/platform/tsconfig.json || status=$?',
        'FIXTURE="services/platform/src/cutover/.tmp-gate-fixture.ts"',
        'if [ -f "$FIXTURE" ]; then',
        '  pnpm tsgo --noEmit --ignoreConfig --strict --pretty false "$FIXTURE" || status=1',
        'fi',
        'exit $status',
      ].join('\n'),
    ],
    kind: 'plain',
  },
  {
    name: 'unit',
    command: 'pnpm vitest run --project unit',
    argv: ['pnpm', 'vitest', 'run', '--project', 'unit'],
    kind: 'vitest',
  },
  {
    name: 'integration',
    command: 'pnpm vitest run --project integration',
    argv: ['pnpm', 'vitest', 'run', '--project', 'integration'],
    kind: 'vitest',
  },
  {
    name: 'live',
    command: 'pnpm vitest run --project live',
    argv: ['pnpm', 'vitest', 'run', '--project', 'live'],
    kind: 'vitest',
  },
  {
    name: 'lanes',
    command: 'pnpm test:lanes',
    argv: ['pnpm', 'test:lanes'],
    kind: 'plain',
  },
  {
    name: 'no-convex-client',
    command: 'bun services/platform/src/cli/holo.ts verify:no-convex-client',
    argv: ['bun', 'services/platform/src/cli/holo.ts', 'verify:no-convex-client'],
    kind: 'plain',
  },
  {
    name: 'no-convex-env',
    command: 'bun services/platform/src/cli/holo.ts verify-no-convex-env',
    argv: ['bun', 'services/platform/src/cli/holo.ts', 'verify-no-convex-env'],
    kind: 'plain',
  },
] as const;

export type GateResult = {
  name: GoNoGoGateName;
  command: string;
  exit_code: number;
  duration_ms: number;
  pass: boolean;
  /** Parsed from real vitest output for vitest gates; null for plain gates. */
  collectedTests: number | null;
  stdout_tail: string;
  stderr_tail: string;
};

export type GoNoGoReport = {
  /** Top-level alias of overall.ok (holo verify:* convention). */
  ok: boolean;
  overall: { ok: boolean };
  git_sha: string;
  generated_at: string;
  gates: GateResult[];
  report_path: string;
  /** Number of gates that failed (pass=false). */
  failed_count: number;
};

const TAIL_CHARS = 8_000;
const MAX_BUFFER = 64 * 1024 * 1024;

/** Keep head + tail so early and late compiler diagnostics both survive. */
function summarizeOutput(s: string, n = TAIL_CHARS): string {
  if (!s) return '';
  if (s.length <= n) return s;
  const half = Math.floor(n / 2);
  return `${s.slice(0, half)}\n\n...[${s.length - n} chars truncated]...\n\n${s.slice(-half)}`;
}

/**
 * Parse vitest summary `Tests  N passed (M)` / `Tests  N failed | M passed (T)` etc.
 * Returns the total collected count in parentheses, or 0 when the suite is empty /
 * unparseable (fail-closed for go/no-go).
 */
export function parseVitestCollectedTests(output: string): number {
  if (!output) return 0;

  // Primary: parenthesized total on a Tests summary line.
  // Examples:
  //   "      Tests  4 passed (4)"
  //   "      Tests  3 passed | 1 failed (4)"
  //   "      Tests  1 skipped (1)"
  const paren =
    /Tests\s+[^\n(]*\((\d+)\)/i.exec(output) ?? /Test Files\s+[^\n(]*\((\d+)\)/i.exec(output);
  if (paren) {
    const n = Number(paren[1]);
    return Number.isFinite(n) ? n : 0;
  }

  // "no tests" / empty suite
  if (/\bTests\s+no tests\b/i.test(output) || /\bno tests found\b/i.test(output)) {
    return 0;
  }

  // Fallback: sum discrete counters if present without parentheses.
  let total = 0;
  let found = false;
  for (const m of output.matchAll(/(\d+)\s+(passed|failed|skipped|todo|expected)\b/gi)) {
    // Only count lines that look like vitest summary (contain "Tests" nearby).
    found = true;
    total += Number(m[1]);
  }
  // Without a Tests context, refuse 0 (fail closed) — do not invent counts.
  if (found && /\bTests\b/i.test(output)) return total;
  return 0;
}

/** Resolve real git HEAD SHA via a real subprocess (never hardcoded). */
export function resolveGitSha(repoRoot: string): string {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.error || r.status !== 0) {
    return '';
  }
  return (r.stdout ?? '').trim();
}

export function defaultGoNoGoReportPath(cwd = process.cwd()): string {
  return resolve(cwd, 'go-no-go-report.json');
}

function runOneGate(spec: GateSpec, options: { cwd: string; env: NodeJS.ProcessEnv }): GateResult {
  const started = Date.now();
  const [bin, ...args] = spec.argv;
  const result = spawnSync(bin, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: MAX_BUFFER,
    // No timeout: full harness suites can run for many minutes.
  });
  const duration_ms = Math.max(1, Date.now() - started);
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exit_code =
    result.error != null ? 127 : typeof result.status === 'number' ? result.status : 1;

  let collectedTests: number | null = null;
  let pass = exit_code === 0;

  if (spec.kind === 'vitest') {
    collectedTests = parseVitestCollectedTests(`${stdout}\n${stderr}`);
    // Fail closed: empty/degenerate suite is not green.
    pass = exit_code === 0 && collectedTests > 0;
  }

  return {
    name: spec.name,
    command: spec.command,
    exit_code,
    duration_ms,
    pass,
    collectedTests,
    stdout_tail: summarizeOutput(stdout),
    stderr_tail: summarizeOutput(stderr),
  };
}

export type RunGoNoGoOptions = {
  repoRoot?: string;
  /** Working directory for subprocesses (default: repoRoot). */
  cwd?: string;
  reportPath?: string;
  /** Override gate list (tests may inject short real subprocesses). */
  gates?: readonly GateSpec[];
  env?: NodeJS.ProcessEnv;
  /** Skip writing the durable report (tests only). */
  skipWrite?: boolean;
};

/**
 * Sequential real-subprocess gate runner. Produces one unified report.
 * overall.ok = AND(every gate.pass).
 */
export function runGoNoGo(options: RunGoNoGoOptions = {}): GoNoGoReport {
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const cwd = options.cwd ?? repoRoot;
  const env = { ...process.env, ...(options.env ?? {}) };
  const specs = options.gates ?? DEFAULT_GATE_SPECS;
  const reportPath = resolve(options.reportPath ?? defaultGoNoGoReportPath(cwd));

  const gates: GateResult[] = [];
  for (const spec of specs) {
    gates.push(runOneGate(spec, { cwd, env }));
  }

  const overallOk = gates.length > 0 && gates.every((g) => g.pass);
  const report: GoNoGoReport = {
    ok: overallOk,
    overall: { ok: overallOk },
    git_sha: resolveGitSha(repoRoot),
    generated_at: new Date().toISOString(),
    gates,
    report_path: reportPath,
    failed_count: gates.filter((g) => !g.pass).length,
  };

  if (!options.skipWrite) {
    const dir = dirname(reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

/** Human-readable text matching holo verify:* `status: OK|FAIL` convention. */
export function formatGoNoGoText(report: GoNoGoReport): string {
  const lines: string[] = [
    'holo cutover:go-no-go — pre-cutover harness suite (T-SYNC-008)',
    `  git_sha:      ${report.git_sha || '(unknown)'}`,
    `  generated_at: ${report.generated_at}`,
    `  report_path:  ${report.report_path}`,
    `  gates:        ${report.gates.length}`,
    `  failed:       ${report.failed_count}`,
  ];
  for (const g of report.gates) {
    const flag = g.pass ? 'PASS' : 'FAIL';
    const tests = g.collectedTests != null ? ` collectedTests=${g.collectedTests}` : '';
    lines.push(`  ${g.name}: ${flag} exit=${g.exit_code} duration_ms=${g.duration_ms}${tests}`);
    lines.push(`    command: ${g.command}`);
  }
  lines.push(report.overall.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}
