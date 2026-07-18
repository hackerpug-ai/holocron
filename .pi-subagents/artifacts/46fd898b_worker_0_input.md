# Task for worker

Write exactly two remediation task files in /Users/inference1/Projects/holocron, and nothing else: (1) .spec/prds/mk6-migration/tasks/sprint-12-observability-telemetry-and-eval-gate/REDHAT-FIX-H1-deterministic-invariant-failure-independent-of-judge-threshold.md and (2) .../REDHAT-FIX-H2-nonskippable-budgeted-escape-telemetry-ledger-proof.md. The Sprint 12 SPRINT.md already references these files. Use the authoritative review at .tmp/sprint-12-independent-readonly-review-20260718T041606Z.md, current feature task files, and prior REDHAT-FIX task files as context. Each must be complete TASK-TEMPLATE-style planning artifacts with provenance, objective, scope/non-goals, dependencies, AC-N and TC-N acceptance/test criteria, RED-first evidence, exact implementation files/surfaces, verification commands, and done/close criteria. H-1 must require a citation-free but judge-passing score >=0.8/meetsThreshold true, deterministicFailures required-citation, failureReason deterministic_invariant_failure, process exit 1, direct $? and PIPESTATUS[0] raw stdout/stderr, and strengthened integration assertions. H-2 must require a non-skippable real Anthropic budgeted-escape path, fail-closed missing-key behavior, real Postgres budget_ledger/telemetry correlation, raw service/CLI evidence, and no silent skip. Do not edit source code, SPRINT.md, ROADMAP.md, gate-results, or any existing files. Validate both files exist and are nonempty with required headings, then return their paths.

---
**Output:**
Write your findings to exactly this path: /Users/inference1/Projects/holocron/.pi-subagents/artifacts/outputs/46fd898b/.tmp/worker-remediation-plan-result.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```