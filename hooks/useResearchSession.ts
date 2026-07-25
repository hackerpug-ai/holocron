import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import {
  deepResearchSessionById,
  researchIterationsBySession,
  researchSessionById,
} from '@/app/zero/queries';
import type { DeepResearchSessionWithIterations } from '@/lib/types/deep-research';

type ResearchSessionRow = {
  id: string;
  query?: string | null;
  topic?: string | null;
  status: string;
  max_iterations?: number | null;
  current_iteration?: number | null;
  coverage_score?: number | null;
  document_id?: string | null;
  conversation_id?: string | null;
  error_text?: string | null;
  error_reason?: string | null;
  findings?: unknown;
  sources?: unknown;
  plan?: unknown;
  created_at: number;
  updated_at: number;
  completed_at?: number | null;
};

type ResearchIterationRow = {
  id: string;
  session_id?: string | null;
  iteration_number?: number | null;
  status: string;
  coverage_score?: number | null;
  feedback?: string | null;
  refined_queries?: unknown;
  findings?: unknown;
  sources?: unknown;
  summary?: string | null;
  created_at: number;
};

function textFromJson(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : value;
  } catch {
    return value;
  }
}

function sourcesFromJson(value: unknown): Array<{ title?: string; url?: string }> {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter(
        (source): source is { title?: string; url?: string } =>
          typeof source === 'object' && source !== null
      )
    : [];
}

