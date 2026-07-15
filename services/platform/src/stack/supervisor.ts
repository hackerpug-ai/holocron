/**
 * Stack supervisor — holo stack up | down | status
 *
 * Orchestrates Postgres + Mastra via launchd (Darwin) with real health probes.
 * Scheduler: always pending (Sprint 11). Zero-cache: disabled until Sprint 20.
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
  probeLaunchdRunning,
  probeMastra,
  probePostgres,
  probeSchedulerState,
  probeZeroCacheState,
  type ServiceState,
} from './probes.ts';

export type StackStatusReport = {
  ok: boolean;
  postgres: ServiceState;
  mastra: ServiceState;
  scheduler: ServiceState;
  zero_cache: ServiceState;
  /** Nested form for operators / tooling. */
  services: {
    postgres: ServiceState;
    mastra: ServiceState;
    scheduler: ServiceState;
    zerocache: ServiceState;
  };
  mode: 'launchd' | 'direct';
  elapsed_ms?: number;
  messages: string[];
  probes: {
    postgres: string;
    mastra: string;
    launchd_postgres?: string;
    launchd_mastra?: string;
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

type DirectPids = { postgres?: number; mastra?: number };

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

function buildStatus(
  cfg: StackConfig,
  mode: 'launchd' | 'direct',
  messages: string[] = []
): StackStatusReport {
  const pg = probePostgres(cfg);
  const mastra = probeMastra(cfg);
  const scheduler = probeSchedulerState(cfg);
  const zeroCache = probeZeroCacheState(cfg);

  const postgresState: ServiceState = pg.ok ? 'healthy' : 'unhealthy';
  const mastraState: ServiceState = mastra.ok ? 'healthy' : 'unhealthy';

  const report: StackStatusReport = {
    ok: postgresState === 'healthy' && mastraState === 'healthy',
    postgres: postgresState,
    mastra: mastraState,
    scheduler,
    zero_cache: zeroCache,
    services: {
      postgres: postgresState,
      mastra: mastraState,
      scheduler,
      zerocache: zeroCache,
    },
    mode,
    messages,
    probes: {
      postgres: pg.detail,
      mastra: mastra.detail,
    },
  };

  if (mode === 'launchd') {
    report.probes.launchd_postgres = probeLaunchdRunning(LAUNCHD_LABELS.postgres).detail;
    report.probes.launchd_mastra = probeLaunchdRunning(LAUNCHD_LABELS.mastra).detail;
  }

  return report;
}

export function formatStatusText(report: StackStatusReport): string {
  const lines: string[] = [];
  lines.push('holo stack status');
  lines.push(`  postgres:    ${report.postgres}`);
  lines.push(`  mastra:      ${report.mastra}`);
  lines.push(`  scheduler:   ${report.scheduler}`);
  lines.push(`  zero_cache:  ${report.zero_cache}`);
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
  // Scheduler pending is OK; zero-cache disabled is OK
  return report.postgres === 'healthy' && report.mastra === 'healthy';
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
 * Scheduler skipped (pending). Zero-cache not started (disabled).
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

    // Never bootstrap scheduler / zerocache (honest disabled)
    bootoutLabel(cfg, LAUNCHD_LABELS.scheduler);
    bootoutLabel(cfg, LAUNCHD_LABELS.zerocache);
    messages.push('scheduler: skipped (Sprint 11 pending)');
    messages.push('zero_cache: disabled (Sprint 20)');
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
    messages.push('scheduler: skipped (Sprint 11 pending)');
    messages.push('zero_cache: disabled (Sprint 20)');
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

/**
 * stack down — bootout launchd units / kill direct processes; zero orphaned holocron PIDs.
 */
export function stackDown(options?: { cfg?: StackConfig; timeoutMs?: number }): StackCommandResult {
  const cfg = options?.cfg ?? loadStackConfig();
  const timeoutMs = options?.timeoutMs ?? STACK_DOWN_TIMEOUT_MS;
  const started = Date.now();
  const messages: string[] = [];
  const useLaunchd = isDarwin() && launchdAvailable(cfg);
  const mode: 'launchd' | 'direct' = useLaunchd ? 'launchd' : 'direct';

  if (mode === 'launchd') {
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

  // Wait until mastra is down (and launchd PIDs cleared)
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    const mastraUp = probeMastra(cfg).ok;
    const list = spawnSync('launchctl', ['list'], { encoding: 'utf8', timeout: 10_000 });
    const holocronRunning = (list.stdout ?? '')
      .split('\n')
      .filter((l) => /holocron-(postgres|mastra|zerocache)/i.test(l))
      .some((l) => {
        const pid = l.trim().split(/\s+/)[0];
        return pid !== undefined && /^\d+$/.test(pid) && Number(pid) > 0;
      });
    if (!mastraUp && !holocronRunning) break;
    // Re-kill residuals if still up
    killResidualStackProcesses(cfg);
    sleepSync(300);
  }

  // Final residual sweep
  messages.push(...killResidualStackProcesses(cfg));

  const report = buildStatus(cfg, mode, messages);
  report.elapsed_ms = Date.now() - started;
  // After down, "ok" means clean shutdown succeeded (services intentionally down)
  const list = spawnSync('launchctl', ['list'], { encoding: 'utf8', timeout: 10_000 });
  const orphans = (list.stdout ?? '')
    .split('\n')
    .filter((l) => /holocron-(postgres|mastra|zerocache)/i.test(l))
    .filter((l) => {
      const pid = l.trim().split(/\s+/)[0];
      return pid !== undefined && /^\d+$/.test(pid) && Number(pid) > 0;
    });
  const mastraStillUp = probeMastra(cfg).ok;
  report.ok = orphans.length === 0 && !mastraStillUp;
  if (!report.ok) {
    report.messages.push(
      `clean shutdown incomplete: orphans=${orphans.length} mastra_up=${mastraStillUp}`
    );
  } else {
    report.messages.push('clean shutdown: zero holocron PIDs, mastra down');
  }

  // stack down exits 0 on clean stop; nonzero if orphans remain
  return {
    ok: report.ok,
    exitCode: report.ok ? 0 : 1,
    report,
    text: formatStatusText(report),
  };
}

/**
 * stack status — real probes; scheduler always pending; zero-cache honest.
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
