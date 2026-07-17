/**
 * holocron-scheduler entrypoint — real worker (not /usr/bin/true).
 *
 * Starts the preferred queue backend (pg-boss, graphile-worker fallback) and
 * keeps the process alive so launchd KeepAlive can manage it.
 *
 * Usage:
 *   bun services/platform/src/queue/scheduler-worker.ts
 *   DATABASE_URL=postgres://127.0.0.1:5432/holocron bun ...
 */
import { startQueueBackend, stopQueueBackend } from './backend.ts';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

async function main(): Promise<void> {
  console.log('[holocron-scheduler] starting queue backend…');
  const status = await startQueueBackend(databaseUrl);
  console.log(
    `[holocron-scheduler] backend=${status.backend} ready=${status.ready} detail=${status.detail}`
  );
  if (!status.ready) {
    console.error('[holocron-scheduler] backend not ready:', status.error ?? status.detail);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.log(`[holocron-scheduler] ${signal} — stopping`);
    await stopQueueBackend();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Stay alive; future sprints register job handlers here.
  // Heartbeat: re-mark backend ready every 30s so probes stay fresh.
  setInterval(() => {
    void startQueueBackend(databaseUrl).then((s) => {
      if (!s.ready) {
        console.error('[holocron-scheduler] heartbeat: backend not ready', s.error ?? s.detail);
      }
    });
  }, 30_000);

  console.log('[holocron-scheduler] running (lease tables ready; handlers deferred to queue-2/3)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
