# Task for worker

Implement and verify the narrow D03-03 bundle guard fix in the isolated worktree /Users/inference1/Projects/holocron/.worktrees/s20-d0303-bundle-fix-20260719T064000Z. Current diff defines validate_app_bundle() in scripts/e2e/run-maestro-reference-flow.sh but still leaves the old [[ -d "$app_path" ]] guard at line ~63. Replace that exact guard with validate_app_bundle "$app_path". Do not edit tests, task files, secrets, package files, or any other source. Run bash -n and git diff --check. Use temporary real shell probes: an empty .app must fail before simulator commands; a minimal Info.plist with nonempty CFBundleIdentifier/CFBundleExecutable and executable file must pass the guard. Commit only if checks pass; report exact commit/evidence or blocker. No --no-verify. Work only in that isolated worktree.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

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