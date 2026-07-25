# Task for reviewer

Read-only adversarial review of commit b9471e3 in /Users/inference1/Projects/holocron/.worktrees/s20-d0303-bundle-fix-20260719T064000Z. Review scripts/e2e/run-maestro-reference-flow.sh against the narrow D03-03 requirement: empty/partial .app must fail before simctl/reset, while a real/valid bundle and existing --check contract remain accepted. Verify call-site ordering, shell correctness, path/key handling, security/path edge cases, and evidence quality. Run only read-only checks (bash -n, diff-check, and safe temporary probes if needed); do not edit files or commit. Report blocking findings, exact commands/results, and whether independent review passes. Do not claim Sprint 20 AC-1 or the human gate.

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