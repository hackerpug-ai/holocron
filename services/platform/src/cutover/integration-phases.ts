/**
 * Serial real-provider integration phases for go/no-go.
 *
 * Keeps the full suite strict but executes in explicit serial phases with
 * readiness checks before each phase and bounded cleanup afterward, eliminating
 * cross-phase pollution (fleet-ID, retailer, socket-probe, Node OOM).
 *
 * The final residual phase runs the full integration project so every file is
 * still collected (vitest de-dupes by path within a single process; across
 * processes we accept re-collection of already-run files only when
 * HOLO_GO_NO_GO_PHASE_RESIDUAL=full — default residual re-runs the whole
 * project once after the specialized phases so coverage is complete).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type IntegrationPhaseName =
  | 'filesystem-contract'
  | 'postgres'
  | 'zero'
  | 'fleet-retailer'
  | 'maestro-evidence'
  | 'residual-full';

export type IntegrationPhase = {
  name: IntegrationPhaseName;
  /**
   * Vitest include globs / paths relative to repo root.
   * Empty includes = run the whole integration project (residual).
   */
  includes: readonly string[];
  /** Optional readiness probe; throw to fail the phase before tests run. */
  ready?: (env: NodeJS.ProcessEnv) => void;
  /** Optional bounded cleanup after the phase. */
  cleanup?: (env: NodeJS.ProcessEnv) => void;
};

