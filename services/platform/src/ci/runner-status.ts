/**
 * D02-03 / D03-02 — Self-hosted runner status probe (fail-closed).
 *
 * Lanes:
 *   integration (default) — online runner with [self-hosted, holocron, integration]
 *   e2e — online runner with [self-hosted, holocron, e2e] PLUS real
 *         MAESTRO_DEVICE (simctl) and EXPO_DEV_BUILD_PATH (.app) probes.
 *
 * NEVER hardcode simulator_present / build_present to true.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export const INTEGRATION_RUNNER_LABELS = [
  'self-hosted',
  'holocron',
  'integration',
] as const;

/** Default / backward-compat alias for integration lane. */
export const REQUIRED_RUNNER_LABELS = INTEGRATION_RUNNER_LABELS;

export const E2E_RUNNER_LABELS = ['self-hosted', 'holocron', 'e2e'] as const;

export type RunnerLane = 'integration' | 'e2e';

export type RunnerInfo = {
  name: string;
  status: string;
  labels: string[];
};

export type RunnerStatusResult = {
  ok: boolean;
  online: boolean;
  required_labels: string[];
  matching_runners: RunnerInfo[];
  errors: string[];
  source: 'status-file' | 'github-api' | 'none';
  lane: RunnerLane;
  /** e2e lane only — real simctl probe of MAESTRO_DEVICE */
  simulator_present?: boolean;
  simulator_name?: string | null;
  /** e2e lane only — real filesystem probe of EXPO_DEV_BUILD_PATH */
  build_present?: boolean;
  build_path?: string | null;
};

function labelsForLane(lane: RunnerLane): readonly string[] {
  return lane === 'e2e' ? E2E_RUNNER_LABELS : INTEGRATION_RUNNER_LABELS;
}

function hasRequiredLabels(
  labels: string[],
  required: readonly string[]
): boolean {
  const set = new Set(labels.map((l) => l.toLowerCase()));
  return required.every((l) => set.has(l.toLowerCase()));
}

function parseLane(raw: string | null | undefined): RunnerLane {
  const v = (raw ?? 'integration').trim().toLowerCase();
  if (v === 'e2e') return 'e2e';
  if (v === 'integration' || v === '') return 'integration';
  throw new Error(
    `invalid --lane "${raw}" (expected integration|e2e)`
  );
}

/**
 * Real simctl probe: MAESTRO_DEVICE must appear in `xcrun simctl list devices available`.
 * Never stubs true.
 */
export function probeSimulator(deviceName: string | undefined | null): {
  present: boolean;
  name: string | null;
  error?: string;
} {
  const name = (deviceName ?? '').trim();
  if (!name) {
    return {
      present: false,
      name: null,
      error: 'MAESTRO_DEVICE is unset — named iOS Simulator required for e2e lane',
    };
  }
  const r = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (r.error || r.status !== 0) {
    return {
      present: false,
      name,
      error: `simctl list failed: ${r.error?.message ?? r.stderr?.trim() ?? `exit ${r.status}`}`,
    };
  }
  const out = r.stdout ?? '';
  // Match device name as a whole token (simctl prints "    Name (UUID) (State)")
  const present = out
    .split('\n')
    .some((line) => line.includes(name) && !line.trimStart().startsWith('--'));
  if (!present) {
    return {
      present: false,
      name,
      error: `named simulator missing from simctl available list: ${name}`,
    };
  }
  return { present: true, name };
}

/**
 * Real filesystem probe of EXPO_DEV_BUILD_PATH.
 * Accepts a .app bundle directory (or a file path ending in .app).
 * Never stubs true.
 */
