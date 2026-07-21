# Red-Hat Review Report — Sprint 20 (Fresh)

**Report Date:** 2026-07-19T21:51:30Z  
**Target:** Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow  
**Target path:** `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow`  
**Reviewed ref:** `main` at `e77e37e3ea80ca2e59a73e85b19457ab169d07a5`  
**Scope:** all 10 original task contracts, `SPRINT.md`, `sprint-goal-state.json`, current trunk source/workflow/tests, real local Maestro artifacts, and the Human Testing Gate. No product code or task contract was edited.

## Verdict

**NEEDS-REVISION — Sprint 20 is not contract-complete and its completion proof is not independently replayable.** The implementation contains real Zero-provider/chat wiring, fail-closed harness checks, a successful historical local Maestro run, and passing static/negative-control tests. The claimed green closeout still depends on missing required scripts/tests/review artifacts, absent CI-dispatched evidence, and a current artifact run whose exact video is missing.

A previous report existed at `red-hat-sprint-20-20260719T204500Z.md`; this report is a fresh audit against the later `main` ref above. Specialist subagent dispatch was attempted but the runtime returned connection errors; findings below are from direct deterministic inspection and command execution, not inherited reviewer conclusions.

## Prompt-to-artifact completion checklist

| Requirement | Evidence inspected | Result |
|---|---|---|
| Fresh independent review | This new report; current `main` = `e77e37e` | PASS |
| All 10 original contracts | S-COLDBOOT-01..03 and D03-01..07 enumerated and AC/TC sections inspected | PASS (reviewed) |
| Human Testing Gate | `SPRINT.md:37-50`, six steps | FAIL: steps 2–4 and 6 lack the required independent/replayable proof |
| Real Maestro harness evidence | `.tmp/maestro-reference-flow-official11/` and latest `.tmp/maestro-reference-flow-run/` | PARTIAL: official11 has a real local success; latest default run lacks exact video |
| Main trunk | `git rev-parse HEAD`, `git log`, current source/workflow | PASS (reviewed) |
| No product/task edits | Only this report was written by this review | PASS |
| Completion metadata | `sprint-goal-state.json`, `SPRINT.md` | FAIL: stale SHA and proxy claims contradict missing contract surfaces |

## HIGH confidence findings

### H1 — Required capstone verifier and replayable gate result are absent
**Severity:** Critical  
**Evidence:** D03-07 requires `scripts/e2e/capstone-verdict.sh` and `.tmp/maestro-reference-flow/capstone-verdict.json` (D03-07:16,48-54,137-139). Neither script nor the Sprint-20 `gate-results.json` exists. The only `capstone-verdict.json` is the untracked, manually present `.tmp/maestro-reference-flow-official11/capstone-verdict.json`; it has no `committed_sha`, checksums, DB evidence, or Zero-query evidence, and there is no executable verifier that generated it.  
**Impact:** A later operator cannot independently recompute green/red from the evidence, and D03-07 AC-1/AC-2 remain unproven.

### H2 — D03-05/D03-06/D03-07 CI-dispatched proof is absent
**Severity:** Critical  
**Evidence:** D03-05 AC-1/AC-3, D03-06 AC-3, and D03-07 AC-3 explicitly require `gh workflow run`, completed self-hosted execution, artifact download, and non-empty `junit.xml`, `zero-cache.log`, and `reference-flow.mov`. `gh` is not installed; no run ID, run URL, head SHA, artifact ZIP, or provenance manifest exists. The workflow only defines the upload path (`.github/workflows/ci-e2e.yml:74-93`); local artifacts cannot satisfy a CI-run contract.  
**Impact:** The required CI trust boundary and reproducibility claim is unverified.

### H3 — The workflow does not invoke the required e2e runner lane probe
**Severity:** High  
**Evidence:** D03-02 requires `holo ci runner:status --json --lane e2e`. The workflow's `Fail-closed runner contract` runs `bun ... holo.ts ci runner:status --json` without `--lane e2e` (`.github/workflows/ci-e2e.yml:74-78`). `runner-status.ts` defaults to the integration lane when no lane is supplied (`services/platform/src/ci/runner-status.ts:330-348`), so the CI job does not prove the named simulator/build probes before using the e2e runner.  
**Impact:** CI can select the e2e-labeled host without executing D03-02's simulator/build health contract.