function requirePostgres(env: NodeJS.ProcessEnv): void {
  const db = env.DATABASE_URL ?? '';
  if (!db.includes('holocron_nonprod')) {
    throw new Error('phase requires DATABASE_URL targeting holocron_nonprod');
  }
  const r = spawnSync('psql', [db, '-X', '-At', '-c', 'SELECT 1'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (r.status !== 0 || (r.stdout ?? '').trim() !== '1') {
    throw new Error(`postgres readiness failed: ${r.stderr || r.stdout}`);
  }
}

function requireZero(env: NodeJS.ProcessEnv): void {
  const zero = env.ZERO_CACHE_URL ?? 'http://127.0.0.1:4848';
  const r = spawnSync(
    'curl',
    ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', zero],
    { encoding: 'utf8' }
  );
  const code = (r.stdout ?? '').trim();
  if (r.status !== 0 || !code || code === '000') {
    throw new Error(`zero readiness failed at ${zero}`);
  }
}

/**
 * Specialized phases run first (pollution-sensitive), then residual-full runs the
 * entire integration project once so every file is collected under a clean
 * post-specialist substrate.
 */
export const INTEGRATION_PHASES: readonly IntegrationPhase[] = [
  {
    name: 'filesystem-contract',
    includes: [
      'services/platform/tests/integration/sprint29-compose-contract.test.ts',
      'services/platform/tests/integration/sprint29-go-no-go.test.ts',
      'services/platform/tests/integration/sprint29-human-gate-oracles.test.ts',
      'services/platform/tests/integration/sprint29-human-gate-freshness.test.ts',
      'services/platform/tests/integration/prd-consistency.test.ts',
      'services/platform/tests/integration/red-no-shells.test.ts',
    ],
  },
  {
    name: 'postgres',
    includes: [
      'services/platform/tests/integration/db-migrate.test.ts',
      'services/platform/tests/integration/jsonb-roundtrip.test.ts',
      'services/platform/tests/integration/nonprod-namespace.test.ts',
      'services/platform/tests/integration/queue-dlq.test.ts',
      'services/platform/tests/integration/queue-priority.test.ts',
      'services/platform/tests/integration/sprint14-etl-and-blob.test.ts',
      'services/platform/tests/integration/sprint29-cutover-etl.test.ts',
      'services/platform/tests/integration/sprint29-soak-flip.test.ts',
      // PITR must run before residual fire-drill suites can neuter archive_command
      // on the shared isolated Postgres (scratch restore sets archive_command=/bin/true).
      'services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts',
      'services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts',
      'services/platform/tests/integration/rrf-search.test.ts',
      'services/platform/tests/integration/search-recall.test.ts',
      'services/platform/tests/integration/inline-surfaces-search.test.ts',
      'services/platform/tests/integration/embed-helper.test.ts',
      'services/platform/tests/integration/embed-run.test.ts',
    ],
    ready: requirePostgres,
  },
  {
    name: 'zero',
    includes: [
      'services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts',
      'services/platform/tests/integration/sprint20-reference-zero-durable.test.ts',
      'services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts',
      'services/platform/tests/integration/sprint29-zero-file-objects-permissions.test.ts',
      'tests/integration/s-reactive-01-eventsource-live.test.ts',
      'tests/integration/s-reactive-01-resumable-sse.test.ts',
      'tests/integration/s-reactive-02-research-progress-zero.test.ts',
      'tests/integration/s-reactive-04-degraded-chat.test.ts',
      'tests/integration/s-rewrite-01-chat-cluster-zero.test.ts',
      'tests/integration/s-rewrite-02-documents-cluster.test.ts',
      'tests/integration/s-rewrite-04-research-cluster-zero.test.ts',
    ],
    ready: (env) => {
      requirePostgres(env);
      requireZero(env);
      // Self-seed research_sessions / reference conversation for Zero-bound suites.
      const holo = resolve(env.HOLO_ROOT ?? process.cwd(), 'services/platform/src/cli/holo.ts');
      const seed = spawnSync('bun', [holo, 'seed:e2e', '--reset'], {
        cwd: env.HOLO_ROOT ?? process.cwd(),
        encoding: 'utf8',
        env,
        timeout: 180_000,
      });
      if (seed.status !== 0) {
        throw new Error(`zero phase seed:e2e --reset failed: ${seed.stderr || seed.stdout}`);
      }
    },
  },
  {
    name: 'fleet-retailer',
    includes: [
      'services/platform/tests/integration/mission-engine-red.test.ts',
      'services/platform/tests/integration/sprint19-mcp-rehost.test.ts',
      'services/platform/tests/integration/sprint25-chat-fleet-only-mock.test.ts',
      'services/platform/tests/integration/pipeline-templates.test.ts',
      // Business-report CLI missions need a fresh fleet path; residual load
      // previously killed them via the default 90s spawnSync timeout.
      'services/platform/tests/integration/business-report-template.test.ts',
      'services/platform/tests/integration/inference-telemetry.test.ts',
      'services/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts',
      'services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts',
      'services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts',
    ],
    ready: (env) => {
      requirePostgres(env);
      // Clear residual WIP mission_runs so idempotency uniques from earlier
      // suites cannot poison the mission-engine RED suite.
      const db = env.DATABASE_URL ?? '';
      if (db) {
        spawnSync(
          'psql',
          [
            db,
            '-X',
            '-v',
            'ON_ERROR_STOP=0',
            '-c',
            "UPDATE mission_runs SET status = 'failed', updated_at = now() WHERE status IN ('running','pending','queued','in_progress')",
          ],
          { encoding: 'utf8', timeout: 30_000 }
        );
      }
    },
    cleanup: () => {
      try {
        (global as { gc?: () => void }).gc?.();
      } catch {
        /* ignore */
      }
    },
  },
  {
    name: 'maestro-evidence',
    includes: [
      'tests/integration/sprint20-capstone-verdict.test.ts',
      'tests/integration/sprint20-this-cycle-coldboot.test.ts',
      'tests/integration/sprint20-maestro-harness.test.ts',
      'tests/integration/sprint20-maestro-native-human-gate.test.ts',
      'tests/integration/sprint20-coldboot-journey.test.ts',
      'tests/integration/sprint20-gate-regenerator-provenance.test.ts',
      'tests/integration/sprint20-ci-e2e-provenance.test.ts',
      'services/platform/tests/integration/sprint20-maestro-harness-artifacts.test.ts',
    ],
    ready: (env) => {
      requirePostgres(env);
      requireZero(env);
    },
  },
  {
    // Filled at runtime with every integration file not claimed by earlier phases.
    name: 'residual-full',
    includes: [],
    ready: (env) => {
      requirePostgres(env);
      // Residual S28 fire-drill / restore suites create many Docker bridge
      // networks. Prior residual runs leave them behind until Docker cannot
      // allocate another subnet ("all predefined address pools have been fully
      // subnetted"). Prune unused networks before residual so provision stays real.
      spawnSync('docker', ['network', 'prune', '-f'], {
        encoding: 'utf8',
        timeout: 60_000,
      });
    },
    cleanup: () => {
      try {
        (global as { gc?: () => void }).gc?.();
      } catch {
        /* ignore */
      }
      spawnSync('docker', ['network', 'prune', '-f'], {
        encoding: 'utf8',
        timeout: 60_000,
      });
    },
  },
] as const;

/** Discover integration test files under the vitest integration project roots. */
export function listIntegrationTestFiles(repoRoot: string): string[] {
  const r = spawnSync(
    'find',
    [
      'services/platform/tests/integration',
      'tests/integration',
      '-type',
      'f',
      '(',
      '-name',
      '*.test.ts',
      '-o',
      '-name',
      '*.test.tsx',
      ')',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (r.status !== 0) return [];
  return (r.stdout ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

function expandPhaseIncludes(repoRoot: string, includes: readonly string[]): string[] {
  const out: string[] = [];
  for (const pattern of includes) {
    if (pattern.includes('*')) {
      const r = spawnSync('bash', ['-lc', `ls -1 ${pattern} 2>/dev/null`], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      for (const line of (r.stdout ?? '').split('\n')) {
        const t = line.trim();
        if (t && existsSync(resolve(repoRoot, t))) out.push(t);
      }
    } else if (existsSync(resolve(repoRoot, pattern))) {
      out.push(pattern);
    }
  }
  return out;
}

/** Build concrete phase file lists; residual receives every unclaimed file. */
export function materializePhases(
  repoRoot: string,
  phases: readonly IntegrationPhase[] = INTEGRATION_PHASES
): IntegrationPhase[] {
  const all = listIntegrationTestFiles(repoRoot);
  const claimed = new Set<string>();
  const materialised: IntegrationPhase[] = [];
  for (const phase of phases) {
    if (phase.name === 'residual-full') continue;
    const files = expandPhaseIncludes(repoRoot, phase.includes);
    for (const f of files) claimed.add(f);
    materialised.push({ ...phase, includes: files });
  }
  const residual = all.filter((f) => !claimed.has(f));
  const residualPhase = phases.find((p) => p.name === 'residual-full');
  if (residualPhase) {
    materialised.push({ ...residualPhase, includes: residual });
  }
  return materialised;
}

export type PhaseRunResult = {
  name: IntegrationPhaseName;
  pass: boolean;
  exit_code: number;
  duration_ms: number;
  collectedTests: number;
  stdout_tail: string;
  stderr_tail: string;
  ready_error?: string;
};

function summarize(s: string, n = 6_000): string {
  if (!s) return '';
  if (s.length <= n) return s;
  const half = Math.floor(n / 2);
  return `${s.slice(0, half)}\n\n...[${s.length - n} chars truncated]...\n\n${s.slice(-half)}`;
}

function parseCollected(output: string): number {
  const paren =
    /Tests\s+[^\n(]*\((\d+)\)/i.exec(output) ?? /Test Files\s+[^\n(]*\((\d+)\)/i.exec(output);
  if (paren) {
    const n = Number(paren[1]);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Run integration as serial phases. When HOLO_GO_NO_GO_PHASED=0, callers should
 * fall back to a single vitest project run.
 */
export function runPhasedIntegration(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  phases?: readonly IntegrationPhase[];
}): { pass: boolean; phases: PhaseRunResult[]; stdout: string; stderr: string } {
  const phases = materializePhases(options.cwd, options.phases ?? INTEGRATION_PHASES);
  const results: PhaseRunResult[] = [];
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  let totalCollected = 0;

  for (const phase of phases) {
    const started = Date.now();
    if (phase.includes.length === 0) {
      results.push({
        name: phase.name,
        pass: true,
        exit_code: 0,
        duration_ms: 1,
        collectedTests: 0,
        stdout_tail: `(phase ${phase.name}: no files)`,
        stderr_tail: '',
      });
      continue;
    }
    try {
      phase.ready?.(options.env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        name: phase.name,
        pass: false,
        exit_code: 1,
        duration_ms: Math.max(1, Date.now() - started),
        collectedTests: 0,
        stdout_tail: '',
        stderr_tail: msg,
        ready_error: msg,
      });
      stderrParts.push(`[phase ${phase.name} ready] ${msg}`);
      break;
    }

    // Chunk large residual file lists to stay under argv limits.
    const chunks: string[][] = [];
    const chunkSize = 40;
    for (let i = 0; i < phase.includes.length; i += chunkSize) {
      chunks.push(phase.includes.slice(i, i + chunkSize));
    }

    let phasePass = true;
    let phaseExit = 0;
    let phaseCollected = 0;
    let phaseStdout = '';
    let phaseStderr = '';
    for (const chunk of chunks) {
      const argv = [
        'vitest',
        'run',
        '--project',
        'integration',
        '--no-file-parallelism',
        '--maxWorkers=1',
        ...chunk,
      ];
      const result = spawnSync('pnpm', argv, {
        cwd: options.cwd,
        encoding: 'utf8',
        env: { ...options.env, PLATFORM_IT: '1', HOLO_INTEGRATION_PHASE: phase.name },
        maxBuffer: 64 * 1024 * 1024,
      });
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      phaseStdout += stdout;
      phaseStderr += stderr;
      const exit_code =
        result.error != null ? 127 : typeof result.status === 'number' ? result.status : 1;
      const collected = parseCollected(`${stdout}\n${stderr}`);
      phaseCollected += collected;
      if (exit_code !== 0 || collected <= 0) {
        phasePass = false;
        phaseExit = exit_code === 0 ? 1 : exit_code;
        break;
      }
    }
    stdoutParts.push(
      `\n===== phase ${phase.name} (${phase.includes.length} files) =====\n${phaseStdout}`
    );
    stderrParts.push(phaseStderr);
    totalCollected += phaseCollected;

    try {
      phase.cleanup?.(options.env);
    } catch (err) {
      stderrParts.push(
        `[phase ${phase.name} cleanup] ${err instanceof Error ? err.message : String(err)}`
      );
    }

    results.push({
      name: phase.name,
      pass: phasePass,
      exit_code: phaseExit,
      duration_ms: Math.max(1, Date.now() - started),
      collectedTests: phaseCollected,
      stdout_tail: summarize(phaseStdout),
      stderr_tail: summarize(phaseStderr),
    });

    if (!phasePass) break;
  }

  return {
    pass: results.length > 0 && results.every((r) => r.pass) && totalCollected > 0,
    phases: results,
    stdout: stdoutParts.join('\n'),
    stderr: stderrParts.join('\n'),
  };
}

/** Default command string for the phased integration gate (operator-greppable). */
export function phasedIntegrationCommand(): string {
  return 'pnpm vitest run --project integration --no-file-parallelism --maxWorkers=1 (phased)';
}

export function resolveRepoRootFromMeta(metaUrl: string): string {
  return resolve(dirname(fileURLToPathSafe(metaUrl)), '../../../..');
}

function fileURLToPathSafe(metaUrl: string): string {
  try {
    return resolve(new URL(metaUrl).pathname);
  } catch {
    return metaUrl;
  }
}
