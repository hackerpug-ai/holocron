# Task for react-native-ui-reviewer

Read-only adversarial red-hat review of Sprint 20 target at /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow on current main. Cover S-COLDBOOT-01, -02, -03 and also inspect all 10 task contracts enough to identify cross-task contradictions. Inspect landed source, tests, .e2e/maestro flow, .tmp/maestro-reference-flow-run evidence, sprint-goal-state, SPRINT Human Testing Gate, and main trunk. Do NOT edit product code or task files. Report mandatory AC verdicts with file:line evidence, stub/test-theatre findings, gate issues, and exact severity/confidence. Treat claimed JSON as untrusted until checked against files and git.

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