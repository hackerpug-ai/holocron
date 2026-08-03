import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createFleetAgentWithResolved } from '../compat/cells/agent.ts';
import { createSql, toSqlJsonValue } from '../db/client.ts';
import {
  isHolocronNonprodDatabaseUrl,
  resolveHolocronNonprodDatabaseUrl,
} from '../db/connection.ts';
import { getTextDelta, handleStreamChunk, TripwireError } from '../mastra/tripwire.ts';
import { shouldUseDeterministicChatStream } from './chat-stream-gate.ts';

const ChatRunRequestSchema = z
  .object({
    requestId: z.string().min(1).max(200),
    msg: z.string().min(1).max(20_000),
    conversationId: z.string().min(1).max(200).optional(),
    /** Optional display title when this command creates a conversation. */
    conversationTitle: z.string().min(1).max(500).optional(),
    /** Structured context card rendered alongside the durable user message. */
    cardData: z.record(z.string(), z.unknown()).optional(),
    /** Document source for a document-context card. */
    documentId: z.string().uuid().optional(),
  })
  .strict();

export type ChatRunRequest = z.infer<typeof ChatRunRequestSchema>;
export type ChatRunScope = 'rn' | 'mcp' | 'control';
export type ChatSpecialistRole = 'divergent' | 'convergent';

export function resolveChatSpecialistRole(message: string): ChatSpecialistRole {
  return /\b(review|refute|challenge|verify|audit)\b/i.test(message) ? 'convergent' : 'divergent';
}

function createChatContextTool(role: ChatSpecialistRole, maxSteps: number) {
  return createTool({
    id: 'chat_context',
    description: 'Return bounded read-only chat execution context with least privilege.',
    inputSchema: z.object({ request: z.string().min(1) }),
    outputSchema: z.object({ role: z.string(), maxSteps: z.number().int().positive() }),
    execute: async () => ({ role, maxSteps }),
  });
}

type ChatRunRow = {
  id: string;
  owner_scope: string;
  request_id: string;
  conversation_id: string | null;
  durable_message_id: string;
  role: string;
  status: string;
  message: string;
  final_text: string | null;
  trace_id: string | null;
  max_steps: number;
  steps_used: number;
  last_event_seq: number;
  error_code: string | null;
  error_message: string | null;
};

type ChatEventRow = {
  run_id: string;
  seq: number;
  event_type: string;
  data_json: unknown;
};

const activeChatRuns = new Map<string, AbortController>();

function rowPayload(row: ChatRunRow, replay: boolean) {
  return {
    ok: row.status !== 'failed',
    replay,
    runId: row.id,
    conversationId: row.conversation_id ?? undefined,
    durableMessageId: row.durable_message_id,
    requestId: row.request_id,
    status: row.status,
    role: row.role,
    traceId: row.trace_id,
    lastEventId: row.last_event_seq,
    maxSteps: row.max_steps,
    stepsUsed: row.steps_used,
    finalText: row.final_text ?? undefined,
    errorCode: row.error_code ?? undefined,
    error: row.error_message ?? undefined,
  };
}

async function appendEvent(
  sql: ReturnType<typeof createSql>,
  runId: string,
  eventType: string,
  data: unknown
): Promise<number> {
  return sql.begin(async (tx) => {
    const rows = await tx<{ last_event_seq: number; status: string }[]>`
      SELECT last_event_seq, status FROM chat_runs WHERE id = ${runId}::uuid FOR UPDATE
    `;
    if (!rows[0] || rows[0].status !== 'running') return 0;
    const seq = Number(rows[0].last_event_seq ?? 0) + 1;
    await tx`
      INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
      VALUES (${runId}::uuid, ${seq}, ${eventType}, ${tx.json(data as never)})
    `;
    await tx`
      UPDATE chat_runs SET last_event_seq = ${seq}, updated_at = now()
      WHERE id = ${runId}::uuid
    `;
    return seq;
  });
}

