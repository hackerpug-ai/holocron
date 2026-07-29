# Red-Hat Final Severity Review — Sprint 28

**Reviewed SHA:** `dbb5c37b1a2ae6cf0a635bc1a508080acc66c656` (`main`)
**Review date:** 2026-07-29T09:51:41Z
**Scope:** Full Sprint 28 closeout after `GATE-FIX-S28R3-QA3`, including the Sprint manifest and task contracts, prior final independent report, QA3 contract and dual-lens approval, committed implementation, committed integration tests, human-gate plan/render, and durable closeout state.
**Mode:** Fresh independent, commit-pinned, read-only review. The only repository write is this report. No product code, gate verdict/evidence artifact, branch, or checkout was changed.
**Test-reality lens:** Implemented-mode static audit. Command-fidelity, source/negative-path, and recorder-oracle coverage were inspected. The live integration suite was not run because it deliberately provisions Docker resources and writes `.tmp/GATE-FIX-S28R3-QA3/**`; live distinct restore credentials are also unavailable. This is not treated as a passing live gate.

## Verdict

**NEEDS-FIXES**

| Severity | Count |
|---|---:|
| CRITICAL | **1** |
| HIGH | **2** |
| MEDIUM | **1** |
| LOW | **0** |

The clean-closeout rule (`CRITICAL=0` and `HIGH=0`) is not met. `DEPENDENCY-S28-R2-RO` remains a legitimate external live-closeout blocker and is not counted as a defect; the findings below are independently reproducible from committed code and tests.

## Acceptance / closeout matrix

| Review requirement | Verdict | Evidence |
|---|---|---|
| 1. Writer and restore identities resolve consistently and equal IDs/secrets fail closed without secret logging | **PASS** | The runner resolves both identities from the selected file, then applies per-key environment override and compares both access-key ID and secret before child start: `scripts/run-fire-drill-on-fresh-target.sh:462-558`. The file-only equality negative proves non-zero exit and no recorder invocation: `sprint28-s28r3-qa3-gate-fix.test.ts:437-545`. Logged diagnostics name keys only, not values. |
| 2. Fresh target has no DB credentials or live pre-failure source, and uses immutable R2 baseline | **FAIL** | DB credentials are correctly excluded from the child and live DB capture is skipped: `run-fire-drill-on-fresh-target.sh:609-648`, `fire-drill.ts:798-889`. But fresh mode still accepts `--source-blob-root` and unconditionally reads/hashes that local pre-failure blob source: `run-fire-drill-on-fresh-target.sh:54,77-78,605-607`; `fire-drill.ts:741-742,953`. |
| 3. Every authoritative live command requires allowlisted `GATE_RUN_ID` before state creation | **FAIL** | Steps 1, 3, and 6 preflight correctly. Step 2 instead begins with `mkdir -p .tmp/REDHAT-FIX-S28R3` and writes shared evidence without validation: `gate-plan.json:48`. The QA3 test deliberately checks only `[1,3,6]`: `sprint28-s28r3-qa3-gate-fix.test.ts:129-150`. |
| 4. Policy validator parses all Allow resources/actions and rejects unsafe grants | **FAIL** | JSON resource inspection rejects mixed bare/exact, wrong-bucket, and off-prefix resources: `prove-isolation.sh:786-850`; the mixed-resource test passes: `sprint28-s28r3-qa3-gate-fix.test.ts:232-309`. Actions are still raw-string greps (`prove-isolation.sh:761-775,852-858`), so an Allow `NotAction` policy can grant writes while satisfying the List/Get strings. |
| 5. Fenced-block fidelity, full-run success/report proof, and repeat cleanup | **PARTIAL** | Fenced command extraction/hashing is real: `sprint28-s28r3-qa3-gate-fix.test.ts:98-113,152-194`. Step 3's trap removes containers, volumes, and network: `gate-plan.json:65`; QA3 verifies its body: `sprint28-s28r3-qa3-gate-fix.test.ts:723-732`. Recorder tests require exit 0 and an attestation but never require a parity report to exist or contain successful parity fields: `:652-672,735-811`. |
| 6. Prior CRITICAL/HIGH findings closed without weakening, stubs, or false-green path | **PARTIAL** | Prior C-1 credential and the DB half of C-2 are closed, but C-2's no-live-source boundary, C-3's all-live-command guarantee, and H-1's action validation remain incomplete; see dispositions below. No Category 1 explicit stubs were found in QA3 production changes. |
| 7. Historical pass/status/dependency honesty | **PASS** | Active `gate-results.json` is absent at the reviewed SHA. The historical unbound pass has null binding fields in `gate-results.unbound-20260729T031355Z.json`. `SPRINT.md:4-17` says **In Progress**, preserves `DEPENDENCY-S28-R2-RO`, and withholds a fresh active result. |

