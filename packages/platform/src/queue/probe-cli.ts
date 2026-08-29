/**
 * Sync-friendly CLI for stack probes:
 *   bun packages/platform/src/queue/probe-cli.ts
 * Prints JSON: { backend, ready, detail }
 */
import { probeQueueBackend } from './backend.ts';

const url = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

const probed = await probeQueueBackend(url);
const out = {
  backend: probed.backend,
  ready: probed.ready,
  detail: probed.detail,
  error: probed.error,
};
console.log(JSON.stringify(out));
process.exit(out.ready ? 0 : 1);
