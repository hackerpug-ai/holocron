/**
 * Real health probes for stack services — never mocked.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FleetRole } from '../fleet/manifest.schema.ts';
import { getFleetManifest, getRoleEntry } from '../fleet/manifest.ts';
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

/** Strip trailing slash and optional /v1 so probe path can be appended cleanly. */
function normalizeEndpointBase(endpoint: string): string {
  return endpoint.replace(/\/$/, '').replace(/\/v1$/i, '');
}

/**
 * Build the fleet embed health URL + contract from the Fleet Role Manifest.
 * Contract (path/method/timeoutMs/expectStatus) is read from the embed role —
 * never hardcoded here.
 */
export function resolveEmbedHealthProbe(options?: {
  manifestPath?: string;
  endpointOverride?: string;
}): {
  url: string;
  method: 'GET' | 'HEAD';
  timeoutMs: number;
  expectStatus: number;
  endpoint: string;
  path: string;
} {
  const manifest = getFleetManifest(options?.manifestPath);
  const role: FleetRole = getRoleEntry(manifest, 'embed');
  const endpoint = normalizeEndpointBase(options?.endpointOverride ?? role.endpoint);
  const path = role.healthProbe.path.startsWith('/')
    ? role.healthProbe.path
    : `/${role.healthProbe.path}`;
  return {
    url: `${endpoint}${path}`,
    method: role.healthProbe.method,
    timeoutMs: role.healthProbe.timeoutMs,
    expectStatus: role.healthProbe.expectStatus ?? 200,
    endpoint,
    path,
  };
}

/**
 * Real HTTP probe of fleet embed-route health using Fleet Role Manifest
 * healthProbe contract (CAP-EMB-01 ops visibility). Fail-fast on timeout.
 */
