/**
 * Shared research commit: real-sourceText gate re-eval, coverage, persist, publish.
 * evaluateEvidenceGate is the only admission judge; independentSourceFloor stays 2.
 */
import { createSql, type Sql, toSqlJsonValue } from '../../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../db/connection.ts';
import {
  type EvidenceGateInput,
  type EvidenceGateResult,
  evaluateEvidenceGate,
} from '../evidence-gate.ts';
import { insertResearchIteration } from '../iteration-writer.ts';
import { publishResearchReport } from '../publish-report.ts';
import { updateResearchSessionStatus } from '../session-writer.ts';
import type { ResearchLedger, ResearchOutput, StopReason } from './schemas.ts';

export function computeCoverageScore(ledger: ResearchLedger): number {
  if (ledger.components.length === 0) return 0;
  const covered = new Set(
    ledger.findings.map((f) => f.component).filter((c) => ledger.components.includes(c))
  );
  return covered.size / ledger.components.length;
}

export function ledgerFindingsToGateInput(ledger: ResearchLedger): EvidenceGateInput {
  return {
    claims: ledger.findings.map((f) => ({
      id: f.id,
      text: f.claimText,
      component: f.component,
    })),
    evidence: ledger.findings.map((f) => ({
      id: `e-${f.id}`,
      claimId: f.id,
      component: f.component,
      sourceId: f.sourceId,
      independenceGroup: f.sourceId,
      quote: f.quote,
      sourceText: f.sourceText,
      grade: f.grade,
      entailment: f.entailment,
      disconfirmationResolved: f.disconfirmationResolved,
      direction: f.direction,
    })),
    requiredComponents: ledger.components.length > 0 ? [...ledger.components] : ['definition'],
    gradeFloor: 3,
    entailmentFloor: 0.8,
    independentSourceFloor: 2,
  };
}

export function gateSnapshot(gate: EvidenceGateResult): {
  admitted: boolean;
  missingComponents: string[];
  independentSourceCount: number;
  reasonCode: string;
  coveredComponents: string[];
  direction: EvidenceGateResult['direction'];
  admittedEvidenceIds: string[];
  rejectedEvidenceIds: string[];
  reason: string;
} {
  return {
    admitted: gate.admitted,
    missingComponents: gate.missingComponents,
    independentSourceCount: gate.independentSourceCount,
    reasonCode: gate.admitted
      ? 'admitted'
      : gate.missingComponents.length > 0
        ? 'missing-components'
        : gate.independentSourceCount < 2
          ? 'independent-source-floor'
          : gate.reason,
    coveredComponents: gate.coveredComponents,
    direction: gate.direction,
    admittedEvidenceIds: gate.admittedEvidenceIds,
    rejectedEvidenceIds: gate.rejectedEvidenceIds,
    reason: gate.reason,
  };
}

export type FinalizeResearchCommitInput = {
  sessionId: string;
  ledger: ResearchLedger;
  report: string;
  stopReason: StopReason | null;
  round: number;
  status: ResearchOutput['status'];
  extraFindings?: Record<string, unknown>;
  iterationNumber?: number;
  branchId?: string;
  system: 'simple' | 'deep';
  sql?: Sql;
};

export type FinalizeResearchCommitResult = {
  admitted: boolean;
  coverageScore: number;
  gaps: string[];
  documentId: string | null;
  gate: EvidenceGateResult;
  report: string;
  publishError: string | null;
};

