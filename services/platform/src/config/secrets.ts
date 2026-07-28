/**
 * Consolidated secrets source for Holocron platform config.
 *
 * Resolution order (STRICTLY one source contract):
 *   1. process.env (operator / CI / launchd inject)
 *   2. services/platform/config/secrets.yaml (gitignored local file)
 *
 * Never hardcode secrets in code. Real secrets.yaml is gitignored;
 * secrets.example.yaml is the committed schema.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Keys that `holo secrets doctor` must resolve (AC-1 / TC-1 / TC-6). */
export const REQUIRED_SECRET_KEYS = [
  'DATABASE_URL',
  'MASTRA_API_KEY',
  'TAILSCALE_AUTH_KEY',
  'FLEET_URL',
  'FLEET_KEY',
  'HOLO_PORT',
  'PLATFORM_URL',
  'HOLO_KEY_RN',
  'HOLO_KEY_MCP',
  'HOLO_KEY_CONTROL',
] as const;

/**
 * Off-mini backup (D04-02) keys — reported by secrets doctor when present.
 * Distinct from DATABASE_URL / Fleet; never printed as values.
 * Required for CAP-BAK-01 runtime after `holo backup:provision`.
 */
export const BACKUP_RUNTIME_SECRET_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ENDPOINT',
  'R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_CREDENTIAL_POLICY',
  'R2_REPO_CIPHER_PASS',
] as const;

export type RequiredSecretKey = (typeof REQUIRED_SECRET_KEYS)[number];

export type SecretsMap = Record<string, string>;

export type SecretResolution = {
  key: string;
  status: 'resolved' | 'missing';
  source: 'env' | 'file' | null;
  /** Never log real values from doctor — only presence. */
  present: boolean;
};

export type DoctorReport = {
  ok: boolean;
  secretsPath: string;
  fileExists: boolean;
  resolutions: SecretResolution[];
  missing: string[];
  resolvedCount: number;
};

/** Walk up from this module to the repo root that contains services/platform. */
export function resolveRepoRoot(fromDir = import.meta.dirname): string {
  const parts = fromDir.split('/');
  const idx = parts.lastIndexOf('services');
  if (idx > 0) return parts.slice(0, idx).join('/');
  // Fallback: cwd when invoked outside the package layout
  return process.cwd();
}

export function defaultSecretsPath(repoRoot = resolveRepoRoot()): string {
  return resolve(repoRoot, 'services/platform/config/secrets.yaml');
}

export function defaultSecretsExamplePath(repoRoot = resolveRepoRoot()): string {
  return resolve(repoRoot, 'services/platform/config/secrets.example.yaml');
}

function coerceString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/**
 * Load flat key→string map from secrets.yaml.
 * Nested objects are not supported (flat contract only).
 */
