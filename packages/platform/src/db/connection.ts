/**
 * Connection defaults (split from index so schema modules don't cycle).
 */
import { createHash } from 'node:crypto';

/** Default admin URL (matches mastra.ts fallback host/port). Override via env. */
export const DEFAULT_DATABASE_URL = 'postgres://127.0.0.1:5432/postgres';

/** Preferred app database once Drizzle owns the schema. */
export const DEFAULT_HOLOCRON_DATABASE_URL = 'postgres://127.0.0.1:5432/holocron';

/** Dedicated nonprod namespace for ETL/upload integration/runtime work. */
export const DEFAULT_HOLOCRON_NONPROD_DATABASE_URL = 'postgres://127.0.0.1:5432/holocron_nonprod';

/** Explicit dangerous escape hatch for ETL/upload against non-nonprod DBs. */
export const DANGEROUS_PROD_DB_OVERRIDE_ENV = 'HOLO_DANGEROUS_ALLOW_PROD_DB';

const HOLOCRON_NONPROD_DB_NAME = 'holocron_nonprod';
const PROD_LIKE_DATABASE_NAMES = new Set(['holocron', 'postgres']);

/** Credential-free identity for a PostgreSQL target used by cutover evidence. */
export type DatabaseTargetIdentity = {
  host: string;
  effective_port: number;
  database: string;
  fingerprint: string;
};

const DATABASE_TARGET_FINGERPRINT_VERSION = 'database-target-v1';

/**
 * Parse and normalize a PostgreSQL URL without returning any credential-bearing
 * component. Scheme aliases, host case, and omitted/default port normalize to
 * one target; query strings and fragments are intentionally ignored.
 */
export function parseDatabaseTargetIdentity(databaseUrl: string): DatabaseTargetIdentity {
  const raw = databaseUrl.trim();
  if (!raw) throw new Error('DATABASE_TARGET_INVALID: database URL is empty');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('DATABASE_TARGET_INVALID: database URL is malformed');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_TARGET_INVALID: database URL must use postgres or postgresql');
  }
  const host = parsed.hostname.trim().toLowerCase();
  if (!host) throw new Error('DATABASE_TARGET_INVALID: database URL host is missing');

  let effective_port = 5432;
  try {
    effective_port = parsed.port ? Number(parsed.port) : 5432;
  } catch {
    throw new Error('DATABASE_TARGET_INVALID: database URL port is invalid');
  }
  if (!Number.isInteger(effective_port) || effective_port < 1 || effective_port > 65535) {
    throw new Error('DATABASE_TARGET_INVALID: database URL port is invalid');
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim();
  } catch {
    throw new Error('DATABASE_TARGET_INVALID: database name is malformed');
  }
  if (!database || database.includes('\0')) {
    throw new Error('DATABASE_TARGET_INVALID: database name is missing');
  }
  const tuple = [DATABASE_TARGET_FINGERPRINT_VERSION, host, String(effective_port), database].join(
    '\0'
  );
  const fingerprint = createHash('sha256').update(tuple).digest('hex');
  return { host, effective_port, database, fingerprint };
}

export function databaseTargetIdentitiesEqual(
  left: DatabaseTargetIdentity | null | undefined,
  right: DatabaseTargetIdentity | null | undefined
): boolean {
  return Boolean(
    left &&
      right &&
      left.host === right.host &&
      left.effective_port === right.effective_port &&
      left.database === right.database &&
      left.fingerprint === right.fingerprint
  );
}

/** Resolve and validate a required CLI database target exactly once. */
export function resolveRequiredDatabaseTarget(env: NodeJS.ProcessEnv = process.env): {
  databaseUrl: string;
  databaseTarget: DatabaseTargetIdentity;
} {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_TARGET_INVALID: DATABASE_URL is required');
  return { databaseUrl, databaseTarget: parseDatabaseTargetIdentity(databaseUrl) };
}

export function databaseNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return (parsed.pathname || '/').replace(/^\//, '') || 'postgres';
  } catch {
    return '';
  }
}