export function probeExpoDevBuild(buildPath: string | undefined | null): {
  present: boolean;
  path: string | null;
  error?: string;
} {
  const raw = (buildPath ?? '').trim();
  if (!raw) {
    return {
      present: false,
      path: null,
      error: 'EXPO_DEV_BUILD_PATH is unset — Expo dev-client .app required for e2e lane',
    };
  }
  const path = resolve(raw);
  if (!existsSync(path)) {
    return {
      present: false,
      path,
      error: `Expo dev build path does not exist: ${path}`,
    };
  }
  let st;
  try {
    st = statSync(path);
  } catch (e) {
    return {
      present: false,
      path,
      error: `cannot stat Expo dev build path: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const base = basename(path);
  if (!base.endsWith('.app')) {
    return {
      present: false,
      path,
      error: `EXPO_DEV_BUILD_PATH must end in .app (got ${base})`,
    };
  }
  // .app bundles are directories on macOS; also accept if somehow a file.
  if (st.isDirectory()) {
    const infoPlist = resolve(path, 'Info.plist');
    if (!existsSync(infoPlist)) {
      return {
        present: false,
        path,
        error: `Expo dev build .app missing Info.plist (stale or incomplete): ${path}`,
      };
    }
  } else if (!st.isFile()) {
    return {
      present: false,
      path,
      error: `EXPO_DEV_BUILD_PATH is not a file or directory: ${path}`,
    };
  }
  return { present: true, path };
}

function baseResult(
  lane: RunnerLane,
  required: readonly string[],
  partial: Omit<RunnerStatusResult, 'lane' | 'required_labels'>
): RunnerStatusResult {
  return {
    ...partial,
    lane,
    required_labels: [...required],
  };
}

function fromStatusFile(
  path: string,
  lane: RunnerLane,
  required: readonly string[]
): Omit<RunnerStatusResult, 'lane' | 'required_labels' | 'simulator_present' | 'simulator_name' | 'build_present' | 'build_path'> {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    online?: boolean;
    runners?: Array<{ name?: string; status?: string; labels?: string[] }>;
  };
  const runners: RunnerInfo[] = (raw.runners ?? []).map((r) => ({
    name: String(r.name ?? 'unknown'),
    status: String(r.status ?? 'unknown'),
    labels: (r.labels ?? []).map(String),
  }));
  const matching = runners.filter(
    (r) =>
      r.status.toLowerCase() === 'online' &&
      hasRequiredLabels(r.labels, required)
  );
  const online = matching.length > 0 && raw.online !== false;
  const errors: string[] = [];
  if (!online) {
    if (runners.length === 0) errors.push('no runners reported in status file');
    else if (matching.length === 0) {
      errors.push(
        `no online runner with required labels: ${required.join(',')}`
      );
    } else errors.push('runner reported offline');
  }
  return {
    ok: online,
    online,
    matching_runners: matching,
    errors,
    source: 'status-file',
  };
}

async function fromGitHubApi(
  lane: RunnerLane,
  required: readonly string[]
): Promise<
  Omit<
    RunnerStatusResult,
    | 'lane'
    | 'required_labels'
    | 'simulator_present'
    | 'simulator_name'
    | 'build_present'
    | 'build_path'
  >
> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    return {
      ok: false,
      online: false,
      matching_runners: [],
      errors: [
        'no HOLO_RUNNER_STATUS_FILE and missing GITHUB_TOKEN/GITHUB_REPOSITORY — runner status fail-closed',
      ],
      source: 'none',
    };
  }
  const url = `https://api.github.com/repos/${repo}/actions/runners?per_page=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'holocron-holo-ci-runner-status',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return {
      ok: false,
      online: false,
      matching_runners: [],
      errors: [`GitHub runners API HTTP ${res.status}`],
      source: 'github-api',
    };
  }
  const body = (await res.json()) as {
    runners?: Array<{
      name?: string;
      status?: string;
      labels?: Array<{ name?: string } | string>;
    }>;
  };
  const runners: RunnerInfo[] = (body.runners ?? []).map((r) => ({
    name: String(r.name ?? 'unknown'),
    status: String(r.status ?? 'unknown'),
    labels: (r.labels ?? []).map((l) =>
      typeof l === 'string' ? l : String(l.name ?? '')
    ),
  }));
  const matching = runners.filter(
    (r) =>
      r.status.toLowerCase() === 'online' &&
      hasRequiredLabels(r.labels, required)
  );
  const online = matching.length > 0;
  return {
    ok: online,
    online,
    matching_runners: matching,
    errors: online
      ? []
      : [`no online runner with required labels: ${required.join(',')}`],
    source: 'github-api',
  };
}

function applyE2eProbes(
  base: RunnerStatusResult
): RunnerStatusResult {
  const sim = probeSimulator(process.env.MAESTRO_DEVICE);
  const build = probeExpoDevBuild(process.env.EXPO_DEV_BUILD_PATH);
  const errors = [...base.errors];
  if (!sim.present && sim.error) errors.push(sim.error);
  if (!build.present && build.error) errors.push(build.error);

  // Fail closed: never report online when simulator or build is missing.
  const probesOk = sim.present && build.present;
  const online = base.online && probesOk;
  const ok = online;

  return {
    ...base,
    ok,
    online,
    errors,
    simulator_present: sim.present,
    simulator_name: sim.name,
    build_present: build.present,
    build_path: build.path,
  };
}

export async function checkRunnerStatus(options?: {
  statusFile?: string | null;
  lane?: string | null;
}): Promise<RunnerStatusResult> {
  const lane = parseLane(options?.lane ?? process.env.HOLO_RUNNER_LANE ?? null);
  const required = labelsForLane(lane);

  const file =
    options?.statusFile ?? process.env.HOLO_RUNNER_STATUS_FILE ?? null;

  let base: RunnerStatusResult;
  if (file && existsSync(resolve(file))) {
    base = baseResult(lane, required, fromStatusFile(resolve(file), lane, required));
  } else {
    base = baseResult(lane, required, await fromGitHubApi(lane, required));
  }

  if (lane === 'e2e') {
    return applyE2eProbes(base);
  }
  return base;
}
