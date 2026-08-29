import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config for the platform domain schema.
 * Migrations live under packages/platform/src/db/migrations.
 *
 * Usage (from packages/platform):
 *   bunx drizzle-kit generate
 *   bunx drizzle-kit migrate
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron',
  },
  strict: true,
  verbose: true,
});
