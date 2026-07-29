# Red-Hat Final Severity Review — Sprint 28

**Reviewed SHA:** `a2109d8d27e9eac0862a69e0fd6651b81aa8db78` (`main`)
**Review date:** 2026-07-29T10:16:25Z
**Scope:** Fresh, independent final closeout review after `GATE-FIX-S28R3-QA4`; Sprint 28 manifest and all task/fix contracts, the prior independent report, QA4 contract and dual-lens approval, prior QA2/QA3 dispositions, committed implementation, committed integration tests, human-gate plan/render, and durable closeout state.
**Mode:** Commit-pinned, read-only review. Product code, gate verdict/evidence artifacts, branches, and checkout state were not changed. This report is the sole repository write.
**Test-reality lens:** Implemented-mode audit of source/control-flow and test oracles. No live integration suite was run: its declared setup provisions Docker resources and writes `.tmp/**`, while the live distinct restore identity is deliberately absent. This was not treated as a passing human gate.

## Verdict

**NEEDS-FIXES**

| Severity | Count |
|---|---:|
| CRITICAL | **0** |
| HIGH | **2** |
| MEDIUM | **1** |
| LOW | **0** |

The clean-closeout rule (`CRITICAL=0` and `HIGH=0`) is not met. `DEPENDENCY-S28-R2-RO` remains a legitimate external closeout blocker, not a code-severity finding: the committed runner refuses missing, placeholder, and writer-equal restore identities before it invokes the child.

## Acceptance / closeout matrix

| Review requirement | Verdict | Commit-pinned evidence |
|---|---|---|
| Fresh-target has no local/live pre-failure blob source and hashes restored target only for after-state parity | **PASS** | The runner rejects `--source-blob-root` before volume resolution/child execution and does not forward `HOLO_BLOB_ROOT`: `scripts/run-fire-drill-on-fresh-target.sh:89-93,603-615`. In `freshTarget`, `runFireDrill` uses a sentinel, skips `hashLocalBlobStore`, requires the baseline manifest, and retains restored-tree hashing: `services/platform/src/backup/fire-drill.ts:741-749,804-817,963-1006`; restored hashing is `hashDirectoryTree(restoredRoot)`: `:656-715`. QA4 supplies a source-path landmine/marker negative: `sprint28-s28r3-qa4-gate-fix.test.ts:367-510`. |
| R2 policy parser handles every Allow action/resource form and permits only exact pairings | **FAIL** | It correctly rejects `NotAction`, `NotResource`, wildcards, non-allowlisted/write actions, wrong bucket, bare bucket wildcard, and off-prefix resources: `scripts/prove-isolation.sh:850-916`. But its pairing test only asks whether a statement has *some* bucket and *some* object ARN, so a single Allow statement containing both bucket actions and `GetObject` with both resource classes passes: `:918-932`. QA4 tests omit this unsafe mixed-statement negative: `sprint28-s28r3-qa4-gate-fix.test.ts:183-312`. |
| Every state-producing authoritative gate command preflights `GATE_RUN_ID` and writes run-isolated evidence | **FAIL** | Steps 1, 2, 3, and 6 start with the allowlist assertion; QA4 closes step 2: `gate-plan.json:28,48,65,109`. Step 3 nevertheless writes provision/fire-drill logs, attestation, and parity report at shared `.tmp/REDHAT-FIX-S28R3/*` paths, and steps 4–5 consume that same shared report: `gate-plan.json:65,83,96`. A different valid run can overwrite the artifact that steps 4–5 verify. The QA4 no-side-effect negatives cover step 2 only: `sprint28-s28r3-qa4-gate-fix.test.ts:315-365`. |
| Full-run/recorder proof requires a complete successful parity report and fails closed on missing/false fields | **PARTIAL** | Runtime enforcement is correct: a zero-exit child must yield readable `POSTGRES_PARITY_PASS`, `LEDGER_CHECKSUM_MATCH`, and `BLOB_PARITY_PASS` all `true`, plus nonempty `baseline_id` or `baseline_key`, or the runner returns failure: `scripts/run-fire-drill-on-fresh-target.sh:683-721`. The intended positive/negative recorder assertions exist at `sprint28-s28r3-qa4-gate-fix.test.ts:515-719`, but both return successfully when Docker is unavailable (`:518,628`), so a nominal `PLATFORM_IT` run can green without executing either proof. |
| Historical pass/status/dependency honesty | **PASS** | No active `gate-results.json` exists in the reviewed tree. The historical unbound result is explicitly pass-only history and has null reviewed/head/commit/source bindings: `gate-results.unbound-20260729T031355Z.json`. `SPRINT.md:4-17` retains **In Progress**, withholds active results, and names `DEPENDENCY-S28-R2-RO`. |

