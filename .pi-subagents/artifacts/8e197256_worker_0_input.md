# Task for worker

Fix the two review blockers in the isolated worktree /Users/inference1/Projects/holocron/.worktrees/s20-d0303-bundle-fix-20260719T064000Z. Current HEAD is b9471e3. Only edit scripts/e2e/run-maestro-reference-flow.sh. (1) Preserve the existing failure diagnostic for a non-directory/missing app path: the first check in validate_app_bundle should retain `Expo development build does not exist: $bundle` (do not change it to `is not a directory bundle`). (2) Prevent CFBundleExecutable path traversal/external symlink acceptance: require the value to be a simple filename with no `/` and reject a symlink executable (`[[ ! -L "$exec_path" ]]`) before -f/-x, while still accepting the verified real bundle shape. Use shell-safe checks. Run bash -n, git diff --check, and real temporary probes: empty bundle fails with the expected old diagnostic or Info.plist diagnostic; `../outside` executable and symlink-to-outside fail; minimal valid bundle passes --check. Run normal pre-commit hooks and commit only if all pass. Do not edit tests/task files/secrets/package files; do not use --no-verify. Report commit and exact evidence or blocker.

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