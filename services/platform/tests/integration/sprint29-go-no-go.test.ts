/**
 * D06-02 / REDHAT-FIX-S29-C01 — cutover:go-no-go integration suite.
 *
 * Proves:
 *   AC-1  fail closed on failed gate (overall.ok=false, failed_count>=1)
 *   AC-2  production CLI / DEFAULT_GATE_SPECS path (no echo substitution for green claims)
 *   AC-3  gate-plan step 1 oracle requires overall.ok + failed_count==0 (not length alone)
 *   AC-4  report shape: git_sha, generated_at, 8 gates, failed_count, overall.ok
 *
 * Shape/parser tests may use short real shell subprocesses; they are labeled
 * non-production and MUST NOT be the sole coverage for cutover:go-no-go green.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-go-no-go.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GATE_SPECS,
  evaluateGoNoGoOracle,
  formatGoNoGoText,
  type GateSpec,
  GO_NO_GO_GATE_NAMES,
  GO_NO_GO_STEP1_JQ_ORACLE,
  type GoNoGoReport,
  parseVitestCollectedTests,
  runGoNoGo,
} from '../../src/cutover/go-no-go.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/D06-02');
const C01_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-C01');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json'
);
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;

const FIXTURE_PATH = resolve(REPO_ROOT, 'services/platform/src/cutover/.tmp-gate-fixture.ts');

const tmpReports: string[] = [];

afterEach(() => {
  if (existsSync(FIXTURE_PATH)) {
    rmSync(FIXTURE_PATH, { force: true });
  }
  for (const p of tmpReports.splice(0)) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
});

function runHolo(
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const r = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: opts?.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: opts?.env ?? process.env,
    timeout: opts?.timeoutMs ?? 120_000,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return {
    status: r.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

/**
 * Non-production shape helper: real /bin/sh subprocess for parser/AND tests only.
 * NEVER used as the sole production CLI green path (C-01 / D06-02 AC-3).
 */
function shapeEchoGate(
  name: GateSpec['name'],
  script: string,
  kind: GateSpec['kind'] = 'plain'
): GateSpec {
  return {
    name,
    command: `sh -c ${JSON.stringify(script)}`,
    argv: ['sh', '-c', script],
    kind,
  };
}

function loadGatePlanStep1(): { literal_cmd: string; n: number; text: string } {
  const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as {
    steps: Array<{ n: number; text: string; literal_cmd: string }>;
  };
  const step1 = plan.steps.find((s) => s.n === 1);
  if (!step1) throw new Error('gate-plan step 1 missing');
  return step1;
}