export async function finalizeResearchCommit(
  input: FinalizeResearchCommitInput
): Promise<FinalizeResearchCommitResult> {
  const coverageScore = computeCoverageScore(input.ledger);
  let gaps = [...input.ledger.gaps];
  let admitted = false;
  let gate: EvidenceGateResult = {
    admitted: false,
    direction: 'none',
    requiredComponents: [...input.ledger.components],
    coveredComponents: [],
    missingComponents: [...input.ledger.components],
    admittedEvidenceIds: [],
    rejectedEvidenceIds: [],
    independentSourceCount: 0,
    reason: 'no_evidence',
  };

  if (input.ledger.components.length > 0 && input.ledger.findings.length > 0) {
    try {
      const gateInput = ledgerFindingsToGateInput(input.ledger);
      gate = evaluateEvidenceGate(gateInput);
      admitted = gate.admitted;
      if (!admitted) {
        gaps = [...new Set([...gaps, gate.reason])];
      }
    } catch (err) {
      admitted = false;
      const msg = err instanceof Error ? err.message : String(err);
      gaps = [...new Set([...gaps, `final_gate_eval_failed:${msg.slice(0, 120)}`])];
    }
  } else if (input.ledger.findings.length === 0) {
    gaps = [...new Set([...gaps, 'under_evidenced_no_findings'])];
  }

  const report =
    input.report ||
    input.ledger.report ||
    (admitted
      ? 'Research completed with admitted evidence.'
      : `Honest refusal: under-evidenced (${input.stopReason ?? 'no_evidence'}). Gaps: ${
          gaps.join('; ') || 'none recorded'
        }`);

  const gateForSnapshot =
    input.ledger.findings.length === 0 &&
    input.ledger.lastGate &&
    typeof input.ledger.lastGate === 'object' &&
    'admitted' in (input.ledger.lastGate as object)
      ? (input.ledger.lastGate as EvidenceGateResult)
      : gate;
  const snapshot = gateSnapshot(gateForSnapshot);
  const persistedGateInput =
    input.ledger.findings.length > 0
      ? ledgerFindingsToGateInput({
          ...input.ledger,
          components: input.ledger.components.length > 0 ? input.ledger.components : ['definition'],
        })
      : (input.ledger.lastGateInput ??
        ledgerFindingsToGateInput({
          ...input.ledger,
          components: input.ledger.components.length > 0 ? input.ledger.components : ['definition'],
        }));
  const findingsPayload = {
    stopReason: input.stopReason,
    admitted,
    coverageScore,
    report,
    gaps,
    rounds: input.round,
    findingsCount: input.ledger.findings.length,
    findings: input.ledger.findings,
    gate: snapshot,
    gateInput: persistedGateInput,
    ...(input.extraFindings ?? {}),
  };

  const ownsSql = !input.sql;
  const sql =
    input.sql ??
    createSql(resolveHolocronNonprodDatabaseUrl({ context: 'research commit' }), { max: 1 });

  let documentId: string | null = null;
  let publishError: string | null = null;

  try {
    const published = await publishResearchReport({
      sql,
      sessionId: input.sessionId,
      title: `Research: ${input.ledger.query}`.slice(0, 240),
      content: [
        `# Research report`,
        ``,
        `session: ${input.sessionId}`,
        `query: ${input.ledger.query}`,
        `admitted: ${admitted}`,
        `stopReason: ${input.stopReason ?? 'none'}`,
        `research-report-token-${input.sessionId.replace(/-/g, '').slice(0, 12)}`,
        ``,
        report,
      ].join('\n'),
      skipEnqueue: false,
    });
    if (published.ok) {
      documentId = published.documentId;
    } else {
      publishError = published.error;
      gaps = [...new Set([...gaps, `publish_failed:${published.error.slice(0, 120)}`])];
    }

    await sql`
      UPDATE research_sessions
      SET coverage_score = ${coverageScore},
          current_coverage_score = ${coverageScore},
          findings = ${sql.json(toSqlJsonValue({ ...findingsPayload, documentId, publishError }))},
          plan = COALESCE(plan, '{}'::jsonb) || ${sql.json(
            toSqlJsonValue({
              gate: snapshot,
              documentId,
            })
          )},
          error_text = ${admitted ? null : report.slice(0, 2000)},
          updated_at = now()
      WHERE id = ${input.sessionId}::uuid
    `;

    await insertResearchIteration({
      sessionId: input.sessionId,
      iterationNumber: input.iterationNumber ?? Math.max(1, input.round || 1),
      summary: report.slice(0, 2000),
      feedback: admitted
        ? `commit: admitted; independentSourceCount=${gate.independentSourceCount}`
        : `commit: honest refusal (${input.stopReason ?? 'under-evidenced'}); independentSourceCount=${gate.independentSourceCount}`,
      refinedQueries: input.ledger.queriesRun.slice(-5),
      sources: input.ledger.findings.map((f) => ({
        title: f.claimText.slice(0, 120),
        url: f.sourceUrl,
        citationId: f.citationId,
      })),
      status: input.status === 'cancelled' ? 'cancelled' : 'completed',
      system: input.system,
      branchId: input.branchId,
      coverageScore,
      reviewGaps: gaps,
      findings: input.ledger.findings,
      sql,
    });
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }

  await updateResearchSessionStatus(input.sessionId, input.status);

  return { admitted, coverageScore, gaps, documentId, gate, report, publishError };
}
