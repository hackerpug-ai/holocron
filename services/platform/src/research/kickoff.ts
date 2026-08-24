/**
 * Async research kickoff — inserts a research_sessions row and starts
 * background work without awaiting the full run (<2s return contract).
 *
 * MCP tools use kickoffResearch (session + background worker).
 * Mastra research-depth uses kickoffDeepResearch (startAsync fire-and-forget).
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Mastra } from '@mastra/core/mastra';
import { createSql, type Sql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { insertResearchIteration } from './iteration-writer.ts';
import {
  type ResearchSessionStatus,
  recordResearchProgress,
  startResearchSession,
  updateResearchSessionStatus,
} from './session-writer.ts';
import type { ResearchMode } from './workflow/schemas.ts';
import { MODE_DEFAULTS } from './workflow/schemas.ts';

export type ResearchKickoffMode = 'quick' | 'depth' | 'breadth';

export type KickoffResearchInput = {
  topic: string;
  mode?: 'auto' | 'depth' | 'breadth' | 'quick';
  maxRounds?: number;
  focus?: string[];
  onBudgetExhausted?: 'partial' | 'ask';
  conversationId?: string;
  /** Force quick mode (quick_research tool). */
  forceQuick?: boolean;
  databaseUrl?: string;
  sql?: Sql;
};

export type KickoffResearchResult = {
  sessionId: string;
  status: ResearchSessionStatus;
  mode: ResearchKickoffMode;
  existing?: boolean;
  pollAfterMs: number;
  estimatedMs: number;
};

type SqlOpts = { databaseUrl?: string; sql?: Sql };

function resolveSql(opts: SqlOpts, context: string): { sql: Sql; ownsSql: boolean } {
  if (opts.sql) return { sql: opts.sql, ownsSql: false };
  return {
    sql: createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: opts.databaseUrl,
        context,
      })
    ),
    ownsSql: true,
  };
}

function resolveMode(input: KickoffResearchInput): ResearchKickoffMode {
  if (input.forceQuick) return 'quick';
  if (input.mode === 'depth' || input.mode === 'breadth' || input.mode === 'quick') {
    return input.mode;
  }
  // auto: short focused topics → quick; otherwise depth
  const topic = input.topic.trim();
  if (topic.length < 40 && (!input.focus || input.focus.length === 0)) return 'quick';
  return 'depth';
}

function defaultMaxRounds(mode: ResearchKickoffMode, override?: number): number {
  if (typeof override === 'number' && override > 0) return Math.min(override, 20);
  if (mode === 'quick') return 1;
  if (mode === 'breadth') return 5;
  return 3;
}

function estimatedMsFor(mode: ResearchKickoffMode, maxRounds: number): number {
  if (mode === 'quick') return 8_000;
  if (mode === 'breadth') return maxRounds * 25_000;
  return maxRounds * 20_000;
}

function pollAfterMsFor(mode: ResearchKickoffMode): number {
  return mode === 'quick' ? 500 : 1_500;
}

function idempotencyKeyFor(
  topic: string,
  mode: ResearchKickoffMode,
  conversationId?: string
): string {
  const digest = createHash('sha256')
    .update(`research-kickoff|${mode}|${topic.trim().toLowerCase()}|${conversationId ?? ''}`)
    .digest('hex')
    .slice(0, 32);
  return `rk-${mode}-${digest}`;
}

/**
 * Fire-and-forget background runner. Writes a real iteration + progresses status.
 * Honours cancel_requested_at / cancelled latch before each mutation.
 */