## Findings

### C-1 — Fresh-target fire drill still reads an optional live pre-failure blob source

**Severity:** CRITICAL  
**Type:** Trust-boundary / false-source path  
**Location:** `scripts/run-fire-drill-on-fresh-target.sh:54,77-78,605-607`; `services/platform/src/backup/fire-drill.ts:741-742,953`

The QA3 fix removes `DATABASE_URL`/`PG*` and skips the live database connection, but does not make the complete fresh-target path baseline-only. The runner accepts `--source-blob-root` and forwards it to `restore:fire-drill`. `runFireDrill` resolves that value (or its normal local default) and always calls `hashLocalBlobStore(sourceBlobRoot)`, even when `freshTarget` makes an immutable R2 recovery baseline mandatory.

This still constructs and reads a pre-failure source from the fresh-target process. A caller can point it at an accessible original blob mount, violating the stated zero-live-source boundary; the current QA3 tests cover only database credentials and a missing-baseline seam, not source-blob access (`sprint28-s28r3-qa3-gate-fix.test.ts:196-221,682-719`).

**RUN-lane fix:** In `freshTarget` mode reject `--source-blob-root`/`HOLO_BLOB_ROOT` (or ignore them and set a baseline-only source sentinel), skip `hashLocalBlobStore`, and derive blob parity solely from the verified baseline manifest. Add a negative proving a readable supplied source path is never traversed and a fresh-target run still fails closed if the baseline is absent.

### H-1 — Policy checker accepts write-capable Allow `NotAction` policies

**Severity:** HIGH  
**Type:** Policy-validation bypass / test theatre  
**Location:** `scripts/prove-isolation.sh:761-775,786-858`; `services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts:232-309`

The new Python section parses only Allow resources. It does not parse `Action` versus `NotAction`; surrounding checks use raw policy-string searches. For example, an Allow statement with exact bucket/prefix resources and `"NotAction":["s3:ListBucket","s3:GetObject"]` permits `PutObject` and `DeleteObject`, while the current checker sees the required `ListBucket`/`GetObject` strings and sees no forbidden action string. Its resource parser also finds only exact resources, so it returns PASS.

**RUN-lane fix:** Parse every Allow statement as JSON. Reject `NotAction` outright; accept only the explicit allowed action set and validate each action/resource pairing (bucket-only List/GetBucketLocation; exact-prefix GetObject). Add negatives for `NotAction`, `s3:*`, and write action mixed into a separate Allow statement, plus an exact-policy positive.

### H-2 — Authoritative step 2 creates shared state without a run-ID preflight

**Severity:** HIGH  
**Type:** Gate-isolation / command-integrity gap  
**Location:** `gate-plan.json:48`; `HUMAN-GATE.md:54`; `sprint28-s28r3-qa3-gate-fix.test.ts:129-150`

Step 2 is a live authoritative command, but it starts with `mkdir -p .tmp/REDHAT-FIX-S28R3` before any `GATE_RUN_ID` assertion and writes fixed `step2-r2-readonly.txt` / `step2-isolation.txt` paths. An unset or malformed ID therefore leaves shared state and concurrent runs can overwrite the evidence. The absence of `:-manual` does not satisfy the required precondition.

**RUN-lane fix:** Prepend `bash scripts/assert-gate-run-id.sh` before every step-2 side effect and place its evidence under an allowlisted run-ID directory. Extend the loop/test to cover every state-producing live command (including step 2), with unset/malformed negatives proving no directory, log, Docker resource, or attestation is created.

### M-1 — Full-run tests still permit a green recorder run with no successful parity report

