# Task for worker

Read-only final audit for Sprint 20 D03-03 candidate. Use candidate worktree /Users/inference1/Projects/holocron/.worktrees/s20-d0303-final-candidate-20260719T071500Z at d845a86; do not edit it. Create a disposable /tmp git worktree or temporary copy from d845a86, overlay tests/integration/sprint20-maestro-harness.test.ts exactly from commit 003390e, and run the exact six-case test with available real dependencies. Capture raw command, stdout/stderr, exit code, and cleanup. Then audit real substrate with commands only: Postgres reachability, Zero services, platform/fleet URLs, named iPhone 17 simulator availability, maestro CLI, and Expo dev build path. Do not use dummy credentials or stubs. If every prerequisite is truly present, do not automatically run destructive Maestro unless the task contract and secrets are demonstrably real; otherwise report exact blocker. Verify candidate remains clean and report whether AC-1 / six-step gate is proven (likely not). Read-only: never edit source/tests/secrets/package files or commit; no --no-verify.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

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
    },
    {
      "id": "criterion-2",
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