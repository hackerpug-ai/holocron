/**
 * Stack supervisor — holo stack up | down | status
 *
 * Orchestrates Postgres + Mastra + scheduler (leased queue) via launchd (Darwin)
 * with real health probes. Zero-cache: boot path enabled (Sprint 24) when
 * HOLO_ENABLE_ZERO_CACHE=1 or ZERO_ADMIN_PASSWORD is set; otherwise honest disabled.
 * See docs/ops/zero-cache-enable.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isDarwin,
  LAUNCHD_LABELS,
  launchdAvailable,
  loadStackConfig,
  STACK_DOWN_TIMEOUT_MS,
  STACK_UP_TIMEOUT_MS,
  type StackConfig,
} from './config.ts';
import {
  bootoutLabel,
  ensureLaunchAgentsInstalled,
  ensureServiceLoaded,
  killResidualStackProcesses,
} from './launchd.ts';
import {
  launchctlListLine,
  probeEmbed,
  probeLaunchdRunning,
  probeMastra,
  probePostgres,
  probePostgresProcess,
  probeQueueDetail,
  probeSchedulerDetail,
  probeZeroCacheHttp,
  probeZeroCacheState,
  type ServiceState,
} from './probes.ts';

/** Scheduler slot as structured object (AC-3: placeholder / program / pid). */
export type SchedulerStatus = {
  /** Launchd / process state string (healthy|pending|running|…). */
  state: ServiceState | 'running';
  /** false once real worker is wired (never /usr/bin/true). */
  placeholder: boolean;
  program: string;
  /** Numeric PID when launchd reports the unit loaded; null when not running. */
  pid: number | null;
  /** Stringify-friendly alias so legacy `String(scheduler)` tests still see state. */
  toString(): string;
};

export type QueueStatus = {
  backend: 'pg-boss' | 'graphile-worker' | 'process-local' | 'unknown';
  ready: boolean;
  detail?: string;
};

export type StackStatusReport = {
  ok: boolean;
  postgres: ServiceState;
  mastra: ServiceState;
  /**
   * Structured scheduler status. JSON serializes {state,placeholder,program}.
   * Text form prints state; never reports fake /usr/bin/true as healthy production.
   */
  scheduler: SchedulerStatus;
  zero_cache: ServiceState;
  /** Fleet embed-route health (CAP-EMB-01 ops visibility) — real HTTP probe. */
  embed: ServiceState;
  /** Self-hosted Langfuse (S31-07) — real HTTP health probe. */
  langfuse: ServiceState;
  /** Postgres leased-queue readiness (pg-boss preferred). */
  queue: QueueStatus;
  /** Nested form for operators / tooling. */
  services: {
    postgres: ServiceState;
    mastra: ServiceState;
    scheduler: ServiceState;
    zerocache: ServiceState;
    embed: ServiceState;
    langfuse: ServiceState;
    queue: QueueStatus;
  };
  mode: 'launchd' | 'direct';
  elapsed_ms?: number;
  messages: string[];
  probes: {
    postgres: string;
    mastra: string;
    embed: string;
    langfuse?: string;
    queue?: string;
    scheduler?: string;
    launchd_postgres?: string;
    launchd_mastra?: string;
    launchd_scheduler?: string;
    launchd_langfuse?: string;
  };
};

export type StackCommandResult = {
  ok: boolean;
  exitCode: number;
  report: StackStatusReport;
  text: string;
};

function sleepSync(ms: number): void {
  spawnSync('sleep', [String(ms / 1000)], { timeout: ms + 1000 });
}

function directPidFile(cfg: StackConfig): string {
  const dir = resolve(cfg.home, '.holocron');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'stack-direct.pids.json');
}

type DirectPids = { postgres?: number; mastra?: number; zerocache?: number };

function readDirectPids(cfg: StackConfig): DirectPids {
  const f = directPidFile(cfg);
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as DirectPids;
  } catch {
    return {};
  }
}

