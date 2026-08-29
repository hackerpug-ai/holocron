/**
 * Port of convex/chat/telemetryMutations.ts (deleteOldTelemetry).
 * Delete agent_telemetry older than 90 days in batches of 1000.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const BATCH_SIZE = 1000;
const DEFAULT_OLDER_THAN_MS = 90 * 24 * 60 * 60 * 1000;

export const cleanupAgentTelemetry: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const olderThanMs =
    typeof ctx.args?.olderThanMs === 'number' && ctx.args.olderThanMs > 0
      ? ctx.args.olderThanMs
      : DEFAULT_OLDER_THAN_MS;
  const now = ctx.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanMs);
  const sql = createSql(ctx.databaseUrl);

  try {
    let deleted = 0;
    while (true) {
      const batch = await sql<{ id: string }[]>`
        DELETE FROM agent_telemetry
        WHERE id IN (
          SELECT id FROM agent_telemetry
          WHERE created_at < ${cutoff.toISOString()}::timestamptz
          ORDER BY created_at ASC
          LIMIT ${BATCH_SIZE}
        )
        RETURNING id::text AS id
      `;
      deleted += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    return { ok: true, detail: { deleted, older_than_ms: olderThanMs } };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
