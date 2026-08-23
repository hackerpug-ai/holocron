import type { EvidenceGateInput } from '../research/evidence-gate.ts';

export class EnrichEvidenceFleetError extends Error {
  readonly code = 'MISSION_FLEET_EMPTY_OUTPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'EnrichEvidenceFleetError';
  }
}

/**
 * Validate fleet ASSAY + CHALLENGE prose arrived before the evidence gate.
 *
 * Intentionally does NOT overwrite evidence quote/sourceText with model output.
 * That previously made `sourceText.includes(quote)` pass vacuously (self-cite).
 * Gate admission uses retrieve/fixture quote+sourceText only; assayText and
 * challengeText remain on the challenge stage payload for telemetry.
 */
export function enrichEvidenceWithFleetModelText(
  evidence: EvidenceGateInput,
  assayText: string,
  challengeText: string
): EvidenceGateInput {
  const assay = assayText.trim();
  const challenge = challengeText.trim();
  if (!assay || !challenge) {
    throw new EnrichEvidenceFleetError(
      'fleet ASSAY/CHALLENGE text required before evidence-gate enrichment'
    );
  }
  return evidence;
}