function writeDirectPids(cfg: StackConfig, pids: DirectPids): void {
  writeFileSync(directPidFile(cfg), JSON.stringify(pids, null, 2), 'utf8');
}

function clearDirectPids(cfg: StackConfig): void {
  const f = directPidFile(cfg);
  if (existsSync(f)) unlinkSync(f);
}

function pidAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false;
  const r = spawnSync('kill', ['-0', String(pid)]);
  return r.status === 0;
}

function makeSchedulerStatus(cfg: StackConfig): SchedulerStatus {
  const detail = probeSchedulerDetail(cfg);
  const listed = launchctlListLine(LAUNCHD_LABELS.scheduler);
  const pid = listed.pid && listed.pid > 0 ? listed.pid : null;
  // AC-3 oracle expects state "running" with a numeric PID when the consumer is live.
  const state: SchedulerStatus['state'] =
    pid != null ? 'running' : detail.state === 'healthy' ? 'running' : detail.state;
  const status: SchedulerStatus = {
    state,
    placeholder: detail.placeholder,
    program: detail.program,
    pid,
    toString() {
      return state;
    },
  };
  return status;
}

const LANGFUSE_LABEL = 'holocron-langfuse';

function langfuseBaseUrl(): string {
  return (process.env.LANGFUSE_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
}

function probeLangfuseHealth(): { ok: boolean; detail: string; state: ServiceState } {
  const base = langfuseBaseUrl();
  const url = `${base}/api/public/health`;
  try {
    const r = spawnSync(
      'curl',
      ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '2', url],
      { encoding: 'utf8' }
    );
    const code = (r.stdout ?? '').trim();
    if (r.status === 0 && (code === '200' || code === '401')) {
      return { ok: true, detail: `langfuse health HTTP ${code} at ${url}`, state: 'healthy' };
    }
    return {
      ok: false,
      detail: `langfuse health failed at ${url} (http=${code || '000'} status=${r.status})`,
      state: 'unhealthy',
    };
  } catch (err) {
    return {
      ok: false,
      detail: `langfuse probe error: ${err instanceof Error ? err.message : String(err)}`,
      state: 'unhealthy',
    };
  }
}

function langfuseComposePath(cfg: StackConfig): string {
  return resolve(cfg.repoRoot, 'services/platform/deploy/compose/langfuse.compose.yaml');
}

/** Bring up self-hosted Langfuse from in-repo compose (S31-07). */
function ensureLangfuseUp(cfg: StackConfig): { ok: boolean; detail: string } {
  const existing = probeLangfuseHealth();
  if (existing.ok) {
    return { ok: true, detail: `langfuse already healthy — ${existing.detail}` };
  }

  const compose = langfuseComposePath(cfg);
  if (!existsSync(compose)) {
    return {
      ok: false,
      detail: `langfuse compose missing: ${compose} (expected in-repo artifact)`,
    };
  }

  // Materialize LaunchAgent template so git-tracked plist is installed for operators.
  try {
    const template = resolve(cfg.templateDir, `${LANGFUSE_LABEL}.plist`);
    if (existsSync(template)) {
      mkdirSync(cfg.launchAgentsDir, { recursive: true });
      mkdirSync(cfg.logDir, { recursive: true });
      const bunDir = resolve(cfg.bunBin, '..');
      const body = readFileSync(template, 'utf8')
        .replaceAll('@HOME@', cfg.home)
        .replaceAll('@HOLO_ROOT@', cfg.holoRoot)
        .replaceAll('@BUN_BIN@', cfg.bunBin)
        .replaceAll('@BUN_DIR@', bunDir)
        .replaceAll('@PG_BIN@', cfg.pgBin)
        .replaceAll('@PGDATA@', cfg.pgData)
        .replaceAll('@DATABASE_URL@', cfg.databaseUrl);
      writeFileSync(resolve(cfg.launchAgentsDir, `${LANGFUSE_LABEL}.plist`), body, 'utf8');
    }
  } catch {
    // Non-fatal — compose up is the source of truth for health.
  }

  const r = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      compose,
      '--project-name',
      'holocron-langfuse',
      'up',
      '-d',
      '--remove-orphans',
    ],
    {
      encoding: 'utf8',
      timeout: 180_000,
      env: process.env,
      cwd: cfg.repoRoot,
    }
  );
  if (r.status !== 0) {
    return {
      ok: false,
      detail: `docker compose langfuse up failed (status=${r.status}): ${(r.stderr ?? r.stdout ?? '').slice(0, 400)}`,
    };
  }

  // Poll health for up to 90s
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const health = probeLangfuseHealth();
    if (health.ok) {
      return { ok: true, detail: `langfuse started — ${health.detail}` };
    }
    sleepSync(2000);
  }
  return {
    ok: false,
    detail: 'langfuse compose up completed but health probe never returned 200/401 within 90s',
  };
}

