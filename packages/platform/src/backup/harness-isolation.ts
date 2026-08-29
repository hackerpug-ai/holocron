/**
 * S31-OPS-03 / R24 — Harness isolation from production config paths.
 *
 * When HOLO_HARNESS=1 or PLATFORM_IT=1, integration and human-gate processes must
 * never write production pgbackrest.conf or live mini PGDATA. Fail closed with
 * HARNESS_PRODUCTION_PATH_REFUSED before any mutation.
 *
 * Secrets isolation (AC-2) is stricter: only when HOLO_HARNESS=1 must secrets
 * resolve under .tmp/ or deploy/nonprod/. PLATFORM_IT alone may still read the
 * operator secrets store for live R2 gates that already isolate conf under workDir.
 *
 * Operator tools (backup:provision without HOLO_HARNESS/PLATFORM_IT) are unaffected.
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
  'packages/platform/config/pgbackrest/pgbackrest.conf';

/** Relative suffix that identifies the production operator secrets store. */
export const PRODUCTION_SECRETS_SUFFIX = 'packages/platform/config/secrets.yaml';

/**
 * True for integration/gate processes that must not mutate production conf/PGDATA.
 * HOLO_HARNESS=1 (explicit) or PLATFORM_IT=1 (backup IT / integration lane).
 */
export function isHarnessMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HOLO_HARNESS === '1' || env.PLATFORM_IT === '1';
}

/**
 * Strict secrets isolation — AC-2 only. PLATFORM_IT alone does not refuse
 * operator secrets.yaml (live backup gates still load it for R2 credentials).
 */
export function isStrictHarnessSecretsMode(env: NodeJS.ProcessEnv = process.env): boolean {
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
 * Ephemeral harness roots: repo `.tmp/`, `packages/platform/deploy/nonprod/`,
 * or any path segment `/.tmp/` (disposable worktrees / OS temp under repo).
 */
export function isEphemeralHarnessPath(path: string, repoRoot = resolveRepoRoot()): boolean {
  const abs = normalizeAbs(path);
  const tmpRoot = resolve(repoRoot, '.tmp');
  const nonprodRoot = resolve(repoRoot, 'packages/platform/deploy/nonprod');
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
 * PLATFORM_IT alone does not trigger this (see isStrictHarnessSecretsMode).
 */
export function assertHarnessSecretsPathAllowed(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = resolveRepoRoot()
): void {
  if (!isStrictHarnessSecretsMode(env)) return;
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
 * Call before any conf write or secrets load when HOLO_HARNESS / PLATFORM_IT may be set.
 * Conf + PGDATA: isHarnessMode (HOLO_HARNESS|PLATFORM_IT). Secrets: HOLO_HARNESS only.
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
  // Secrets isolation is HOLO_HARNESS-only (AC-2); skip under PLATFORM_IT alone.
  if (isStrictHarnessSecretsMode(env)) {
    if (options.secretsPath) {
      assertHarnessSecretsPathAllowed(options.secretsPath, env, repoRoot);
    } else {
      resolveHarnessSecretsPath(env, repoRoot);
    }
  }
  if (options.pg1Path) {
    assertHarnessPgdataAllowed(options.pg1Path, env);
  }
}