async function finalizeChatRun(
  sql: ReturnType<typeof createSql>,
  run: ChatRunRow,
  status: 'completed' | 'blocked' | 'failed',
  eventType: string,
  eventData: unknown,
  options?: { finalText?: string; errorCode?: string; errorMessage?: string }
): Promise<void> {
  await sql.begin(async (tx) => {
    const rows = await tx<{ last_event_seq: number; status: string }[]>`
      SELECT last_event_seq, status FROM chat_runs WHERE id = ${run.id}::uuid FOR UPDATE
    `;
    if (!rows[0] || ['completed', 'blocked', 'failed'].includes(rows[0].status)) return;
    const seq = Number(rows[0].last_event_seq ?? 0) + 1;
    await tx`
      INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
      VALUES (${run.id}::uuid, ${seq}, ${eventType}, ${tx.json(eventData as never)})
    `;
    await tx`
      UPDATE chat_runs
      SET status = ${status}, final_text = ${options?.finalText ?? null},
          error_code = ${options?.errorCode ?? null}, error_message = ${options?.errorMessage ?? null},
          steps_used = CASE WHEN ${status} IN ('completed', 'blocked') THEN 1 ELSE steps_used END,
          last_event_seq = ${seq}, completed_at = now(), updated_at = now()
      WHERE id = ${run.id}::uuid
    `;
    // Persist durable assistant text for completed runs and cancelled partials.
    // Cancel path may pass assembled token text so the client keeps one bubble
    // that Zero can reconcile (AC-5 partial message kept).
    const finalText = typeof options?.finalText === 'string' ? options.finalText : null;
    const shouldPersistMessage =
      finalText !== null &&
      (status === 'completed' || finalText.length > 0) &&
      Boolean(run.conversation_id);
    if (shouldPersistMessage && run.conversation_id && finalText !== null) {
      // GATE-FIX-01: UPSERT content so an empty placeholder never blocks the
      // durable assistant text that MessageBubble must paint after airplane.
      await tx`
        INSERT INTO chat_messages (id, conversation_id, role, content, message_type, session_id)
        VALUES (${run.durable_message_id}::uuid, ${run.conversation_id}, 'agent', ${finalText}, 'text', ${run.id})
        ON CONFLICT (id) DO UPDATE
        SET content = EXCLUDED.content,
            role = 'agent',
            message_type = COALESCE(chat_messages.message_type, EXCLUDED.message_type),
            session_id = COALESCE(chat_messages.session_id, EXCLUDED.session_id)
        WHERE chat_messages.content IS NULL
           OR btrim(chat_messages.content) = ''
           OR length(EXCLUDED.content) > length(coalesce(chat_messages.content, ''))
      `;
    }
    // ALWAYS clear agent_busy on any terminal finalize (completed/blocked/failed).
    // Previously only completed+finalText cleared it, which left cancel/stop
    // stuck with agent_busy=true → composer disabled (AC-5 CRITICAL).
    if (run.conversation_id) {
      if (finalText !== null && finalText.length > 0) {
        await tx`
          UPDATE conversations
          SET last_message_preview = ${finalText.slice(0, 200)},
              agent_busy = false,
              agent_busy_since = NULL,
              updated_at = now()
          WHERE id::text = ${run.conversation_id}
        `;
      } else {
        await tx`
          UPDATE conversations
          SET agent_busy = false,
              agent_busy_since = NULL,
              updated_at = now()
          WHERE id::text = ${run.conversation_id}
        `;
      }
    }
  });
}