function mapSession(row: ResearchSessionRow | undefined | null) {
  if (!row) return null;
  return {
    // Convex-era aliases used by existing UI
    _id: row.id,
    id: row.id,
    query: row.query ?? row.topic ?? '',
    topic: row.topic ?? row.query ?? '',
    status: row.status,
    maxIterations: row.max_iterations ?? undefined,
    currentIteration: row.current_iteration ?? undefined,
    coverageScore: row.coverage_score ?? undefined,
    documentId: row.document_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    errorText: row.error_text ?? row.error_reason ?? undefined,
    findings: row.findings,
    plan: row.plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

/**
 * Hook for fetching a research session with its iterations via Zero.
 * Replaces Convex useQuery(api.researchSessions.queries.get).
 */
export function useResearchSession(sessionId: string | null) {
  const [sessionRow] = useZeroQuery(sessionId ? researchSessionById(sessionId) : undefined, {
    enabled: !!sessionId,
  });
  const [iterationRows] = useZeroQuery(
    sessionId ? researchIterationsBySession(sessionId) : undefined,
    { enabled: !!sessionId }
  );

  const session = mapSession(sessionRow as ResearchSessionRow | undefined);
  const iterations = ((iterationRows ?? []) as ResearchIterationRow[]).map((iter) => ({
    _id: iter.id,
    id: iter.id,
    sessionId: iter.session_id,
    iterationNumber: iter.iteration_number ?? 0,
    status: iter.status,
    coverageScore: iter.coverage_score ?? undefined,
    feedback: iter.feedback ?? undefined,
    refinedQueries: iter.refined_queries as string[] | undefined,
    findings: iter.findings,
    summary: iter.summary ?? undefined,
    createdAt: iter.created_at,
  }));

  const withIterations = session
    ? {
        ...session,
        iterations,
      }
    : undefined;

  return {
    session: withIterations,
    isLoading: sessionId != null && sessionRow === undefined,
    error: null as Error | null,
  };
}

/**
 * Hook for fetching a deep research session via Zero
 * (api.research.queries.getDeepResearchSession → deepResearchSessionById).
 */
export function useDeepResearchSession(sessionId: string | null) {
  const [sessionRow] = useZeroQuery(sessionId ? deepResearchSessionById(sessionId) : undefined, {
    enabled: !!sessionId,
  });
  const [iterationRows] = useZeroQuery(
    sessionId ? researchIterationsBySession(sessionId) : undefined,
    { enabled: !!sessionId }
  );

  const base = mapSession(sessionRow as ResearchSessionRow | undefined);
  const iterations = ((iterationRows ?? []) as ResearchIterationRow[]).map((iter) => ({
    id: iter.id,
    sessionId: iter.session_id ?? '',
    iterationNumber: iter.iteration_number ?? 0,
    status: iter.status as 'pending' | 'running' | 'completed',
    coverageScore: iter.coverage_score ?? undefined,
    feedback: iter.feedback ?? undefined,
    refinedQueries: (iter.refined_queries as string[] | undefined) ?? undefined,
    findings: textFromJson(iter.findings),
    sources: sourcesFromJson(iter.sources),
    summary: iter.summary ?? undefined,
    createdAt: iter.created_at,
    updatedAt: iter.created_at,
  }));

  // Derive a report string from the latest iteration summary / findings.
  const last = iterations[iterations.length - 1];
  const report =
    (typeof last?.findings === 'string' ? last.findings : undefined) ??
    last?.summary ??
    (typeof base?.findings === 'string' ? (base.findings as string) : undefined);

  const mappedIterations = iterations.map((iter) => ({
    id: iter.id,
    sessionId: iter.sessionId || '',
    iterationNumber: iter.iterationNumber,
    coverageScore: iter.coverageScore ?? null,
    feedback: iter.feedback ?? null,
    refinedQueries: (iter.refinedQueries as string[] | null) ?? null,
    findings: typeof iter.findings === 'string' ? iter.findings : null,
    sources: iter.sources,
    status: (iter.status === 'running' || iter.status === 'completed' ? iter.status : 'pending') as
      | 'pending'
      | 'running'
      | 'completed',
    createdAt: iter.createdAt,
    updatedAt: iter.createdAt,
  }));

  const session: DeepResearchSessionWithIterations | null | undefined =
    sessionRow === undefined && sessionId
      ? undefined
      : base
        ? {
            id: base.id,
            conversationId: base.conversationId ?? null,
            topic: base.topic || base.query,
            maxIterations: base.maxIterations ?? 0,
            currentIteration: base.currentIteration ?? 0,
            coverageScore: base.coverageScore ?? null,
            status: (['pending', 'running', 'paused', 'completed', 'cancelled'].includes(
              base.status
            )
              ? base.status
              : 'running') as DeepResearchSessionWithIterations['status'],
            createdAt: base.createdAt,
            updatedAt: base.updatedAt,
            documentId: base.documentId ?? null,
            report: report ?? undefined,
            iterations: mappedIterations,
            citations: iterations.flatMap((iter) =>
              iter.sources.map((source, index) => ({
                id: index + 1,
                title: source.title || source.url || 'Research source',
                url: source.url,
              }))
            ),
          }
        : null;

  return {
    session,
    isLoading: sessionId != null && sessionRow === undefined,
    error: null as Error | null,
  };
}

export function isSessionLoading(session: { id: string } | null | undefined): session is undefined {
  return session === undefined;
}

export function sessionExists(
  session: { id: string } | null | undefined
): session is { id: string } {
  return session !== undefined && session !== null;
}

export function getSessionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Starting research...',
    searching: 'Searching sources...',
    analyzing: 'Analyzing findings...',
    synthesizing: 'Synthesizing results...',
    completed: 'Research complete',
    failed: 'Research failed',
    cancelled: 'Research cancelled',
    running: 'Research in progress...',
  };
  return labels[status] || status;
}

export function calculateSessionProgress(session: {
  currentIteration?: number;
  maxIterations?: number;
  status: string;
}): number {
  if (session.currentIteration && session.maxIterations) {
    return (session.currentIteration / session.maxIterations) * 100;
  }

  const statusProgress: Record<string, number> = {
    pending: 0,
    searching: 25,
    analyzing: 50,
    synthesizing: 75,
    completed: 100,
    failed: 0,
    cancelled: 0,
    running: 50,
  };

  return statusProgress[session.status] || 0;
}
