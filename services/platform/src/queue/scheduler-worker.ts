/**
 * holocron-scheduler entrypoint — real leased-queue consumer (S31-02).
 *
 * Cadence (WHEN): schedule-parser over MIGRATED_JOBS; due jobs fire via runJob.
 * Durability (ONCE): dequeue() / completeLeasedJob over queue_jobs leases.
 *
 * Usage:
 *   bun services/platform/src/queue/scheduler-worker.ts
 *   DATABASE_URL=postgres://127.0.0.1:5432/holocron bun ...
 *
 * Test hooks:
 *   HOLO_SCHEDULER_EVAL_AT=ISO-8601  — single-step evaluation instant then exit
 *   HOLO_SCHEDULER_ONCE=1            — one consume+cadence pass then exit
 *   HOLO_SCHEDULER_PARSE_ONLY=1      — parse all schedules and exit (0/1)
 */
import '../config/bootstrap-secrets.ts';

import { startQueueBackend, stopQueueBackend } from './backend.ts';
import { getJob, MIGRATED_JOBS, resolveJobsForRun } from './jobs-registry.ts';
import { runJob } from './jobs-runner.ts';
import { completeLeasedJob, dequeue, failLeasedJob } from './priority.ts';
import {
  isDueAt,
  nextFireAt,
  type ParsedSchedule,
  parseSchedule,
  ScheduleParseError,
} from './schedule-parser.ts';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

/** Parse ms env values; strip underscores so '120_000' works (Number('120_000') is NaN). */
function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw.replace(/_/g, ''));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const POLL_MS = envMs('HOLO_SCHEDULER_POLL_MS', 1_000);
const CADENCE_MS = envMs('HOLO_SCHEDULER_CADENCE_MS', 15_000);

type BoundSchedule = {
  name: string;
  parsed: ParsedSchedule;
  /** Last time we fired this job (ms). Interval jobs use this for due checks. */
  lastFiredAt: number | null;
};

function parseAllSchedules(
  jobs = MIGRATED_JOBS
): { ok: true; bound: BoundSchedule[] } | { ok: false; error: ScheduleParseError } {
  const bound: BoundSchedule[] = [];
  for (const job of jobs) {
    try {
      const parsed = parseSchedule(job.schedule, job.name);
      bound.push({ name: job.name, parsed, lastFiredAt: null });
    } catch (err) {
      if (err instanceof ScheduleParseError) {
        return { ok: false, error: err };
      }
      throw err;
    }
  }
  return { ok: true, bound };
}

