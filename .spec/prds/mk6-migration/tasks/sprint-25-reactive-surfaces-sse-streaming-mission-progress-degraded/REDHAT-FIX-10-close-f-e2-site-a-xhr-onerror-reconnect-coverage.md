# REDHAT-FIX-10 — Close F-E2 (HIGH) — single-site-A (XHR onError retry) reconnect mutant has zero coverage. Add integration test driving XHR-onError path without setOnline(false), OR document single-site-A as separate mutant in mutation-probe log
> Status: Backlog
> Cycle: 1
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 45 min
> Type: FEATURE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#F-E2`
> Reviewer: react-native-ui-reviewer

## Outcome

PATH-A: new/extended site-A integration test exits 0 on correct code with Last-Event-ID=='3' and unique assembly; single-site-A mutant exits non-zero; site-B AC-1 still green; redhat-fix-10-site-a-mutation.log records single-site-A KILLED, single-site-B KILLED, dual-site KILLED; path.json path=A. PATH-B only if PATH-A blocked: path=B + log documents single-site-A SURVIVES with residual risk — weaker, not preferred.

## Background

- **Source finding:** `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#F-E2`
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01
- **Agent rationale:** Owns hooks/use-resumable-sse-stream.ts site-A XHR onError reconnect (:728-744 / openEventSource at :740) and tests/integration/redhat-fix-04-production-hook-reconnect.test.ts which currently drives only site B via setOnline(false/true). Closing F-E2 requires a production-controller integration path that destroys the SSE response mid-flight WITHOUT setOnline(false) so site A fires with Last-Event-ID from assemblyRef. Reviewer: react-native-ui-reviewer.
- H3 dual-site kill still holds; F-E2 narrows coverage to single-site-A.
- Prefer PATH-A real kill over PATH-B log documentation.
- destroyActive already exists unused in withSseStub — high leverage reuse.
- [mastra-planner boundary] Backend SSE contract is frozen — client-only site-A coverage gap.
- [mastra-planner boundary] Site A onError reconnect at use-resumable-sse-stream.ts:740 must send Last-Event-ID from assemblyRef.current.lastSeq.
- [mastra-planner boundary] Site B setOnline path already covered by redhat-fix-04 AC-1 — keep non-regressed.
- [mastra-planner boundary] Test must use production createResumableSseController / openEventSource, not harness reimplementation.
- [mastra-planner boundary] Mutation kill: wipe assemblyRef ONLY at site A → suite MUST exit 1 (cycle-5 proved dual-site kill ≠ single-site-A kill).
- [mastra-planner boundary] Prefer stub destroyActive() already in redhat-fix-04 test file to force XHR onError without setOnline.
- [mastra-planner boundary] Mutation log format must record site=A | site=B | site=A+B for falsifiable future reviews.
- [mastra-planner boundary] All three are cycle-5 blockers for unqualified Sprint 25 close; estimated total ~1.5–2h.
- [mastra-planner boundary] Shared evidence root: .tmp/sprint-25/ with path.json + red.log pattern from prior REDHAT-FIX tasks (cold-checkout TDD chain).
- [mastra-planner boundary] Do not re-litigate closed H1 Streaming seed, H2 writer existence, dual-site H3 core kill — these tasks close narrower residual gaps.
- [mastra-planner boundary] Verification stack: PLATFORM_IT Postgres for FIX-09; pnpm vitest redhat-fix-04 for FIX-10; maestro/integration+docs for FIX-11; biome + tsgo as touched-scope gates.
- [mastra-planner boundary] Fakeability: behavioral ACs carry full scenario objects (fixtures, start_ref, must_observe, must_not_observe empty/start, negative_control, evidence, topology single-node, test_tier integration|e2e on PRIMARY).
- Primary expansion: react-native-ui-planner; backend boundary enrichments from mastra-planner.

## Critical Constraints