export function probeEmbed(cfg?: StackConfig, options?: { manifestPath?: string }): ProbeResult {
  void cfg;
  let contract: ReturnType<typeof resolveEmbedHealthProbe>;
  try {
    contract = resolveEmbedHealthProbe({ manifestPath: options?.manifestPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail: `embed healthProbe contract unavailable: ${msg}`,
      exitCode: 1,
    };
  }

  // curl max-time is whole seconds; ceil so sub-second contracts still fail closed.
  const maxTimeSec = Math.max(1, Math.ceil(contract.timeoutMs / 1000));
  // spawnSync timeout slightly above curl so curl's --max-time wins for fail-fast.
  const spawnTimeoutMs = contract.timeoutMs + 1500;

  const r = run(
    'curl',
    [
      '-sS',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '--max-time',
      String(maxTimeSec),
      '-X',
      contract.method,
      '-H',
      'accept: application/json',
      contract.url,
    ],
    { timeoutMs: spawnTimeoutMs }
  );

  const httpCodeRaw = r.stdout.trim();
  const httpCode = Number(httpCodeRaw);
  const timedOut =
    r.status === null ||
    /timed?\s*out|operation timed out|curl: \(28\)/i.test(r.combined) ||
    (r.status !== 0 && httpCodeRaw === '000');

  if (timedOut) {
    return {
      ok: false,
      detail: `embed probe timeout after ${contract.timeoutMs}ms at ${contract.url}`,
      exitCode: r.status ?? 28,
    };
  }

  if (!Number.isFinite(httpCode) || httpCode === 0) {
    return {
      ok: false,
      detail: `embed probe failed at ${contract.url}: ${r.combined.trim().slice(0, 200) || 'unreachable'}`,
      exitCode: r.status,
    };
  }

  if (httpCode !== contract.expectStatus) {
    return {
      ok: false,
      detail: `embed probe HTTP ${httpCode} (expected ${contract.expectStatus}) at ${contract.url}`,
      exitCode: r.status ?? 1,
    };
  }

  return {
    ok: true,
    detail: `embed healthy HTTP ${httpCode} ${contract.method} ${contract.url}`,
    exitCode: 0,
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

/**
 * Check for the configured Postgres process itself, scoped to this stack's PGDATA.
 * This deliberately does not use the configured TCP port: another service (for
 * example, a VM SSH forward) may legitimately be listening on that port.
 */
export function probePostgresProcess(cfg: StackConfig): ProbeResult {
  const escapedPgData = cfg.pgData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = `postgres.*-D[[:space:]]*${escapedPgData}`;
  const r = run('pgrep', ['-f', pattern], { timeoutMs: 5_000 });
  const pids = r.stdout
    .split('\n')
    .map((pid) => pid.trim())
    .filter((pid) => /^\d+$/.test(pid));

  if (r.status === 0 && pids.length > 0) {
    return {
      ok: true,
      detail: `configured postgres process pid=${pids.join(',')} PGDATA=${cfg.pgData}`,
      exitCode: 0,
    };
  }
  if (r.status === 1) {
    return {
      ok: false,
      detail: `no configured postgres process (PGDATA=${cfg.pgData})`,
      exitCode: 1,
    };
  }
  // pgrep errors are not evidence that the service is down. Callers checking
  // shutdown must treat this as unknown and fail closed.
  return {
    ok: false,
    detail: `unable to verify configured postgres process: ${r.combined.trim().slice(0, 200)}`,
    exitCode: null,
  };
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

/** Real scheduler program path (never /usr/bin/true). */
export function schedulerProgramPath(cfg: StackConfig): string {
  return resolve(cfg.holoRoot, 'packages/platform/src/queue/scheduler-worker.ts');
}

/**
 * Read ProgramArguments[0..] from the installed (or template) scheduler plist.
 * Used so stack status never claims a fake /usr/bin/true placeholder.
 */
export function readSchedulerProgram(cfg: StackConfig): {
  program: string;
  placeholder: boolean;
  source: 'installed' | 'template' | 'default';
} {
  const installed = resolve(cfg.launchAgentsDir, `${LAUNCHD_LABELS.scheduler}.plist`);
  const template = resolve(cfg.templateDir, `${LAUNCHD_LABELS.scheduler}.plist`);
  const fallback = schedulerProgramPath(cfg);

  const tryRead = (path: string, source: 'installed' | 'template') => {
    const r = run('/usr/bin/plutil', ['-extract', 'ProgramArguments', 'json', '-o', '-', path], {
      timeoutMs: 5_000,
    });
    if (r.status !== 0) return null;
    try {
      const args = JSON.parse(r.stdout.trim()) as string[];
      // Prefer the script path (args[1] when bun + script); else first arg.
      const program =
        args.find((a) => /scheduler-worker/.test(a)) ?? args[args.length - 1] ?? args[0] ?? '';
      return { program, source };
    } catch {
      return null;
    }
  };

  const fromInstalled = existsSync(installed) ? tryRead(installed, 'installed') : null;
  const fromTemplate = existsSync(template) ? tryRead(template, 'template') : null;
  // Prefer non-placeholder program: template may be newer than a stale installed agent.
  const isPlaceholder = (p: string) => p === '/usr/bin/true' || /\/usr\/bin\/true$/.test(p);
  let picked = fromInstalled ?? fromTemplate;
  if (
    fromInstalled &&
    isPlaceholder(fromInstalled.program) &&
    fromTemplate &&
    !isPlaceholder(fromTemplate.program)
  ) {
    picked = fromTemplate;
  }
  const program = picked?.program || fallback;
  const placeholder = isPlaceholder(program);
  return {
    program,
    placeholder,
    source: picked?.source ?? 'default',
  };
}

export type SchedulerProbeDetail = {
  state: ServiceState;
  placeholder: boolean;
  program: string;
};

/**
 * Probe scheduler: real launchctl PID when loaded; never report healthy for
 * /usr/bin/true placeholder. Real worker (scheduler-worker.ts) may be healthy.
 */
export function probeSchedulerState(cfg: StackConfig): ServiceState {
  return probeSchedulerDetail(cfg).state;
}

export function probeSchedulerDetail(cfg: StackConfig): SchedulerProbeDetail {
  const prog = readSchedulerProgram(cfg);
  if (prog.placeholder) {
    return { state: 'pending', placeholder: true, program: prog.program };
  }
  const listed = launchctlListLine(LAUNCHD_LABELS.scheduler);
  if (listed.pid && listed.pid > 0) {
    return { state: 'healthy', placeholder: false, program: prog.program };
  }
  // Real program wired but not running — honest pending (not fake healthy).
  return { state: 'pending', placeholder: false, program: prog.program };
}

/** HTTP keepalive probe for zero-cache (default :4848). */
export function probeZeroCacheHttp(port = Number(process.env.ZERO_PORT ?? 4848)): ProbeResult {
  const url = `http://127.0.0.1:${Number.isFinite(port) ? port : 4848}/keepalive`;
  const r = run('curl', ['-sf', '--max-time', '2', url], { timeoutMs: 4_000 });
  return {
    ok: r.status === 0,
    detail:
      r.status === 0 ? `zero-cache keepalive ok (${url})` : `zero-cache keepalive fail (${url})`,
    exitCode: r.status,
  };
}

/**
 * Honest zero_cache state:
 * - healthy when HTTP keepalive succeeds OR a real launchd PID is running
 * - disabled when unit is Disabled / not loaded / boot path not opted-in
 * - pending when enabled but not ready
 * - unhealthy when process claimed but keepalive fails
 */
export function probeZeroCacheState(cfg: StackConfig): ServiceState {
  // Prefer live HTTP — covers launchd, direct spawn, and Maestro foreground.
  if (probeZeroCacheHttp().ok) {
    return 'healthy';
  }

  const listed = launchctlListLine(LAUNCHD_LABELS.zerocache);
  if (listed.pid && listed.pid > 0) {
    // PID present but keepalive not answering yet → pending (not fake healthy)
    return 'pending';
  }

  const plist = resolve(cfg.launchAgentsDir, `${LAUNCHD_LABELS.zerocache}.plist`);
  const disabled = plistIsDisabled(plist);
  const enableFlag =
    process.env.HOLO_ENABLE_ZERO_CACHE === '1' || Boolean(process.env.ZERO_ADMIN_PASSWORD);

  if (disabled || !listed.listed) {
    return enableFlag ? 'pending' : 'disabled';
  }

  // Listed without PID and without keepalive
  return enableFlag ? 'unhealthy' : 'disabled';
}

export type QueueProbeDetail = {
  backend: 'pg-boss' | 'graphile-worker' | 'process-local' | 'unknown';
  ready: boolean;
  detail: string;
};

/**
 * Sync queue readiness probe against real Postgres (psql SELECT).
 * Never reports process-local as healthy production backend.
 */
export function probeQueueDetail(cfg: StackConfig): QueueProbeDetail {
  const psqlCandidates = [
    resolve(cfg.pgBin, 'psql'),
    '/opt/homebrew/opt/postgresql@18/bin/psql',
    '/usr/local/opt/postgresql@18/bin/psql',
    'psql',
  ];
  const sql = `SELECT COALESCE(backend,'pg-boss') || '|' || COALESCE(ready::text,'false') FROM queue_backend_meta WHERE id = 1`;
  for (const bin of psqlCandidates) {
    const r = run(
      bin,
      [
        '-h',
        cfg.pgHost,
        '-p',
        String(cfg.pgPort),
        '-d',
        'holocron',
        '-v',
        'ON_ERROR_STOP=1',
        '-t',
        '-A',
        '-c',
        sql,
      ],
      {
        timeoutMs: 5_000,
        env: {
          ...process.env,
          DATABASE_URL: cfg.databaseUrl,
          PGHOST: cfg.pgHost,
          PGPORT: String(cfg.pgPort),
        },
      }
    );
    if (r.status === null && /ENOENT|not found/i.test(r.combined)) continue;
    if (r.status !== 0) {
      // Table may not exist yet — try create-via-probe script fallback below.
      break;
    }
    const raw = r.stdout.trim();
    const [backendRaw, readyRaw] = raw.split('|');
    const backend =
      backendRaw === 'graphile-worker'
        ? 'graphile-worker'
        : backendRaw === 'pg-boss'
          ? 'pg-boss'
          : 'unknown';
    const ready = readyRaw === 't' || readyRaw === 'true';
    if ((backend === 'pg-boss' || backend === 'graphile-worker') && ready) {
      return {
        backend,
        ready,
        detail: `queue meta backend=${backend} ready=${ready}`,
      };
    }
    // meta stale (ready=false) or backend unknown: break to the probe-cli
    // activation path, which starts the real backend (pg-boss/graphile-worker)
    // and marks readiness from a live round-trip — never reports a stale
    // ready=false when the backend is in fact operational.
    break;
  }

  // Fallback / ensure: run probe-cli (startQueueBackend + probe) via bun.
  const probeCliCandidates = [
    resolve(cfg.repoRoot, 'packages/platform/src/queue/probe-cli.ts'),
    resolve(cfg.holoRoot, 'packages/platform/src/queue/probe-cli.ts'),
  ];
  const probeCli = probeCliCandidates.find((p) => existsSync(p));
  if (probeCli) {
    const r = run(cfg.bunBin, [probeCli], {
      timeoutMs: 30_000,
      env: { ...process.env, DATABASE_URL: cfg.databaseUrl },
    });
    const line =
      r.stdout
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('{')) ?? r.stdout.trim();
    try {
      const parsed = JSON.parse(line) as {
        backend?: string;
        ready?: boolean;
        detail?: string;
      };
      const backend =
        parsed.backend === 'graphile-worker'
          ? 'graphile-worker'
          : parsed.backend === 'pg-boss'
            ? 'pg-boss'
            : 'unknown';
      if (backend === 'pg-boss' || backend === 'graphile-worker') {
        return {
          backend,
          ready: Boolean(parsed.ready),
          detail: parsed.detail ?? 'queue probe via probe-cli',
        };
      }
    } catch {
      // fall through
    }
    return {
      backend: 'unknown',
      ready: false,
      detail: `queue probe-cli failed: ${r.combined.trim().slice(0, 240)}`,
    };
  }

  return {
    backend: 'unknown',
    ready: false,
    detail: 'queue_backend_meta unreachable and no probe-cli',
  };
}
