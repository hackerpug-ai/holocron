import { createSql } from '../db/client';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection';

export type ResearchInspection = {
  ok: boolean;
  sessionId: string;
  status?: string;
  assayInstanceId?: string | null;
  challengeInstanceId?: string | null;
  assayChallengeDistinct?: boolean;
  gate?: unknown;
  plan?: unknown;
  findings?: unknown;
  error?: string;
  errorCode?: string;
};

function processSummary(plan: unknown): unknown[] {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return [];
  const processes = (plan as Record<string, unknown>).processes;
  return Array.isArray(processes) ? processes : [];
}

export async function inspectResearchSession(
  sessionId: string,
  options?: { databaseUrl?: string; processes?: boolean }
): Promise<ResearchInspection & { processes?: unknown[] }> {
  const sql = createSql(
    resolveHolocronNonprodDatabaseUrl({
      databaseUrl: options?.databaseUrl,
      context: 'research inspection',
    })
  );
  try {
    const rows = await sql<
      {
        id: string;
        status: string;
        plan: unknown;
        findings: unknown;
        final_confidence_summary: unknown;
      }[]
    >`
      SELECT id, status, plan, findings, final_confidence_summary
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return {
        ok: false,
        sessionId,
        errorCode: 'RESEARCH_NOT_FOUND',
        error: `research session not found: ${sessionId}`,
      };
    }
    const plan = row.plan;
    const planObject = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
    const assayInstanceId =
      typeof (planObject as Record<string, unknown>).assayInstanceId === 'string'
        ? ((planObject as Record<string, unknown>).assayInstanceId as string)
        : null;
    const challengeInstanceId =
      typeof (planObject as Record<string, unknown>).challengeInstanceId === 'string'
        ? ((planObject as Record<string, unknown>).challengeInstanceId as string)
        : null;
    return {
      ok: true,
      sessionId,
      status: row.status,
      assayInstanceId,
      challengeInstanceId,
      assayChallengeDistinct:
        assayInstanceId !== null &&
        challengeInstanceId !== null &&
        assayInstanceId !== challengeInstanceId,
      gate: row.final_confidence_summary,
      plan,
      findings: row.findings,
      ...(options?.processes ? { processes: processSummary(plan) } : {}),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