### MUST
- MUST prefer PATH-A: add integration coverage that drives production site-A onError reconnect without calling setOnline(false)
- MUST assert reconnect request header Last-Event-ID equals '3' (or lastSeq resume cursor == 3) from REAL stub headers
- MUST assert final streamedText equals UNIQUE_TEXT unique concat and tokenCount equals unique count with 0 full-replay duplicates
- MUST prove single-site-A mutant is KILLED by the new (or extended) suite: wipe assemblyRef only before site-A openEventSource → exit non-zero failures>=1; correct path exit 0
- MUST keep site-B AC-1 / dual-site dual-wipe kill non-regressed
- MUST set disableStatusPollFallback=true on the site-A path under test
- MUST capture RED evidence .tmp/sprint-25/redhat-fix-10-red.log proving single-site-A mutant SURVIVES current AC-1 on HEAD
- MUST write .tmp/sprint-25/redhat-fix-10-path.json with path A|B and .tmp/sprint-25/redhat-fix-10-site-a-mutation.log with single-site-A / single-site-B / dual-site lines

### NEVER
- NEVER claim F-E2 closed solely by dual-site wipe that already passed in REDHAT-FIX-04
- NEVER drive site-A test via setOnline(false/true) only (that is site B)
- NEVER mock EventSource/XHR with canned headers that skip real Last-Event-ID observation
- NEVER leave single-site-A mutant surviving under PATH-A
- NEVER delete site-B coverage while adding site-A

### STRICTLY
- STRICTLY PRIMARY AC test_tier integration, flow_ref UC-SYNC-02
- STRICTLY PATH-A preferred; PATH-B only with explicit path.json path=B and documented residual SURVIVES for single-site-A (unqualified sprint close weaker)
- STRICTLY tdd_mode red_first: red log shows single-site-A SURVIVES on pre-fix HEAD
- STRICTLY mutation log distinguishes single-site-A vs single-site-B vs dual-site (fixes cycle-4 log ambiguity)

## Specification

**Objective:** Close cycle-5 HIGH F-E2 by adding production-controller coverage for SSE reconnect site A (XHR onError retry) that does not depend on setOnline(false), so a single-site-A assemblyRef-reset mutant is killed and the mutation probe log records single-site vs dual-site outcomes distinctly.

