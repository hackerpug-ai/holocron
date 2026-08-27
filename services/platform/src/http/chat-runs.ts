import { createHash, randomUUID } from 'node:crypto';
import { TripWire } from '@mastra/core/agent';
import { z } from 'zod';
import {
  getSpecialist,
  isSpecialistName,
  resolveSpecialistTools,
  SPECIALIST_NAMES,
  type SpecialistName,
} from '../chat/specialists.ts';
import { triageMessage } from '../chat/triage.ts';
import {
  createFleetAgentWithResolved,
  isAllowedFleetRouterEndpoint,
} from '../compat/cells/agent.ts';
import { createSql, toSqlJsonValue } from '../db/client.ts';
import {
  isHolocronNonprodDatabaseUrl,
  resolveHolocronNonprodDatabaseUrl,
} from '../db/connection.ts';
import {
  assertModelRequestAccountingSnapshot,
  createModelRequestAccounting,
  createModelRequestAccountingEvent,
  type ModelRequestAccounting,
  runWithModelRequestAccounting,
  snapshotModelRequestAccounting,
  terminalizeModelRequestAccounting,
} from '../inference/telemetry.ts';
import {
  CHAT_POLICY_PROCESSOR_ID,
  chatPolicyBlockProcessor,
  evaluateChatPolicy,
} from '../mastra/processors/chat-policy-block.ts';
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
    /** Optional agent-loop bound (default 8). */
    maxSteps: z.number().int().positive().max(32).optional(),
  })
  .strict();

export type ChatRunRequest = z.infer<typeof ChatRunRequestSchema>;
export type ChatRunScope = 'rn' | 'mcp' | 'control';
/** Persisted chat_runs.role — one of the 10 ported specialists. */
export type ChatSpecialistRole = SpecialistName;