async function claimRun(sql: ReturnType<typeof createSql>, runId: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE chat_runs
    SET status = 'running', trace_id = ${`chat:${runId}`}, updated_at = now()
    WHERE id = ${runId}::uuid AND status = 'pending'
    RETURNING id
  `;
  return rows.length === 1;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Build a multi-token reply that always has enough words for Maestro
 * token-growth / Last-Event-ID oracles (AC-1..AC-4) without fleet budget.
 * Real tokens are written to chat_run_events and streamed over live SSE.
 */
export function buildDeterministicChatTokens(message: string): string[] {
  const cleaned = message.replace(/\[\[e2e[_-]?stream\]\]/gi, '').trim();
  const preview = cleaned.slice(0, 40).replace(/\s+/g, ' ').trim() || 'hello';
  // Compact multi-token body: enough words for gap-fill oracles without
  // stretching past the SSE poll deadline (30s) at default pace.
  const body =
    `Streaming reply about ${preview}. ` +
    'One two three four five six seven eight nine ten. ' +
    'Rivers mountains valleys forests oceans clouds.';
  // Word tokens only (spaces attached) so seq advances ~1:1 with words.
  const words = body
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((word, index, arr) => (index < arr.length - 1 ? `${word} ` : word));
  // Ensure >= 8 token events for gap-fill / multi-token ACs.
  while (words.length < 12) {
    words.push(` token${words.length}`);
  }
  return words;
}

/**
 * Pace real chat_run_events token inserts so Maestro can observe stop + last-seq
 * mid-stream. Still goes through the real SSE socket (never mocks EventSource).
 */
async function emitDeterministicTokenStream(
  sql: ReturnType<typeof createSql>,
  runId: string,
  message: string,
  controller: AbortController,
  options?: { paceMs?: number }
): Promise<string> {
  const paceMs = options?.paceMs ?? Number(process.env.HOLO_CHAT_DETERMINISTIC_PACE_MS ?? 180);
  const tokens = buildDeterministicChatTokens(message);
  let finalText = '';
  for (const token of tokens) {
    if (controller.signal.aborted) break;
    finalText += token;
    const seq = await appendEvent(sql, runId, 'token', { token });
    // appendEvent returns 0 when run already terminal/cancelled — stop emitting.
    if (seq === 0) break;
    if (paceMs > 0) {
      await sleep(paceMs, controller.signal);
    }
  }
  if (!finalText.trim() && !controller.signal.aborted) {
    finalText = 'OK.';
    await appendEvent(sql, runId, 'token', { token: finalText });
  }
  return finalText;
}

export async function processChatRun(databaseUrl: string, run: ChatRunRow): Promise<void> {
  const sql = createSql(databaseUrl);
  const controller = new AbortController();
  try {
    if (!(await claimRun(sql, run.id))) return;
    activeChatRuns.set(run.id, controller);
    if (/\[\[tripwire\]\]/i.test(run.message)) {
      const error = {
        code: 'CHAT_PROCESSOR_BLOCKED',
        message: 'chat processor tripwire blocked unsafe dispatch',
      };
      await finalizeChatRun(sql, run, 'blocked', 'blocked', error, {
        errorCode: error.code,
        errorMessage: error.message,
      });
      return;
    }

    let finalText = '';

    if (shouldUseDeterministicChatStream(databaseUrl, run.message)) {
      // E2E / nonprod: multi-token SSE without depending on fleet budget.
      finalText = await emitDeterministicTokenStream(sql, run.id, run.message, controller);
    } else {
      try {
        const agentBundle = await createFleetAgentWithResolved({
          role: run.role,
          agentId: `chat-${run.id}`,
        });
        const result = await agentBundle.agent.stream(
          `CHAT specialist request. Answer concisely and safely: ${run.message}`,
          {
            maxSteps: run.max_steps,
            abortSignal: controller.signal,
            toolsets: {
              chat: {
                chat_context: createChatContextTool(run.role as ChatSpecialistRole, run.max_steps),
              },
            },
          }
        );
        for await (const chunk of result.fullStream) {
          if (controller.signal.aborted) break;
          const handled = handleStreamChunk(chunk);
          if (handled.action === 'tripwire') throw new TripwireError(handled.tripwire);
          const textDelta = getTextDelta(chunk);
          if (chunk.type === 'text-delta' && textDelta !== undefined) {
            finalText += textDelta;
            await appendEvent(sql, run.id, 'token', { token: textDelta });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        // Nonprod safety net: if fleet is budget-empty / unreachable, still emit
        // real multi-token SSE so reactive surfaces stay testable.
        // S-REACTIVE-04: HOLO_CHAT_FLEET_ONLY=1 must surface the real failure envelope
        // (ROLE_UNAVAILABLE / surface-unavailable) so the client can enter `degraded`
        // instead of masking fleet-down with a deterministic success stream.
        if (
          isHolocronNonprodDatabaseUrl(databaseUrl) &&
          process.env.HOLO_CHAT_FLEET_ONLY !== '1' &&
          !(error instanceof TripwireError)
        ) {
          finalText = await emitDeterministicTokenStream(sql, run.id, run.message, controller);
        } else {
          throw error;
        }
      }

      // Empty fleet success (budget 403 mapped to empty text, etc.)
      if (!finalText.trim() && !controller.signal.aborted) {
        if (isHolocronNonprodDatabaseUrl(databaseUrl) && process.env.HOLO_CHAT_FLEET_ONLY !== '1') {
          finalText = await emitDeterministicTokenStream(sql, run.id, run.message, controller);
        } else if (process.env.HOLO_CHAT_FLEET_ONLY === '1') {
          // S-REACTIVE-04: empty stream under fleet-only is a fleet-unavailable signal
          // (do not leave the client on a generic hang / opaque failure).
          throw new Error(
            "fleet role 'divergent' unreachable (degradation=surface-unavailable): empty stream under HOLO_CHAT_FLEET_ONLY"
          );
        } else {
          throw new Error('Chat stream completed without an assistant response');
        }
      }
    }

    // Cancel owns finalize when aborted mid-stream (partial durable + agent_busy clear).
    if (controller.signal.aborted) {
      return;
    }

    if (!finalText.trim()) {
      throw new Error('Chat stream completed without an assistant response');
    }

    await finalizeChatRun(
      sql,
      run,
      'completed',
      'terminal',
      {
        status: 'completed',
        text: finalText,
      },
      { finalText }
    );
  } catch (error) {
    // Cancel path aborts the stream and owns finalize (partial + agent_busy clear).
    // Do not race a second failed finalize that could clobber cancel semantics.
    if (controller.signal.aborted) {
      return;
    }
    if (error instanceof TripwireError) {
      await finalizeChatRun(
        sql,
        run,
        'blocked',
        'blocked',
        {
          code: 'CHAT_PROCESSOR_BLOCKED',
          message: error.message,
          processorId: error.tripwire.processorId,
        },
        {
          errorCode: 'CHAT_PROCESSOR_BLOCKED',
          errorMessage: error.message,
        }
      );
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    // S-REACTIVE-04: surface the exact fleet-unavailable message when the failure
    // envelope is ROLE_UNAVAILABLE / surface-unavailable so clients can enter
    // `degraded` without paraphrasing.
    const isFleetUnavailable =
      /ROLE_UNAVAILABLE|surface-unavailable|fleet role .+ unreachable|Local fleet unavailable/i.test(
        message
      ) ||
      (error instanceof Error && (error as { code?: string }).code === 'ROLE_UNAVAILABLE');
    const failureText = isFleetUnavailable
      ? 'Local fleet unavailable — running in reduced mode'
      : `Assistant could not complete this turn: ${message}`;
    await finalizeChatRun(
      sql,
      run,
      'failed',
      'terminal',
      {
        status: 'failed',
        error: isFleetUnavailable ? 'Local fleet unavailable — running in reduced mode' : message,
        text: failureText,
        code: isFleetUnavailable ? 'ROLE_UNAVAILABLE' : 'CHAT_RUN_FAILED',
      },
      {
        errorCode: isFleetUnavailable ? 'ROLE_UNAVAILABLE' : 'CHAT_RUN_FAILED',
        errorMessage: isFleetUnavailable
          ? 'Local fleet unavailable — running in reduced mode'
          : message,
        finalText: failureText,
      }
    );
  } finally {
    activeChatRuns.delete(run.id);
    await sql.end({ timeout: 5 });
  }
}

export async function createChatRun(
  raw: unknown,
  scope: ChatRunScope,
  options?: { databaseUrl?: string }
) {
  const input = ChatRunRequestSchema.parse(raw);
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'chat run create',
  });
  const sql = createSql(databaseUrl);
  try {
    const result = await sql.begin(async (tx) => {
      const existing = await tx<ChatRunRow[]>`
        SELECT * FROM chat_runs WHERE owner_scope = ${scope} AND request_id = ${input.requestId}
        LIMIT 1
      `;
      if (existing[0]) return { created: false, run: existing[0] };

      const conversationId = input.conversationId ?? randomUUID();
      if (!input.conversationId) {
        await tx`
          INSERT INTO conversations (
            id, title, last_message_preview, agent_busy, agent_busy_since
          )
          VALUES (
            ${conversationId}::uuid,
            ${input.conversationTitle ?? input.msg.slice(0, 80)},
            ${input.msg.slice(0, 200)},
            true,
            now()
          )
        `;
      } else {
        await tx`
          UPDATE conversations
          SET agent_busy = true,
              agent_busy_since = now(),
              updated_at = now()
          WHERE id::text = ${conversationId}
        `;
      }

      const rows = await tx<ChatRunRow[]>`
        INSERT INTO chat_runs (id, owner_scope, request_id, conversation_id, role, message)
        VALUES (${randomUUID()}::uuid, ${scope}, ${input.requestId}, ${conversationId}, ${resolveChatSpecialistRole(input.msg)}, ${input.msg})
        ON CONFLICT (owner_scope, request_id) DO NOTHING
        RETURNING *
      `;
      const run = rows[0];
      if (!run) {
        const conflicted = await tx<ChatRunRow[]>`
          SELECT * FROM chat_runs WHERE owner_scope = ${scope} AND request_id = ${input.requestId}
          LIMIT 1
        `;
        if (!conflicted[0]) throw new Error('chat run insert returned no row');
        return { created: false, run: conflicted[0] };
      }
      await tx`
        INSERT INTO chat_messages (
          id, conversation_id, role, content, message_type, card_data, document_id, session_id
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${conversationId},
          'user',
          ${input.msg},
          ${input.cardData ? 'result_card' : 'text'},
          ${input.cardData ? tx.json(toSqlJsonValue(input.cardData)) : null},
          ${input.documentId ?? null},
          ${run.id}
        )
      `;
      await tx`
        UPDATE conversations
        SET last_message_preview = ${input.msg.slice(0, 200)}, updated_at = now()
        WHERE id::text = ${conversationId}
      `;
      return { created: true, run };
    });
    if (!result.created) return rowPayload(result.run, true);
    void processChatRun(databaseUrl, result.run);
    return rowPayload(result.run, false);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function cancelChatRun(
  runId: string,
  options?: { databaseUrl?: string; ownerScope?: ChatRunScope }
) {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'chat run cancel',
  });
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<ChatRunRow[]>`
      SELECT * FROM chat_runs
      WHERE id = ${runId}::uuid
        AND (${options?.ownerScope ?? null}::text IS NULL OR owner_scope = ${options?.ownerScope ?? null})
      LIMIT 1
    `;
    const run = rows[0];
    if (!run) return null;
    if (!['completed', 'blocked', 'failed'].includes(run.status)) {
      activeChatRuns.get(runId)?.abort();
      // Assemble partial assistant text from token events so cancel finalizes
      // one durable bubble matching the client overlay (AC-5).
      const tokenEvents = await sql<{ data_json: unknown }[]>`
        SELECT data_json FROM chat_run_events
        WHERE run_id = ${runId}::uuid AND event_type = 'token'
        ORDER BY seq ASC
      `;
      let partialText = '';
      for (const ev of tokenEvents) {
        const data = ev.data_json;
        if (
          data &&
          typeof data === 'object' &&
          typeof (data as { token?: unknown }).token === 'string'
        ) {
          partialText += (data as { token: string }).token;
        }
      }
      await finalizeChatRun(
        sql,
        run,
        'blocked',
        'blocked',
        {
          code: 'CHAT_RUN_CANCELLED',
          message: 'chat run cancelled by client',
          ...(partialText.length > 0 ? { text: partialText } : {}),
        },
        {
          errorCode: 'CHAT_RUN_CANCELLED',
          errorMessage: 'chat run cancelled by client',
          // Persist partial (or empty) so agent_busy clears + Zero can reconcile
          finalText: partialText,
        }
      );
    }
    const updated = (
      await sql<ChatRunRow[]>`
      SELECT * FROM chat_runs
      WHERE id = ${runId}::uuid
        AND (${options?.ownerScope ?? null}::text IS NULL OR owner_scope = ${options?.ownerScope ?? null})
      LIMIT 1
    `
    )[0];
    return updated ? rowPayload(updated, false) : null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function getChatRun(
  runId: string,
  options?: { databaseUrl?: string; afterSeq?: number; ownerScope?: ChatRunScope }
) {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'chat run status',
  });
  const sql = createSql(databaseUrl);
  try {
    const runs = await sql<ChatRunRow[]>`
      SELECT * FROM chat_runs
      WHERE id = ${runId}::uuid
        AND (${options?.ownerScope ?? null}::text IS NULL OR owner_scope = ${options?.ownerScope ?? null})
      LIMIT 1
    `;
    const run = runs[0];
    if (!run) return null;
    const events = await sql<ChatEventRow[]>`
      SELECT run_id, seq, event_type, data_json
      FROM chat_run_events
      WHERE run_id = ${runId}::uuid AND seq > ${options?.afterSeq ?? 0}
      ORDER BY seq ASC
    `;
    return { ...rowPayload(run, false), events };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function listChatEvents(
  runId: string,
  afterSeq: number,
  options?: { databaseUrl?: string; ownerScope?: ChatRunScope }
): Promise<{ run: ReturnType<typeof rowPayload>; events: ChatEventRow[] } | null> {
  const result = await getChatRun(runId, { ...options, afterSeq });
  if (!result) return null;
  return { run: result, events: result.events };
}
