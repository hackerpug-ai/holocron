/**
 * Port of convex/taskCrons.ts:30-144 (timeoutStuckTasks + timeoutTask).
 *
 * Marks tasks in status "running" whose started_at ?? created_at exceeds the
 * timeout threshold (default 60 minutes) as terminal with timeout details.
 *
 * Also reaps chat_runs stranded by process death (AC-5 stuck-run sweep) —
 * intentionally inside this job so we do not add a 17th registry entry.
 *
 * Status note: Convex uses status "error". Postgres workStatusValues (S31-01)
 * admits "failed" not "error". We write status="error" when the CHECK allows
 * it; otherwise we fall back to "failed" while keeping error_message and
 * error_details.reason verbatim from Convex.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const DEFAULT_TIMEOUT_MINUTES = 60;

/** Stall window for chat_runs: no progress (updated_at) for this long → reaped. */
const CHAT_RUN_STALL_MS = 10 * 60 * 1000;

type RunningTaskRow = {
  id: string;
  started_at: Date | string | null;
  created_at: Date | string;
};

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Convex writes status "error". Postgres workStatusValues (S31-01) only admits
 * "failed". Prefer "error" when the live CHECK allows it (test harness expands
 * the constraint); fall back to "failed" so the job never crashes on the gap.
 */
async function resolveTerminalStatus(
  sql: ReturnType<typeof createSql>
): Promise<'error' | 'failed'> {
  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO tasks (task_type, status, legacy_convex_id)
        VALUES ('__s31_probe__', 'error', '__s31_status_probe__')
      `;
      throw new Error('S31_PROBE_ROLLBACK');
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('S31_PROBE_ROLLBACK')) return 'error';
    if (msg.includes('tasks_status_check') || /check constraint/i.test(msg)) return 'failed';
    return 'failed';
  }
  return 'error';
}

export const taskTimeoutWorker: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const timeoutMinutes =
    typeof ctx.args?.timeoutMinutes === 'number' && ctx.args.timeoutMinutes > 0
      ? ctx.args.timeoutMinutes
      : DEFAULT_TIMEOUT_MINUTES;
  const now = ctx.now ?? new Date();
  const nowMs = now.getTime();
  const cutoffMs = nowMs - timeoutMinutes * 60 * 1000;
  const sql = createSql(ctx.databaseUrl);

  try {
    const terminalStatus = await resolveTerminalStatus(sql);

    const running = await sql<RunningTaskRow[]>`
      SELECT id::text AS id, started_at, created_at
      FROM tasks
      WHERE status = 'running'
    `;

    let timedOutCount = 0;
    for (const task of running) {
      const startedMs = toMs(task.started_at) ?? toMs(task.created_at);
      if (startedMs == null || startedMs >= cutoffMs) continue;

      const runningTime = Math.floor((nowMs - startedMs) / 60_000);
      // Verbatim Convex user-visible string (convex/taskCrons.ts:132).
      const errorMessage = `Task timed out after running for ${runningTime} minutes (timeout: ${timeoutMinutes} minutes)`;
      const errorDetails = {
        reason: 'timeout',
        runningTime,
        timeoutMinutes,
        timedOutAt: nowMs,
      };

      try {
        const updated = await sql<{ id: string }[]>`
          UPDATE tasks
          SET
            status = ${terminalStatus},
            error_message = ${errorMessage},
            error_details = ${sql.json(errorDetails as never)},
            completed_at = ${now.toISOString()}::timestamptz,
            updated_at = ${now.toISOString()}::timestamptz
          WHERE id = ${task.id}::uuid
            AND status = 'running'
          RETURNING id::text AS id
        `;
        if (updated.length > 0) timedOutCount++;
      } catch (err) {
        console.error(
          `[task-timeout-worker] Failed to timeout task ${task.id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // ── AC-5: stranded chat_runs sweep (inside this job; no 17th registry entry) ──
    const stallCutoff = new Date(nowMs - CHAT_RUN_STALL_MS);
    const stranded = await sql<{ id: string; conversation_id: string | null }[]>`
      SELECT id::text AS id, conversation_id
      FROM chat_runs
      WHERE status = 'running'
        AND updated_at < ${stallCutoff.toISOString()}::timestamptz
    `;

    let reapedChatRuns = 0;
    for (const run of stranded) {
      try {
        const updated = await sql<{ id: string }[]>`
          UPDATE chat_runs
          SET
            status = 'failed',
            error_code = 'STALLED_PROCESS_DEATH',
            error_message = 'Chat run reaped: serving process died without terminalizing the run',
            completed_at = ${now.toISOString()}::timestamptz,
            updated_at = ${now.toISOString()}::timestamptz
          WHERE id = ${run.id}::uuid
            AND status = 'running'
          RETURNING id::text AS id
        `;
        if (updated.length === 0) continue;
        reapedChatRuns++;

        if (run.conversation_id) {
          // Clear agent_busy only when no other running chat_run holds the conversation.
          const others = await sql<{ n: string }[]>`
            SELECT count(*)::text AS n
            FROM chat_runs
            WHERE conversation_id = ${run.conversation_id}
              AND status = 'running'
              AND id <> ${run.id}::uuid
          `;
          if (Number(others[0]?.n ?? 0) === 0) {
            await sql`
              UPDATE conversations
              SET
                agent_busy = false,
                agent_busy_since = NULL,
                updated_at = ${now.toISOString()}::timestamptz
              WHERE id = ${run.conversation_id}::uuid
                 OR legacy_convex_id = ${run.conversation_id}
            `;
          }
        }
      } catch (err) {
        console.error(
          `[task-timeout-worker] Failed to reap chat_run ${run.id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    console.error(
      `[task-timeout-worker] Timed out ${timedOutCount} task(s); reaped ${reapedChatRuns} chat_run(s)`
    );

    return {
      ok: true,
      detail: {
        timed_out_count: timedOutCount,
        timeout_minutes: timeoutMinutes,
        terminal_status: terminalStatus,
        reaped_chat_runs: reapedChatRuns,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: {}, error };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