**Success state:** PATH-A: new/extended site-A integration test exits 0 on correct code with Last-Event-ID=='3' and unique assembly; single-site-A mutant exits non-zero; site-B AC-1 still green; redhat-fix-10-site-a-mutation.log records single-site-A KILLED, single-site-B KILLED, dual-site KILLED; path.json path=A. PATH-B only if PATH-A blocked: path=B + log documents single-site-A SURVIVES with residual risk — weaker, not preferred.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** sse-site-a-onerror-reconnect-oracle, single-site-a-mutant-kill-evidence
- **Consumes:** production-hook-sse-reconnect-mutation-oracle, resumable-sse-chat-client, assemblyRef-reset-mutant-kill-evidence
- **Boundary contracts:**
  - Site A: XHR onError retry openEventSource(resumeRunId, assemblyRef.current.lastSeq) at hooks/use-resumable-sse-stream.ts:740 (onError :728-744).
  - Site B: NetInfo/online handler openEventSource(runId, assemblyRef.current.lastSeq) at :764 (setOnline :751-765).
  - Existing redhat-fix-04 runProductionReconnect drives ONLY site B via controller.setOnline(false) then setOnline(true) at tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:314-321.
  - Cycle-5 probe: single-site-A wipe SURVIVES AC-1; single-site-B wipe KILLED; dual-site wipe KILLED. H3 dual-site claim still holds; F-E2 is narrower coverage gap.
  - PATH-A (PREFERRED): integration test destroys stub response mid-flight WITHOUT setOnline(false) so production onError retry fires and Last-Event-ID is sent; single-site-A mutant killed.
  - PATH-B (ESCAPE): extend mutation probe log to document single-site-A as separate mutant with SURVIVES|KILLED status — only if PATH-A blocked by product freeze / flaky XHR; prefer PATH-A.
  - withSseStub already exposes destroyActive() at redhat-fix-04:246-255 — prefer reuse over new stub framework.
  - disableStatusPollFallback=true required so poll cannot sole-greenwash site-A break.
  - Product freeze: do not re-open H1/H2/H3 product paths; narrow test + optional small hook testability tweaks only if required for destroyActive-driven onError.
  - SSE event types: token | terminal | blocked | error (Sprint 18)
  - Monotonic seq is SSE id; client applyTokenEvent only for seq > lastSeq
  - Server: Last-Event-ID → afterSeq; listChatEvents filters seq > afterSeq (chat-runs.ts:618-621) — DO NOT REWRITE
  - Client headers: buildSseResumeHeaders({ apiKey, lastSeq: assemblyRef.current.lastSeq || afterSeq })
  - Site A: onError → openEventSource(resumeRunId, assemblyRef.current.lastSeq) ~:740
  - Site B: setOnline true → openEventSource(runId, assemblyRef.current.lastSeq) ~:764
  - disableStatusPollFallback=true so poll cannot sole-greenwash
  - Durable content equality is FIX-11 — out of scope for FIX-10
  - CAP-SYNC-01 / UC-SYNC-02 remain the capability/flow spine
  - proposed_by tripwire: every expanded task sets proposed_by=mastra-planner
  - No stubs of core writer/SSE/durable finalize paths

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **Description:** GIVEN createResumableSseController against real http SSE stub with disableStatusPollFallback=true WHEN first connect reaches lastSeq>=3 and the active SSE response is destroyed (or server-closed) WITHOUT calling setOnline(false) THEN production site-A onError retry fires, reconnect request Last-Event-ID equals '3', final streamedText equals UNIQUE_TEXT, tokenCount equals unique count, resumeTransport equals 'sse', and full-replay duplicates == 0
- **Test tier:** `integration` · **Verification service:** `real http SSE stub + createResumableSseController site-A onError path` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1-site-A' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-1'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub — only setOnline(false/true) site B exercised and labeled as site A, empty — Last-Event-ID missing on onError reconnect, disconnect — onError path never re-opens EventSource, mock — XHR/EventSource mocked so headers unobservable, static — poll sole-greenwashes wiped assembly under disableStatusPollFallback=false
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `sse-stub-site-a-onerror-reconnect`: actor `cli_user`
    - **Steps:**
      - Start withSseStub (or equivalent) with destroyActive
      - createResumableSseController({ disableStatusPollFallback: true, reconnectDelayMs: 50, initialIsOnline: true })
      - connect({ runId, durableMessageId }); wait lastSeq>=3
      - setPhase('reconnect') so resume delivers remaining tokens
      - destroyActive() — DO NOT call setOnline(false)
      - Wait phase complete / lastSeq>=UNIQUE_COUNT
      - Read reconnect request Last-Event-ID from stub request log
      - Assert unique assembly from controller.getSnapshot() and assemblyRef
    - **MUST observe:**
      - `setOnline(false) call count == 0 during site-A scenario`
      - `reconnect request header Last-Event-ID equals '3'`
      - `snapshot.streamedText equals 'OneTwoThreeFourFive'`
      - `snapshot.tokenCount == UNIQUE_COUNT (5)`
      - `snapshot.resumeTransport equals 'sse'`
      - `assemblyRef.current.lastSeq >= 5`
    - **MUST NOT observe:**
      - `empty/start signature: Last-Event-ID header missing/empty on site-A reconnect`
      - `final text duplicated prefix OneTwoThreeOneTwoThree`
      - `tokenCount == 0 after site-A reconnect`
      - `scenario only uses setOnline(false/true) (site B sole path)`
      - `resumeTransport equals 'poll' as sole finalize path`