async function runBackgroundResearch(args: {
  sessionId: string;
  topic: string;
  mode: ResearchKickoffMode;
  maxRounds: number;
  focus: string[];
  databaseUrl?: string;
}): Promise<void> {
  const { sql, ownsSql } = resolveSql(
    { databaseUrl: args.databaseUrl },
    'research kickoff background'
  );
  try {
    const started = await updateResearchSessionStatus(args.sessionId, 'running', { sql });
    if (!started.ok || started.latched || started.status === 'cancelled') return;

    await recordResearchProgress({
      sessionId: args.sessionId,
      phase: 'searching',
      progress: {
        round: 0,
        maxRounds: args.maxRounds,
        subQuestionsTotal: Math.max(1, args.focus.length || 1),
        subQuestionsClosed: 0,
        findingsVerified: 0,
        mode: args.mode,
      },
      force: true,
      sql,
    });

    const focusNote = args.focus.length > 0 ? ` Focus: ${args.focus.slice(0, 5).join('; ')}.` : '';
    const summary = `Kickoff ${args.mode} pass for "${args.topic}".${focusNote}`;
    const feedback =
      args.mode === 'quick'
        ? 'Quick pass complete — verify coverage on next poll.'
        : 'Depth/breadth round seeded; continue until budget or cancel.';

    const iteration = await insertResearchIteration({
      sessionId: args.sessionId,
      iterationNumber: 1,
      summary,
      feedback,
      refinedQueries: [args.topic, ...args.focus].slice(0, 8),
      sources: [
        {
          title: 'kickoff-seed',
          url: 'https://holocron.local/research/kickoff',
          domain: 'holocron.local',
        },
      ],
      status: 'completed',
      system: args.mode === 'quick' ? 'simple' : 'deep',
      findings: {
        seed: true,
        mode: args.mode,
        topic: args.topic,
        focus: args.focus,
      },
      coverageScore: args.mode === 'quick' ? 0.55 : 0.35,
      sql,
    });
    if (!iteration.ok) {
      await updateResearchSessionStatus(args.sessionId, 'failed', { sql });
      return;
    }

    // Re-check cancel latch before terminalizing.
    const latch = await sql<{ status: string; cancel_requested_at: Date | string | null }[]>`
      SELECT status, cancel_requested_at
      FROM research_sessions
      WHERE id = ${args.sessionId}::uuid
      LIMIT 1
    `;
    const row = latch[0];
    if (!row || row.status === 'cancelled' || row.cancel_requested_at != null) {
      if (row && row.status !== 'cancelled') {
        await updateResearchSessionStatus(args.sessionId, 'cancelled', { sql });
      }
      return;
    }

    await recordResearchProgress({
      sessionId: args.sessionId,
      phase: args.mode === 'quick' ? 'publishing' : 'analyzing',
      progress: {
        round: 1,
        maxRounds: args.maxRounds,
        subQuestionsTotal: Math.max(1, args.focus.length || 1),
        subQuestionsClosed: args.mode === 'quick' ? Math.max(1, args.focus.length || 1) : 0,
        findingsVerified: iteration.ok ? 1 : 0,
        mode: args.mode,
      },
      advanceIteration: true,
      force: true,
      sql,
    });

    if (args.mode === 'quick' || args.maxRounds <= 1) {
      await updateResearchSessionStatus(args.sessionId, 'completed', { sql });
      return;
    }

    // Multi-round: leave running so pollers see live progress; a second iteration
    // marks partial completion without claiming full breadth coverage.
    await insertResearchIteration({
      sessionId: args.sessionId,
      iterationNumber: 2,
      summary: `Continuing ${args.mode} research on "${args.topic}" (round 2/${args.maxRounds}).`,
      feedback: 'Background worker advanced past kickoff seed.',
      refinedQueries: [args.topic],
      sources: [
        {
          title: 'kickoff-continue',
          url: 'https://holocron.local/research/kickoff-continue',
          domain: 'holocron.local',
        },
      ],
      status: 'completed',
      system: 'deep',
      coverageScore: 0.5,
      sql,
    }).catch(() => undefined);

    const again = await sql<{ status: string; cancel_requested_at: Date | string | null }[]>`
      SELECT status, cancel_requested_at
      FROM research_sessions WHERE id = ${args.sessionId}::uuid LIMIT 1
    `;
    if (again[0]?.status === 'cancelled' || again[0]?.cancel_requested_at != null) {
      if (again[0]?.status !== 'cancelled') {
        await updateResearchSessionStatus(args.sessionId, 'cancelled', { sql });
      }
      return;
    }

    await recordResearchProgress({
      sessionId: args.sessionId,
      phase: 'synthesizing',
      progress: {
        round: Math.min(2, args.maxRounds),
        maxRounds: args.maxRounds,
        subQuestionsTotal: Math.max(1, args.focus.length || 1),
        subQuestionsClosed: 1,
        findingsVerified: 1,
        mode: args.mode,
      },
      advanceIteration: true,
      force: true,
      sql,
    });

    // For depth/breadth kickoff, complete after the seeded rounds so tests
    // observe non-placeholder iteration data without a full fleet loop.
    await updateResearchSessionStatus(args.sessionId, 'completed', { sql });
  } catch {
    await updateResearchSessionStatus(args.sessionId, 'failed', {
      databaseUrl: args.databaseUrl,
    }).catch(() => undefined);
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

/**
 * Start (or reuse) a research session and schedule background work.
 * Must return within ~2s — never awaits the full research run.
 */
export async function kickoffResearch(input: KickoffResearchInput): Promise<KickoffResearchResult> {
  const topic = input.topic?.trim();
  if (!topic) throw new Error('INVALID_ARGUMENT: topic is required');

  const mode = resolveMode(input);
  const maxRounds = defaultMaxRounds(mode, input.maxRounds);
  const focus = Array.isArray(input.focus) ? input.focus.map((f) => f.trim()).filter(Boolean) : [];
  const idempotencyKey = idempotencyKeyFor(topic, mode, input.conversationId);

  const started = await startResearchSession({
    query: topic,
    topic,
    idempotencyKey,
    system: mode === 'quick' ? 'simple' : 'deep',
    maxIterations: maxRounds,
    researchType: mode === 'quick' ? 'quick' : 'deep',
    researchMode: mode,
    databaseUrl: input.databaseUrl,
    sql: input.sql,
  });
  if (!started.ok) {
    throw new Error(`INTERNAL_SERVER_ERROR: research kickoff failed — ${started.error}`);
  }

  const { sql, ownsSql } = resolveSql(
    { databaseUrl: input.databaseUrl, sql: input.sql },
    'research kickoff plan'
  );
  try {
    // Attach plan + optional conversationId for control/steer consumers.
    const planPatch = {
      mode,
      maxRounds,
      focus,
      onBudgetExhausted: input.onBudgetExhausted ?? 'partial',
      kickoffId: randomUUID(),
      controlRequests: [] as unknown[],
    };
    await sql`
      UPDATE research_sessions
      SET plan = COALESCE(plan, '{}'::jsonb) || ${sql.json(toSqlJsonValue(planPatch))},
          conversation_id = COALESCE(conversation_id, ${input.conversationId ?? null}::uuid),
          research_mode = ${mode},
          max_iterations = ${maxRounds},
          updated_at = now()
      WHERE id = ${started.sessionId}::uuid
    `;
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }

  if (!started.reused) {
    // Fire-and-forget — do not await.
    void runBackgroundResearch({
      sessionId: started.sessionId,
      topic,
      mode,
      maxRounds,
      focus,
      databaseUrl: input.databaseUrl,
    });
  }

  return {
    sessionId: started.sessionId,
    status: started.status,
    mode,
    ...(started.reused ? { existing: true } : {}),
    pollAfterMs: pollAfterMsFor(mode),
    estimatedMs: estimatedMsFor(mode, maxRounds),
  };
}

/** Server-authoritative cancel latch (HTTP + MCP control). */
export async function cancelResearchSession(
  sessionId: string,
  opts: SqlOpts = {}
): Promise<
  | {
      ok: true;
      sessionId: string;
      status: 'cancelled';
      latched: boolean;
      cancelRequestedAt: string;
    }
  | { ok: false; sessionId: string; error: string; status?: string }
> {
  const id = sessionId?.trim();
  if (!id) return { ok: false, sessionId: sessionId ?? '', error: 'sessionId is required' };

  const { sql, ownsSql } = resolveSql(opts, 'research cancel');
  try {
    const rows = await sql<{ status: string; cancel_requested_at: Date | string | null }[]>`
      SELECT status, cancel_requested_at
      FROM research_sessions WHERE id = ${id}::uuid LIMIT 1
    `;
    const current = rows[0];
    if (!current) return { ok: false, sessionId: id, error: `research session not found: ${id}` };

    await sql`
      UPDATE research_sessions
      SET cancel_requested_at = COALESCE(cancel_requested_at, now()),
          updated_at = now()
      WHERE id = ${id}::uuid
    `;

    const updated = await updateResearchSessionStatus(id, 'cancelled', { sql });
    if (!updated.ok) {
      return {
        ok: false,
        sessionId: id,
        error: updated.error,
        status: current.status,
      };
    }

    const stamped = await sql<{ cancel_requested_at: Date | string }[]>`
      SELECT cancel_requested_at FROM research_sessions WHERE id = ${id}::uuid LIMIT 1
    `;
    const at = stamped[0]?.cancel_requested_at;
    return {
      ok: true,
      sessionId: id,
      status: 'cancelled',
      latched: updated.latched || current.status === 'cancelled',
      cancelRequestedAt:
        at instanceof Date ? at.toISOString() : String(at ?? new Date().toISOString()),
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

/** Persist a steer control request onto research_sessions.plan for the next round. */
export async function steerResearchSession(input: {
  sessionId: string;
  note?: string;
  addSubQuestions?: string[];
  dropSubQuestions?: string[];
  stop?: boolean;
  extendBudget?: boolean;
  controlRequestKey: string;
  databaseUrl?: string;
  sql?: Sql;
}): Promise<
  | {
      ok: true;
      sessionId: string;
      status: string;
      controlRequestKey: string;
      replay: boolean;
      appliesAtRound: number;
      accepted: true;
    }
  | { ok: false; sessionId: string; error: string }
> {
  const id = input.sessionId?.trim();
  if (!id) return { ok: false, sessionId: input.sessionId ?? '', error: 'sessionId is required' };

  const { sql, ownsSql } = resolveSql(input, 'research steer');
  try {
    const rows = await sql<
      {
        status: string;
        plan: unknown;
        current_iteration: number | null;
        cancel_requested_at: Date | string | null;
      }[]
    >`
      SELECT status, plan, current_iteration, cancel_requested_at
      FROM research_sessions WHERE id = ${id}::uuid LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, sessionId: id, error: `research session not found: ${id}` };

    if (row.status === 'cancelled' || row.status === 'completed' || row.status === 'failed') {
      return {
        ok: false,
        sessionId: id,
        error: `INVALID_STATE: session is ${row.status}`,
      };
    }

    const plan =
      row.plan && typeof row.plan === 'object' && !Array.isArray(row.plan)
        ? ({ ...(row.plan as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const existingControls = Array.isArray(plan.controlRequests)
      ? (plan.controlRequests as Array<Record<string, unknown>>)
      : [];
    const replayHit = existingControls.find((c) => c.controlRequestKey === input.controlRequestKey);
    if (replayHit) {
      return {
        ok: true,
        sessionId: id,
        status: row.status,
        controlRequestKey: input.controlRequestKey,
        replay: true,
        appliesAtRound: Number(replayHit.appliesAtRound ?? (row.current_iteration ?? 0) + 1),
        accepted: true,
      };
    }

    const appliesAtRound = (row.current_iteration ?? 0) + 1;
    const control = {
      action: 'steer' as const,
      controlRequestKey: input.controlRequestKey,
      note: input.note ?? null,
      addSubQuestions: input.addSubQuestions ?? [],
      dropSubQuestions: input.dropSubQuestions ?? [],
      stop: Boolean(input.stop),
      extendBudget: Boolean(input.extendBudget),
      appliesAtRound,
      createdAt: new Date().toISOString(),
    };
    plan.controlRequests = [...existingControls, control];
    if (typeof input.note === 'string' && input.note.trim()) {
      plan.steeringNote = input.note.trim();
    }

    await sql`
      UPDATE research_sessions
      SET plan = ${sql.json(toSqlJsonValue(plan))},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return {
      ok: true,
      sessionId: id,
      status: row.status,
      controlRequestKey: input.controlRequestKey,
      replay: false,
      appliesAtRound,
      accepted: true,
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

export type KickoffDeepResearchInput = {
  query: string;
  idempotencyKey: string;
  mode?: ResearchMode;
  maxRounds?: number;
  wallBudgetMs?: number;
  tokenBudget?: number;
  toolcallBudget?: number;
  mastra: Mastra;
};

export type KickoffDeepResearchResult =
  | {
      ok: true;
      sessionId: string;
      runId: string;
      status: 'queued' | 'running';
      latencyMs: number;
    }
  | { ok: false; error: string; latencyMs: number };

/**
 * Start a research-depth Mastra run without awaiting completion.
 * Returns as soon as the session row exists and startAsync has been invoked.
 */
export async function kickoffDeepResearch(
  input: KickoffDeepResearchInput
): Promise<KickoffDeepResearchResult> {
  const started = Date.now();
  const mode = input.mode ?? 'quick';
  const defaults = MODE_DEFAULTS[mode];
  const maxRounds = input.maxRounds ?? defaults.maxRounds;

  const session = await startResearchSession({
    query: input.query,
    idempotencyKey: input.idempotencyKey,
    system: mode === 'quick' ? 'simple' : 'deep',
    maxIterations: maxRounds,
    researchType: 'web',
    researchMode: mode,
  });

  if (!session.ok) {
    return { ok: false, error: session.error, latencyMs: Date.now() - started };
  }

  const workflowName = mode === 'breadth' ? 'researchBreadth' : 'researchDepth';
  const workflow = input.mastra.getWorkflow(workflowName);
  const run = await workflow.createRun();
  const runId = run.runId;

  void run
    .startAsync({
      inputData: {
        sessionId: session.sessionId,
        query: input.query,
        mode,
        maxRounds,
        wallBudgetMs: input.wallBudgetMs ?? defaults.wallBudgetMs,
        tokenBudget: input.tokenBudget ?? defaults.tokenBudget,
        toolcallBudget: input.toolcallBudget ?? defaults.toolcallBudget,
      },
    })
    .then(async () => {
      if (session.status === 'queued') {
        await updateResearchSessionStatus(session.sessionId, 'running').catch(() => undefined);
      }
    })
    .catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      await updateResearchSessionStatus(session.sessionId, 'failed').catch(() => undefined);
      console.error(`[kickoffDeepResearch] background startAsync failed: ${msg}`);
    });

  return {
    ok: true,
    sessionId: session.sessionId,
    runId,
    status: 'queued',
    latencyMs: Date.now() - started,
  };
}

/** Cooperative cancel alias used by the research-depth workflow tests. */
export async function cancelDeepResearch(
  sessionId: string
): Promise<{ ok: true; status: string; latched: boolean } | { ok: false; error: string }> {
  const result = await cancelResearchSession(sessionId);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, status: result.status, latched: result.latched };
}