/** Shell-evaluate the post-CLI jq oracle against a report file (C-01). */
function jqStep1Oracle(reportPath: string): { status: number | null; stdout: string } {
  const r = spawnSync('jq', ['-e', GO_NO_GO_STEP1_JQ_ORACLE, reportPath], {
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

describe('D06-02 cutover:go-no-go', () => {
  it('DEFAULT_GATE_SPECS enumerates exactly the 8 named production gates (not echo)', () => {
    expect(DEFAULT_GATE_SPECS).toHaveLength(8);
    expect(DEFAULT_GATE_SPECS.map((g) => g.name)).toEqual([...GO_NO_GO_GATE_NAMES]);
    for (const g of DEFAULT_GATE_SPECS) {
      expect(g.command.length, g.name).toBeGreaterThan(0);
      expect(g.argv.length, g.name).toBeGreaterThan(0);
      // Production gates never shell-echo success stubs.
      expect(g.command, g.name).not.toMatch(/\becho\b/);
      expect(g.command, g.name).not.toMatch(/\bprintf\b/);
    }
    // typecheck uses sh -c wrapper for fixture — argv[0] is sh; command string is pnpm tsgo.
    const typecheck = DEFAULT_GATE_SPECS.find((g) => g.name === 'typecheck')!;
    expect(typecheck.command.startsWith('pnpm tsgo')).toBe(true);
    expect(typecheck.argv[0]).toBe('sh');
    // Other production gates invoke pnpm/bun directly (not echo sh wrappers).
    for (const g of DEFAULT_GATE_SPECS.filter((x) => x.name !== 'typecheck')) {
      expect(['pnpm', 'bun'], g.name).toContain(g.argv[0]);
    }
    expect(DEFAULT_GATE_SPECS[0]!.command.startsWith('pnpm biome check')).toBe(true);
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'unit')!.command).toContain(
      'pnpm vitest run --project unit'
    );
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'integration')!.command).toContain(
      'pnpm vitest run --project integration'
    );
    expect(DEFAULT_GATE_SPECS.find((g) => g.name === 'live')!.command).toContain(
      'pnpm vitest run --project live'
    );
  });

  it('parseVitestCollectedTests reads real vitest summary parentheses (never hardcodes)', () => {
    const sample = [
      ' RUN  v4.1.0',
      ' ✓ |unit| foo.test.ts (4 tests) 10ms',
      '',
      ' Test Files  1 passed (1)',
      '      Tests  4 passed (4)',
      '   Duration  100ms',
    ].join('\n');
    expect(parseVitestCollectedTests(sample)).toBe(4);

    const mixed = '      Tests  3 passed | 1 failed (4)\n';
    expect(parseVitestCollectedTests(mixed)).toBe(4);

    expect(parseVitestCollectedTests('')).toBe(0);
    expect(parseVitestCollectedTests('no tests found')).toBe(0);
    expect(parseVitestCollectedTests('Tests  no tests')).toBe(0);
  });

  it('shape-only: runGoNoGo ANDs gate.pass, parses collectedTests, writes durable report', () => {
    // NON-PRODUCTION shape/parser coverage — short real shell gates only.
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const reportPath = resolve(EVIDENCE_DIR, 'unit-shape-go-no-go-report.json');
    tmpReports.push(reportPath);

    const gates: GateSpec[] = [
      shapeEchoGate('lint', 'echo lint-ok; exit 0'),
      shapeEchoGate('typecheck', 'echo typecheck-ok; exit 0'),
      shapeEchoGate(
        'unit',
        'printf "Test Files  1 passed (1)\\n      Tests  2 passed (2)\\n"; exit 0',
        'vitest'
      ),
      shapeEchoGate(
        'integration',
        'printf "Test Files  1 passed (1)\\n      Tests  3 passed (3)\\n"; exit 0',
        'vitest'
      ),
      shapeEchoGate(
        'live',
        'printf "Test Files  1 passed (1)\\n      Tests  1 passed (1)\\n"; exit 0',
        'vitest'
      ),
      shapeEchoGate('lanes', 'echo lanes-ok; exit 0'),
      shapeEchoGate('no-convex-client', 'echo no-convex-client-ok; exit 0'),
      shapeEchoGate('no-convex-env', 'echo no-convex-env-ok; exit 0'),
    ];

    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
      reportPath,
      gates,
    });

    expect(report.gates).toHaveLength(8);
    expect(report.overall.ok).toBe(true);
    expect(report.failed_count).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.git_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(report.generated_at.length).toBeGreaterThan(0);
    expect(existsSync(reportPath)).toBe(true);
    expect(evaluateGoNoGoOracle(report).ok).toBe(true);

    const unit = report.gates.find((g) => g.name === 'unit');
    expect(unit?.collectedTests).toBe(2);
    expect(unit?.pass).toBe(true);
    expect(unit?.duration_ms).toBeGreaterThan(0);

    // Fail-closed: vitest gate with 0 collectedTests is not pass even if exit 0.
    const emptyVitest = runGoNoGo({
      repoRoot: REPO_ROOT,
      reportPath: resolve(EVIDENCE_DIR, 'empty-vitest-report.json'),
      skipWrite: true,
      gates: [
        shapeEchoGate(
          'unit',
          'printf "Test Files  no tests\\n      Tests  no tests\\n"; exit 0',
          'vitest'
        ),
      ],
    });
    expect(emptyVitest.gates[0]!.collectedTests).toBe(0);
    expect(emptyVitest.gates[0]!.pass).toBe(false);
    expect(emptyVitest.overall.ok).toBe(false);
    expect(emptyVitest.failed_count).toBe(1);
    expect(evaluateGoNoGoOracle(emptyVitest).ok).toBe(false);

    // AND: one failing plain gate flips overall.ok + failed_count
    const oneFail = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [
        shapeEchoGate('lint', 'echo ok; exit 0'),
        shapeEchoGate('typecheck', 'echo boom; exit 2'),
      ],
    });
    expect(oneFail.gates[0]!.pass).toBe(true);
    expect(oneFail.gates[1]!.pass).toBe(false);
    expect(oneFail.overall.ok).toBe(false);
    expect(oneFail.failed_count).toBeGreaterThanOrEqual(1);
  });

  it('AC-1 / failed_count: deliberately broken typecheck fails closed (production gate runner)', () => {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, 'const x: string = 123;\n', 'utf8');
    expect(existsSync(FIXTURE_PATH)).toBe(true);

    const reportPath = resolve(EVIDENCE_DIR, 'ac2-broken-typecheck-report.json');
    tmpReports.push(reportPath);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    mkdirSync(C01_EVIDENCE, { recursive: true });

    // REAL production typecheck gate from DEFAULT_GATE_SPECS — not echo.
    const typecheckSpec = DEFAULT_GATE_SPECS.find((g) => g.name === 'typecheck');
    expect(typecheckSpec).toBeTruthy();
    expect(typecheckSpec!.command).toContain('pnpm tsgo');

    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      cwd: REPO_ROOT,
      reportPath,
      gates: [typecheckSpec!],
    });

    const tc = report.gates.find((g) => g.name === 'typecheck');
    expect(tc, 'typecheck gate missing').toBeTruthy();
    expect(tc!.pass).toBe(false);
    expect(tc!.exit_code).not.toBe(0);
    expect(report.overall.ok).toBe(false);
    expect(report.failed_count).toBeGreaterThanOrEqual(1);
    expect(evaluateGoNoGoOracle(report).ok).toBe(false);
    expect(
      evaluateGoNoGoOracle(report).reasons.some((r) => /failed_count|overall\.ok/.test(r))
    ).toBe(true);

    const blob = `${tc!.stderr_tail}\n${tc!.stdout_tail}`;
    expect(blob).toMatch(/\.tmp-gate-fixture\.ts/);

    writeFileSync(resolve(EVIDENCE_DIR, 'ac2-typecheck-excerpt.txt'), blob.slice(0, 4000), 'utf8');
    writeFileSync(
      resolve(C01_EVIDENCE, 'forced-fail-typecheck-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );

    rmSync(FIXTURE_PATH, { force: true });
  }, 120_000);

  it('AC-3 formatGoNoGoText emits literal status: OK or status: FAIL', () => {
    const ok = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lint', 'exit 0')],
    });
    const okText = formatGoNoGoText(ok);
    expect(okText).toContain('status: OK');
    expect(ok.overall.ok).toBe(true);
    expect(ok.failed_count).toBe(0);

    const fail = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lint', 'exit 1')],
    });
    const failText = formatGoNoGoText(fail);
    expect(failText).toContain('status: FAIL');
    expect(fail.overall.ok).toBe(false);
    expect(fail.failed_count).toBeGreaterThanOrEqual(1);
  });

  it('CLI registers cutover:go-no-go in --help', () => {
    const help = runHolo(['--help']);
    expect(help.combined).toMatch(/cutover:go-no-go/);
  });

  it('CLI text mode exit code mirrors overall.ok for a failing short path (AC-3)', () => {
    const fail = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lanes', 'echo fail; exit 7')],
    });
    expect(fail.overall.ok).toBe(false);
    expect(fail.failed_count).toBeGreaterThanOrEqual(1);
    const text = formatGoNoGoText(fail);
    expect(text).toMatch(/status: FAIL/);
    // CLI does process.exit(report.overall.ok ? 0 : 1)
    expect(fail.overall.ok ? 0 : 1).toBe(1);

    const ok = runGoNoGo({
      repoRoot: REPO_ROOT,
      skipWrite: true,
      gates: [shapeEchoGate('lanes', 'exit 0')],
    });
    expect(ok.overall.ok ? 0 : 1).toBe(0);
    expect(ok.failed_count).toBe(0);
    expect(formatGoNoGoText(ok)).toMatch(/status: OK/);
  });

  it('persisted report git_sha equals real git rev-parse HEAD (TC-6)', () => {
    const reportPath = resolve(EVIDENCE_DIR, 'git-sha-report.json');
    tmpReports.push(reportPath);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const report = runGoNoGo({
      repoRoot: REPO_ROOT,
      reportPath,
      gates: [shapeEchoGate('lint', 'exit 0')],
    });
    const head = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(report.git_sha).toBe((head.stdout ?? '').trim());
    const onDisk = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      git_sha: string;
    };
    expect(onDisk.git_sha).toBe(report.git_sha);
  });

  describe('REDHAT-FIX-S29-C01 — false go/no-go oracle', () => {
    it('gate-plan step 1 literal_cmd invokes real cutover:go-no-go CLI and requires overall.ok + failed_count==0', () => {
      const step1 = loadGatePlanStep1();
      expect(step1.literal_cmd).toMatch(/bun services\/platform\/src\/cli\/holo\.ts/);
      expect(step1.literal_cmd).toMatch(/cutover:go-no-go/);
      expect(step1.literal_cmd).toMatch(/--json/);
      expect(step1.literal_cmd).toMatch(/overall\.ok/);
      expect(step1.literal_cmd).toMatch(/failed_count/);
      // C-01: must not be length-only false pass.
      expect(step1.literal_cmd).not.toMatch(/length == 8/);
      // Must not be a pure jq-on-existing-report without running the CLI.
      expect(step1.literal_cmd.trim().startsWith('jq ')).toBe(false);
    });

    it('C-01 step1-oracle rejects failed_count=5 false-pass fixture despite gates.length==8', () => {
      mkdirSync(C01_EVIDENCE, { recursive: true });
      const fixturePath = resolve(C01_EVIDENCE, 'false-pass-failed-count-5.json');

      // Lineage of .gate-evidence/20260802T004525Z/step1.log: length 8 + failed_count 5.
      const fixture: GoNoGoReport = {
        ok: false,
        overall: { ok: false },
        git_sha: '2b966c7b60559ec9986cf737ed5322a6146c7960',
        generated_at: '2026-08-02T00:45:25.000Z',
        report_path: fixturePath,
        failed_count: 5,
        gates: GO_NO_GO_GATE_NAMES.map((name, i) => ({
          name,
          command: DEFAULT_GATE_SPECS[i]!.command,
          exit_code: i < 3 ? 0 : 1,
          duration_ms: 10,
          pass: i < 3,
          collectedTests: name === 'unit' || name === 'integration' || name === 'live' ? 1 : null,
          stdout_tail: '',
          stderr_tail: i < 3 ? '' : 'fail',
        })),
      };
      // Force the C-01 shape: 8 gates, 5 failed, overall false (even if vitest counts look green).
      fixture.failed_count = 5;
      fixture.overall.ok = false;
      fixture.ok = false;
      for (let i = 0; i < fixture.gates.length; i++) {
        const g = fixture.gates[i]!;
        if (i >= 3) {
          g.pass = false;
          g.exit_code = 1;
        }
      }
      writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

      // Old false oracle would green on length alone.
      const lengthOnly = spawnSync('jq', ['-e', '.gates | length == 8', fixturePath], {
        encoding: 'utf8',
      });
      expect(lengthOnly.status, 'length-only still true on fixture (negative control)').toBe(0);

      // Remediated oracle fails closed.
      const oracle = evaluateGoNoGoOracle(fixture);
      expect(oracle.ok).toBe(false);
      expect(oracle.reasons.join(';')).toMatch(/failed_count|overall\.ok/);

      const jq = jqStep1Oracle(fixturePath);
      expect(jq.status, `step1 jq oracle must fail: ${jq.stdout}`).not.toBe(0);

      writeFileSync(
        resolve(C01_EVIDENCE, 'false-pass-oracle-result.json'),
        `${JSON.stringify({ oracle, jq_status: jq.status, length_only_status: lengthOnly.status }, null, 2)}\n`,
        'utf8'
      );
    });

    it('production DEFAULT_GATE_SPECS runners: real no-convex + typecheck identity (not echo)', () => {
      // Execute real production gate runners from DEFAULT_GATE_SPECS (unbound echo).
      const production = DEFAULT_GATE_SPECS.filter(
        (g) => g.name === 'no-convex-client' || g.name === 'no-convex-env'
      );
      expect(production).toHaveLength(2);
      for (const g of production) {
        expect(g.command).toContain('holo.ts');
        expect(g.command).not.toMatch(/\becho\b/);
      }

      mkdirSync(C01_EVIDENCE, { recursive: true });
      const reportPath = resolve(C01_EVIDENCE, 'production-partial-gates-report.json');
      tmpReports.push(reportPath);

      const report = runGoNoGo({
        repoRoot: REPO_ROOT,
        cwd: REPO_ROOT,
        reportPath,
        gates: production,
      });

      expect(report.gates).toHaveLength(2);
      for (const g of report.gates) {
        expect(g.command).toContain('holo.ts');
        expect(g.duration_ms).toBeGreaterThan(0);
        // Real subprocess ran (exit code is a number from the process).
        expect(typeof g.exit_code).toBe('number');
      }
      // Fail-closed invariant: overall.ok iff failed_count===0 and every gate.pass.
      expect(report.failed_count).toBe(report.gates.filter((g) => !g.pass).length);
      expect(report.overall.ok).toBe(
        report.failed_count === 0 && report.gates.every((g) => g.pass)
      );
    }, 120_000);

    itLive(
      'production CLI cutover:go-no-go --json executes real DEFAULT_GATE_SPECS runners (fail-closed)',
      () => {
        mkdirSync(C01_EVIDENCE, { recursive: true });
        mkdirSync(EVIDENCE_DIR, { recursive: true });
        const reportPath = resolve(C01_EVIDENCE, 'production-cli-go-no-go-report.json');

        // Real CLI path via bun services/platform/src/cli/holo.ts (not a PATH holo stub).
        // HOLO_GO_NO_GO_ONLY keeps this finite inside the integration lane (avoids nested
        // full unit/integration/live re-entry). Production gate-plan step 1 does NOT set
        // HOLO_GO_NO_GO_ONLY — operator runs all 8 DEFAULT_GATE_SPECS unbound.
        // PLATFORM_IT=0 also prevents nested itLive re-entry.
        const only = 'lint,no-convex-client,no-convex-env';
        const r = runHolo(['cutover:go-no-go', '--json', '--output', reportPath], {
          timeoutMs: 300_000,
          env: {
            ...process.env,
            PLATFORM_IT: '0',
            HOLO_GO_NO_GO_ONLY: only,
          },
        });

        expect(
          existsSync(reportPath),
          `CLI must write report to ${reportPath}\n${r.combined}`
        ).toBe(true);
        const report = JSON.parse(readFileSync(reportPath, 'utf8')) as GoNoGoReport;

        expect(report.gates.length).toBeGreaterThanOrEqual(3);
        expect(typeof report.failed_count).toBe('number');
        expect(typeof report.overall.ok).toBe('boolean');
        expect(report.git_sha).toMatch(/^[0-9a-f]{40}$/);
        expect(report.generated_at.length).toBeGreaterThan(0);

        // Production commands from DEFAULT_GATE_SPECS — never echo stubs.
        for (const g of report.gates) {
          expect(g.command.length, g.name).toBeGreaterThan(0);
          expect(g.command, g.name).not.toMatch(/\becho\b/);
          expect(g.command, g.name).not.toMatch(/\bprintf\b/);
          expect(g.duration_ms, g.name).toBeGreaterThan(0);
          const expected = DEFAULT_GATE_SPECS.find((s) => s.name === g.name);
          expect(expected, g.name).toBeTruthy();
          expect(g.command).toBe(expected!.command);
        }

        // Exit code mirrors overall.ok (CLI process.exit).
        const expectedExit = report.overall.ok ? 0 : 1;
        expect(r.status, `CLI exit must mirror overall.ok=${report.overall.ok}`).toBe(expectedExit);

        // Fail-closed: never green with failures.
        expect(report.failed_count).toBe(report.gates.filter((g) => !g.pass).length);
        if (report.failed_count > 0) {
          expect(report.overall.ok).toBe(false);
        }
        if (report.overall.ok) {
          expect(report.failed_count).toBe(0);
        }

        writeFileSync(
          resolve(C01_EVIDENCE, 'production-cli-summary.json'),
          `${JSON.stringify(
            {
              exit: r.status,
              overall_ok: report.overall.ok,
              failed_count: report.failed_count,
              gates: report.gates.map((g) => ({
                name: g.name,
                pass: g.pass,
                command: g.command,
                exit_code: g.exit_code,
              })),
              note: 'HOLO_GO_NO_GO_ONLY used for finite CLI proof; gate-plan step1 runs unbound 8 gates',
            },
            null,
            2
          )}\n`,
          'utf8'
        );
      },
      300_000
    );
  });
});