export function loadSecretsFile(path: string): SecretsMap {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`secrets file must be a flat YAML mapping: ${path}`);
  }
  const out: SecretsMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const s = coerceString(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

/**
 * Resolve a single key: env wins, then secrets file.
 */
export function resolveSecret(
  key: string,
  options?: { fileMap?: SecretsMap; env?: NodeJS.ProcessEnv }
): SecretResolution {
  const env = options?.env ?? process.env;
  const fromEnv = coerceString(env[key]);
  if (fromEnv !== undefined) {
    return { key, status: 'resolved', source: 'env', present: true };
  }
  const fileMap = options?.fileMap;
  if (fileMap && coerceString(fileMap[key]) !== undefined) {
    return { key, status: 'resolved', source: 'file', present: true };
  }
  return { key, status: 'missing', source: null, present: false };
}

/**
 * Get the resolved string value (env > file). Returns undefined if missing.
 */
export function getSecretValue(
  key: string,
  options?: { secretsPath?: string; env?: NodeJS.ProcessEnv }
): string | undefined {
  const env = options?.env ?? process.env;
  const fromEnv = coerceString(env[key]);
  if (fromEnv !== undefined) return fromEnv;
  const path = options?.secretsPath ?? defaultSecretsPath();
  const fileMap = loadSecretsFile(path);
  return coerceString(fileMap[key]);
}

/**
 * Load all secrets into a map (file then overlay env).
 */
export function loadConsolidatedSecrets(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
}): SecretsMap {
  const path = options?.secretsPath ?? defaultSecretsPath();
  const env = options?.env ?? process.env;
  const fileMap = loadSecretsFile(path);
  const out: SecretsMap = { ...fileMap };
  for (const [k, v] of Object.entries(env)) {
    const s = coerceString(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

export type ApplySecretsResult = {
  /** Keys written into env from secrets file (were unset/empty). */
  applied: string[];
  /** Keys left untouched because env already had a non-empty value. */
  skipped: string[];
  /** Absolute path of the secrets file consulted. */
  secretsPath: string;
  fileExists: boolean;
};

/**
 * Overlay consolidated secrets into process.env (or a provided env bag).
 *
 * Contract (RH-1 / D01-04):
 *   - env wins over file — never overwrite non-empty existing keys
 *   - fills missing REQUIRED_SECRET_KEYS (+ any extra flat keys from the file)
 *   - safe for launchd clean env: picks up gitignored secrets.yaml at process
 *     boot without writing secret values into 0644 LaunchAgent plists
 *
 * Call once at Mastra process start (startService / service:up) BEFORE
 * scoped-key middleware captures keys from process.env.
 */
export function applyConsolidatedSecretsToEnv(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
  /** Limit to these keys; default = REQUIRED_SECRET_KEYS ∪ file keys. */
  keys?: readonly string[];
}): ApplySecretsResult {
  const secretsPath = options?.secretsPath ?? defaultSecretsPath();
  const env = options?.env ?? process.env;
  const fileExists = existsSync(secretsPath);
  const fileMap = fileExists ? loadSecretsFile(secretsPath) : {};

  const keySet = new Set<string>();
  if (options?.keys) {
    for (const k of options.keys) keySet.add(k);
  } else {
    for (const k of REQUIRED_SECRET_KEYS) keySet.add(k);
    for (const k of Object.keys(fileMap)) keySet.add(k);
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const key of keySet) {
    const existing = coerceString(env[key]);
    if (existing !== undefined) {
      skipped.push(key);
      continue;
    }
    const fromFile = coerceString(fileMap[key]);
    if (fromFile !== undefined) {
      env[key] = fromFile;
      applied.push(key);
    }
  }

  return { applied, skipped, secretsPath, fileExists };
}

/**
 * Doctor: verify every required key resolves. Never prints secret values.
 */
export function runSecretsDoctor(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
  requiredKeys?: readonly string[];
}): DoctorReport {
  const secretsPath = options?.secretsPath ?? defaultSecretsPath();
  const env = options?.env ?? process.env;
  const required = options?.requiredKeys ?? REQUIRED_SECRET_KEYS;
  const fileExists = existsSync(secretsPath);
  const fileMap = fileExists ? loadSecretsFile(secretsPath) : {};
  const resolutions: SecretResolution[] = required.map((key) =>
    resolveSecret(key, { fileMap, env })
  );
  const missing = resolutions.filter((r) => r.status === 'missing').map((r) => r.key);
  const resolvedCount = resolutions.filter((r) => r.status === 'resolved').length;
  return {
    ok: missing.length === 0,
    secretsPath,
    fileExists,
    resolutions,
    missing,
    resolvedCount,
  };
}

export function formatDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('holo secrets doctor — consolidated secrets resolution');
  lines.push(`  secrets file: ${report.secretsPath}`);
  lines.push(`  file exists:  ${report.fileExists ? 'yes' : 'no'}`);
  lines.push('');
  for (const r of report.resolutions) {
    if (r.status === 'resolved') {
      // AC-1: print `DATABASE_URL: resolved` (source annotation is optional)
      lines.push(`${r.key}: resolved`);
    } else {
      // Only emitted on fail path; success path must not match /MISSING|missing key/i
      lines.push(`${r.key}: NOT SET`);
    }
  }
  lines.push('');
  lines.push(`  keys resolved: ${report.resolvedCount}`);
  lines.push(`  keys absent:   ${report.missing.length}`);
  if (report.missing.length > 0) {
    lines.push(`  absent keys: ${report.missing.join(', ')}`);
  }
  lines.push(report.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}

/**
 * Extended doctor text that also reports backup/R2 key presence (values never printed).
 * Core required keys still gate exit status; backup keys are informational + AC-2 evidence.
 */
export function formatDoctorTextWithBackup(
  report: DoctorReport,
  options?: { secretsPath?: string; env?: NodeJS.ProcessEnv }
): string {
  const base = formatDoctorText(report);
  const secretsPath = options?.secretsPath ?? report.secretsPath;
  const env = options?.env ?? process.env;
  const fileMap = existsSync(secretsPath) ? loadSecretsFile(secretsPath) : {};
  const lines = ['', 'backup / R2 (CAP-BAK-01) — presence only, values never printed:'];
  let backupPresent = 0;
  for (const key of BACKUP_RUNTIME_SECRET_KEYS) {
    const r = resolveSecret(key, { fileMap, env });
    if (r.status === 'resolved') {
      lines.push(`${key}: resolved`);
      backupPresent += 1;
    } else {
      lines.push(`${key}: NOT SET`);
    }
  }
  lines.push(`  backup keys present: ${backupPresent}/${BACKUP_RUNTIME_SECRET_KEYS.length}`);
  return `${base}\n${lines.join('\n')}`;
}

/**
 * Ensure config directory layout for docs/tooling.
 */
export function secretsConfigDir(repoRoot = resolveRepoRoot()): string {
  return resolve(repoRoot, 'services/platform/config');
}

export function secretsGitignorePath(repoRoot = resolveRepoRoot()): string {
  return resolve(secretsConfigDir(repoRoot), '.gitignore');
}
