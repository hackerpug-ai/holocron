/**
 * Portable stack config — resolved from env + consolidated secrets (D01-04).
 * No mini-only hardcoded hosts; same contract on laptop and mini.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { getSecretValue, resolveRepoRoot } from '../config/secrets.ts';

export const STACK_UP_TIMEOUT_MS = 60_000;
export const STACK_DOWN_TIMEOUT_MS = 30_000;
export const DEFAULT_MASTRA_PORT = 4111;
export const DEFAULT_PG_PORT = 5432;

export const LAUNCHD_LABELS = {
  postgres: 'holocron-postgres',
  mastra: 'holocron-mastra',
  scheduler: 'holocron-scheduler',
  zerocache: 'holocron-zerocache',
} as const;

export type StackServiceName = keyof typeof LAUNCHD_LABELS;

export type StackConfig = {
  /** Repo used for CLI / install templates (may be worktree). */
  repoRoot: string;
  /** Stable root for launchd ProgramArguments (prefer main clone). */
  holoRoot: string;
  home: string;
  launchAgentsDir: string;
  logDir: string;
  bunBin: string;
  pgBin: string;
  pgData: string;
  pgHost: string;
  pgPort: number;
  databaseUrl: string;
  mastraHost: string;
  mastraPort: number;
  mastraHealthUrl: string;
  fleetUrl: string;
  uid: number;
  domain: string;
  installScript: string;
  templateDir: string;
};

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function brewPrefix(formula?: string): string | null {
  const args = formula ? ['--prefix', formula] : ['--prefix'];
  const r = spawnSync('brew', args, { encoding: 'utf8' });
  if (r.status === 0) {
    const p = (r.stdout ?? '').trim();
    return p.length > 0 ? p : null;
  }
  return null;
}

function resolvePgBin(): string {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const prefix = brewPrefix('postgresql@18');
  if (prefix) return resolve(prefix, 'bin');
  const candidates = ['/opt/homebrew/opt/postgresql@18/bin', '/usr/local/opt/postgresql@18/bin'];
  const found = firstExisting(candidates.map((c) => resolve(c, 'pg_isready')));
  if (found) return dirname(found);
  return '/opt/homebrew/opt/postgresql@18/bin';
}

function resolvePgData(): string {
  if (process.env.PGDATA) return process.env.PGDATA;
  const brew = brewPrefix() ?? '/opt/homebrew';
  const candidates = [
    resolve(brew, 'var/postgresql@18'),
    '/opt/homebrew/var/postgresql@18',
    '/usr/local/var/postgresql@18',
    '/usr/local/var/postgres',
  ];
  return firstExisting(candidates) ?? candidates[0] ?? '/opt/homebrew/var/postgresql@18';
}

function resolveBunBin(home: string): string {
  if (process.env.BUN_BIN) return process.env.BUN_BIN;
  const which = spawnSync('which', ['bun'], { encoding: 'utf8' });
  if (which.status === 0) {
    const p = (which.stdout ?? '').trim();
    if (p) return p;
  }
  const fallback = resolve(home, '.bun/bin/bun');
  return existsSync(fallback) ? fallback : 'bun';
}

/**
 * Prefer main clone for launchd WorkingDirectory so agents survive worktree cleanup.
 */
export function resolveHoloRoot(repoRoot: string, home: string): string {
  if (
    process.env.HOLO_ROOT &&
    existsSync(resolve(process.env.HOLO_ROOT, 'packages/platform/src/cli/holo.ts'))
  ) {
    return process.env.HOLO_ROOT;
  }
  const main = resolve(home, 'Projects/holocron');
  if (existsSync(resolve(main, 'packages/platform/src/cli/holo.ts'))) {
    return main;
  }
  return repoRoot;
}

function parsePortFromUrl(url: string | undefined, fallback: number): number {
  if (!url) return fallback;
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, 'http:'));
    if (u.port) return Number(u.port);
  } catch {
    // ignore
  }
  return fallback;
}

function parseHostFromUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, 'http:'));
    if (u.hostname) return u.hostname;
  } catch {
    // ignore
  }
  return fallback;
}

export function loadStackConfig(options?: {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
}): StackConfig {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const repoRoot = options?.repoRoot ?? resolveRepoRoot();
  const holoRoot = resolveHoloRoot(repoRoot, home);
  const databaseUrl =
    getSecretValue('DATABASE_URL', { env }) ??
    env.DATABASE_URL ??
    'postgres://127.0.0.1:5432/holocron';
  const mastraPort = Number(
    getSecretValue('HOLO_PORT', { env }) ?? env.HOLO_PORT ?? env.PORT ?? DEFAULT_MASTRA_PORT
  );
  const mastraHost = env.HOLO_MASTRA_HOST ?? '127.0.0.1';
  const fleetUrl =
    getSecretValue('FLEET_URL', { env }) ?? env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';
  const pgBin = resolvePgBin();
  const pgData = resolvePgData();
  const pgHost = env.PGHOST ?? parseHostFromUrl(databaseUrl, '127.0.0.1');
  const pgPort = Number(env.PGPORT ?? parsePortFromUrl(databaseUrl, DEFAULT_PG_PORT));
  const uid = Number(env.HOLO_UID ?? process.getuid?.() ?? 501);
  const launchAgentsDir = env.LAUNCH_AGENTS_DIR ?? resolve(home, 'Library/LaunchAgents');

  return {
    repoRoot,
    holoRoot,
    home,
    launchAgentsDir,
    logDir: resolve(home, 'Library/Logs/holocron'),
    bunBin: resolveBunBin(home),
    pgBin,
    pgData,
    pgHost,
    pgPort,
    databaseUrl,
    mastraHost,
    mastraPort: Number.isFinite(mastraPort) ? mastraPort : DEFAULT_MASTRA_PORT,
    mastraHealthUrl: `http://${mastraHost}:${Number.isFinite(mastraPort) ? mastraPort : DEFAULT_MASTRA_PORT}/health`,
    fleetUrl,
    uid,
    domain: `gui/${uid}`,
    installScript: resolve(repoRoot, 'scripts/install-launchd.sh'),
    templateDir: resolve(repoRoot, 'packages/platform/deploy/launchd'),
  };
}

export function plistPath(cfg: StackConfig, label: string): string {
  return resolve(cfg.launchAgentsDir, `${label}.plist`);
}

export function isDarwin(): boolean {
  return process.platform === 'darwin';
}

export function launchdAvailable(cfg: StackConfig): boolean {
  if (!isDarwin()) return false;
  // Prefer launchd when agent plists (or templates) exist
  if (existsSync(plistPath(cfg, LAUNCHD_LABELS.postgres))) return true;
  if (existsSync(resolve(cfg.templateDir, 'holocron-postgres.plist'))) return true;
  const lc = spawnSync('launchctl', ['print', 'system'], { encoding: 'utf8' });
  return lc.status === 0 || lc.status === 1; // print system may fail for user; binary exists
}