function buildStatus(
  cfg: StackConfig,
  mode: 'launchd' | 'direct',
  messages: string[] = []
): StackStatusReport {
  const pg = probePostgres(cfg);
  const mastra = probeMastra(cfg);
  const embed = probeEmbed(cfg);
  const langfuse = probeLangfuseHealth();
  const scheduler = makeSchedulerStatus(cfg);
  const zeroCache = probeZeroCacheState(cfg);
  const queueProbe = probeQueueDetail(cfg);

  const postgresState: ServiceState = pg.ok ? 'healthy' : 'unhealthy';
  const mastraState: ServiceState = mastra.ok ? 'healthy' : 'unhealthy';
  const embedState: ServiceState = embed.ok ? 'healthy' : 'unhealthy';
  const langfuseState: ServiceState = langfuse.state;
  const queue: QueueStatus = {
    backend: queueProbe.backend,
    ready: queueProbe.ready,
    detail: queueProbe.detail,
  };

  const report: StackStatusReport = {
    // stack up still gates on postgres+mastra only; embed/queue/langfuse are ops-visibility
    ok: postgresState === 'healthy' && mastraState === 'healthy',
    postgres: postgresState,
    mastra: mastraState,
    scheduler,
    zero_cache: zeroCache,
    embed: embedState,
    langfuse: langfuseState,
    queue,
    services: {
      postgres: postgresState,
      mastra: mastraState,
      scheduler: scheduler.state,
      zerocache: zeroCache,
      embed: embedState,
      langfuse: langfuseState,
      queue,
    },
    mode,
    messages,
    probes: {
      postgres: pg.detail,
      mastra: mastra.detail,
      embed: embed.detail,
      langfuse: langfuse.detail,
      queue: queueProbe.detail,
      scheduler: `placeholder=${scheduler.placeholder} program=${scheduler.program} state=${scheduler.state}`,
    },
  };

  if (mode === 'launchd') {
    report.probes.launchd_postgres = probeLaunchdRunning(LAUNCHD_LABELS.postgres).detail;
    report.probes.launchd_mastra = probeLaunchdRunning(LAUNCHD_LABELS.mastra).detail;
    report.probes.launchd_scheduler = probeLaunchdRunning(LAUNCHD_LABELS.scheduler).detail;
  }

  return report;
}

export function formatStatusText(report: StackStatusReport): string {
  const lines: string[] = [];
  lines.push('holo stack status');
  lines.push(`  postgres:    ${report.postgres}`);
  lines.push(`  mastra:      ${report.mastra}`);
  lines.push(
    `  scheduler:   ${report.scheduler.state} (placeholder=${report.scheduler.placeholder})`
  );
  lines.push(`  zero_cache:  ${report.zero_cache}`);
  lines.push(`  embed:       ${report.embed}`);
  lines.push(`  langfuse:    ${report.langfuse}`);
  lines.push(`  queue:       backend=${report.queue.backend} ready=${report.queue.ready}`);
  lines.push(`  mode:        ${report.mode}`);
  if (report.elapsed_ms !== undefined) {
    lines.push(`  elapsed_ms:  ${report.elapsed_ms}`);
  }
  for (const m of report.messages) {
    lines.push(`  · ${m}`);
  }
  lines.push(report.ok ? '  status: OK' : '  status: DEGRADED');
  return lines.join('\n');
}

