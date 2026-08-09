/**
 * S31-OPS-03 / R24 — Harness isolation from production config paths.
 *
 * When HOLO_HARNESS=1, integration and human-gate processes must never read or
 * write production pgbackrest.conf, production secrets.yaml, or live mini PGDATA.
 * Fail closed with HARNESS_PRODUCTION_PATH_REFUSED before any mutation.
 *
 * Operator tools (backup:provision without HOLO_HARNESS) are unaffected.
 */
import { resolve } from 'node:path';
import { defaultSecretsPath, resolveRepoRoot } from '../config/secrets.ts';

/** Canonical refusal token — tests and CLI grep for this exact string. */
export const HARNESS_PRODUCTION_PATH_REFUSED = 'HARNESS_PRODUCTION_PATH_REFUSED';

/** Live mini PGDATA candidates (mirrors fire-drill FORBIDDEN_PGDATA). */
export const HARNESS_FORBIDDEN_PGDATA = [
  '/opt/homebrew/var/postgresql@18',
  '/usr/local/var/postgres',
  '/usr/local/var/postgresql@18',
  '/var/lib/postgresql/data',
] as const;

/** Relative suffix that identifies the production operator pgBackRest conf. */
export const PRODUCTION_PGBACKREST_CONF_SUFFIX =
  'services/platform/config/pgbackrest/pgbackrest.conf';

/** Relative suffix that identifies the production operator secrets store. */
export const PRODUCTION_SECRETS_SUFFIX = 'services/platform/config/secrets.yaml';

export function isHarnessMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HOLO_HARNESS === '1';
}

export function productionPgbackrestConfPath(repoRoot = resolveRepoRoot()): string {
  return resolve(repoRoot, PRODUCTION_PGBACKREST_CONF_SUFFIX);
}

export function productionSecretsPath(repoRoot = resolveRepoRoot()): string {
  return resolve(repoRoot, PRODUCTION_SECRETS_SUFFIX);
}

function normalizeAbs(path: string): string {
  return resolve(path);
}

/**
 * True when `path` is the operator production pgBackRest conf.
 * Matches both this worktree's absolute path and any other checkout that ends
 * with the canonical relative suffix (R24 historical absolute-path overwrite).
 */
export function isProductionPgbackrestConfPath(
  path: string,
  repoRoot = resolveRepoRoot()
): boolean {
  const abs = normalizeAbs(path);
  if (abs === productionPgbackrestConfPath(repoRoot)) return true;
  if (abs.endsWith(`/${PRODUCTION_PGBACKREST_CONF_SUFFIX}`)) return true;
  // Bare exact suffix (no leading slash edge)
  if (abs === PRODUCTION_PGBACKREST_CONF_SUFFIX) return true;
  return false;
}

export function isProductionSecretsPath(path: string, repoRoot = resolveRepoRoot()): boolean {
  const abs = normalizeAbs(path);
  if (abs === productionSecretsPath(repoRoot)) return true;
  if (abs === defaultSecretsPath(repoRoot)) return true;
  if (abs.endsWith(`/${PRODUCTION_SECRETS_SUFFIX}`)) return true;
  return false;
}

