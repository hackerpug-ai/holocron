/**
 * Port of convex/toolCalls/scheduled.ts (timeoutStuckToolCalls).
 * tool_calls stuck approved > 5m → failed; clear agent_busy on conversation.
 *
 * Note: Convex uses status "timed_out"; Postgres workStatusValues has no
 * timed_out — we use "failed" with a timeout error string.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export const toolcallTimeout: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const cutoff = new Date(now.getTime() - DEFAULT_TIMEOUT_MS);
  const sql = createSql(ctx.databaseUrl);

  try {
    const stuck = await sql<
      {
        id: string;
        conversation_id: string | null;
        tool_display_name: string | null;
        tool_name: string;
      }[]
    >`
      SELECT
        id::text AS id,
        conversation_id,
        tool_display_name,
        tool_name
      FROM tool_calls
      WHERE status = 'approved'
        AND COALESCE(resolved_at, created_at) < ${cutoff.toISOString()}::timestamptz
    `;

    let timedOutCount = 0;
    for (const tc of stuck) {
      const updated = await sql<{ id: string }[]>`
        UPDATE tool_calls
        SET
          status = 'failed',
          error = ${`Tool execution timed out after ${Math.round(DEFAULT_TIMEOUT_MS / 60000)} minutes`},
          resolved_at = ${now.toISOString()}::timestamptz
        WHERE id = ${tc.id}::uuid
          AND status = 'approved'
        RETURNING id::text AS id
      `;
      if (updated.length === 0) continue;
      timedOutCount++;

      if (tc.conversation_id) {
        const display = tc.tool_display_name ?? tc.tool_name;
        await sql`
          INSERT INTO chat_messages (conversation_id, role, content, message_type, created_at)
          VALUES (
            ${tc.conversation_id},
            'agent',
            ${`The "${display}" tool timed out. You can try again by sending your request once more.`},
            'error',
            ${now.toISOString()}::timestamptz
          )
        `.catch(() => {
          // chat_messages insert is best-effort if schema/columns differ
        });

        await sql`
          UPDATE conversations
          SET
            agent_busy = false,
            agent_busy_since = NULL,
            updated_at = ${now.toISOString()}::timestamptz
          WHERE id = ${tc.conversation_id}::uuid
             OR legacy_convex_id = ${tc.conversation_id}
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
