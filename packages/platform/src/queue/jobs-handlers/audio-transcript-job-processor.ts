/**
 * Port of convex/audioTranscripts/scheduled processPendingJobs.
 *
 * - No pending work → ok:true
 * - Pending + no DEEPGRAM_API_KEY → leave pending, ok:false DEEPGRAM_API_KEY_MISSING
 * - Pending + key → call Deepgram; only mark completed on real transcript text.
 *   Never claim+ok:true with transcribed:0.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const BATCH = 5;

type DeepgramResult = { ok: true; transcript: string } | { ok: false; error: string };

async function transcribeWithDeepgram(sourceUrl: string, apiKey: string): Promise<DeepgramResult> {
  // Deepgram pre-recorded URL transcription (Nova-3).
  const endpoint = new URL('https://api.deepgram.com/v1/listen');
  endpoint.searchParams.set('model', 'nova-3');
  endpoint.searchParams.set('smart_format', 'true');

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: sourceUrl }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return {
      ok: false,
      error: `DEEPGRAM_NETWORK: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      error: `DEEPGRAM_HTTP_${response.status}: ${body.slice(0, 200)}`,
    };
  }

  const json = (await response.json()) as {
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  const transcript = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  if (!transcript) {
    return { ok: false, error: 'DEEPGRAM_EMPTY_TRANSCRIPT' };
  }
  return { ok: true, transcript };
}

export const audioTranscriptJobProcessor: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const sql = createSql(ctx.databaseUrl);
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim() ?? '';

  try {
    const pending = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audio_transcript_jobs WHERE status = 'pending'
    `;
    const pendingCount = Number(pending[0]?.count ?? 0);

    if (pendingCount === 0) {
      return { ok: true, detail: { claimed: 0, transcribed: 0, pending: 0 } };
    }

    if (!apiKey) {
      // Leave pending; do not claim.
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
    let lastError: string | null = null;

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
        lastError = 'SOURCE_URL_MISSING';
        continue;
      }

      const result = await transcribeWithDeepgram(job.source_url, apiKey);
      if (!result.ok) {
        // Revert to pending so a later run can retry — never leave silent running.
        await sql`
          UPDATE audio_transcript_jobs
          SET
            status = 'pending',
            error_message = ${result.error},
            started_at = NULL
          WHERE id = ${job.id}::uuid
            AND status = 'running'
        `;
        lastError = result.error;
        continue;
      }

      // Persist transcript on audio_transcripts (preview_text holds full text for Nova-3).
      const jobMeta = await sql<{ content_id: string | null; source_url: string | null }[]>`
        SELECT content_id, source_url FROM audio_transcript_jobs WHERE id = ${job.id}::uuid
      `;
      const contentId = jobMeta[0]?.content_id ?? null;
      const sourceUrl = jobMeta[0]?.source_url ?? job.source_url;
      const wordCount = result.transcript.split(/\s+/).filter(Boolean).length;

      const transcriptId = await sql<{ id: string }[]>`
        INSERT INTO audio_transcripts (
          content_id,
          source_url,
          transcript_type,
          transcript_source,
          preview_text,
          word_count,
          generated_at,
          created_at
        )
        VALUES (
          ${contentId},
          ${sourceUrl},
          'full',
          'deepgram-nova-3',
          ${result.transcript},
          ${wordCount},
          ${now.toISOString()}::timestamptz,
          ${now.toISOString()}::timestamptz
        )
        RETURNING id::text AS id
      `;

      if (!transcriptId[0]?.id) {
        await sql`
          UPDATE audio_transcript_jobs
          SET
            status = 'pending',
            error_message = 'TRANSCRIPT_INSERT_FAILED',
            started_at = NULL
          WHERE id = ${job.id}::uuid
        `;
        lastError = 'TRANSCRIPT_INSERT_FAILED';
        continue;
      }

      await sql`
        UPDATE audio_transcript_jobs
        SET
          status = 'completed',
          transcript_id = ${transcriptId[0].id},
          error_message = NULL,
          completed_at = ${now.toISOString()}::timestamptz
        WHERE id = ${job.id}::uuid
      `;
      transcribed++;
    }

    // Never claim+ok:true with transcribed:0 when work was claimed.
    if (claimed.length > 0 && transcribed === 0) {
      return {
        ok: false,
        detail: {
          claimed: claimed.length,
          transcribed: 0,
          pending: pendingCount,
        },
        error: lastError ?? 'DEEPGRAM_TRANSCRIBE_FAILED',
      };
    }

    return {
      ok: true,
      detail: {
        claimed: claimed.length,
        transcribed,
        pending: pendingCount,
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