## Findings

### H-1 — Policy checker false-passes a mixed Allow statement instead of enforcing action-to-resource pairing

**Severity:** HIGH  
**Confidence:** HIGH  
**Type:** Policy-validation bypass / untested unsafe mixed statement

The validator collects `bucket_resources` and `obj_resources_stmt` per Allow statement, but a bucket action is rejected only when the statement has no bucket ARN, and `GetObject` only when it has no object ARN. Consequently this policy is accepted despite failing the required exact action/resource pairing discipline:

```json
{
  "Effect": "Allow",
  "Action": ["s3:ListBucket", "s3:GetObject"],
  "Resource": [
    "arn:aws:s3:::holocron-backup",
    "arn:aws:s3:::holocron-backup/pgbackrest/*"
  ]
}
```

`scripts/prove-isolation.sh:918-932` must instead reject any statement that mixes a bucket action with object resources or `GetObject` with bucket resources (or normalize and validate each action/resource tuple independently). The current QA4 negatives prove `NotAction`, `NotResource`, `s3:*`, and a separate `PutObject` Allow only; they never mutate the mixed-pairing case: `services/platform/tests/integration/sprint28-s28r3-qa4-gate-fix.test.ts:183-312`.

**RUN-lane fix:** For every Allow statement, partition resources by class and require: bucket actions have only the exact bucket ARN; `GetObject` has only the exact `${prefix}/*` ARN. Add a negative for the policy above, plus both one-action/wrong-resource cases. Keep the existing split exact-policy positive green.

### H-2 — Step 3 validates the run ID but still publishes shared gate evidence

**Severity:** HIGH  
**Confidence:** HIGH  
**Type:** Run-isolation / false-attribution path

The stateful restore command starts correctly with `assert-gate-run-id.sh`, but immediately creates the shared parent directory and writes `.tmp/REDHAT-FIX-S28R3/step3-provision.txt`, `step3-fire-drill.txt`, `attestation.json`, and `parity-report.json` without `${GATE_RUN_ID}`. Steps 4 and 5 then verify that shared report rather than a report bound to the run: `gate-plan.json:65,83,96` (and the rendered command is identical in `HUMAN-GATE.md:64,74,84`). Two valid concurrent/repeated IDs can therefore cross-contaminate evidence and cause one run’s steps 4–5 to validate another run’s output.

**RUN-lane fix:** Bind step 3 output to `EVID=.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}` after the existing preflight, including provision/fire-drill logs, attestation, and report. Update steps 4–5 to read only `$EVID/parity-report.json`; regenerate `HUMAN-GATE.md`; and add two-run/foreign-report negatives proving a report from ID A cannot satisfy ID B.

### M-1 — Recorder oracle is silently skipped when Docker is unavailable

**Severity:** MEDIUM  
**Confidence:** HIGH  
**Type:** Test-reality / environmental false green

The runner itself is fail-closed, but the two tests intended to prove the full-run report contract do `if (!dockerAvailable()) return;`. In an environment with `PLATFORM_IT=1` but no Docker daemon, both tests pass without invoking the runner or testing the complete/missing report contract: `services/platform/tests/integration/sprint28-s28r3-qa4-gate-fix.test.ts:515-530,625-641`.

**RUN-lane fix:** Make absence of Docker an explicit skipped/failed prerequisite rather than a passing return for these contract tests, or split the report-contract seam into a no-Docker test that executes the runner with a resolved fake/no-side-effect target while preserving a separately required Docker integration test.

## Prior CRITICAL/HIGH disposition

