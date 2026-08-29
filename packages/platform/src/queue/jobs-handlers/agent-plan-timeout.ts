/**
 * Port of convex/agentPlans/scheduled.ts (timeoutStuckPlans).
 * Plans stuck executing/running > 30m → failed; active steps failed; agent_busy clear.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const TIMEOUT_MS = 30 * 60 * 1000;

export const agentPlanTimeout: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const cutoff = new Date(now.getTime() - TIMEOUT_MS);
  const sql = createSql(ctx.databaseUrl);

  try {
    // Convex "executing" maps to Postgres running/in_progress under workStatusValues.
    const stuck = await sql<{ id: string; conversation_id: string | null; title: string | null }[]>`
      SELECT id::text AS id, conversation_id, title
      FROM agent_plans
      WHERE status IN ('running', 'in_progress', 'executing')
        AND updated_at < ${cutoff.toISOString()}::timestamptz
    `;

    let timedOutCount = 0;
    for (const plan of stuck) {
      const updated = await sql<{ id: string }[]>`
        UPDATE agent_plans
        SET
          status = 'failed',
          updated_at = ${now.toISOString()}::timestamptz
        WHERE id = ${plan.id}::uuid
          AND status IN ('running', 'in_progress', 'executing')
        RETURNING id::text AS id
      `;
      if (updated.length === 0) continue;
      timedOutCount++;

      await sql`
        UPDATE agent_plan_steps
        SET
          status = 'failed',
          error_message = 'Plan timed out'
        WHERE plan_id = ${plan.id}
          AND status IN ('pending', 'running', 'awaiting_approval', 'approved', 'in_progress')
      `.catch(() => {});

      if (plan.conversation_id) {
        await sql`
          UPDATE conversations
          SET
            agent_busy = false,
            agent_busy_since = NULL,
            updated_at = ${now.toISOString()}::timestamptz
          WHERE id = ${plan.conversation_id}::uuid
             OR legacy_convex_id = ${plan.conversation_id}
        `.catch(() => {});

        const title = plan.title ?? 'untitled';
        await sql`
          INSERT INTO chat_messages (conversation_id, role, content, message_type, created_at)
          VALUES (
            ${plan.conversation_id},
            'agent',
            ${`The plan "${title}" timed out after 30 minutes of inactivity.`},
            'error',
            ${now.toISOString()}::timestamptz
          )
        `.catch(() => {});
      }
    }

    return { ok: true, detail: { timed_out_count: timedOutCount } };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
