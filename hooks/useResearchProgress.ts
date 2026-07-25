/**
 * Live research progress via Zero-synced `research_sessions` rows (S-REACTIVE-02).
 *
 * Progress = current_iteration / max_iterations (fraction from live columns).
 * Bound to zero_pub full-table member `research_sessions` through
 * `researchSessionById` — advances via WAL replay with no manual refresh.
 *
 * Mission progress (`mission_runs`) is excluded from zero_pub and out of scope.
 */

import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { researchSessionById } from '@/app/zero/queries';

export type ResearchProgressStatus =
  | 'pending'
  | 'searching'
  | 'analyzing'
  | 'synthesizing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | string;

export type ResearchProgressSessionRow = {
  id: string;
  query?: string | null;
  topic?: string | null;
  status: string;
  current_iteration?: number | null;
  max_iterations?: number | null;
  coverage_score?: number | null;
  error_text?: string | null;
  document_id?: string | null;
};

export interface UseResearchProgressResult {
  /** Raw Zero row (null when not found; undefined while loading maps to isLoading). */
  session: ResearchProgressSessionRow | null;
  currentIteration: number | null;
  maxIterations: number | null;
  /** 0–100 fraction for progress bars. */
  progressPercent: number;
  /** Compact label derived from columns, e.g. current/max. Null when columns missing. */
  label: string | null;
  status: ResearchProgressStatus | null;
  queryLabel: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Subscribe to a research session's progress columns via Zero useQuery.
 * Returns reactive current_iteration / max_iterations for live progress UI.
 */
export function useResearchProgress(sessionId: string | null): UseResearchProgressResult {
  const enabled = !!sessionId;
  const [row] = useZeroQuery(sessionId ? researchSessionById(sessionId) : undefined, {
    enabled,
  });

  const session =
    row === undefined || row === null ? null : (row as unknown as ResearchProgressSessionRow);

  const currentIteration =
    session?.current_iteration != null ? Number(session.current_iteration) : null;
  const maxIterations = session?.max_iterations != null ? Number(session.max_iterations) : null;

  const progressPercent =
    currentIteration != null && maxIterations != null && maxIterations > 0
      ? (currentIteration / maxIterations) * 100
      : 0;

  const label =
    currentIteration != null && maxIterations != null
      ? `${currentIteration}/${maxIterations}`
      : null;

  return {
    session,
    currentIteration,
    maxIterations,
    progressPercent,
    label,
    status: (session?.status as ResearchProgressStatus | undefined) ?? null,
    queryLabel: session?.query ?? session?.topic ?? '',
    isLoading: enabled && row === undefined,
    error: null,
  };
}

/** Pure helper: derive percent from iteration columns (no I/O). */
export function researchProgressPercent(
  currentIteration: number | null | undefined,
  maxIterations: number | null | undefined
): number {
  if (
    currentIteration == null ||
    maxIterations == null ||
    !Number.isFinite(currentIteration) ||
    !Number.isFinite(maxIterations) ||
    maxIterations <= 0
  ) {
    return 0;
  }
  return (currentIteration / maxIterations) * 100;
}

/** Pure helper: compact current/max label from iteration columns. */
export function researchProgressLabel(
  currentIteration: number | null | undefined,
  maxIterations: number | null | undefined
): string | null {
  if (currentIteration == null || maxIterations == null) return null;
  return `${currentIteration}/${maxIterations}`;
}