### H4 — Required D03-06 review artifact and fork-safety regression test are missing
**Severity:** High  
**Evidence:** D03-06 requires `docs/ci/D03-06-adversarial-review.md` and `tests/ci/fork-safety.test.ts` (D03-06:16,50-54,171-174). Both paths are absent from the filesystem and Git index. `actionlint` is also unavailable, so no captured actionlint result exists. The workflow's static guard is visible (`.github/workflows/ci-e2e.yml:26-39`), but read-through is not the required standing test/review artifact.  
**Impact:** Fork-vs-same-repo behavior and the required review evidence are not regression-protected.

### H5 — The required durable-via-Zero integration test is missing
**Severity:** High  
**Evidence:** S-COLDBOOT-02 AC-2 names `services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` (S-COLDBOOT-02:88-95,167-169); it does not exist. The current boundary test only proves a Hono write via direct Postgres (`services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts:19-74`), while `tests/integration/sprint20-zero-builder-query.test.ts` is source-shape coverage. The screen does use a Zero query (`app/(drawer)/chat/reference.tsx:18-27`), but no real test proves the same agent row ID/content is returned by a live Zero cache.  
**Impact:** CAP-SYNC-01 is asserted by UI/prose but not independently proven at the durable read boundary.

### H6 — Required testID uniqueness audit is missing and the UI can emit duplicate assistant IDs
**Severity:** High  
**Evidence:** S-COLDBOOT-03 AC-2 requires `tests/integration/sprint20-testid-audit.test.tsx` (S-COLDBOOT-03:93-99,181-182); it is absent. `ReferenceChatScreen` assigns `chat-assistant-message` to every agent row in the `FlatList` (`app/(drawer)/chat/reference.tsx:88-99`), so uniqueness is an actual behavior claim, not merely a naming check.  
**Impact:** The Maestro selector can become ambiguous after more than one assistant row, with no standing test to catch it.

### H7 — D03-04 live Zero-cache reset/read proof is absent
**Severity:** High  
**Evidence:** D03-04 AC-1 requires `services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts` and a live zero-cache query after reset (D03-04:48-55,169-176,219). The required file is absent. `namespace-reset.json` proves CLI/Postgres reset output only; `zero-cache.log` proves the cache became ready, not that conversation 020 and zero messages were read through the cache.  
**Impact:** Reset determinism is not proven on the replicated surface, contrary to D03-04's primary objective.

### H8 — Current D03-02 live runner test is red in the actual environment
**Severity:** High (environment blocker)  
**Evidence:** `PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-macos-runner-status.test.ts` produced **5 passed, 1 failed**. TC-1 fails at `tests/integration/sprint20-macos-runner-status.test.ts:187-191` because `EXPO_DEV_BUILD_PATH` is not set to a real `.app`. The test's own message requires running `scripts/e2e/build-expo-dev-client.sh`.  
**Impact:** The real runner/build-ready AC-1 evidence is not present in this environment; the sprint cannot claim a verified online e2e substrate from the current checkout.

### H9 — The current default run does not satisfy the exact video artifact contract
**Severity:** High  
**Evidence:** D03-03/D03-05/D03-06/D03-07 all require a non-empty `reference-flow.mov`. The latest default artifact directory has `reference-flow.mov` absent and only `reference-flow.mov.sb-99cdcea4-JsW9Yj` (282,700,100 bytes); `video.log` is 476 bytes and records the recorder resource-busy failure. The harness starts recording in the background and swallows recorder errors during cleanup (`scripts/e2e/run-maestro-reference-flow.sh:103-115`). A historical `.tmp/maestro-reference-flow-official11/reference-flow.mov` is real and 5,313,208 bytes, but it is an older local run in a different directory and is not current CI/provenance-bound evidence.  
**Impact:** One historical success does not establish “every run” or the required current/default artifact path, and recorder failure can be silently converted into a passing JUnit result.

## MEDIUM confidence findings

### M1 — D03-03 lifecycle oracle can pass with an empty uninstall artifact
**Severity:** Medium  
**Evidence:** D03-03 AC-2's scenario requires `test -s simctl-uninstall.txt`, but its verify command is `rg -l . file1 file2` (D03-03:79-103,173-175). The current default run's `simctl-uninstall.txt` is 0 bytes while `simctl-install.txt` is non-empty. The harness deliberately tolerates uninstall failure (`scripts/e2e/run-maestro-reference-flow.sh:88-96`), so the documented oracle does not prove a successful uninstall occurred.