### AC-2: AC-2 [PRIMARY]
- **Description:** GIVEN single-site-A assemblyRef-reset mutant at hooks/use-resumable-sse-stream.ts:740 WHEN the site-A suite runs THEN exit != 0 failures >= 1; WHEN unmutated THEN exit 0; WHEN single-site-B wipe runs against site-B AC-1 THEN still killed; mutation.log records single-site-A / single-site-B / dual-site distinct outcomes
- **Test tier:** `integration` · **Verification service:** `production-code mutation probe + site-A suite` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-2-site-A-mutation' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-2'; test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -q 'single-site-A' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -E 'single-site-A.*(KILLED|failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — single-site-A still SURVIVES under PATH-A suite (cycle-5 defect), stub — only dual-site wipe logged as kill, empty — no site-a mutation.log, mock — log format change without actual site-A test (PATH-B without disclosure)
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `single-site-a-assemblyref-reset-mutant`: actor `cli_user`
    - **Steps:**
      - Run site-A suite unmutated → exit 0
      - Apply single-site-A wipe only before openEventSource(resumeRunId, ...) at :740
      - Re-run site-A suite → exit != 0
      - Restore; optionally probe single-site-B vs dual-site for log completeness
      - Write redhat-fix-10-site-a-mutation.log with distinct site labels
    - **MUST observe:**
      - `PATH-A: single-site-A correct exit code == 0`
      - `PATH-A: single-site-A mutant exit code != 0 and failures >= 1`
      - `mutation.log contains literal 'single-site-A'`
      - `mutation.log contains distinct single-site-B and/or dual-site lines (or documents site-B covered by redhat-fix-04)`
      - `path.json path equals 'A' under PATH-A`
    - **MUST NOT observe:**
      - `empty/start signature: single-site-A mutant still exit 0 under PATH-A`
      - `only dual-site wipe used to claim F-E2 closed`
      - `PATH-A claimed while suite still only setOnline-driven`

### AC-3: AC-3
- **Description:** GIVEN existing site-B REDHAT-FIX-04 suite WHEN FIX-10 lands THEN AC-1 site-B reconnect and dual-site production-assembly-reset remain green/killed; pure-function suites non-regressed
- **Test tier:** `integration` · **Verification service:** `vitest redhat-fix-04 retained + pure suites` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — site-B path broken while fixing site-A, empty — redhat-fix-04 suite deleted, static — dual-site mutant no longer killed
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `sse-stub-site-a-onerror-reconnect`: actor `cli_user`
    - **Steps:**
      - Run existing AC-1 site-B path
      - Run s-reactive-01 pure suite
      - Confirm both reconnect sites still present in production source
    - **MUST observe:**
      - `redhat-fix-04 AC-1 exit code == 0`
      - `s-reactive-01 suite exit code == 0`
      - `match count >= 1 for literal 'openEventSource(resumeRunId' and match count >= 1 for setOnline 'openEventSource'`
    - **MUST NOT observe:**
      - `empty/start signature: site-B AC-1 exit non-zero`
      - `site-B openEventSource call site removed`

