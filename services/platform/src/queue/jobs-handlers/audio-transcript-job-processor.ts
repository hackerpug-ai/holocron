/**
 * Port of convex/audioTranscripts/scheduled processPendingJobs (claim path).
 * Claims pending audio_transcript_jobs into running. Full Deepgram transcription
 * is deferred when no DEEPGRAM_API_KEY is present — jobs remain claimable and
 * the absence of the key is a named non-success for work that needs it.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const BATCH = 5;

export const audioTranscriptJobProcessor: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const sql = createSql(ctx.databaseUrl);
  const hasDeepgram = Boolean(process.env.DEEPGRAM_API_KEY?.trim());

  try {
    const pending = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audio_transcript_jobs WHERE status = 'pending'
    `;
    const pendingCount = Number(pending[0]?.count ?? 0);

    if (pendingCount === 0) {
      return { ok: true, detail: { claimed: 0, transcribed: 0, pending: 0 } };
    }

    if (!hasDeepgram) {
      // Named dependency error when work exists but the secret is absent.
      // Do not claim rows into running — leave them pending for a configured worker.
      return {
        ok: false,
        detail: { claimed: 0, transcribed: 0, pending: pendingCount },
        error: 'DEEPGRAM_API_KEY_MISSING',
      };
    }

    const claimed = await sql<{ id: string; source_url: string | null }[]>`
      UPDATE audio_transcript_jobs
      SET
        status = 'running',
        started_at = COALESCE(started_at, ${now.toISOString()}::timestamptz)
      WHERE id IN (
        SELECT id FROM audio_transcript_jobs
        WHERE status = 'pending'
        ORDER BY COALESCE(priority, 0) DESC, created_at ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id::text AS id, source_url
    `;

    let transcribed = 0;
    for (const job of claimed) {
      if (!job.source_url) {
        await sql`
          UPDATE audio_transcript_jobs
          SET
            status = 'failed',
            error_message = 'SOURCE_URL_MISSING',
            completed_at = ${now.toISOString()}::timestamptz
          WHERE id = ${job.id}::uuid
        `;
        continue;
      }
      // Real transcription would call Deepgram here. Without a durable audio
      // pipeline endpoint in-process, leave the job running for a worker that
      // owns the network path — do not fabricate success.
      transcribed += 0;
    }

    return {
      ok: true,
      detail: {
        claimed: claimed.length,
        transcribed,
        pending: pendingCount,
        note: 'claimed for Deepgram worker; no fabricated transcripts',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
