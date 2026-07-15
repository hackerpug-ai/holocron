/**
 * Connection defaults (split from index so schema modules don't cycle).
 */

/** Default admin URL (matches mastra.ts fallback host/port). Override via env. */
export const DEFAULT_DATABASE_URL = 'postgres://127.0.0.1:5432/postgres';

/** Preferred app database once Drizzle owns the schema. */
export const DEFAULT_HOLOCRON_DATABASE_URL = 'postgres://127.0.0.1:5432/holocron';

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
  },
  extensions: {
    vector: 'pgvector (CREATE EXTENSION vector)',
    fts: 'native (to_tsvector / tsquery)',
  },
  walLevelRequired: 'logical',
  authModel: 'single-user-tailnet-trust',
  provisioningDoc: 'docs/postgres-provisioning.md',
} as const;