### M2 — D03-03 mode verification regex rejects the documented default mode
**Severity:** Medium  
**Evidence:** D03-03 permits `server-list+already-running` in its AC-3 scenario, and the harness emits that default (`scripts/e2e/run-maestro-reference-flow.sh:20,98-101`). The verify command only accepts `"mode":"[a-z-]+"` (D03-03:109-131,173-175), which cannot match the `+` character. The current artifact contains `{"mode":"server-list+already-running"}`.

### M3 — D03-01 TC-2 no longer proves the contract's real install-failure path
**Severity:** Medium  
**Evidence:** The current test for an empty bundle accepts an early `Expo development build does not exist` rejection as an alternative to a real `xcrun simctl install` failure (`tests/integration/sprint20-maestro-harness.test.ts:82-115`). The task contract specifically requires an existing empty directory to reach a real install failure and capture `simctl-install.txt` (D03-01:48-71,139-143). The current targeted suite passes, but this is a weaker test than the contract.

### M4 — Green default test runs are proxy signals because real cold-boot cases are opt-in/skippable
**Severity:** Medium  
**Evidence:** `tests/integration/sprint20-coldboot-journey.test.ts:168-195,198-220` returns from real JUnit/Postgres assertions unless both `PLATFORM_IT=1` and `COLDBOOT_IT=1`. Running the file without those flags produced 7 passed, but did not execute the live substrate. `sprint20-zero-builder-query.test.ts` has the same COLDBOOT_IT gating for its real run. The completion metadata treats these as proof without preserving a required real-run command result.

### M5 — Completion metadata is stale and internally acknowledges missing work
**Severity:** Medium  
**Evidence:** `SPRINT.md:6,19-20` says Completed but still says `Progress: 0/10 tasks completed`. `sprint-goal-state.json` records protected/main SHA `b084dd5` and local artifact claims, while current HEAD is `e77e37e`; its own follow-up list (`sprint-goal-state.json:214-219`) names the missing durable Zero test, testID audit, forced-failure test, and video cleanup as “non-blocking.” The task contracts mark these as required ACs, not optional follow-ups.

### M6 — Manual official11 capstone JSON is not evidence provenance
**Severity:** Medium  
**Evidence:** `.tmp/maestro-reference-flow-official11/capstone-verdict.json` says green from local files and reports JUnit/video/screenshot sizes, but it lacks the D03-07-required executable derivation, current `main` SHA, checksums, Postgres agent-row query, and live Zero-query result. Its timestamp predates the current closeout metadata and it is not tracked. It is useful corroborating local evidence, not a valid capstone verdict.

## All 10 task contract verdicts

| Task | AC verdict | Evidence-based assessment |
|---|---|---|
| S-COLDBOOT-01 | **PARTIAL** | AC-2 static source passes (`app/_layout.tsx:1-16,128-160`); `pnpm tsgo --noEmit` passed. A historical local JUnit/screenshot supports AC-1, but no current env-provenance artifact proves `EXPO_PUBLIC_CONVEX_URL` was absent during that run. |
| S-COLDBOOT-02 | **PARTIAL / FAIL** | AC-3 source is Convex-free and Hono/Zero-wired (`reference.tsx:18-73`); AC-1 has historical UI evidence. AC-2 is **FAIL** because the required durable Zero integration test is absent. |
| S-COLDBOOT-03 | **PARTIAL / FAIL** | Flow contains launcher/chat assertions and historical official11 JUnit/screenshot. AC-2 testID audit and AC-3 named deterministic-reset test are absent; the existing journey test does not implement the named reset test. |
| D03-01 | **PARTIAL** | Backend negative-control cases and most harness tests pass. The empty-directory case accepts early directory rejection instead of proving the required real `simctl install` failure, so AC-1/TC-2 is weaker than written. |
| D03-02 | **PARTIAL** | Provision/build scripts and fail-closed negative tests exist. The required live TC-1 fails in the current environment because no real `.app` is configured; no current runner status artifact is preserved. |
| D03-03 | **FAIL** | Historical official11 has a real video/JUnit/screenshot, but the current/default run is sidecar-only; uninstall evidence is empty; mode oracle is incompatible with `+`; forced-failure runtime test/fixture is absent. |
| D03-04 | **FAIL** | Required live Zero namespace test is absent. CLI reset output and cache readiness do not establish the required post-reset Zero read/fingerprint replay. |
| D03-05 | **FAIL** | Workflow is present, pinned, and has `contents: read`, concurrency, and `always()` upload. No completed CI run/artifact exists, failure artifact run is absent, and the runner contract omits `--lane e2e`. |
| D03-06 | **FAIL** | Required review document, fork-safety regression test, and captured actionlint/equivalent evidence are absent. Static workflow inspection is insufficient. |
| D03-07 | **FAIL** | Required executable capstone verifier, current capstone artifact, local capstone replay, and CI reproduction are absent. The manual official11 JSON cannot substitute for the verifier. |

