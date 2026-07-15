/**
 * Real health probes for stack services — never mocked.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { StackConfig } from './config.ts';
import { LAUNCHD_LABELS } from './config.ts';

export type ServiceState =
  | 'healthy'
  | 'unhealthy'
  | 'pending'
  | 'disabled'
  | 'not_implemented'
  | 'skipped'
  | 'unknown';

export type ProbeResult = {
  ok: boolean;
  detail: string;
  exitCode: number | null;
};

function run(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options?.timeoutMs ?? 10_000,
    env: options?.env ?? process.env,
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

/** Real pg_isready against configured host/port. */
export function probePostgres(cfg: StackConfig): ProbeResult {
  const candidates = [
    resolve(cfg.pgBin, 'pg_isready'),
    '/opt/homebrew/opt/postgresql@18/bin/pg_isready',
    '/usr/local/opt/postgresql@18/bin/pg_isready',
    'pg_isready',
  ];
  let last: ProbeResult = { ok: false, detail: 'pg_isready not found', exitCode: null };
  for (const bin of candidates) {
    const r = run(bin, ['-h', cfg.pgHost, '-p', String(cfg.pgPort)], { timeoutMs: 5_000 });
    if (r.status === null && /ENOENT|not found/i.test(r.combined)) {
      last = { ok: false, detail: `missing ${bin}`, exitCode: null };
      continue;
    }
    return {
      ok: r.status === 0,
      detail: r.combined.trim() || (r.status === 0 ? 'accepting connections' : 'not ready'),
      exitCode: r.status,
    };
  }
  return last;
}

/** Real HTTP GET to Mastra /health. */
export function probeMastra(cfg: StackConfig): ProbeResult {
  const r = run('curl', ['-sf', '--max-time', '5', cfg.mastraHealthUrl], { timeoutMs: 8_000 });
  return {
    ok: r.status === 0 && r.stdout.trim().length > 0,
    detail: r.status === 0 ? r.stdout.trim().slice(0, 200) : r.combined.trim().slice(0, 200),
    exitCode: r.status,
  };
}

/**
 * Parse `launchctl list` for a label.
 * Format: PID Status Label — PID "-" means not running.
 */
export function launchctlListLine(label: string): {
  listed: boolean;
  pid: number | null;
  status: number | null;
  line: string | null;
} {
  const r = run('launchctl', ['list'], { timeoutMs: 10_000 });
  if (r.status !== 0) {
    return { listed: false, pid: null, status: null, line: null };
  }
  const line =
    r.stdout
      .split('\n')
      .map((l) => l.trim())
      .find((l) => {
        const parts = l.split(/\s+/);
        return parts[parts.length - 1] === label;
      }) ?? null;
  if (!line) return { listed: false, pid: null, status: null, line: null };
  const parts = line.split(/\s+/);
  const pidRaw = parts[0] ?? '-';
  const statusRaw = parts[1] ?? '';
  const pid = pidRaw === '-' || pidRaw === '' ? null : Number(pidRaw);
  const status = /^-?\d+$/.test(statusRaw) ? Number(statusRaw) : null;
  return {
    listed: true,
    pid: Number.isFinite(pid) ? pid : null,
    status,
    line,
  };
}

export function probeLaunchdRunning(label: string): ProbeResult {
  const info = launchctlListLine(label);
  if (!info.listed) {
    return { ok: false, detail: `${label} not in launchctl list`, exitCode: 1 };
  }
  if (info.pid === null || info.pid <= 0) {
    return {
      ok: false,
      detail: `${label} listed but not running (pid=-)`,
      exitCode: info.status ?? 1,
    };
  }
  return {
    ok: true,
    detail: `${label} pid=${info.pid}`,
    exitCode: 0,
  };
}

/** Read Disabled key from an installed plist (honest disabled slots). */
export function plistIsDisabled(plistFile: string): boolean {
  const r = run('/usr/bin/plutil', ['-extract', 'Disabled', 'raw', '-o', '-', plistFile], {
    timeoutMs: 5_000,
  });
  if (r.status !== 0) return false;
  return r.stdout.trim() === 'true' || r.stdout.trim() === '1';
}

export function probeSchedulerState(cfg: StackConfig): ServiceState {
  // Sprint 11 owns scheduler — always pending/disabled, never healthy
  void cfg;
  const listed = launchctlListLine(LAUNCHD_LABELS.scheduler);
  if (listed.pid && listed.pid > 0) {
    // Should not happen with Disabled=true; still never report healthy
    return 'pending';
  }
  return 'pending';
}

export function probeZeroCacheState(cfg: StackConfig): ServiceState {
  const listed = launchctlListLine(LAUNCHD_LABELS.zerocache);
  if (listed.pid && listed.pid > 0) {
    // Only healthy if a real PID is running (Sprint 20 wire-up)
    return 'healthy';
  }
  // Installed disabled unit or not loaded — honest disabled
  const plist = resolve(cfg.launchAgentsDir, `${LAUNCHD_LABELS.zerocache}.plist`);
  if (plistIsDisabled(plist) || !listed.listed) {
    return 'disabled';
  }
  return 'not_implemented';
}
