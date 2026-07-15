/**
 * Shared helpers for Sprint-06 stack / secrets / launchd RED integration suite.
 *
 * Real process boundary only — no mocked health probes, no stubbed CLI.
 * Invoke: bun services/platform/src/cli/holo.ts <args>
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/** Walk up from this file to the repo root that contains services/platform. */
export function resolveRepoRoot(): string {
  // fixtures → __tests__ → cli → src → platform → services → repo
  const parts = import.meta.dirname.split('/');
  const idx = parts.lastIndexOf('services');
  if (idx > 0) return parts.slice(0, idx).join('/');
  return process.cwd();
}

export const REPO_ROOT = resolveRepoRoot();
export const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
export const BUN_BIN = process.env.BUN_BIN ?? 'bun';

/** Gate: live platform integration tests require PLATFORM_IT=1. */
export const PLATFORM_IT = process.env.PLATFORM_IT === '1';

export const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

export const LAUNCH_AGENTS_DIR = resolve(homedir(), 'Library/LaunchAgents');

export const HOLOCRON_PLISTS = [
  'holocron-postgres.plist',
  'holocron-mastra.plist',
  'holocron-scheduler.plist',
  'holocron-zerocache.plist',
] as const;

export type HoloResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
};

/** Run the real holo CLI as a Bun subprocess. */
export function runHolo(
  args: string[],
  options?: { env?: Record<string, string | undefined>; timeoutMs?: number }
): HoloResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options?.env) {
    for (const [k, v] of Object.entries(options.env)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
  if (!env.DATABASE_URL) env.DATABASE_URL = DEFAULT_DATABASE_URL;

  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: options?.timeoutMs ?? 90_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

/** Run an arbitrary system command (pg_isready, curl, launchctl, plutil, …). */
export function runCmd(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
): HoloResult {
  const result = spawnSync(command, args, {
    cwd: options?.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: options?.env ?? process.env,
    timeout: options?.timeoutMs ?? 30_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

/** Prefer space form (`stack up`); fall back to colon form (`stack:up`) once either is implemented. */
export function runStack(subcommand: 'up' | 'down' | 'status', extra: string[] = []): HoloResult {
  const spaced = runHolo(['stack', subcommand, ...extra]);
  // If only colon form exists, space form may report unknown "stack" — try colon.
  if (
    spaced.status !== 0 &&
    /unknown command:\s*stack\b/i.test(spaced.combined) &&
    !/unknown command:\s*stack:(up|down|status)/i.test(spaced.combined)
  ) {
    const colon = runHolo([`stack:${subcommand}`, ...extra]);
    // Prefer colon result only when it is no longer "unknown command".
    if (!/unknown command/i.test(colon.combined) || colon.status === 0) {
      return colon;
    }
  }
  return spaced;
}

export function parseJsonObject(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in stdout:\n${stdout}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}