## Human Testing Gate review

| Step | Result | Evidence |
|---|---|---|
| 1. Cold boot/open app | **PARTIAL PASS** | Official11 JUnit has `tests=1 failures=0`, screenshot and test-output exist; latest default run also has passing JUnit. Current run provenance/env is not preserved. |
| 2. Send through fleet/Postgres | **PARTIAL** | `sprint-goal-state.json` claims fresh user/agent rows, and the Hono screen sends via POST (`reference.tsx:39-73`), but no raw query artifact is attached to the current run. |
| 3. Observe durable Zero reply | **PARTIAL/FAIL** | UI reads the Zero subscription and Zero logs show query pipelines, but the required durable Zero integration test and same-row query evidence are absent. |
| 4. Check CI artifacts | **FAIL** | No CI run ID/download/provenance exists. Historical local official11 files are not CI artifacts; latest default run lacks exact `.mov`. |
| 5. Missing build fails closed | **PASS with contract caveat** | Current `PLATFORM_IT=1` harness suite passed; source guards exist at `run-maestro-reference-flow.sh:39-46`. TC-2 does not prove the exact requested install-failure path. |
| 6. Reset known seed | **PARTIAL** | `namespace-reset.json` is non-empty and reports `ok:true`, nonprod DB, truncation and seed fingerprint; no live Zero conversation/zero-message query or consecutive fingerprint comparison is captured. |

## Stub / test-theatre findings

- **HIGH — Proxy completion metadata:** `sprint-goal-state.json` marks missing required tests/artifacts as non-blocking follow-ups and substitutes prose/local JUnit for D03-04/D03-06/D03-07 contracts.
- **HIGH — Skippable real-service tests:** default green Vitest output does not imply a real cold boot because `COLDBOOT_IT` gates return without assertions.
- **HIGH — Unowned oracle:** D03-04, S-COLDBOOT-02, S-COLDBOOT-03, D03-06, and D03-07 name source/test artifacts that do not exist.
- **MEDIUM — Artifact-path drift:** official11 success artifacts, latest `maestro-reference-flow-run` artifacts, and the contract's default `.tmp/maestro-reference-flow` path are treated interchangeably despite different timestamps and video outcomes.

## Required remediation before accepting green

1. Implement and test the D03-07 capstone verifier; emit `gate-results.json` from the current `main` SHA.
2. Execute and preserve a real `ci-e2e.yml` run, downloaded artifact metadata, run/head SHA, and artifact checksums.
3. Fix recorder lifecycle so exact `reference-flow.mov` is verified and failures cannot be swallowed; add forced-failure coverage.
4. Add D03-06 review/fork-safety artifacts and actionlint/equivalent captured evidence.
5. Add/run the durable Zero integration test, Zero reset/read test, and testID uniqueness audit.
6. Correct the workflow runner probe to `--lane e2e`, then rerun the live D03-02 TC-1 with a real `.app` build.
7. Strengthen D03-03/D03-01 command/test oracles and regenerate all completion metadata only after independent replay.

## Metadata

- **Agents:** specialist dispatch attempted (`react-native-ui-reviewer`, `ghactions-reviewer`, `mastra-reviewer`, `code-reviewer`) but runtime connection errors returned no reviewer outputs; direct deterministic audit performed instead.
- **Confidence framework:** HIGH = directly missing/contradicted or failed command; MEDIUM = implementation exists but replayable proof/oracle is incomplete.
- **Commands run:** targeted Sprint-20 Vitest suites; `pnpm tsgo --noEmit`; workflow pin/permission scan; required-path existence and command-resolution checks; artifact size/content inspection; git trunk inspection.
- **Current test evidence:** harness/artifact/builder suite `18 passed`; coldboot journey default `7 passed` with live checks gated/skipped; runner-status `5 passed, 1 failed` (live TC-1 missing real `.app`); typecheck passed.
- **Report status:** `needs-revision`.
