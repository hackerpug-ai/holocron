/**
 * Research Context Management
 *
 * Utilities for building and managing context across sequential research sessions
 */

/**
 * Maximum number of previous sessions to include in context
 */
export const MAX_CONTEXT_ENTRIES = 5;

/**
 * Context entry from a previous research session
 */
export interface ResearchContextEntry {
  sessionId: string;
  topic: string;
  summary: string;
  timestamp: number;
}

/**
 * Build a context summary from previous research sessions
 *
 * @param previousSessions - Array of previous research sessions
 * @returns Concise context summary for next research iteration
 */
export function buildContextSummary(
  previousSessions: Array<{
    _id: { toString: () => string };
    topic: string;
    createdAt: number;
  }>
): string {
  if (previousSessions.length === 0) {
    return "";
  }

  const entries = previousSessions
    .slice(-MAX_CONTEXT_ENTRIES) // Only include most recent
    .map((session) => {
      const topic = session.topic;
      return `- ${topic}`;
    })
    .join("\n");

  return `Previous research in this conversation:\n${entries}`;
}

/**
 * Prune old context to maintain bounded size
 *
 * @param contextEntries - Current context entries
 * @returns Pruned context entries (max MAX_CONTEXT_ENTRIES)
 */
export function pruneOldContext(
  contextEntries: ResearchContextEntry[]
): ResearchContextEntry[] {
  return contextEntries.slice(-MAX_CONTEXT_ENTRIES);
}

/**
 * Extract relevant findings from a completed research session
 *
 * @param session - Research session data
 * @returns Extracted and summarized findings
 */
export function extractRelevantFindings(session: {
  topic: string;
  findings?: string | null;
  iterations?: Array<{ findings?: string | null }>;
}): string {
  if (session.findings) {
    return session.findings;
  }

  // If no direct findings, synthesize from iterations
  if (session.iterations && session.iterations.length > 0) {
    const iterationFindings = session.iterations
      .filter((it) => it.findings)
      .map((it) => it.findings)
      .join("\n\n");

    return iterationFindings || "Research in progress...";
  }

  return "";
}
