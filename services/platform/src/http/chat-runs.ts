import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createFleetAgentWithResolved } from '../compat/cells/agent.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { handleStreamChunk, TripwireError } from '../mastra/tripwire.ts';

const ChatRunRequestSchema = z
  .object({
    requestId: z.string().min(1).max(200),
    msg: z.string().min(1).max(20_000),
    conversationId: z.string().min(1).max(200).optional(),
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
    if (status === 'completed' && options?.finalText !== undefined) {
      await tx`
        INSERT INTO chat_messages (id, role, content, message_type, session_id)
        VALUES (${run.durable_message_id}::uuid, 'assistant', ${options.finalText}, 'chat', ${run.id})
        ON CONFLICT (id) DO NOTHING
      `;
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

async function processChatRun(databaseUrl: string, run: ChatRunRow): Promise<void> {
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

    const agentBundle = await createFleetAgentWithResolved({
      role: run.role,
      agentId: `chat-${run.id}`,
    });
    const result = await agentBundle.agent.stream(
      `CHAT specialist request. Answer concisely and safely: ${run.message}`,
      {
        maxSteps: run.max_steps,
        abortSignal: controller.signal,
        tools: {
          chat_context: createChatContextTool(run.role as ChatSpecialistRole, run.max_steps),
        },
      }
    );
    let finalText = '';
    for await (const chunk of result.fullStream) {
      const handled = handleStreamChunk(chunk);
      if (handled.action === 'tripwire') throw new TripwireError(handled.tripwire);
      if (chunk.type === 'text-delta' && typeof chunk.payload?.text === 'string') {
        finalText += chunk.payload.text;
        await appendEvent(sql, run.id, 'token', { token: chunk.payload.text });
      }
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
    await finalizeChatRun(
      sql,
      run,
      'failed',
      'terminal',
      { status: 'failed', error: message },
      {
        errorCode: 'CHAT_RUN_FAILED',
        errorMessage: message,
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
    const existing = await sql<ChatRunRow[]>`
      SELECT * FROM chat_runs WHERE owner_scope = ${scope} AND request_id = ${input.requestId}
      LIMIT 1
    `;
    if (existing[0]) return rowPayload(existing[0], true);

    const rows = await sql<ChatRunRow[]>`
      INSERT INTO chat_runs (id, owner_scope, request_id, conversation_id, role, message)
      VALUES (${randomUUID()}::uuid, ${scope}, ${input.requestId}, ${input.conversationId ?? null}, ${resolveChatSpecialistRole(input.msg)}, ${input.msg})
      ON CONFLICT (owner_scope, request_id) DO NOTHING
      RETURNING *
    `;
    const run =
      rows[0] ??
      (
        await sql<ChatRunRow[]>`
        SELECT * FROM chat_runs WHERE owner_scope = ${scope} AND request_id = ${input.requestId}
        LIMIT 1
      `
      )[0];
    if (!run) throw new Error('chat run insert returned no row');
    void processChatRun(databaseUrl, run);
    return rowPayload(run, false);
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
      await finalizeChatRun(
        sql,
        run,
        'blocked',
        'blocked',
        {
          code: 'CHAT_RUN_CANCELLED',
          message: 'chat run cancelled by client',
        },
        {
          errorCode: 'CHAT_RUN_CANCELLED',
          errorMessage: 'chat run cancelled by client',
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
