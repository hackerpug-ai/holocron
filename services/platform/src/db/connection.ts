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
 */
export function resolveDatabaseUrl(options?: { preferHolocron?: boolean }): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return options?.preferHolocron ? DEFAULT_HOLOCRON_DATABASE_URL : DEFAULT_DATABASE_URL;
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