function requiredHealthy(report: StackStatusReport): boolean {
  // Scheduler pending is OK; zero-cache disabled is OK (opt-in via HOLO_ENABLE_ZERO_CACHE)
  return report.postgres === 'healthy' && report.mastra === 'healthy';
}

/** Opt-in zero_cache boot — secrets + flag gate (never start /usr/bin/true). */
export function zeroCacheBootEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HOLO_ENABLE_ZERO_CACHE === '0') return false;
  if (env.HOLO_ENABLE_ZERO_CACHE === '1') return true;
  // Implicit enable when admin password is present (same as Maestro harness)
  return Boolean(env.ZERO_ADMIN_PASSWORD && env.ZERO_ADMIN_PASSWORD.length > 0);
}

function startDirectPostgres(cfg: StackConfig): { ok: boolean; detail: string; pid?: number } {
  const postgresBin = resolve(cfg.pgBin, 'postgres');
  if (!existsSync(postgresBin)) {
    return { ok: false, detail: `postgres binary missing: ${postgresBin}` };
  }
  if (!existsSync(cfg.pgData)) {
    return { ok: false, detail: `PGDATA missing: ${cfg.pgData}` };
  }
  const existing = probePostgres(cfg);
  if (existing.ok) {
    return { ok: true, detail: 'postgres already accepting connections' };
  }
  const child = spawn(postgresBin, ['-D', cfg.pgData], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PATH: `${cfg.pgBin}:/usr/bin:/bin`,
      HOME: cfg.home,
      LC_ALL: 'en_US.UTF-8',
    },
  });
  child.unref();
  if (!child.pid) return { ok: false, detail: 'failed to spawn postgres' };
  return { ok: true, detail: `spawned postgres pid=${child.pid}`, pid: child.pid };
}

function startDirectMastra(cfg: StackConfig): { ok: boolean; detail: string; pid?: number } {
  const holoCli = resolve(cfg.holoRoot, 'services/platform/src/cli/holo.ts');
  if (!existsSync(holoCli)) {
    return { ok: false, detail: `holo.ts missing: ${holoCli}` };
  }
  const health = probeMastra(cfg);
  if (health.ok) {
    return { ok: true, detail: 'mastra already healthy' };
  }
  const child = spawn(cfg.bunBin, [holoCli, 'service:up'], {
    detached: true,
    stdio: 'ignore',
    cwd: cfg.holoRoot,
    env: {
      ...process.env,
      HOME: cfg.home,
      PATH: `${resolve(cfg.bunBin, '..')}:${cfg.pgBin}:/opt/homebrew/bin:/usr/bin:/bin`,
      HOLO_ROOT: cfg.holoRoot,
      DATABASE_URL: cfg.databaseUrl,
      PORT: String(cfg.mastraPort),
      FLEET_URL: cfg.fleetUrl,
    },
  });
  child.unref();
  if (!child.pid) return { ok: false, detail: 'failed to spawn mastra' };
  return { ok: true, detail: `spawned mastra pid=${child.pid}`, pid: child.pid };
}