export function isForbiddenHarnessPgdata(
  path: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const abs = normalizeAbs(path);
  const candidates = [
    ...HARNESS_FORBIDDEN_PGDATA,
    env.HOLO_LIVE_PGDATA?.trim(),
    env.HOLO_STANDING_PG1_PATH?.trim(),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return candidates.some((c) => normalizeAbs(c) === abs);
}

/**
 * Ephemeral harness roots: repo `.tmp/`, `services/platform/deploy/nonprod/`,
 * or any path segment `/.tmp/` (disposable worktrees / OS temp under repo).
 */
export function isEphemeralHarnessPath(path: string, repoRoot = resolveRepoRoot()): boolean {
  const abs = normalizeAbs(path);
  const tmpRoot = resolve(repoRoot, '.tmp');
  const nonprodRoot = resolve(repoRoot, 'services/platform/deploy/nonprod');
  if (abs === tmpRoot || abs.startsWith(`${tmpRoot}/`)) return true;
  if (abs === nonprodRoot || abs.startsWith(`${nonprodRoot}/`)) return true;
  // Disposable dirs under a worktree `.tmp` even if repoRoot resolution differs
  if (abs.includes('/.tmp/')) return true;
  return false;
}

function refuse(detail: string): never {
  throw new Error(`${HARNESS_PRODUCTION_PATH_REFUSED}: ${detail}`);
}

/**
 * Resolve pgBackRest conf path from env.
 * Precedence: HOLO_PGBACKREST_CONF → PGBACKREST_CONFIG → default production path.
 */
export function resolveHarnessPgbackrestConfPath(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = resolveRepoRoot()
): string {
  const fromEnv = env.HOLO_PGBACKREST_CONF?.trim() || env.PGBACKREST_CONFIG?.trim() || '';
  // Default matches operator production conf; harness mode refuses it on write/load.
  return fromEnv || productionPgbackrestConfPath(repoRoot);
}

/**
 * When HOLO_HARNESS=1, refuse production (or non-ephemeral) conf targets.
 * No-op when harness mode is off (operator provision may write production conf).
 */
export function assertHarnessPgbackrestConfWritable(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = resolveRepoRoot()
): void {
  if (!isHarnessMode(env)) return;
  const abs = normalizeAbs(path);
  if (isProductionPgbackrestConfPath(abs, repoRoot)) {
    refuse(`harness refuses write to production pgbackrest conf: ${abs}`);
  }
  if (!isEphemeralHarnessPath(abs, repoRoot)) {
    refuse(`harness pgbackrest conf must be under .tmp/ or deploy/nonprod/; got ${abs}`);
  }
}

/**
 * When HOLO_HARNESS=1, refuse reading/writing production secrets.yaml.
 * Secrets path must resolve under .tmp/ or deploy/nonprod/.
 */
export function assertHarnessSecretsPathAllowed(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = resolveRepoRoot()
): void {
  if (!isHarnessMode(env)) return;
  const abs = normalizeAbs(path);
  if (isProductionSecretsPath(abs, repoRoot)) {
    refuse(`harness refuses production secrets.yaml: ${abs}`);
  }
  if (!isEphemeralHarnessPath(abs, repoRoot)) {
    refuse(`harness secrets path must be under .tmp/ or deploy/nonprod/; got ${abs}`);
  }
}

/**
 * When HOLO_HARNESS=1, refuse live mini PGDATA as scratch / pg1-path.
 */
export function assertHarnessPgdataAllowed(
  path: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!isHarnessMode(env)) return;
  const abs = normalizeAbs(path);
  if (isForbiddenHarnessPgdata(abs, env)) {
    refuse(`harness refuses live mini PGDATA path: ${abs}`);
  }
}

/**
 * Resolve secrets path and assert harness isolation when HOLO_HARNESS=1.
 * Callers that load secrets under harness mode should prefer this over the
 * raw resolveSecretsPathFromEnv default (which points at production).
 */
export function resolveHarnessSecretsPath(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = resolveRepoRoot()
): string {
  const fromEnv =
    env.HOLO_SECRETS_PATH?.trim() ||
    env.HOLOCRON_SECRETS_PATH?.trim() ||
    env.SECRETS_PATH?.trim() ||
    '';
  const path = fromEnv || productionSecretsPath(repoRoot);
  assertHarnessSecretsPathAllowed(path, env, repoRoot);
  return normalizeAbs(path);
}

/**
 * Combined preflight for harness backup/PITR entry points.
 * Call before any conf write or secrets load when HOLO_HARNESS may be set.
 */
export function assertHarnessBackupPaths(
  options: {
    pgbackrestConf?: string;
    secretsPath?: string;
    pg1Path?: string;
    env?: NodeJS.ProcessEnv;
    repoRoot?: string;
  } = {}
): void {
  const env = options.env ?? process.env;
  if (!isHarnessMode(env)) return;
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const conf = options.pgbackrestConf?.trim() || resolveHarnessPgbackrestConfPath(env, repoRoot);
  assertHarnessPgbackrestConfWritable(conf, env, repoRoot);
  if (options.secretsPath) {
    assertHarnessSecretsPathAllowed(options.secretsPath, env, repoRoot);
  } else if (
    env.HOLO_SECRETS_PATH ||
    env.HOLOCRON_SECRETS_PATH ||
    env.SECRETS_PATH ||
    isHarnessMode(env)
  ) {
    // Always validate the resolved secrets target in harness mode (default = production).
    resolveHarnessSecretsPath(env, repoRoot);
  }
  if (options.pg1Path) {
    assertHarnessPgdataAllowed(options.pg1Path, env);
  }
}