export function isHolocronNonprodDatabaseUrl(url: string): boolean {
  return databaseNameFromUrl(url) === HOLOCRON_NONPROD_DB_NAME;
}

export function isProductionLikeDatabaseUrl(url: string): boolean {
  return PROD_LIKE_DATABASE_NAMES.has(databaseNameFromUrl(url));
}

export function allowDangerousProdDbOverride(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DANGEROUS_PROD_DB_OVERRIDE_ENV] === '1';
}

export function assertHolocronNonprodDatabaseUrl(
  url: string,
  options?: { context?: string; allowDangerousOverride?: boolean }
): string {
  if (options?.allowDangerousOverride ?? allowDangerousProdDbOverride()) {
    return url;
  }

  const databaseName = databaseNameFromUrl(url);
  if (databaseName === HOLOCRON_NONPROD_DB_NAME) {
    return url;
  }

  const context = options?.context ?? 'runtime';
  const qualifier = isProductionLikeDatabaseUrl(url) ? 'production-like' : 'non-nonprod';
  throw new Error(
    `${context} refuses ${qualifier} database '${databaseName || '(empty)'}' — expected ${HOLOCRON_NONPROD_DB_NAME}; set ${DANGEROUS_PROD_DB_OVERRIDE_ENV}=1 to override (dangerous)`
  );
}

/**
 * Resolve the connection string for platform DB work.
 * Prefer DATABASE_URL; fall back to the holocron DB when requested.
 *
 * This returns the raw/owner URL (no role rewrite). Product evidence paths
 * MUST use resolveProductDatabaseUrl (roles.ts) so sessions run as holocron_app.
 * Migrate/admin MUST use resolveOwnerDatabaseUrl (or this raw helper).
 */
export function resolveDatabaseUrl(options?: { preferHolocron?: boolean }): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return options?.preferHolocron ? DEFAULT_HOLOCRON_DATABASE_URL : DEFAULT_DATABASE_URL;
}

/**
 * Resolve the ETL/upload runtime DB.
 *
 * Fail closed to holocron_nonprod. This intentionally ignores DATABASE_URL_OWNER
 * so admin/owner shells cannot silently redirect runtime writes into prod.
 */
export function resolveHolocronNonprodDatabaseUrl(options?: {
  databaseUrl?: string;
  context?: string;
  allowDangerousOverride?: boolean;
}): string {
  const databaseUrl =
    options?.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_HOLOCRON_NONPROD_DATABASE_URL;
  return assertHolocronNonprodDatabaseUrl(databaseUrl, {
    context: options?.context ?? 'etl/upload runtime',
    allowDangerousOverride: options?.allowDangerousOverride,
  });
}

/**
 * Owner/admin connection string for migrate, provisioning, and maintenance.
 * Prefer DATABASE_URL_OWNER when set; otherwise raw DATABASE_URL / defaults.
 * Never rewrites username to holocron_app.
 */
export function resolveOwnerDatabaseUrl(options?: { preferHolocron?: boolean }): string {
  if (process.env.DATABASE_URL_OWNER) {
    return process.env.DATABASE_URL_OWNER;
  }
  return resolveDatabaseUrl(options);
}

/**
 * Connection facts for operators / Drizzle clients.
 * Host/port match the live provisioned instance (loopback view).
 * Tailscale host is documented in docs/postgres-provisioning.md.
 */
export const postgresConnectionFacts = {
  engine: 'postgresql',
  majorVersionRequired: 18,
  port: 5432,
  databases: {
    admin: 'postgres',
    app: 'holocron',
    nonprod: 'holocron_nonprod',
  },
  extensions: {
    vector: 'pgvector (CREATE EXTENSION vector)',
    fts: 'native (to_tsvector / tsquery)',
  },
  walLevelRequired: 'logical',
  authModel: 'single-user-tailnet-trust',
  provisioningDoc: 'docs/postgres-provisioning.md',
} as const;