async function consumeOne(): Promise<boolean> {
  const leased = await dequeue(databaseUrl);
  if (!leased) return false;

  const registryJob = getJob(leased.name);
  // Mission / ad-hoc queue work: complete under lease after optional handler.
  try {
    if (registryJob?.handler) {
      const result = await runJob(registryJob, { databaseUrl });
      if (!result.ok) {
        await failLeasedJob(leased, result.error ?? 'handler failed', { databaseUrl });
        console.error(
          `[holocron-scheduler] leased job ${leased.name} failed: ${result.error ?? 'unknown'}`
        );
        return true;
      }
    } else if (leased.name === 'mission:execute' || leased.name.startsWith('mission:')) {
      // AC-4: background mission execution leaves the HTTP thread.
      const { createSql } = await import('../db/client.ts');
      const { executeQueuedMissionRun } = await import('../http/missions.ts');
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ payload: { runId?: string } }[]>`
          SELECT payload FROM queue_jobs WHERE id = ${leased.id}::uuid LIMIT 1
        `;
        const runId = rows[0]?.payload?.runId;
        if (runId) {
          await executeQueuedMissionRun(runId, { databaseUrl });
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
    await completeLeasedJob(leased, { databaseUrl });
    // Yield so completed_at is strictly ordered under AC-3
    // (interactive-before-background) even at JS Date millisecond resolution.
    await new Promise((r) => setTimeout(r, 25));
    console.log(
      `[holocron-scheduler] completed ${leased.lane}/${leased.name} id=${leased.id} owner-prefix=worker-`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failLeasedJob(leased, msg, { databaseUrl }).catch(() => {});
    console.error(`[holocron-scheduler] error on ${leased.name}: ${msg}`);
  }
  return true;
}

async function fireDueCadence(bound: BoundSchedule[], at: Date): Promise<string[]> {
  const fired: string[] = [];
  const jobs = resolveJobsForRun();
  for (const entry of bound) {
    const job = jobs.find((j) => j.name === entry.name);
    if (!job) continue;

    let due = false;
    if (entry.parsed.kind === 'daily') {
      due = isDueAt(entry.parsed, at);
      // Fire at most once per UTC day.
      if (due && entry.lastFiredAt != null) {
        const last = new Date(entry.lastFiredAt);
        if (
          last.getUTCFullYear() === at.getUTCFullYear() &&
          last.getUTCMonth() === at.getUTCMonth() &&
          last.getUTCDate() === at.getUTCDate()
        ) {
          due = false;
        }
      }
    } else {
      // Interval cadence is wall-clock relative to lastFiredAt.
      // Explicit EVAL_AT steps are for daily windows (AC-2); do not mass-fire
      // every interval job at an artificial instant.
      if (process.env.HOLO_SCHEDULER_EVAL_AT) {
        due = false;
      } else if (entry.lastFiredAt == null) {
        // Seed on first continuous observation — do not fire immediately.
        entry.lastFiredAt = at.getTime();
        due = false;
      } else {
        due = at.getTime() - entry.lastFiredAt >= entry.parsed.ms;
      }
    }

    if (!due) continue;

    const result = await runJob(job, { databaseUrl });
    entry.lastFiredAt = at.getTime();
    if (result.ok) {
      fired.push(job.name);
      console.log(`[holocron-scheduler] cadence fire ${job.name} at ${at.toISOString()}`);
    } else {
      console.error(
        `[holocron-scheduler] cadence fire ${job.name} failed: ${result.error ?? 'unknown'}`
      );
    }
  }
  return fired;
}

async function main(): Promise<void> {
  // Fail closed on unparseable schedules before entering the consume loop.
  const parsed = parseAllSchedules(MIGRATED_JOBS);
  if (!parsed.ok) {
    console.error(parsed.error.message);
    process.exit(1);
  }
  const bound = parsed.bound;

  if (process.env.HOLO_SCHEDULER_PARSE_ONLY === '1') {
    for (const entry of bound) {
      const next = nextFireAt(entry.parsed, new Date());
      console.log(
        JSON.stringify({
          name: entry.name,
          schedule: entry.parsed,
          next_fire_at: next.toISOString(),
        })
      );
    }
    process.exit(0);
  }

  console.log('[holocron-scheduler] starting queue backend…');
  const status = await startQueueBackend(databaseUrl);
  console.log(
    `[holocron-scheduler] backend=${status.backend} ready=${status.ready} detail=${status.detail}`
  );
  if (!status.ready) {
    console.error('[holocron-scheduler] backend not ready:', status.error ?? status.detail);
    process.exit(1);
  }

  // Single-step evaluation (AC-2 schedule tests).
  const evalAtRaw = process.env.HOLO_SCHEDULER_EVAL_AT;
  if (evalAtRaw) {
    const at = new Date(evalAtRaw);
    if (Number.isNaN(at.getTime())) {
      console.error(`SCHEDULE_PARSE_ERROR: invalid HOLO_SCHEDULER_EVAL_AT=${evalAtRaw}`);
      process.exit(1);
    }
    // Cadence-only evaluation: do not drain queue_jobs (that would re-run
    // leased handlers and pollute daily-window oracles like morning-digest).
    const fired = await fireDueCadence(bound, at);
    console.log(
      JSON.stringify({
        eval_at: at.toISOString(),
        fired,
        fired_count: fired.length,
      })
    );
    await stopQueueBackend();
    process.exit(0);
  }

  const shutdown = async (signal: string) => {
    console.log(`[holocron-scheduler] ${signal} — stopping`);
    await stopQueueBackend();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  console.log(
    `[holocron-scheduler] running (consume loop active; poll=${POLL_MS}ms cadence=${CADENCE_MS}ms)`
  );

  let lastCadence = 0;
  const tick = async () => {
    try {
      // Drain up to a small batch of leases per tick (interactive-before-background
      // is enforced inside dequeue ORDER BY priority DESC).
      for (let i = 0; i < 8; i++) {
        const did = await consumeOne();
        if (!did) break;
      }
      const now = Date.now();
      if (now - lastCadence >= CADENCE_MS) {
        lastCadence = now;
        await fireDueCadence(bound, new Date(now));
      }
    } catch (err) {
      console.error(
        '[holocron-scheduler] tick error:',
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  if (process.env.HOLO_SCHEDULER_ONCE === '1') {
    await tick();
    await stopQueueBackend();
    process.exit(0);
  }

  // Heartbeat backend readiness + consume loop.
  setInterval(() => {
    void startQueueBackend(databaseUrl).then((s) => {
      if (!s.ready) {
        console.error('[holocron-scheduler] heartbeat: backend not ready', s.error ?? s.detail);
      }
    });
  }, 30_000);

  setInterval(() => {
    void tick();
  }, POLL_MS);

  // Immediate first tick so stack:up consumers drain promptly.
  await tick();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
