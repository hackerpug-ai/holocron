/**
 * Connection defaults (split from index so schema modules don't cycle).
 */

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