| Prior review finding | Disposition at `a2109d8d…` |
|---|---|
| QA2 C1: ambient writer reaches fire-drill | **Closed.** Writer and restore identities are resolved from the same source and access-key/secret equality is rejected before child start: `run-fire-drill-on-fresh-target.sh:500-564`. |
| QA2 C2: human surface drift | **Closed.** The committed plan is the sole literal-command source and rendered command digests are present; no stale active gate result claims completion. |
| QA2 C3: stale unbound pass / false Completed status | **Closed.** `SPRINT.md` is In Progress; active result absent; unbound historical result lacks SHA binding. |
| QA2 H1: arbitrary writable fresh-target destinations | **Closed.** The runner resolves named fresh-target volume execution paths and refuses unbound/inaccessible fallbacks: `run-fire-drill-on-fresh-target.sh:206-263`. |
| QA2 H2: whole-bucket restore policy | **Partially closed.** Exact bucket/prefix, wildcard, `NotAction`, `NotResource`, and writes are now rejected; exact pairing still false-passes (**H-1 above**). |
| QA3 C1: file-backed duplicate writer/restore identity | **Closed.** Same-source resolution and both equality checks are live before child invocation: `run-fire-drill-on-fresh-target.sh:500-564`. |
| QA3 C2: database credential leak/live DB source | **Closed.** Child env excludes `DATABASE_URL`/`PG*`; fresh mode skips live capture and consumes the recovery baseline: `run-fire-drill-on-fresh-target.sh:643-655`; `fire-drill.ts:804-863`. |
| QA3 C3: required run ID was documentation-only | **Partially closed.** Preflight now covers step 2 as well as steps 1/3/6, but step 3 evidence remains shared (**H-2 above**). |
| QA3 H1: mixed exact-plus-bare policy | **Closed for the original bare-resource bypass.** `bucket/*` is rejected even beside an exact prefix: `prove-isolation.sh:908-916`. The independent action/resource mixed-statement gap is new (**H-1 above**), not an assertion weakening. |
| Prior QA4 C-1: live pre-failure blob source | **Closed.** Baseline-only fresh-target source flow and traversal negative are present. |
| Prior QA4 H-1: `NotAction` policy bypass | **Closed.** Every Allow statement rejects nonempty `NotAction`/`NotResource`; corresponding negatives exist. |
| Prior QA4 H-2: step 2 no run-ID preflight | **Closed.** Step 2 validates before `mkdir` and writes under its run-ID directory. |
| Prior QA4 M-1: recorder could exit zero without a successful parity report | **Closed in runtime, partially proven in tests.** The runner contract is now fail-closed, but its two intended full-run tests can silently return green without Docker (**M-1 above**). |

## Dependency and durable-state assessment

`DEPENDENCY-S28-R2-RO` is correctly exposed, preserved, and fails closed. Missing restore credentials emit the named residual and exit before the child; placeholder values and values equal to resolved writer credentials fail the same way: `scripts/run-fire-drill-on-fresh-target.sh:542-564`. Its absence therefore blocks genuine live closeout but does not itself create a software finding.

The historical `20260729T031355Z` pass is archival only and has no reviewed/head/commit/source SHA binding. No active `gate-results.json` exists at the reviewed SHA. The sprint’s current status is honestly **In Progress**; no fabricated 6/6 result is present.

## Review evidence and limits

- Read: `AGENTS.md`, full `RULES.md`, full `/review-red-hat` skill, all committed Sprint 28 markdown task/fix contracts, the prior report, QA4 contract/approval note, QA2/QA3 approval/disposition artifacts, implementation, tests, gate plan/render, and committed durable state at the reviewed SHA.
- Static validation: exact SHA is an ancestor of `main`; `bash -n` passed for `run-fire-drill-on-fresh-target.sh`, `prove-isolation.sh`, `assert-gate-run-id.sh`, and `render-human-gate-from-plan.sh` as read from the target object. `git diff --check` reports only pre-existing/documentation trailing whitespace in landed markdown, not a product-code whitespace defect.
- No stubs, fabricated evidence, or assertion weakening were found in the QA4 fixes for the prior CRITICAL/HIGH findings. The two findings above are direct control-flow/oracle gaps, not task-claim deductions.

## Final

**Reviewed SHA:** `a2109d8d27e9eac0862a69e0fd6651b81aa8db78`  
**Counts:** CRITICAL **0**, HIGH **2**, MEDIUM **1**, LOW **0**  
**Verdict:** **NEEDS-FIXES**