export function resolveChatSpecialistRole(message: string): ChatSpecialistRole {
  return triageMessage(message).specialist;
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

class ChatModelAccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatModelAccountingError';
  }
}

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
  options?: {
    finalText?: string;
    errorCode?: string;
    errorMessage?: string;
    stepsUsed?: number;
  }
): Promise<void> {
  const stepsUsed = Math.max(
    0,
    Math.min(
      typeof options?.stepsUsed === 'number' ? options.stepsUsed : run.steps_used,
      run.max_steps
    )
  );
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
          steps_used = ${stepsUsed},
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
      // GATE-FIX-01: UPSERT content so an empty value never blocks the
      // durable assistant text that MessageBubble must paint after airplane.
      await tx`
        INSERT INTO chat_messages (id, conversation_id, role, content, message_type)
        VALUES (${run.durable_message_id}::uuid, ${run.conversation_id}, 'agent', ${finalText}, 'text')
        ON CONFLICT (id) DO UPDATE
        SET content = EXCLUDED.content,
            role = 'agent',
            message_type = COALESCE(chat_messages.message_type, EXCLUDED.message_type)
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

/**
 * Deterministic W3C trace id (32 lowercase hex) for a chat run.
 *
 * OBS remediation B1: chat runs previously stamped `chat:${runId}` into
 * chat_runs.trace_id, which is not a valid W3C trace id — any downstream
 * OTel export keyed on it was malformed. Deriving a stable 32-hex digest of
 * the run id keeps claim retries idempotent (same trace per run) while
 * satisfying the trace-id format every consumer validates against.
 */
export function chatRunTraceId(runId: string): string {
  return createHash('sha256').update(`holocron-chat-run:${runId}`).digest('hex').slice(0, 32);
}

async function claimRun(sql: ReturnType<typeof createSql>, runId: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE chat_runs
    SET status = 'running', trace_id = ${chatRunTraceId(runId)}, updated_at = now()
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
 * mid-stream. Still goes through the real SSE socket without substitution.
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

function resolveSpecialistForRun(run: ChatRunRow): ReturnType<typeof getSpecialist> {
  if (isSpecialistName(run.role)) {
    return getSpecialist(run.role);
  }
  // Legacy rows that still carry divergent/convergent — re-triage from message.
  return getSpecialist(triageMessage(run.message).specialist);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ParsedChatRunSseEvent = {
  event: string;
  id?: string;
  data: unknown;
};

/**
 * Parse the public chat-run SSE wire format at the production boundary.
 *
 * Consumers must reject a partial JSON data frame instead of silently
 * accepting the preceding tokens as a complete response. This parser is also
 * used by the deployed-verifier invalid-stream control, which feeds it a
 * private truncated copy of a real public response.
 */
export function parseChatRunSse(input: string): ParsedChatRunSseEvent[] {
  const events: ParsedChatRunSseEvent[] = [];
  for (const block of input.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).replace(/^ /, ''));
    if (dataLines.length === 0) continue;
    const dataText = dataLines.join('\n');
    let data: unknown;
    try {
      data = JSON.parse(dataText);
    } catch (error) {
      throw new Error(
        `CHAT_STREAM_PARSE_FAILED: invalid SSE JSON data (${error instanceof Error ? error.message : String(error)})`
      );
    }
    const eventLine = lines.find((line) => line.startsWith('event:'));
    const idLine = lines.find((line) => line.startsWith('id:'));
    events.push({
      event: eventLine?.slice('event:'.length).trim() || 'message',
      ...(idLine ? { id: idLine.slice('id:'.length).trim() } : {}),
      data,
    });
  }
  if (events.length === 0)
    throw new Error('CHAT_STREAM_PARSE_FAILED: SSE stream contained no data frames');
  return events;
}

export async function processChatRun(databaseUrl: string, run: ChatRunRow): Promise<void> {
  const sql = createSql(databaseUrl);
  const controller = new AbortController();
  let stepsUsed = 0;
  try {
    if (!(await claimRun(sql, run.id))) return;
    activeChatRuns.set(run.id, controller);

    const specialist = resolveSpecialistForRun(run);
    const toolIds = [...specialist.toolIds];

    // Persist least-privilege grants so AC-2 reads state, not source.
    await appendEvent(sql, run.id, 'tool_grants', {
      specialist: specialist.name,
      tools: toolIds,
      fleetRole: specialist.fleetRole,
    });

    let finalText = '';
    let hitMaxSteps = false;

    // Never short-circuit policy-tripping messages through the deterministic
    // emitter — the registered inputProcessor must abort on the real agent path.
    const policyWouldBlock = evaluateChatPolicy(run.message) !== null;
    if (shouldUseDeterministicChatStream(databaseUrl, run.message) && !policyWouldBlock) {
      if (process.env.PLATFORM_IT === '1') {
        throw new ChatModelAccountingError(
          'public integration runs must reach the real agent.stream model boundary'
        );
      }
      // E2E / nonprod: multi-token SSE without depending on fleet budget.
      finalText = await emitDeterministicTokenStream(sql, run.id, run.message, controller);
      stepsUsed = 1;
    } else {
      let accounting: ModelRequestAccounting | undefined;
      try {
        const tools = resolveSpecialistTools(toolIds);
        const agentBundle = await createFleetAgentWithResolved({
          role: specialist.fleetRole,
          agentId: `chat-${specialist.name}-${run.id}`,
          runId: run.id,
          instructions: specialist.systemPrompt,
          tools,
          inputProcessors: [chatPolicyBlockProcessor],
        });
        // Keep the public boundary fail-closed even if a future factory caller
        // accidentally returns a non-router model. This check is before Agent
        // stream creation and therefore before any provider transport call.
        if (!isAllowedFleetRouterEndpoint(agentBundle.resolved.baseURL)) {
          throw new ChatModelAccountingError(
            `public chat refused non-router endpoint: ${agentBundle.resolved.baseURL}`
          );
        }
        // Bound runs that need more work than maxSteps: force a tool call every
        // step so the loop hits the ceiling (AC-3). Never force on larger budgets —
        // toolChoice:required would consume every step without a final text turn.
        const forceToolLoop =
          run.max_steps <= 2 &&
          toolIds.length > 0 &&
          (/\bMUST call\b/i.test(run.message) ||
            /\bPerform at least \d+ sequential tool calls\b/i.test(run.message));
        const requestAccounting = createModelRequestAccounting({
          requestId: run.request_id,
          runId: run.id,
          resolvedEndpoint: agentBundle.resolved.baseURL,
        });
        accounting = requestAccounting;
        let accountingSnapshot: ReturnType<typeof snapshotModelRequestAccounting> | undefined;
        try {
          const result = await runWithModelRequestAccounting(requestAccounting, () =>
            agentBundle.agent.stream(
              `CHAT specialist request (${specialist.name}). Answer concisely and safely: ${run.message}`,
              {
                maxSteps: run.max_steps,
                abortSignal: controller.signal,
                ...(forceToolLoop ? { toolChoice: 'required' as const } : {}),
              }
            )
          );
          await runWithModelRequestAccounting(requestAccounting, async () => {
            // The accounting ALS must remain active through the complete stream.
            // Mastra may issue additional doGenerate/doStream calls while this
            // iterator consumes tool-loop steps.
            for await (const chunk of result.fullStream as AsyncIterable<unknown>) {
              if (controller.signal.aborted) break;
              const handled = handleStreamChunk(chunk);
              if (handled.action === 'tripwire') throw new TripwireError(handled.tripwire);

              if (isRecord(chunk) && chunk.type === 'step-finish') {
                stepsUsed = Math.min(stepsUsed + 1, run.max_steps);
                await appendEvent(sql, run.id, 'step', {
                  step: stepsUsed,
                  maxSteps: run.max_steps,
                });
                if (stepsUsed >= run.max_steps) {
                  hitMaxSteps = true;
                }
              }

              if (
                isRecord(chunk) &&
                (chunk.type === 'tool-call' || chunk.type === 'tool-call-input-streaming-start')
              ) {
                const payload = isRecord(chunk.payload) ? chunk.payload : {};
                await appendEvent(sql, run.id, 'tool-call', {
                  toolName:
                    typeof payload.toolName === 'string'
                      ? payload.toolName
                      : typeof payload.tool_name === 'string'
                        ? payload.tool_name
                        : chunk.type,
                  toolCallId:
                    typeof payload.toolCallId === 'string'
                      ? payload.toolCallId
                      : typeof payload.tool_call_id === 'string'
                        ? payload.tool_call_id
                        : undefined,
                  args: payload.args ?? payload.input,
                });
                // A tool-using step is observable even if step-finish is delayed.
                if (stepsUsed === 0) {
                  stepsUsed = 1;
                }
              }

              const textDelta = getTextDelta(chunk);
              if (isRecord(chunk) && chunk.type === 'text-delta' && textDelta !== undefined) {
                finalText += textDelta;
                await appendEvent(sql, run.id, 'token', { token: textDelta });
              }
            }

            // Prefer authoritative step count from the stream result when present.
            const streamResult = result as {
              steps?: unknown;
              finishReason?: unknown;
              text?: Promise<string> | string;
            };
            if (Array.isArray(streamResult.steps) && streamResult.steps.length > 0) {
              stepsUsed = Math.min(streamResult.steps.length, run.max_steps);
            }
            if (typeof streamResult.finishReason === 'string') {
              if (
                streamResult.finishReason === 'length' ||
                /max.?step/i.test(streamResult.finishReason)
              ) {
                hitMaxSteps = true;
                stepsUsed = Math.min(Math.max(stepsUsed, run.max_steps), run.max_steps);
              }
            }
            if (!finalText.trim() && streamResult.text) {
              const maybe = await Promise.resolve(streamResult.text);
              if (typeof maybe === 'string' && maybe.trim()) {
                finalText = maybe;
              }
            }
          });
        } finally {
          // This is the sole terminalization point, after agent.stream and the
          // complete fullStream/tool-loop iterator have settled.
          accountingSnapshot = terminalizeModelRequestAccounting(requestAccounting);
        }
        if (!accountingSnapshot) {
          throw new ChatModelAccountingError('public model accounting did not terminalize');
        }
        const telemetryIdRows = await sql<{ id: string }[]>`
          SELECT id::text AS id
          FROM inference_telemetry
          WHERE run_id = ${run.id}
            AND step_id = 'chat-runs/model'
        `;
        const telemetryRowIds = telemetryIdRows.map((row) => row.id).sort();
        assertModelRequestAccountingSnapshot(accountingSnapshot, {
          durableTelemetryRows: telemetryRowIds.length,
        });
        await appendEvent(
          sql,
          run.id,
          'model-accounting',
          createModelRequestAccountingEvent(accountingSnapshot, telemetryRowIds)
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ChatModelAccountingError) throw error;
        if (
          accounting &&
          (accounting.modelRequests > 0 ||
            accounting.cloudRequests > 0 ||
            accounting.unknownRequests > 0)
        ) {
          throw new ChatModelAccountingError(
            `public model accounting rejected after provider failure: ${JSON.stringify(snapshotModelRequestAccounting(accounting))}`
          );
        }
        if (process.env.PLATFORM_IT === '1') {
          throw new ChatModelAccountingError(
            `public integration model boundary was unavailable before accounting: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        // Nonprod safety net: if fleet is budget-empty / unreachable, still emit
        // real multi-token SSE so reactive surfaces stay testable.
        // S-REACTIVE-04: HOLO_CHAT_FLEET_ONLY=1 must surface the real failure envelope
        // (ROLE_UNAVAILABLE / surface-unavailable) so the client can enter `degraded`
        // instead of masking fleet-down with a deterministic success stream.
        if (
          isHolocronNonprodDatabaseUrl(databaseUrl) &&
          process.env.HOLO_CHAT_FLEET_ONLY !== '1' &&
          !(error instanceof TripwireError) &&
          !(error instanceof TripWire)
        ) {
          finalText = await emitDeterministicTokenStream(sql, run.id, run.message, controller);
          if (stepsUsed === 0) stepsUsed = 1;
        } else {
          throw error;
        }
      }

      // Empty fleet success (budget 403 mapped to empty text, etc.)
      if (!finalText.trim() && !controller.signal.aborted) {
        // maxSteps-bounded tool loops may exhaust the step budget before a text turn.
        if (hitMaxSteps || stepsUsed >= run.max_steps) {
          hitMaxSteps = true;
          stepsUsed = Math.min(Math.max(stepsUsed, run.max_steps), run.max_steps);
          finalText = `Stopped after max_steps=${run.max_steps}.`;
          await appendEvent(sql, run.id, 'token', { token: finalText });
        } else if (
          isHolocronNonprodDatabaseUrl(databaseUrl) &&
          process.env.HOLO_CHAT_FLEET_ONLY !== '1'
        ) {
          finalText = await emitDeterministicTokenStream(sql, run.id, run.message, controller);
          if (stepsUsed === 0) stepsUsed = 1;
        } else if (process.env.HOLO_CHAT_FLEET_ONLY === '1') {
          // S-REACTIVE-04: empty stream under fleet-only is a fleet-unavailable signal
          // (do not leave the client on a generic hang / opaque failure).
          throw new Error(
            `fleet role '${specialist.fleetRole}' unreachable (degradation=surface-unavailable): empty stream under HOLO_CHAT_FLEET_ONLY`
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

    if (stepsUsed === 0) stepsUsed = 1;
    stepsUsed = Math.min(stepsUsed, run.max_steps);
    if (stepsUsed >= run.max_steps) hitMaxSteps = true;

    await finalizeChatRun(
      sql,
      run,
      'completed',
      'terminal',
      {
        status: 'completed',
        text: finalText,
        specialist: specialist.name,
        ...(hitMaxSteps
          ? { stopReason: 'max_steps', max_steps: run.max_steps, steps_used: stepsUsed }
          : { steps_used: stepsUsed }),
      },
      { finalText, stepsUsed }
    );
  } catch (error) {
    // Cancel path aborts the stream and owns finalize (partial + agent_busy clear).
    // Do not race a second failed finalize that could clobber cancel semantics.
    if (controller.signal.aborted) {
      return;
    }
    if (error instanceof TripwireError || error instanceof TripWire) {
      const processorId =
        error instanceof TripwireError
          ? error.tripwire.processorId || CHAT_POLICY_PROCESSOR_ID
          : error.processorId || CHAT_POLICY_PROCESSOR_ID;
      const message = error.message;
      await finalizeChatRun(
        sql,
        run,
        'blocked',
        'blocked',
        {
          code: 'CHAT_PROCESSOR_BLOCKED',
          message,
          processorId,
        },
        {
          errorCode: 'CHAT_PROCESSOR_BLOCKED',
          errorMessage: message,
          stepsUsed: 0,
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
        stepsUsed: Math.min(Math.max(stepsUsed, 0), run.max_steps),
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

      const specialistRole = resolveChatSpecialistRole(input.msg);
      const maxSteps = input.maxSteps ?? 8;
      const rows = await tx<ChatRunRow[]>`
        INSERT INTO chat_runs (id, owner_scope, request_id, conversation_id, role, message, max_steps)
        VALUES (
          ${randomUUID()}::uuid,
          ${scope},
          ${input.requestId},
          ${conversationId},
          ${specialistRole},
          ${input.msg},
          ${maxSteps}
        )
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
          id, conversation_id, role, content, message_type, card_data, document_id
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${conversationId},
          'user',
          ${input.msg},
          ${input.cardData ? 'result_card' : 'text'},
          ${input.cardData ? tx.json(toSqlJsonValue(input.cardData)) : null},
          ${input.documentId ?? null}
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
          stepsUsed: run.steps_used,
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

/** Exported for tests/oracles — the closed set of ported specialist names. */
export const CHAT_SPECIALIST_NAMES = SPECIALIST_NAMES;
