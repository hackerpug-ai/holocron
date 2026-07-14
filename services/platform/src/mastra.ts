import { MastraStorageExporter, Observability } from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';

// ── environment ──────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/postgres';
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';
const FLEET_KEY = process.env.FLEET_KEY ?? 'sk-none';

export { DATABASE_URL, FLEET_KEY, FLEET_URL };

// ── storage ───────────────────────────────────────────────────
export function createStorage(): PostgresStore {
  return new PostgresStore({
    id: 'compat-storage',
    connectionString: DATABASE_URL,
  });
}

// ── observability ─────────────────────────────────────────────
export function createObservability(): Observability {
  return new Observability({
    configs: {
      default: {
        serviceName: 'compat-spike',
        sampling: { type: 'always' as const },
        exporters: [new MastraStorageExporter()],
      },
    },
  });
}
