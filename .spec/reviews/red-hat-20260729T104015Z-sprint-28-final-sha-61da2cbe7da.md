# Red-Hat Final Severity Review — Sprint 28

**Reviewed SHA:** `61da2cbe7da045c0ad77de46180e5a041b7c2f97` (`main`)  
**Review date:** 2026-07-29T10:40:15Z  
**Scope:** Fresh independent final closeout review after `GATE-FIX-S28R3-QA5`: the Sprint 28 manifest and task/fix contracts, prior independent report at `a2109d8d…`, QA5 contract and dual-lens approval, cumulative QA2–QA4 dispositions, committed implementation/tests, human-gate plan/render, and committed closeout state.  
**Mode:** SHA-pinned, read-only review. Product code, gate verdict/evidence artifacts, branches, and checkout state were not changed. This report is the sole repository write.  
**Test-reality lens:** Implemented-mode source/oracle audit. The Docker-backed suite was not run because it creates Docker and `.tmp/**` evidence; that absence is not treated as a passing human gate. The always-on no-Docker report-contract seam, source control flow, and policy checker were inspected. A bounded non-secret policy probe was run only after confirming the relevant worktree paths exactly match the reviewed object.

## Acceptance / closeout matrix

| # | Requirement | Verdict | Commit-pinned evidence |
|---|---|---|---|
| 1 | Every R2 Allow statement enforces exact action-to-resource class pairing; unsafe resource/action forms fail and split exact policy passes | **PASS** | The JSON parser rejects nonempty `NotAction`/`NotResource`, wildcard/write/non-allowlisted actions, wrong bucket, bare `bucket/*`, and off-prefix resources, then rejects bucket actions with object ARNs and `GetObject` with bucket ARNs: `scripts/prove-isolation.sh:850-938`. QA5 has negatives for mixed, List-only/object-only, and GetObject-only/bucket-only cases plus the split-policy control: `services/platform/tests/integration/sprint28-s28r3-qa5-gate-fix.test.ts:269-382`; QA4 covers `NotAction`, `NotResource`, wildcard, and write paths: `sprint28-s28r3-qa4-gate-fix.test.ts:189-312`. The bounded probe returned exit 0 for split exact and exit 1 for all three malformed pairings. |
| 2 | Steps 3–5 bind all evidence production/consumption to validated `GATE_RUN_ID`; generated human gate is literal-plan faithful | **PASS** | Each step starts with `assert-gate-run-id`; step 3 stores provision log, fire-drill log, attestation, staging root, and report under `$EVID=.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}`; steps 4–5 consume only `$EVID/parity-report.json`: `gate-plan.json:65-101`. The run-ID allowlist fails before side effects: `scripts/assert-gate-run-id.sh:13-35`. QA5 tests command paths, exact fenced-block fidelity, foreign-run and shared-report negatives: `sprint28-s28r3-qa5-gate-fix.test.ts:129-172,386-498`. SHA-256 recomputation matched all six rendered command blocks to their `gate-plan.json` literals. |
| 3 | Zero-exit child requires a complete successful parity report; no Docker may not silently green the report contract | **PASS** | `scripts/assert-fire-drill-report.sh:19-51` requires all three true parity fields and a nonempty `baseline_id` or `baseline_key`; the runner invokes it after a zero child exit and converts a failed assertion to failure: `scripts/run-fire-drill-on-fresh-target.sh:677-694`. Always-on no-Docker tests accept a complete report and reject missing/false fields: `sprint28-s28r3-qa5-gate-fix.test.ts:174-267`. The separately required Docker recorder positive and zero-exit/incomplete-report negative throw explicitly when Docker is absent instead of returning green: `:500-699` and `sprint28-s28r3-qa4-gate-fix.test.ts:580-789`. |
| 4 | Prior CRITICAL/HIGH dispositions remain closed without assertion weakening, stub evidence, or a new false-green path | **PASS** | Baseline-only fresh-target refuses a live source root and does not forward `HOLO_BLOB_ROOT`: `run-fire-drill-on-fresh-target.sh:89-93,603-615`; child environment is `env -i`, maps restore keys only, and omits DB/PG credentials: `:626-679`. Writer/restore values resolve from the same file/env source and missing, placeholder, or equal credentials fail before child start: `:465-564`. Exact named-volume host execution is required and daemon-only/shared fallbacks fail: `:206-287`. Every state-producing gate command preflights the ID before its first mkdir/restore action: `gate-plan.json:29,49,66,84,97,110`. Changed production files contain no explicit Category 1 stub or test-theatre control path; tests exercise real shell entry points or the extracted contract seam. |
| 5 | Historical pass is archival only; no active result is present; Sprint state and external dependency are honest | **PASS** | Target tree has no active `gate-results.json`; only `gate-results.prev.json` and `gate-results.unbound-20260729T031355Z.json` remain. The latter has null `gate_run_id` and SHA/source bindings. `SPRINT.md:4-17` remains **In Progress**, withholds active results, and names `DEPENDENCY-S28-R2-RO`. |

