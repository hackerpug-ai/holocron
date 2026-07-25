# Task for react-native-ui-reviewer

Perform a read-only adversarial red-hat review of Sprint 20 at /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow against current main HEAD. Inspect all 10 original task contracts, SPRINT.md Human Testing Gate, current app/Zero/Maestro implementation, and local real Maestro artifacts. Do not edit any files, including task contracts. Enumerate every AC as PASS/FAIL/PARTIAL with file:line evidence, identify test theatre/stubs and gate gaps, and report concise findings with severity/confidence. Read brain/docs/ANTI-STUB-REVIEW.md if it exists; if absent note that. Stop after a self-contained review result.

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