# Task for reviewer

Read-only adversarial review of the in-progress Sprint 20 D03-07 candidate at /Users/inference1/Projects/holocron/.worktrees/D03-07. Do not edit any files, do not commit, and do not run commands that mutate artifacts. Compare scripts/e2e/capstone-verdict.sh, tests/integration/sprint20-capstone-verdict.test.ts, docs/ci/D03-07-capstone-verdict.md against the D03-07 task contract at /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-07-prove-cold-boot-reference-flow-green-go-no-go-capstone.md. Focus on whether the verdict can legitimately prove AC-1/AC-2/AC-3, provenance/anti-fake requirements, and whether tests are real behavioral coverage versus synthetic fixture acceptance. Report blocking findings with file/line evidence. Explicitly distinguish implementation readiness from Sprint 20 human-gate completion; do not claim green without current real local+CI evidence. Stop after the report.

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