function startDirectZeroCache(cfg: StackConfig): { ok: boolean; detail: string; pid?: number } {
  if (probeZeroCacheHttp().ok) {
    return { ok: true, detail: 'zero_cache already healthy (keepalive)' };
  }
  const wrapper = resolve(cfg.repoRoot, 'scripts/run-zero-cache.sh');
  const alt = resolve(cfg.holoRoot, 'scripts/run-zero-cache.sh');
  const script = existsSync(wrapper) ? wrapper : alt;
  if (!existsSync(script)) {
    return {
      ok: false,
      detail: `run-zero-cache.sh missing (expected ${wrapper}); see docs/ops/zero-cache-enable.md`,
    };
  }
  if (!process.env.ZERO_ADMIN_PASSWORD) {
    return {
      ok: false,
      detail: 'ZERO_ADMIN_PASSWORD required to boot zero_cache — docs/ops/zero-cache-enable.md',
    };
  }
  const child = spawn('/bin/bash', [script], {
    detached: true,
    stdio: 'ignore',
    cwd: cfg.holoRoot,
    env: {
      ...process.env,
      HOME: cfg.home,
      HOLO_ROOT: cfg.holoRoot,
      DATABASE_URL: process.env.DATABASE_URL ?? cfg.databaseUrl,
      ZERO_UPSTREAM_DB: process.env.ZERO_UPSTREAM_DB ?? process.env.DATABASE_URL ?? cfg.databaseUrl,
      PATH: `${resolve(cfg.holoRoot, 'node_modules/.bin')}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
    },
  });
  child.unref();
  if (!child.pid) return { ok: false, detail: 'failed to spawn zero_cache' };
  return { ok: true, detail: `spawned zero_cache pid=${child.pid}`, pid: child.pid };
}

function stopDirect(cfg: StackConfig): string[] {
  const messages: string[] = [];
  const pids = readDirectPids(cfg);
  for (const [name, pid] of Object.entries(pids)) {
    if (pid && pidAlive(pid)) {
      spawnSync('kill', ['-TERM', String(pid)]);
      messages.push(`SIGTERM direct ${name} pid=${pid}`);
    }
  }
  sleepSync(500);
  for (const [name, pid] of Object.entries(pids)) {
    if (pid && pidAlive(pid)) {
      spawnSync('kill', ['-KILL', String(pid)]);
      messages.push(`SIGKILL direct ${name} pid=${pid}`);
    }
  }
  messages.push(...killResidualStackProcesses(cfg));
  clearDirectPids(cfg);
  return messages;
}

function waitUntilHealthy(
  cfg: StackConfig,
  mode: 'launchd' | 'direct',
  deadlineMs: number
): StackStatusReport {
  const started = Date.now();
  let last = buildStatus(cfg, mode);
  while (Date.now() - started < deadlineMs) {
    last = buildStatus(cfg, mode);
    if (requiredHealthy(last)) {
      last.elapsed_ms = Date.now() - started;
      return last;
    }
    sleepSync(400);
  }
  last = buildStatus(cfg, mode);
  last.elapsed_ms = Date.now() - started;
  last.messages = [
    ...last.messages,
    `timeout after ${deadlineMs}ms — postgres=${last.postgres} mastra=${last.mastra}`,
  ];
  last.ok = false;
  return last;
}

/**
 * stack up — ensure Postgres + Mastra healthy within 60s.
 * Scheduler skipped (pending). Zero-cache boot path enabled when opted-in
 * (HOLO_ENABLE_ZERO_CACHE=1 or ZERO_ADMIN_PASSWORD); otherwise honest disabled.
 */
export function stackUp(options?: { cfg?: StackConfig; timeoutMs?: number }): StackCommandResult {
  const cfg = options?.cfg ?? loadStackConfig();
  const timeoutMs = options?.timeoutMs ?? STACK_UP_TIMEOUT_MS;
  const started = Date.now();
  const messages: string[] = [];

  const useLaunchd = isDarwin() && launchdAvailable(cfg);
  const mode: 'launchd' | 'direct' = useLaunchd ? 'launchd' : 'direct';

  // Fast path: already healthy
  let status = buildStatus(cfg, mode);
  if (requiredHealthy(status)) {
    status.elapsed_ms = Date.now() - started;
    status.messages = ['already healthy'];
    return {
      ok: true,
      exitCode: 0,
      report: status,
      text: formatStatusText(status),
    };
  }

  if (mode === 'launchd') {
    const installed = ensureLaunchAgentsInstalled(cfg);
    messages.push(...installed.messages.slice(-8));
    if (!installed.ok) {
      status = buildStatus(cfg, mode, messages);
      status.ok = false;
      status.elapsed_ms = Date.now() - started;
      return { ok: false, exitCode: 1, report: status, text: formatStatusText(status) };
    }

    // Avoid brew services fighting for the same port
    spawnSync('brew', ['services', 'stop', 'postgresql@18'], { encoding: 'utf8', timeout: 15_000 });

    const pgHealthy = probePostgres(cfg).ok;
    const mastraHealthy = probeMastra(cfg).ok;

    // Postgres
    if (!pgHealthy) {
      const ens = ensureServiceLoaded(cfg, LAUNCHD_LABELS.postgres, { forceRestart: true });
      messages.push(ens.detail);
      if (!ens.ok) {
        status = buildStatus(cfg, mode, messages);
        status.elapsed_ms = Date.now() - started;
        return { ok: false, exitCode: 1, report: status, text: formatStatusText(status) };
      }
    } else {
      // Ensure launchd tracks it even if already healthy via other means
      const ens = ensureServiceLoaded(cfg, LAUNCHD_LABELS.postgres);
      messages.push(ens.detail);
    }

    // Mastra — force restart if unhealthy (AC-5 kill/restart)
    if (!mastraHealthy) {
      const ens = ensureServiceLoaded(cfg, LAUNCHD_LABELS.mastra, { forceRestart: true });
      messages.push(ens.detail);
      if (!ens.ok) {
        status = buildStatus(cfg, mode, messages);
        status.elapsed_ms = Date.now() - started;
        return { ok: false, exitCode: 1, report: status, text: formatStatusText(status) };
      }
    } else {
      const ens = ensureServiceLoaded(cfg, LAUNCHD_LABELS.mastra);
      messages.push(ens.detail);
    }

    // S31-02: scheduler is the leased-queue consumer. Enable (do not boot out)
    // and load the real worker (scheduler-worker.ts) — never /usr/bin/true.
    const schedEns = ensureServiceLoaded(cfg, LAUNCHD_LABELS.scheduler);
    messages.push(schedEns.detail);
    const q = probeQueueDetail(cfg);
    messages.push(`scheduler: enabled (placeholder=false); consume loop active`);
    messages.push(`queue: backend=${q.backend} ready=${q.ready}`);

    // zero_cache boot path (Sprint 24) — opt-in only; never claim healthy without probe
    if (zeroCacheBootEnabled()) {
      const ens = ensureServiceLoaded(cfg, LAUNCHD_LABELS.zerocache, { forceRestart: true });
      messages.push(`zero_cache: boot attempted — ${ens.detail}`);
      if (!ens.ok) {
        messages.push(
          'zero_cache: enable failed — see docs/ops/zero-cache-enable.md (ZERO_ADMIN_PASSWORD, pnpm install, run-zero-cache.sh)'
        );
      }
    } else {
      bootoutLabel(cfg, LAUNCHD_LABELS.zerocache);
      messages.push(
        'zero_cache: disabled (set HOLO_ENABLE_ZERO_CACHE=1 + ZERO_ADMIN_PASSWORD to boot; docs/ops/zero-cache-enable.md)'
      );
    }

    // S31-07: self-hosted Langfuse from in-repo compose artifacts
    const lf = ensureLangfuseUp(cfg);
    messages.push(`langfuse: ${lf.detail}`);
  } else {
    const pids = readDirectPids(cfg);
    const pg = startDirectPostgres(cfg);
    messages.push(pg.detail);
    if (pg.pid) pids.postgres = pg.pid;
    if (!pg.ok && !probePostgres(cfg).ok) {
      status = buildStatus(cfg, mode, messages);
      status.elapsed_ms = Date.now() - started;
      return { ok: false, exitCode: 1, report: status, text: formatStatusText(status) };
    }
    if (!probeMastra(cfg).ok) {
      // Kill stale mastra if tracked
      if (pids.mastra && pidAlive(pids.mastra)) {
        spawnSync('kill', ['-KILL', String(pids.mastra)]);
      }
      const m = startDirectMastra(cfg);
      messages.push(m.detail);
      if (m.pid) pids.mastra = m.pid;
      if (!m.ok) {
        status = buildStatus(cfg, mode, messages);
        status.elapsed_ms = Date.now() - started;
        return { ok: false, exitCode: 1, report: status, text: formatStatusText(status) };
      }
    }
    writeDirectPids(cfg, pids);
    // Direct mode: start queue backend via probe (ensures schema + meta ready)
    const q = probeQueueDetail(cfg);
    messages.push(`scheduler: direct mode (queue backend=${q.backend} ready=${q.ready})`);
    if (zeroCacheBootEnabled()) {
      const z = startDirectZeroCache(cfg);
      messages.push(z.detail);
      if (z.pid) pids.zerocache = z.pid;
      writeDirectPids(cfg, pids);
    } else {
      messages.push(
        'zero_cache: disabled (set HOLO_ENABLE_ZERO_CACHE=1 + ZERO_ADMIN_PASSWORD to boot; docs/ops/zero-cache-enable.md)'
      );
    }

    // S31-07: self-hosted Langfuse from in-repo compose artifacts (direct mode)
    const lf = ensureLangfuseUp(cfg);
    messages.push(`langfuse: ${lf.detail}`);
  }

  const remaining = Math.max(1000, timeoutMs - (Date.now() - started));
  status = waitUntilHealthy(cfg, mode, remaining);
  status.messages = [...messages, ...status.messages];
  status.elapsed_ms = Date.now() - started;

  // Fail closed on timeout
  if (!requiredHealthy(status) || status.elapsed_ms > timeoutMs) {
    status.ok = false;
    if (status.elapsed_ms > timeoutMs) {
      status.messages.push(`exceeded ${timeoutMs}ms deadline`);
    }
    return {
      ok: false,
      exitCode: 1,
      report: status,
      text: formatStatusText(status),
    };
  }

  status.ok = true;
  return {
    ok: true,
    exitCode: 0,
    report: status,
    text: formatStatusText(status),
  };
}

function holocronLaunchdOrphans(): string[] {
  const list = spawnSync('launchctl', ['list'], { encoding: 'utf8', timeout: 10_000 });
  return (list.stdout ?? '')
    .split('\n')
    .filter((l) => /holocron-(postgres|mastra|zerocache)/i.test(l))
    .filter((l) => {
      const pid = l.trim().split(/\s+/)[0];
      return pid !== undefined && /^\d+$/.test(pid) && Number(pid) > 0;
    });
}

/**
 * True when stack is fully down: no holocron launchd PIDs, Mastra /health fails,
 * and the configured Holocron Postgres process is gone. Do not use pg_isready
 * here: an unrelated listener or VM SSH forward may keep the configured port
 * accepting connections after the Holocron launchd service has stopped.
 */
function stackIsFullyDown(
  cfg: StackConfig,
  mode: 'launchd' | 'direct'
): {
  down: boolean;
  orphans: string[];
  mastraUp: boolean;
  postgresUp: boolean;
} {
  const orphans = holocronLaunchdOrphans();
  const mastraUp = probeMastra(cfg).ok;
  const postgresProcess = probePostgresProcess(cfg);
  const launchdPostgresUp = mode === 'launchd' && probeLaunchdRunning(LAUNCHD_LABELS.postgres).ok;
  // An unavailable process probe is unknown, not proof of shutdown. Keep the
  // shutdown check fail-closed while still ignoring unrelated port listeners.
  const postgresUp = launchdPostgresUp || postgresProcess.ok || postgresProcess.exitCode === null;
  return {
    down: orphans.length === 0 && !mastraUp && !postgresUp,
    orphans,
    mastraUp,
    postgresUp,
  };
}

/**
 * stack down — bootout launchd units / kill direct processes; zero orphaned holocron PIDs.
 * Fails closed until Postgres is down (pg_isready fails), Mastra is down, and no holocron PIDs.
 */
export function stackDown(options?: { cfg?: StackConfig; timeoutMs?: number }): StackCommandResult {
  const cfg = options?.cfg ?? loadStackConfig();
  const timeoutMs = options?.timeoutMs ?? STACK_DOWN_TIMEOUT_MS;
  const started = Date.now();
  const messages: string[] = [];
  const useLaunchd = isDarwin() && launchdAvailable(cfg);
  const mode: 'launchd' | 'direct' = useLaunchd ? 'launchd' : 'direct';

  if (mode === 'launchd') {
    // Stop brew-managed postgresql so it cannot KeepAlive-race holocron PGDATA
    spawnSync('brew', ['services', 'stop', 'postgresql@18'], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    messages.push('brew services stop postgresql@18 (best-effort)');

    for (const label of [
      LAUNCHD_LABELS.mastra,
      LAUNCHD_LABELS.postgres,
      LAUNCHD_LABELS.scheduler,
      LAUNCHD_LABELS.zerocache,
    ]) {
      bootoutLabel(cfg, label);
      messages.push(`bootout ${label}`);
    }
    messages.push(...killResidualStackProcesses(cfg));
  } else {
    messages.push(...stopDirect(cfg));
  }

  // Wait until the configured Postgres process is gone, Mastra is down, and launchd PIDs cleared
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    const state = stackIsFullyDown(cfg, mode);
    if (state.down) break;

    if (mode === 'launchd') {
      // Re-bootout if KeepAlive / race re-listed agents with PIDs
      if (state.orphans.length > 0 || state.postgresUp) {
        bootoutLabel(cfg, LAUNCHD_LABELS.postgres);
        bootoutLabel(cfg, LAUNCHD_LABELS.mastra);
      }
    }
    // Residual kill: SIGTERM then SIGKILL for postgres + mastra
    killResidualStackProcesses(cfg);
    sleepSync(300);
  }

  // Final residual sweep + settle
  messages.push(...killResidualStackProcesses(cfg));
  sleepSync(200);

  const report = buildStatus(cfg, mode, messages);
  report.elapsed_ms = Date.now() - started;
  // After down, "ok" means clean shutdown: no orphans, mastra down, and the
  // configured Postgres process is gone (unrelated port listeners are ignored).
  const final = stackIsFullyDown(cfg, mode);
  report.ok = final.down;
  if (!report.ok) {
    report.messages.push(
      `clean shutdown incomplete: orphans=${final.orphans.length} mastra_up=${final.mastraUp} postgres_up=${final.postgresUp}`
    );
  } else {
    report.messages.push(
      'clean shutdown: zero holocron PIDs, mastra down, postgres not accepting connections'
    );
  }

  // stack down exits 0 on clean stop; nonzero if anything still up
  return {
    ok: report.ok,
    exitCode: report.ok ? 0 : 1,
    report,
    text: formatStatusText(report),
  };
}

/**
 * stack status — real probes for postgres/mastra/scheduler/queue; zero-cache honest.
 */
export function stackStatus(options?: { cfg?: StackConfig }): StackCommandResult {
  const cfg = options?.cfg ?? loadStackConfig();
  const mode: 'launchd' | 'direct' = isDarwin() && launchdAvailable(cfg) ? 'launchd' : 'direct';
  const report = buildStatus(cfg, mode);
  // status command exits 0 even when degraded — reporting is the job
  return {
    ok: true,
    exitCode: 0,
    report,
    text: formatStatusText(report),
  };
}

export { loadStackConfig, STACK_UP_TIMEOUT_MS, type StackConfig };