## QA5 fakeability / test-reality audit

| AC | Could a broken implementation pass? | Real oracle / negative control | Verdict |
|---|---|---|---|
| AC-H1 action/resource pairing | No | Real `prove-isolation.sh` JSON policy parser is invoked with mixed and one-action/wrong-resource policies; all must produce a nonzero result. Split exact policy is the positive control. | **PASS** |
| AC-H2 run-scoped evidence | No | Static literal-command assertions reject the former shared paths; exact plan/render comparison and A-to-B/foreign-report execution negatives discriminate a shared-report regression. | **PASS** |
| AC-M1 report contract | No | Extracted no-Docker validator rejects omitted and false required fields; full-run positive and zero-exit/incomplete negative are explicitly Docker-required, so unavailable Docker cannot become a green execution. | **PASS** |

The QA5 contract is marked `red_first`; its generated `.tmp` execution outputs are intentionally not accepted as a current live gate or as durable closeout evidence. The committed tests above nevertheless have direct negative controls against the three prior defects; no stubbed success oracle was found.

## Prior CRITICAL/HIGH disposition

| Review tranche | Finding disposition at `61da2cbe…` |
|---|---|
| QA2 C-1/C-2 | **Closed.** Same-source writer/restore equality is rejected before the child and the `env -i` child excludes `DATABASE_URL`/`PG*`; no ambient writer or live-DB source can satisfy the fire drill. |
| QA2 C-3; QA2 H-1/H-2 | **Closed.** Unbound status is historical only; named volumes are mandatory; exact R2 bucket/prefix parsing now rejects the whole-bucket and mixed-resource bypasses. |
| QA3 C-1/C-2/C-3; H-1 | **Closed.** File-only duplicate identities fail; fresh target is baseline-only; every gate state producer has run-ID preflight; `NotAction` and other policy-action bypasses fail. |
| QA4 C-1; H-1/H-2 | **Closed.** Explicit source blob roots fail before child invocation, `NotAction`/`NotResource` fail in the Allow parser, and step 2 now validates its run ID before writing run-scoped evidence. |
| Prior report H-1 | **Closed.** QA5 enforces action-to-resource pairing per Allow statement and its regressions cover mixed, List-only/object-only, and GetObject-only/bucket-only policies. |
| Prior report H-2 | **Closed.** QA5 scopes step 3 outputs and step 4/5 reads to the validated ID; foreign A/shared reports cannot satisfy B. |

## Dependency and durable-state assessment

`DEPENDENCY-S28-R2-RO` is a legitimate external live-closeout blocker, not a software severity finding. The runner emits that named residual and exits before child execution when restore credentials are missing, placeholder-like, or equal to the resolved writer identity (`scripts/run-fire-drill-on-fresh-target.sh:544-564`). The Sprint correctly remains In Progress and makes no active 6/6 gate-pass claim. A fresh live run remains required once distinct restore-only credentials exist.

## Review evidence and limits

- Read `AGENTS.md`, `RULES.md`, the complete `/review-red-hat` skill and anti-stub protocol, Sprint 28 task/fix material, all requested QA5/prior-review artifacts, and the relevant target-commit implementation/tests.
- Verified the requested SHA is `main` HEAD and that reviewed scripts/tests match the worktree before the bounded non-secret policy probe.
- `bash -n` passed for the changed shell entry points. SHA-256 values for all six `HUMAN-GATE.md` command blocks exactly equal their `gate-plan.json` literal commands.
- `git diff --check` reports Markdown trailing whitespace in landed task/review prose only; no code formatting defect is implicated.
- No Docker/R2 fire-drill, no gate command, and no repository-writing test was run. The absence of a live run is preserved as the documented external blocker, never converted to a pass.

## Verdict

**APPROVED**

| Severity | Count |
|---|---:|
| CRITICAL | **0** |
| HIGH | **0** |
| MEDIUM | **0** |
| LOW | **0** |

The code-severity clean-closeout criterion is met (`CRITICAL=0`, `HIGH=0`). This approves the reviewed implementation at the SHA above; it does not complete the external live human gate or remove `DEPENDENCY-S28-R2-RO`.

