# Task for devops-engineer

Read-only feasibility audit for Sprint 20 blocked E2E substrate. Repository: /Users/inference1/Projects/holocron. Sprint contract: /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/SPRINT.md and D03-07 task file. Inspect only; do not edit files, create credentials, start/stop services, run Maestro, mutate Postgres/Zero, or touch shared primary. Determine whether authentic local credentials/endpoints and a real fleet/Zero/Expo iOS substrate can be obtained from existing provisioned infrastructure without dummy values. Check config/process/listener evidence, scripts and supported commands, and identify the exact next safe human/operator action. Explicitly distinguish real provisioned substrate from placeholders and historical artifacts. Return a concise evidence-backed report with blockers and whether any safe automated progress exists. Stop after audit.

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