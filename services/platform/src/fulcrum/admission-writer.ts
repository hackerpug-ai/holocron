/**
 * Fulcrum admission writer — the evidence-gate caller's persistence seam.
 *
 * Reads the mission's ACTIVE domain_tier_versions / domain_tiers ladder and the
 * claim's bound fetch artifacts from Postgres, feeds ALREADY-READ values to the
 * pure gate (src/fulcrum/gate/admission.ts), then persists the decision for
 * EVERY evaluated claim — admissions and rejections alike — onto claims.status,
 * claims.passes_gate, claims.qualifying_grade and claims.metadata_json
 * (metadata_json.admission.reasons carries the machine-readable reasons).
 *
 * The connection is caller-supplied: recording an admission decision is a
 * platform-stage write (holocron_app holds no UPDATE grant on claims, mirroring
 * the ledger immutability model — the stage executor rides the privileged path).
 */

import { z } from 'zod';
import type { Sql } from '../db/client.ts';
import {
  type AdmissionDecision,
  AdmissionPolicySchema,
  evaluateAdmission,
  type GradedEvidence,
} from './gate/admission.ts';

export const AdmissionRequestSchema = z
  .object({
    claimId: z.string().min(1),
    policy: AdmissionPolicySchema,
    /** Evaluation clock as epoch ms — explicit so the decision is deterministic. */
    now: z.number().int().min(0),
  })
  .strict();

export type AdmissionRequest = z.infer<typeof AdmissionRequestSchema>;

export type AdmissionOutcome = {
  claimId: string;
  decision: AdmissionDecision;
};

type LadderRow = { version: number; domain: string; tier: string; tierValue: number };

/**
 * Resolve the tier ladder by lookup against the mission's ACTIVE
 * domain_tier_versions row (highest version; global highest when the claim has
 * no candidate → mission binding). Never a hardcoded map, never a model call.
 */
export async function loadActiveLadder(sql: Sql, claimId: string): Promise<Map<string, LadderRow>> {
  // claims.candidate_id is the text FK column holding the candidates.id uuid
  // (ledger convention: uuid PKs, text foreign keys) — cast the uuid side.
  const missionRows = await sql<{ mission_id: string | null }[]>`
    SELECT c.mission_id
    FROM claims cl
    JOIN candidates c ON c.id::text = cl.candidate_id
    WHERE cl.id = ${claimId}::uuid
    LIMIT 1
  `;
  const missionId = missionRows[0]?.mission_id ?? null;

  const rows = await sql<LadderRow[]>`
    SELECT dtv.version, dt.registrable_domain AS domain, dt.tier, dt.tier_value AS "tierValue"
    FROM domain_tiers dt
    JOIN domain_tier_versions dtv ON dtv.id::text = dt.domain_tier_version_id
    WHERE ${missionId}::text IS NULL OR dtv.mission_id = ${missionId}
    ORDER BY dtv.version DESC, dtv.created_at DESC
  `;
  const activeVersion = rows[0]?.version;
  const ladder = new Map<string, LadderRow>();
  if (activeVersion === undefined) return ladder;
  for (const row of rows) {
    if (row.version === activeVersion) ladder.set(row.domain, row);
  }
  return ladder;
}

/**
 * Evaluate + record the admission decision for one claim.
 * Reads: the claim row, its bound sources (claims.source_id ∪
 * claim_evidence_bindings.source_id), the active ladder. Writes: the claims row.
 */
export async function evaluateAndRecordAdmission(
  sql: Sql,
  input: AdmissionRequest
): Promise<AdmissionOutcome> {
  const req = AdmissionRequestSchema.parse(input);

  const claimRows = await sql<{ id: string; quote_text: string | null }[]>`
    SELECT id::text AS id, quote_text
    FROM claims
    WHERE id = ${req.claimId}::uuid
  `;
  const claimRow = claimRows[0];
  if (!claimRow) throw new Error(`fulcrum admission: claim ${req.claimId} not found`);

  const sourceRows = await sql<
    {
      id: string;
      source_domain: string | null;
      normalized_text: string | null;
      retrieved_at: Date | null;
    }[]
  >`
    SELECT s.id::text AS id, s.source_domain, s.normalized_text, s.retrieved_at
    FROM sources s
    WHERE s.id::text IN (
      SELECT source_id FROM claims WHERE id = ${req.claimId}::uuid AND source_id IS NOT NULL
      UNION
      SELECT source_id FROM claim_evidence_bindings WHERE claim_id = ${req.claimId}
    )
  `;

  const ladder = await loadActiveLadder(sql, req.claimId);

  const gradedEvidence: GradedEvidence[] = sourceRows.map((s) => ({
    sourceId: s.id,
    sourceDomain: s.source_domain,
    // Unclassified domain → null tier (never a default); a missing fetch
    // artifact or timestamp fails closed (empty artifact → quote never verifies;
    // epoch 0 → out of any recency window).
    tierValue: s.source_domain === null ? null : (ladder.get(s.source_domain)?.tierValue ?? null),
    retrievedAt: s.retrieved_at === null ? 0 : s.retrieved_at.getTime(),
    normalizedText: s.normalized_text ?? '',
  }));

  const decision = evaluateAdmission(
    { id: claimRow.id, quoteText: claimRow.quote_text },
    gradedEvidence,
    req.policy,
    req.now
  );

  await persistDecision(sql, req.claimId, decision, req);

  return { claimId: req.claimId, decision };
}

/** Persist status, passes_gate, qualifying_grade and the reasons for every evaluated claim. */
async function persistDecision(
  sql: Sql,
  claimId: string,
  decision: AdmissionDecision,
  req: AdmissionRequest
): Promise<void> {
  const admissionMeta = {
    admission: {
      status: decision.status,
      passesGate: decision.passesGate,
      qualifyingGrade: decision.qualifyingGrade,
      reasons: decision.reasons,
      evaluatedAt: new Date(req.now).toISOString(),
      policy: {
        gradeFloor: req.policy.gradeFloor,
        recencyWindowDays: req.policy.recencyWindowDays,
      },
    },
  };
  await sql`
    UPDATE claims SET
      status = ${decision.status},
      passes_gate = ${decision.passesGate},
      qualifying_grade = ${decision.qualifyingGrade},
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || ${sql.json(admissionMeta)}::jsonb
    WHERE id = ${claimId}::uuid
  `;
}
