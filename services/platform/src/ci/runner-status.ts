/**
 * D02-03 — Self-hosted runner status probe (fail-closed).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const REQUIRED_RUNNER_LABELS = ['self-hosted', 'holocron', 'integration'] as const;

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
};

function hasRequiredLabels(labels: string[]): boolean {
  const set = new Set(labels.map((l) => l.toLowerCase()));
  return REQUIRED_RUNNER_LABELS.every((l) => set.has(l));
}

function fromStatusFile(path: string): RunnerStatusResult {
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
    (r) => r.status.toLowerCase() === 'online' && hasRequiredLabels(r.labels)
  );
  const online = matching.length > 0 && raw.online !== false;
  const errors: string[] = [];
  if (!online) {
    if (runners.length === 0) errors.push('no runners reported in status file');
    else if (matching.length === 0) {
      errors.push(
        `no online runner with required labels: ${REQUIRED_RUNNER_LABELS.join(',')}`
      );
    } else errors.push('runner reported offline');
  }
  return {
    ok: online,
    online,
    required_labels: [...REQUIRED_RUNNER_LABELS],
    matching_runners: matching,
    errors,
    source: 'status-file',
  };
}

async function fromGitHubApi(): Promise<RunnerStatusResult> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    return {
      ok: false,
      online: false,
      required_labels: [...REQUIRED_RUNNER_LABELS],
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
      required_labels: [...REQUIRED_RUNNER_LABELS],
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
    (r) => r.status.toLowerCase() === 'online' && hasRequiredLabels(r.labels)
  );
  const online = matching.length > 0;
  return {
    ok: online,
    online,
    required_labels: [...REQUIRED_RUNNER_LABELS],
    matching_runners: matching,
    errors: online
      ? []
      : [`no online runner with required labels: ${REQUIRED_RUNNER_LABELS.join(',')}`],
    source: 'github-api',
  };
}

export async function checkRunnerStatus(options?: {
  statusFile?: string | null;
}): Promise<RunnerStatusResult> {
  const file =
    options?.statusFile ??
    process.env.HOLO_RUNNER_STATUS_FILE ??
    null;
  if (file && existsSync(resolve(file))) {
    return fromStatusFile(resolve(file));
  }
  return fromGitHubApi();
}