### AC-4: AC-4
- **Description:** GIVEN RED-first discipline WHEN implementer starts THEN redhat-fix-10-red.log shows single-site-A SURVIVES current AC-1 on HEAD; AFTER fix path.json records A (preferred) or B (documented residual); mutation log exists
- **Test tier:** `integration` · **Verification service:** `tdd evidence files under .tmp/sprint-25/` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-10-red.log && test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && test -f .tmp/sprint-25/redhat-fix-10-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-10-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — no red log, stub — green without red, static — path A claimed without site-A suite, mock — fabricated KILLED line without mutant edit
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `single-site-a-assemblyref-reset-mutant`: actor `cli_user`
    - **Steps:**
      - On HEAD before fix: wipe only site A; run AC-1; record SURVIVES in redhat-fix-10-red.log
      - Implement PATH-A site-A suite (preferred) or PATH-B log extension
      - Write path.json and site-a-mutation.log
    - **MUST observe:**
      - `redhat-fix-10-red.log size > 0 and mentions single-site-A SURVIVES or pre-fix gap`
      - `redhat-fix-10-site-a-mutation.log size > 0`
      - `path.json path field equals 'A' or 'B'`
      - `if path A: single-site-A KILLED in mutation log`
      - `if path B: single-site-A SURVIVES documented as residual with rationale`
    - **MUST NOT observe:**
      - `empty/start signature: no red evidence`
      - `path A without site-A suite kill evidence`

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Site-A onError reconnect without setOnline: Last-Event-ID==3 + unique assembly | AC-1 | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1-site-A' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-1'` |
| TC-2 | Single-site-A mutant killed; mutation.log distinguishes site A/B/dual | AC-2 | `test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -q 'single-site-A' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -E 'single-site-A.*(KILLED|failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log` |
| TC-3 | Site-B AC-1 non-regression + pure suite green | AC-3 | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts` |
| TC-4 | TDD evidence: red log + mutation log + path.json A\|B | AC-4 | `test -f .tmp/sprint-25/redhat-fix-10-red.log && test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-10-path.json` |
| TC-5 | Evidence-chain: path A preferred — if path A then site-A KILLED must be present | AC-2 | `python3 -c "import json,pathlib,re; p=json.loads(pathlib.Path('.tmp/sprint-25/redhat-fix-10-path.json').read_text()); log=pathlib.Path('.tmp/sprint-25/redhat-fix-10-site-a-mutation.log').read_text(); assert p['path'] in ('A','B'); assert p['path']!='A' or re.search(r'single-site-A.*(KILLED|exit=[1-9]|failures=[1-9])', log)"` |

## Fixtures

### `sse-stub-site-a-onerror-reconnect`
- **seed_method:** `cli`
- **description:** Reuse/extend redhat-fix-04 withSseStub: first connect delivers tokens seq 1-3 with connection left destroyable; setPhase('reconnect') before destroyActive(); destroyActive() kills active SSE response without controller.setOnline(false); reconnect emits remaining tokens + terminal with UNIQUE_TEXT. Captures real Last-Event-ID headers.
  - createResumableSseController with disableStatusPollFallback=true, reconnectDelayMs small (e.g. 50)
  - first connect lastSeq>=3 streamedText OneTwoThree
  - destroyActive mid-flight OR server-close without setOnline(false) fires site-A onError
  - reconnect Last-Event-ID == '3'
  - final UNIQUE_TEXT + tokenCount unique

### `single-site-a-assemblyref-reset-mutant`
- **seed_method:** `cli`
- **description:** Temporary production edit: insert assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 } ONLY immediately before site-A openEventSource(resumeRunId, assemblyRef.current.lastSeq) at hooks/use-resumable-sse-stream.ts:740. Do not wipe site B for the single-site-A probe.
  - site A only wipe — cycle-5 SURVIVES current AC-1
  - under PATH-A suite, single-site-A wipe MUST fail
  - site B only wipe still killed by existing AC-1

## Reading List

- .spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#F-E2
- hooks/use-resumable-sse-stream.ts:728-744 — site A onError retry
- hooks/use-resumable-sse-stream.ts:751-765 — site B setOnline handler
- hooks/use-resumable-sse-stream.ts:430-870 — createResumableSseController
- tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:160-255 — withSseStub destroyActive already present
- tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:287-354 — runProductionReconnect site-B only
- tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:426-495 — dual-site mutation probe
- .tmp/sprint-25/redhat-fix-04-production-mutation.log — ambiguous dual-site kill claim
- .spec/prds/mk6-migration/08-uc-sync.md — UC-SYNC-02
- .spec/prds/mk6-migration/11-e2e-testing-criteria.md — T-SYNC-006

## Guardrails

### WRITE-ALLOWED
- tests/integration/redhat-fix-04-production-hook-reconnect.test.ts (MODIFY — add AC-1-site-A + single-site mutation probes; preferred colocation)
- tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts (NEW — alternative if cleaner split)
- hooks/use-resumable-sse-stream.ts (MODIFY only if narrow testability needed for destroyActive-driven onError; preserve both reconnect sites + Last-Event-ID)
- .tmp/sprint-25/redhat-fix-10-red.log
- .tmp/sprint-25/redhat-fix-10-site-a-mutation.log
- .tmp/sprint-25/redhat-fix-10-path.json
- .tmp/sprint-25/redhat-fix-04-production-mutation.log (optional footnote linking single-site-A)

### WRITE-PROHIBITED
- services/platform/src/http/chat-runs.ts
- services/platform/src/db/seed-e2e.ts
- services/platform/src/research/progress.ts
- Mocking EventSource/XHR so Last-Event-ID unobservable
- Removing site-B coverage
- Claiming F-E2 closed by dual-site-only probe without site-A driver
- PATH-B only format change while claiming PATH-A kill

## Design / Pattern

- **References:** red-hat cycle-5 #F-E2, REDHAT-FIX-04, use-resumable-sse-stream.ts site A/B, redhat-fix-04 destroyActive
- **Pattern:** Dual reconnect path coverage (socket death vs NetInfo online) with per-site mutation probes
- **Pattern source:** cycle-5 F-E2 probe; REDHAT-FIX-04 production-hook pattern
- **Anti-pattern:** Labeling setOnline reconnect as site-A; dual-site wipe as proof of single-site-A; poll greenwash
- **Note:** PATH-A preferred: reuse destroyActive + setPhase('reconnect') without setOnline
- **Note:** May need stub tweak: keep first connection open long enough to destroy mid-stream rather than only res.end() after 3 tokens — implementer choice if current res.end already triggers onError; key is NO setOnline(false)
- **Note:** Mutation log MUST label single-site-A / single-site-B / dual-site to fix cycle-4 ambiguity
- **Note:** PATH-B allowed only with path.json B and residual SURVIVES disclosure

## Verification Gates

- **Site-A suite:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1-site-A' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-1'` → expected: Exit 0 on correct code (PATH-A)
- **Single-site-A kill evidence:** `test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -E 'single-site-A.*(KILLED|failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log` → expected: PATH-A: single-site-A KILLED
- **Site-B non-regression:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'` → expected: Exit 0
- **TDD evidence:** `test -f .tmp/sprint-25/redhat-fix-10-red.log && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-10-path.json` → expected: red log + path recorded
- **Lint smoke:** `pnpm biome check tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` → expected: Exit 0

