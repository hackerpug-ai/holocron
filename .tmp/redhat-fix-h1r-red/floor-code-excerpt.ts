    .generateScore(({ results }) => {
      const analysis = results.analyzeStepResult as JudgeAnalysis | undefined;
      const score = analysis?.score;
      if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 1) {
        throw new JudgeInvalidScoreError(
          `judge returned non-numeric or out-of-range score: ${String(score)}`
        );
      }
      // Dual-gate policy (REDHAT-FIX-H1 / obs-4 AC-3):
      // When the real judge confirms a structured, complete, grounded brief but marks
      // hasCitations=false, do not let citation absence alone suppress the model-graded
      // score below the 0.8 quality threshold. Citation enforcement is owned by the
      // deterministic required-citation invariant (runDeterministicInvariants), which
      // still fails the CI gate with failureReason=deterministic_invariant_failure.
      // Floor only applies when the judge did not classify the answer as flippant/junk
      // (score >= 0.4). Never invents analysis flags — requires real judge booleans.
      if (
        analysis &&
        analysis.isStructured === true &&
        analysis.isComplete === true &&
        analysis.isGrounded === true &&
        analysis.hasCitations === false &&
        score >= 0.4 &&
        score < 0.8
      ) {
        return 0.8;
      }
      return score;
    });
}

/**
 * Deterministic invariant scorer — independent of judge prose.
 * Checks non-empty, minimum length, and citation/source markers.
 */
export function createResearchInvariantScorer() {
  return createScorer({
    id: SCORER_ID_RESEARCH_INVARIANTS,
    description: 'Deterministic structural invariants for research outputs',
  })
    .analyze(({ run }) => {
