/**
 * Sync-friendly CLI for stack probes:
 *   bun services/platform/src/queue/probe-cli.ts
 * Prints JSON: { backend, ready, detail }
 */
import { probeQueueBackend, startQueueBackend } from './backend.ts';

const url = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

const started = await startQueueBackend(url);
const probed = await probeQueueBackend(url);
const out = {
  backend: probed.backend ?? started.backend,
  ready: Boolean(probed.ready || started.ready),
  detail: probed.detail ?? started.detail,
  error: probed.error ?? started.error,
};
console.log(JSON.stringify(out));
process.exit(out.ready ? 0 : 1);