**Severity:** MEDIUM  
**Type:** Weak oracle / incomplete full-run assertion  
**Location:** `services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts:652-672,735-811`

The QA3 recorder tests correctly require runner exit 0, recorder execution, and a successful attestation. Neither creates nor asserts the requested report path; no assertion checks `POSTGRES_PARITY_PASS`, `LEDGER_CHECKSUM_MATCH`, or `BLOB_PARITY_PASS`. A recorder that exits 0 without performing the fire drill consequently makes these tests green.

**RUN-lane fix:** Make the injectable seam write an intentionally complete, contract-shaped report and assert all three success fields plus a nonempty baseline binding; separately retain a negative recorder/report case that exits 0 but omits or falsifies a required field and must fail the test.

## Prior CRITICAL/HIGH disposition

| Prior finding (`10bc18a0…`) | Disposition at `dbb5c37b…` |
|---|---|
| C-1: file-backed writer/restore equality bypass | **Closed.** Shared resolver and both post-resolution comparisons cover access-key ID and secret; the file-only equal-identity test proves the child is not invoked. |
| C-2: DB credential leak / live DB source | **Partially closed.** DB credentials are stripped and live DB capture is skipped, but fresh mode still reads the local/explicit pre-failure blob source (**C-1 above**). |
| C-3: required `GATE_RUN_ID` was documentation-only | **Partially closed.** Steps 1, 3, and 6 now validate before state and no active Sprint 28 `:-manual` fallback remains. Step 2 remains unvalidated and stateful (**H-2 above**). |
| H-1: mixed exact-plus-bare policy accepted | **Partially closed.** The mixed-resource case now fails, but action semantics are not parsed and `NotAction` can retain writes (**H-1 above**). |

## Prior MEDIUM disposition

| Prior finding | Disposition |
|---|---|
| M-1: published command digest was note-only | **Closed.** QA3 hashes the actual numbered fenced blocks against each `literal_cmd`. |
| M-2: recorder test omitted success assertions | **Partially closed.** Exit and attestation are asserted; report success remains unproven (**M-1 above**). |
| M-3: failed/repeated cleanup leaked network | **Closed.** The authoritative step-3 trap removes `${HOST}-net`; the committed test inspects that exact trap body. |

## Durable-state and dependency assessment

`DEPENDENCY-S28-R2-RO` is correctly exposed and fails closed: the runner refuses missing or placeholder `R2_RESTORE_*` values before child start (`scripts/run-fire-drill-on-fresh-target.sh:538-547`), and the sprint does not manufacture a current result. The dependency is external and remains a valid closeout blocker rather than a code-severity finding.

The historical unbound pass is archival only. The active `gate-results.json` is absent at this SHA; neither the unbound result nor `gate-results.prev.json` supplies reviewed/head SHA binding. Sprint 28 therefore remains honestly **In Progress**.

## Review evidence and limits

- Read: `AGENTS.md`, full `RULES.md`, full `/review-red-hat` skill, `ANTI-STUB-REVIEW.md`, Sprint 28 manifest/task/fix contracts, prior report, QA3 contract, QA3 dual-lens note, source, tests, plan, render, and result artifacts at the reviewed SHA.
- Static checks: target commit exists and is `main`; relevant worktree paths equal the reviewed tree; `bash -n` passes for the changed shell entry points; `git diff --check` found documentation-only whitespace warnings in the landed commit, no code whitespace failure.
- Anti-stub grep audit found no new explicit production stubs (`TODO`/`FIXME`/`NotImplemented`/fake-named handlers). The weaknesses above are behavioral/test-oracle gaps, not a claim based on task completion text.
- The scenario-contract validator was run against committed task contracts. Several legacy original-task contracts produce structural findings under the current validator; their scenario objects do not carry requirement-primary metadata into the standalone parser. They are not counted as QA3 implementation severities; the direct source/test audit above establishes the actionable closeout findings.

## Final

**Reviewed SHA:** `dbb5c37b1a2ae6cf0a635bc1a508080acc66c656`  
**Counts:** CRITICAL **1**, HIGH **2**, MEDIUM **1**, LOW **0**  
**Verdict:** **NEEDS-FIXES**