## Agent Assignment

- **Implementer:** react-native-ui-implementer
- **Rationale:** Owns hooks/use-resumable-sse-stream.ts site-A XHR onError reconnect (:728-744 / openEventSource at :740) and tests/integration/redhat-fix-04-production-hook-reconnect.test.ts which currently drives only site B via setOnline(false/true). Closing F-E2 requires a production-controller integration path that destroys the SSE response mid-flight WITHOUT setOnline(false) so site A fires with Last-Event-ID from assemblyRef. Reviewer: react-native-ui-reviewer.
- **Reviewer:** react-native-ui-reviewer
- **Proposed by:** react-native-ui-planner

## Coding Standards

- brain/docs/TDD-METHODOLOGY.md
- RULES.md

## Dependencies

- **depends_on:** REDHAT-FIX-04
- **blocks:** —

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-10",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sse-stub-site-a-onerror-reconnect": {
      "description": "Reuse/extend redhat-fix-04 withSseStub: first connect delivers tokens seq 1-3 with connection left destroyable; setPhase('reconnect') before destroyActive(); destroyActive() kills active SSE response without controller.setOnline(false); reconnect emits remaining tokens + terminal with UNIQUE_TEXT. Captures real Last-Event-ID headers.",
      "seed_method": "cli",
      "records": [
        "createResumableSseController with disableStatusPollFallback=true, reconnectDelayMs small (e.g. 50)",
        "first connect lastSeq>=3 streamedText OneTwoThree",
        "destroyActive mid-flight OR server-close without setOnline(false) fires site-A onError",
        "reconnect Last-Event-ID == '3'",
        "final UNIQUE_TEXT + tokenCount unique"
      ]
    },
    "single-site-a-assemblyref-reset-mutant": {
      "description": "Temporary production edit: insert assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 } ONLY immediately before site-A openEventSource(resumeRunId, assemblyRef.current.lastSeq) at hooks/use-resumable-sse-stream.ts:740. Do not wipe site B for the single-site-A probe.",
      "seed_method": "cli",
      "records": [
        "site A only wipe \u2014 cycle-5 SURVIVES current AC-1",
        "under PATH-A suite, single-site-A wipe MUST fail",
        "site B only wipe still killed by existing AC-1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN createResumableSseController against real http SSE stub with disableStatusPollFallback=true WHEN first connect reaches lastSeq>=3 and the active SSE response is destroyed (or server-closed) WITHOUT calling setOnline(false) THEN production site-A onError retry fires, reconnect request Last-Event-ID equals '3', final streamedText equals UNIQUE_TEXT, tokenCount equals unique count, resumeTransport equals 'sse', and full-replay duplicates == 0",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1-site-A' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real http SSE stub + createResumableSseController site-A onError path",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 only setOnline(false/true) site B exercised and labeled as site A",
            "empty \u2014 Last-Event-ID missing on onError reconnect",
            "disconnect \u2014 onError path never re-opens EventSource",
            "mock \u2014 XHR/EventSource mocked so headers unobservable",
            "static \u2014 poll sole-greenwashes wiped assembly under disableStatusPollFallback=false"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-site-a-onerror-reconnect",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Start withSseStub (or equivalent) with destroyActive",
                "createResumableSseController({ disableStatusPollFallback: true, reconnectDelayMs: 50, initialIsOnline: true })",
                "connect({ runId, durableMessageId }); wait lastSeq>=3",
                "setPhase('reconnect') so resume delivers remaining tokens",
                "destroyActive() \u2014 DO NOT call setOnline(false)",
                "Wait phase complete / lastSeq>=UNIQUE_COUNT",
                "Read reconnect request Last-Event-ID from stub request log",
                "Assert unique assembly from controller.getSnapshot() and assemblyRef"
              ]
            },
            "end_state": {
              "must_observe": [
                "setOnline(false) call count == 0 during site-A scenario",
                "reconnect request header Last-Event-ID equals '3'",
                "snapshot.streamedText equals 'OneTwoThreeFourFive'",
                "snapshot.tokenCount == UNIQUE_COUNT (5)",
                "snapshot.resumeTransport equals 'sse'",
                "assemblyRef.current.lastSeq >= 5"
              ],
              "must_not_observe": [
                "empty/start signature: Last-Event-ID header missing/empty on site-A reconnect",
                "final text duplicated prefix OneTwoThreeOneTwoThree",
                "tokenCount == 0 after site-A reconnect",
                "scenario only uses setOnline(false/true) (site B sole path)",
                "resumeTransport equals 'poll' as sole finalize path"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN single-site-A assemblyRef-reset mutant at hooks/use-resumable-sse-stream.ts:740 WHEN the site-A suite runs THEN exit != 0 failures >= 1; WHEN unmutated THEN exit 0; WHEN single-site-B wipe runs against site-B AC-1 THEN still killed; mutation.log records single-site-A / single-site-B / dual-site distinct outcomes",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-2-site-A-mutation' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-2'; test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -q 'single-site-A' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -E 'single-site-A.*(KILLED|failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "production-code mutation probe + site-A suite",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 single-site-A still SURVIVES under PATH-A suite (cycle-5 defect)",
            "stub \u2014 only dual-site wipe logged as kill",
            "empty \u2014 no site-a mutation.log",
            "mock \u2014 log format change without actual site-A test (PATH-B without disclosure)"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "single-site-a-assemblyref-reset-mutant",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run site-A suite unmutated \u2192 exit 0",
                "Apply single-site-A wipe only before openEventSource(resumeRunId, ...) at :740",
                "Re-run site-A suite \u2192 exit != 0",
                "Restore; optionally probe single-site-B vs dual-site for log completeness",
                "Write redhat-fix-10-site-a-mutation.log with distinct site labels"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: single-site-A correct exit code == 0",
                "PATH-A: single-site-A mutant exit code != 0 and failures >= 1",
                "mutation.log contains literal 'single-site-A'",
                "mutation.log contains distinct single-site-B and/or dual-site lines (or documents site-B covered by redhat-fix-04)",
                "path.json path equals 'A' under PATH-A"
              ],
              "must_not_observe": [
                "empty/start signature: single-site-A mutant still exit 0 under PATH-A",
                "only dual-site wipe used to claim F-E2 closed",
                "PATH-A claimed while suite still only setOnline-driven"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN existing site-B REDHAT-FIX-04 suite WHEN FIX-10 lands THEN AC-1 site-B reconnect and dual-site production-assembly-reset remain green/killed; pure-function suites non-regressed",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest redhat-fix-04 retained + pure suites",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 site-B path broken while fixing site-A",
            "empty \u2014 redhat-fix-04 suite deleted",
            "static \u2014 dual-site mutant no longer killed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-site-a-onerror-reconnect",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run existing AC-1 site-B path",
                "Run s-reactive-01 pure suite",
                "Confirm both reconnect sites still present in production source"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-04 AC-1 exit code == 0",
                "s-reactive-01 suite exit code == 0",
                "match count >= 1 for literal 'openEventSource(resumeRunId' and match count >= 1 for setOnline 'openEventSource'"
              ],
              "must_not_observe": [
                "empty/start signature: site-B AC-1 exit non-zero",
                "site-B openEventSource call site removed"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN RED-first discipline WHEN implementer starts THEN redhat-fix-10-red.log shows single-site-A SURVIVES current AC-1 on HEAD; AFTER fix path.json records A (preferred) or B (documented residual); mutation log exists",
      "verify": "test -f .tmp/sprint-25/redhat-fix-10-red.log && test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && test -f .tmp/sprint-25/redhat-fix-10-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-10-path.json",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "tdd evidence files under .tmp/sprint-25/",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 no red log",
            "stub \u2014 green without red",
            "static \u2014 path A claimed without site-A suite",
            "mock \u2014 fabricated KILLED line without mutant edit"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "single-site-a-assemblyref-reset-mutant",
            "action": {
              "actor": "cli_user",
              "steps": [
                "On HEAD before fix: wipe only site A; run AC-1; record SURVIVES in redhat-fix-10-red.log",
                "Implement PATH-A site-A suite (preferred) or PATH-B log extension",
                "Write path.json and site-a-mutation.log"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-10-red.log size > 0 and mentions single-site-A SURVIVES or pre-fix gap",
                "redhat-fix-10-site-a-mutation.log size > 0",
                "path.json path field equals 'A' or 'B'",
                "if path A: single-site-A KILLED in mutation log",
                "if path B: single-site-A SURVIVES documented as residual with rationale"
              ],
              "must_not_observe": [
                "empty/start signature: no red evidence",
                "path A without site-A suite kill evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Site-A onError reconnect without setOnline: Last-Event-ID==3 + unique assembly",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1-site-A' || pnpm vitest run tests/integration/redhat-fix-10-site-a-onerror-reconnect.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Single-site-A mutant killed; mutation.log distinguishes site A/B/dual",
      "verify": "test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -q 'single-site-A' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && rg -E 'single-site-A.*(KILLED|failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-10-site-a-mutation.log",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Site-B AC-1 non-regression + pure suite green",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "TDD evidence: red log + mutation log + path.json A|B",
      "verify": "test -f .tmp/sprint-25/redhat-fix-10-red.log && test -f .tmp/sprint-25/redhat-fix-10-site-a-mutation.log && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-10-path.json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Evidence-chain: path A preferred \u2014 if path A then site-A KILLED must be present",
      "verify": "python3 -c \"import json,pathlib,re; p=json.loads(pathlib.Path('.tmp/sprint-25/redhat-fix-10-path.json').read_text()); log=pathlib.Path('.tmp/sprint-25/redhat-fix-10-site-a-mutation.log').read_text(); assert p['path'] in ('A','B'); assert p['path']!='A' or re.search(r'single-site-A.*(KILLED|exit=[1-9]|failures=[1-9])', log)\"",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
