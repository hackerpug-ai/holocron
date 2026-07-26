# REDHAT-FIX-04 — Fix REDHAT-FIX-03's mutation test — redhat-fix-03-sse-reconnect-wiring.test.ts's runReconnectWiring harness reimplements the reconnect flow in a local variable instead of exercising the production useResumableSSEStream hook; the assemblyRef-reset mutant against production code at hooks/use-resumable-sse-stream.ts:608,712 still survives. Render the real hook (@testing-library/react-hooks + a real http.createServer SSE stub) or extract+test openEventSource directly
> Status: ✅ Completed
> Cycle: 1
> Reviewer: product-manager+technical
> Completed: 2026-07-26T05:32:55Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Effort: M
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#H3-NOT-CLOSED`

## Outcome

New production-hook (or production-extracted openEventSource) integration suite exits 0 on correct code; when production assemblyRef is wiped at reconnect sites (~:608,:712), the suite exits non-zero with >=1 failure; buildSseResumeHeaders pure-function suite remains green; .tmp/sprint-25/redhat-fix-04-production-mutation.log and redhat-fix-04-red.log exist; REDHAT-FIX-03 harness pure-function tests remain non-regressed but are no longer the sole H3 claim.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#H3-NOT-CLOSED
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md`
- **Why it matters:** Unqualified Sprint 25 gate close is blocked until cycle-2 H3-NOT-CLOSED / G-2 / G-3 are closed.
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST add an integration test that exercises PRODUCTION reconnect code — either render useResumableSSEStream via @testing-library/react-hooks (or @testing-library/react-native renderHook) against a real http.createServer SSE stub, OR extract openEventSource (and the assemblyRef cursor it reads) into a production-imported unit and test that unit directly
- MUST prove the assemblyRef-reset PRODUCTION mutant is KILLED: temporarily insert assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 } immediately before reconnect openEventSource calls at hooks/use-resumable-sse-stream.ts:~608 and ~:711 (or the equivalent sites after any extraction) and observe the NEW suite exit non-zero with >=1 assertion failure
- MUST prove the correct (unmutated) production path exits 0 with Last-Event-ID=='3' (or lastSeq resume cursor == 3), final assembled text equal to unique token concat, tokenCount == unique count, 0 full-replay duplicates
- MUST keep buildSseResumeHeaders pure-function coverage green (header-drop mutant remains killed)
- MUST write mutation probe evidence to .tmp/sprint-25/redhat-fix-04-production-mutation.log with distinct lines for correct (exit 0) vs production-assembly-reset (exit non-zero, failures>=1)
- MUST capture RED evidence first: run the new production-hook suite against HEAD BEFORE the fix and show it either does not exist or FAILS to kill the production assemblyRef-reset mutant (suite green under production mutant) — log at .tmp/sprint-25/redhat-fix-04-red.log
- MUST set disableStatusPollFallback=true for the production-hook reconnect path under test so poll cannot sole-greenwash assembly wipe
- MUST preserve mobile reconnect semantics: online/offline (useNetworkStatus) and/or XHR onError retry both re-open with assemblyRef.current.lastSeq as Last-Event-ID source

### NEVER
- NEVER claim mutant-kill by wiping a LOCAL harness variable (the REDHAT-FIX-03 runReconnectWiring:189-336 anti-pattern)
- NEVER mock EventSource/XHR with canned strings that skip real request headers
- NEVER rely solely on static rg /Last-Event-ID/ or pure applyTokenEvent retests as the H3 close
- NEVER leave the production assemblyRef-reset mutant surviving (suite exit 0 under the production edit at :608,:712)
- NEVER delete poll fallback in production without analysis — use disableStatusPollFallback under test only
- NEVER re-litigate backend chat-runs afterSeq contract (services/platform/src/http/chat-runs.ts is proven)

### STRICTLY
- STRICTLY PRIMARY AC test_tier integration, flow_ref UC-SYNC-02, verification_service real http SSE stub + production hook (or production-extracted openEventSource)
- STRICTLY tdd_mode red_first: RED log proves current suite is green under production assemblyRef-reset mutant OR new suite is absent; GREEN proves production mutant killed
- STRICTLY if extract path chosen: production useResumableSSEStream MUST import and call the extracted unit (no parallel reimplementation left as the only tested path)
- STRICTLY touch targets / SafeAreaView not in scope for this hook test task — do not invent UI churn; focus production reconnect assembly continuity
- STRICTLY PATH-A only for H3: close by production-truth coverage, not by re-scoping the gate claim

## Specification

**Objective:** Close cycle-2 H3-NOT-CLOSED by replacing the illusion of mutation testing (runReconnectWiring local assembly wipe) with a test that exercises the production useResumableSSEStream reconnect path (or production-extracted openEventSource) against a real http.createServer SSE stub, so wiping production assemblyRef.current before reconnect fails the suite and correct wiring passes with unique token assembly.

**Success state:** New production-hook (or production-extracted openEventSource) integration suite exits 0 on correct code; when production assemblyRef is wiped at reconnect sites (~:608,:712), the suite exits non-zero with >=1 failure; buildSseResumeHeaders pure-function suite remains green; .tmp/sprint-25/redhat-fix-04-production-mutation.log and redhat-fix-04-red.log exist; REDHAT-FIX-03 harness pure-function tests remain non-regressed but are no longer the sole H3 claim.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** production-hook-sse-reconnect-mutation-oracle, assemblyRef-reset-mutant-kill-evidence
- **Consumes:** resumable-sse-chat-client, mutation-resistant-sse-reconnect-oracle, honest-streaming-seed-oracle
- **Boundary contracts:**
- PRIMARY gate: mid-stream disconnect+reconnect → exactly one final assistant message matching Zero row, 0 duplicate tokens (CAP-SYNC-01 / UC-SYNC-02 / T-SYNC-006)
- Production assemblyRef lives at hooks/use-resumable-sse-stream.ts:406; reconnect openEventSource(runId, assemblyRef.current.lastSeq) at ~:608 (XHR onError retry) and ~:711 (online handler)
- buildSseResumeHeaders at :312-326 is a pure export — keep its mutant-kill tests; they do NOT substitute for production-hook/openEventSource coverage
- disableStatusPollFallback at :249,:720 must remain available so poll cannot sole-greenwash a broken assembly/Last-Event-ID path
- NEVER mock EventSource/XHR so Last-Event-ID headers and token application are unobservable
- Harness proving logic (runReconnectWiring local assembly) ≠ proving production code implements it
- SSE resume contract (server — frozen): GET /api/chat-runs/:id/events honors Last-Event-ID → afterSeq; listChatEvents/getChatRun filters seq > afterSeq. Monotonic seq is SSE id. NEVER rewrite chat-runs.ts in FIX-04.
- SSE event type contract (client must honor): event names: token | terminal | blocked | error. Client applyTokenEvent only for seq > lastSeq; terminal/blocked finalize phase; error/fleet ROLE_UNAVAILABLE → degraded. Do not invent new event types in the test stub that production does not emit.
- Durable row authority: After terminal, chat_messages (Zero-synced) is authoritative final text. Stream assembly is provisional. Exactly-once UX = single assistant bubble whose content diff vs durable row == 0.
- Client Last-Event-ID wiring: openEventSource(targetRunId, afterSeq) must send headers via buildSseResumeHeaders({ apiKey, lastSeq: assemblyRef.current.lastSeq || afterSeq }). Reconnect call sites :608 (error/retry path) and :712 (online resume) must pass assemblyRef.current.lastSeq without reset.
- Test truth boundary: A mutant is killed only if mutating PRODUCTION hooks/use-resumable-sse-stream.ts causes the NEW suite to fail. Harness-local simulation is documentation, not kill evidence.

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **Description:** GIVEN a real http.createServer SSE stub and the PRODUCTION useResumableSSEStream hook (or production-extracted openEventSource imported by the hook) WHEN first connect receives tokens seq 1-3, disconnects, then reconnects THEN Last-Event-ID equals '3' (or resume cursor lastSeq==3), final assembled text equals unique token concatenation, tokenCount equals unique count, and full-replay duplicates == 0
- **Test tier:** `integration` · **Verification service:** `real http SSE stub + production useResumableSSEStream (renderHook) or production-extracted openEventSource` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — production reconnect omits Last-Event-ID / loses assemblyRef.lastSeq, stub — only runReconnectWiring local assembly is exercised (REDHAT-FIX-03 anti-pattern), empty — tokenCount == 0 after reconnect, mock — EventSource/XHR mocked so headers unobservable, static — status poll sole-greenwashes broken assembly without SSE resume
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `sse-stub-production-hook-reconnect`: actor `cli_user`
    - **Steps:**
    - Start http.createServer SSE stub with sequenced tokens
    - Render production useResumableSSEStream via renderHook (or call production-extracted openEventSource) with platformUrl pointing at stub, disableStatusPollFallback=true
    - connect({ runId, durableMessageId }) and wait until lastSeq==3 / streamedText=='OneTwoThree'
    - Simulate mid-stream disconnect (close socket and/or flip useNetworkStatus isOnline false→true, or trigger onError reconnect)
    - Capture reconnect request headers from stub
    - Receive remaining tokens; assert unique concat + tokenCount from production hook state (result.current), not a local harness assembly variable
    - **MUST observe:**
    - `reconnect request header Last-Event-ID equals '3'`
    - `production hook result.current.streamedText equals unique token concatenation 'OneTwoThreeFourFive'`
    - `production hook result.current.tokenCount == 5 (unique token count)`
    - `production hook result.current.lastSeq >= 5 after complete`
    - `resumeTransport equals 'sse' (not 'poll') when disableStatusPollFallback=true`
    - **MUST NOT observe:**
    - `empty/start signature: Last-Event-ID header missing on reconnect (empty header)`
    - `final text with duplicated prefix e.g. 'OneTwoThreeOneTwoThree'`
    - `tokenCount == 0 after reconnect (empty assembly)`
    - `tokenCount == 8 (full-replay duplicates)`
    - `only local harness assembly mutated while production assemblyRef untested`

### AC-2: AC-2 [PRIMARY]
- **Description:** GIVEN the production assemblyRef-reset mutant inserted before reconnect openEventSource calls at hooks/use-resumable-sse-stream.ts:~608 and ~:711 (or extracted unit sites) WHEN the REDHAT-FIX-04 production-hook suite runs THEN assertion failure count >= 1 and process exit code != 0; WHEN the same suite runs against unmutated production code THEN exit code == 0
- **Test tier:** `integration` · **Verification service:** `production-code mutation probe + real http SSE stub` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-2-production-mutation' && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'production-assembly-reset' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'exit_nonzero|exit=[1-9]|failures=[1-9]' .tmp/sprint-25/redhat-fix-04-production-mutation.log`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — suite remains green under production assemblyRef wipe (SURVIVES as in cycle-2 probe), stub — only local harness mode 'assembly-reset' is simulated, empty — no mutation.log / no exit code delta, mock — self-generated harness simulation treated as production mutant kill
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `production-assemblyref-reset-mutant`: actor `cli_user`
    - **Steps:**
    - Run production-hook suite against unmutated HEAD → expect exit 0; record correct line in mutation.log
    - Apply production mutant: assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 } before reconnect openEventSource at both reconnect sites
    - Re-run the SAME suite that imports production hook/unit → expect exit != 0 and failures >= 1
    - Restore production source; re-run suite exit 0
    - Write .tmp/sprint-25/redhat-fix-04-production-mutation.log with correct vs production-assembly-reset results
    - **MUST observe:**
    - `correct path exit code == 0`
    - `production-assembly-reset path exit code != 0`
    - `production-assembly-reset assertion failure count >= 1`
    - `mutation.log records correct exit_code==0 and production-assembly-reset exit_code!=0 with distinct outcomes`
    - `mutant edit targets production file path equals 'hooks/use-resumable-sse-stream.ts' (or production-extracted unit), not tests/integration/redhat-fix-03 local assembly`
    - **MUST NOT observe:**
    - `empty/start signature: production mutant suite still 4 passed exit code == 0 (cycle-2 SURVIVES)`
    - `only harness mode 'assembly-reset' failure count used as proof`
    - `baseline anomaly: correct and mutant both failures==1 with no meaningful delta`

### AC-3: AC-3
- **Description:** GIVEN the existing pure-function suites (buildSseResumeHeaders + redhat-fix-03 header-drop coverage + s-reactive-01 pure suite) WHEN REDHAT-FIX-04 lands THEN those suites remain exit 0 and header-drop mutant remains killed; pure-function coverage is retained but explicitly documented as non-substitutes for production-hook coverage
- **Test tier:** `integration` · **Verification service:** `vitest pure-function + redhat-fix-03 retained suite`
- **Verify:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — pure suite deleted without production-hook replacement, empty — buildSseResumeHeaders export removed, stub — redhat-fix-03 suite deleted without replacement production coverage, removed — pure-function coverage dropped after extraction
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `sse-stub-production-hook-reconnect`: actor `cli_user`
    - **Steps:**
    - Run s-reactive-01-resumable-sse.test.ts
    - Run redhat-fix-03-sse-reconnect-wiring.test.ts
    - Confirm buildSseResumeHeaders still exported and tested
    - **MUST observe:**
    - `s-reactive-01-resumable-sse.test.ts exit code == 0`
    - `redhat-fix-03-sse-reconnect-wiring.test.ts exit code == 0 (or only obsolete harness tests removed with note if superseded)`
    - `buildSseResumeHeaders export name equals 'buildSseResumeHeaders' from hooks/use-resumable-sse-stream.ts`
    - **MUST NOT observe:**
    - `empty/start signature: pure suite deleted with no production-hook replacement (exit non-zero or missing suite == empty)`
    - `header-drop mutant no longer killed at pure-function layer (suite exit code != 0)`

### AC-4: AC-4
- **Description:** GIVEN disableStatusPollFallback=true on the production-hook reconnect test WHEN assembly/Last-Event-ID is broken THEN the suite fails (poll cannot sole-greenwash); WHEN correct production path runs THEN resumeTransport is 'sse'
- **Test tier:** `integration` · **Verification service:** `production hook instrumentation + SSE stub`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-4-poll-cannot-greenwash'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — poll-only greenwash of wiped assemblyRef, empty — disableStatusPollFallback ignored, stub — poll path marks resumeTransport equals 'poll' while claims 'sse', mock — poll finalText sole-greens broken Last-Event-ID path
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `sse-stub-production-hook-reconnect`: actor `cli_user`
    - **Steps:**
    - Render production hook with disableStatusPollFallback=true
    - Run correct reconnect path → expect resumeTransport 'sse'
    - Run production assembly-reset mutant path → expect failure without poll rescue
    - **MUST observe:**
    - `correct path resumeTransport equals 'sse'`
    - `broken assembly/Last-Event-ID under poll-disabled mode: assertion failure count >= 1`
    - `disableStatusPollFallback equals true and poll effect early-return (resumeTransport != 'poll' on correct path)`
    - **MUST NOT observe:**
    - `empty/start signature: broken path still passes via poll finalText only (tokenCount == 0 assembly rescued)`
    - `M2 unaddressed with disableStatusPollFallback option missing (option == false or absent)`

### AC-5: AC-5
- **Description:** GIVEN RED-first discipline WHEN implementer starts THEN .tmp/sprint-25/redhat-fix-04-red.log exists showing that either the production-hook suite was absent OR the production assemblyRef-reset mutant survived the pre-fix suite (exit 0 under mutant); AFTER fix, green evidence and mutation.log prove kill
- **Test tier:** `integration` · **Verification service:** `tdd evidence files under .tmp/sprint-25/`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — no red log, stub — green claimed without red phase, static — path B re-scope of H3 without production coverage, mock — fabricated path.json without mutation evidence
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `production-assemblyref-reset-mutant`: actor `cli_user`
    - **Steps:**
    - Capture redhat-fix-04-red.log (pre-fix production mutant survives or suite missing)
    - Implement production-hook/openEventSource test PATH-A
    - Capture green + production-mutation.log
    - Write redhat-fix-04-path.json {"path":"A"}
    - **MUST observe:**
    - `redhat-fix-04-red.log exists and file size > 0`
    - `redhat-fix-04-production-mutation.log exists and file size > 0`
    - `path.json path field equals 'A'`
    - `PATH-A production-truth coverage (path field == 'A', not PATH-B re-scope of CAP-SYNC-01 gate)`
    - **MUST NOT observe:**
    - `empty/start signature: only green logs without red evidence (red log missing or size == 0)`
    - `path.json path field equals 'B' without amending gate claim (disallowed for H3)`

## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Production hook/openEventSource reconnect: Last-Event-ID==3 and unique assembly from production state | AC-1 | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'` |
| TC-2 | Production assemblyRef-reset mutant is killed (exit non-zero); correct path exit 0; mutation.log exists | AC-2 | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-2-production-mutation' && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'production-assembly-reset' .tmp/sprint-25/redhat-fix-04-production-mutation.log` |
| TC-3 | Pure-function + redhat-fix-03 non-regression still green | AC-3 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts` |
| TC-4 | Poll cannot sole-greenwash production assembly/Last-Event-ID break under disableStatusPollFallback | AC-4 | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-4-poll-cannot-greenwash'` |
| TC-5 | TDD evidence chain: red log + production mutation log + path.json A present | AC-5 | `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json` |
| TC-6 | Adversarial re-probe command: suite fails under documented production mutant edit (manual or scripted) | AC-2 | `test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-04-production-mutation.log` |

## Reading List

- .spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md — H3-NOT-CLOSED (lines 25-29, 118-125, 130-134, 166-197)
- hooks/use-resumable-sse-stream.ts:249 — disableStatusPollFallback option
- hooks/use-resumable-sse-stream.ts:312-326 — buildSseResumeHeaders pure export
- hooks/use-resumable-sse-stream.ts:406 — assemblyRef declaration
- hooks/use-resumable-sse-stream.ts:441-619 — openEventSource + XHR onError reconnect (~:608)
- hooks/use-resumable-sse-stream.ts:700-713 — online handler reconnect (~:711)
- hooks/use-resumable-sse-stream.ts:715-720 — poll fallback M2 disable
- tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts:185-336 — runReconnectWiring anti-pattern (local assembly)
- tests/integration/s-reactive-01-resumable-sse.test.ts — pure suite still green under production mutant
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-03-strengthen-sse-reconnect-exactly-once-oracle.md — AC-2 false PASS self-annotation
- .spec/prds/mk6-migration/08-uc-sync.md — UC-SYNC-02
- .spec/prds/mk6-migration/11-e2e-testing-criteria.md — T-SYNC-006
- package.json — @testing-library/react-hooks, @testing-library/react-native present

## Guardrails

### WRITE-ALLOWED
- hooks/use-resumable-sse-stream.ts (MODIFY — extract openEventSource / assembly cursor only if needed; preserve Last-Event-ID + disableStatusPollFallback)
- hooks/useNetworkStatus.ts (MODIFY only if a test-only injectable online state is required; prefer vi.mock of the module)
- tests/integration/redhat-fix-04-production-hook-reconnect.test.ts (NEW)
- tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts (MODIFY only to add comment that harness is non-authoritative for production assemblyRef; do not claim production kill)
- tests/integration/s-reactive-01-resumable-sse.test.ts (MODIFY only if shared helpers needed)
- .tmp/sprint-25/redhat-fix-04-red.log
- .tmp/sprint-25/redhat-fix-04-production-mutation.log
- .tmp/sprint-25/redhat-fix-04-path.json
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md (footnote H3 production-hook coverage)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-03-strengthen-sse-reconnect-exactly-once-oracle.md (footnote AC-2 partial: pure-function killed; production-hook deferred to REDHAT-FIX-04)

### WRITE-PROHIBITED
- services/platform/src/http/chat-runs.ts — backend contract proven; do not re-litigate
- services/platform/src/db/seed-e2e.ts — H1 closed by REDHAT-FIX-01
- .maestro/reactive/advance-server.py — H2 closed by REDHAT-FIX-02
- Mocking EventSource/XHR with canned strings that skip real headers
- Claiming mutant kill via runReconnectWiring local assembly wipe
- Other REDHAT-FIX-0{1,2,3,5,6} product scopes (evidence-only footnotes ok)
- Deleting poll fallback from production without analysis
- services/platform/src/http/chat-runs.ts
- services/platform/src/db/seed-e2e.ts
- services/platform/src/research/progress.ts
- services/platform/src/mission/cycle.ts
- services/platform/src/observability/mission-research.ts
- Replacing production EventSource/XHR path with a mock that never surfaces real request headers
- Keeping runReconnectWiring as the ONLY AC-2 mutant path without production-hook coverage

## Design

- **References:** `./SPRINT.md`, `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#H3-NOT-CLOSED`, `REDHAT-FIX-03-strengthen-sse-reconnect-exactly-once-oracle.md`, `hooks/use-resumable-sse-stream.ts:406,608,711`, `tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts:189-336`, `hooks/use-resumable-sse-stream.ts:441-712 (openEventSource + reconnect call sites)`, `hooks/use-resumable-sse-stream.ts:306-326 (buildSseResumeHeaders — already mutant-A killed)`, `services/platform/src/http/chat-runs.ts:618-621 (seq > afterSeq — DO NOT TOUCH)`, `services/platform/src/http/chat-runs.ts:115-156 (finalizeChatRun durable row — DO NOT TOUCH)`, `tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts (runReconnectWiring harness — replace/supplement)`, `S-REACTIVE-01 AC-2 PRIMARY / REDHAT-FIX-03 AC-2 PRIMARY`
- **Pattern:** Production-hook mutation test: exercise real useResumableSSEStream (or extracted openEventSource sharing production assemblyRef) over real SSE stub that (1) emits token seq 1..3, (2) drops connection, (3) records reconnect Last-Event-ID, (4) replays only seq > afterSeq. Assert header Last-Event-ID=='3', unique concat, tokenCount==unique. Kill production mutants by editing production file in isolated worktree: (A) omit Last-Event-ID, (B) reset assemblyRef before reconnect — both must fail ≥1 assertion. Correct path exit 0 with resumeTransport==='sse'.
- **Pattern source:** red-hat cycle-2 H3-NOT-CLOSED fix recommendation + chat-runs afterSeq contract (Sprint 18 proven)
- **Anti-pattern:** runReconnectWiring reimplementation that wipes a local `assembly = {}` under mode:'assembly-reset' and claims mutant killed; static rg /Last-Event-ID/; trusting self-annotated [x] PASS + harness mutation.log without production-code probe; rewriting chat-runs.ts 'to make tests pass'.
- **Interaction notes:**
- Prefer renderHook(useResumableSSEStream) + real http.createServer; if Node lacks XMLHttpRequest progressive SSE, extract openEventSource + assembly cursor into a production-imported module and test that unit — production MUST call the extracted unit
- Control reconnect via vi.mock('@/hooks/useNetworkStatus') isOnline flip and/or stub-side connection close that triggers onError retry
- Keep buildSseResumeHeaders pure tests; annotate they are necessary but not sufficient for H3
- Mobile: reconnect must preserve touch-stream continuity (no second bubble) — hook state only; no ChatThread churn required unless wiring exposes lastSeq for test
- SafeAreaView/touch targets N/A for pure hook test; do not expand into UI redesign
- Backend afterSeq / Last-Event-ID replay is already sound (chat_run_events WHERE seq > afterSeq). FIX-04 proves CLIENT production wiring, not server reimplementation.
- Mutant A (header-drop on buildSseResumeHeaders) is already killed via pure-function import — KEEP that coverage; it is necessary but not sufficient.
- Mutant B (assemblyRef.current = {lastSeq:0,text:'',tokenCount:0} before reconnect at :608 and :712) still SURVIVES because the suite mutates a harness-local assembly, not production assemblyRef.
- Two acceptable implementation paths: (a) render useResumableSSEStream via @testing-library/react-hooks (+ RN/XHR polyfill) against real http.createServer SSE stub; (b) extract openEventSource / reconnect continuation into a testable unit that still owns the SAME assemblyRef state object production uses.
- Self-generated redhat-fix-03-mutation.log is unreliable (baseline anomaly: unmutated correct also reported failures=1 exit=0 in some runs). New mutation evidence must come from production-code probe (worktree mutant → suite fails) not harness simulation mode.
- AC-5 durable-row authority: assembled client text must equal chat_messages content after terminal; agent row count == 1. Prefer PLATFORM_IT live when available; do not invent a second durable source of truth.
- disableStatusPollFallback must remain available so poll cannot sole-greenwash a broken Last-Event-ID (M2) while the production-hook test runs.

## Agent Assignment

- **Agent:** `react-native-ui-implementer`
- **Rationale:** Owns hooks/use-resumable-sse-stream.ts reconnect wiring, assemblyRef continuity, and the REDHAT-FIX-03 integration suite that currently reimplements (not exercises) production. Closing H3-NOT-CLOSED requires a production-hook (or production-extracted openEventSource) test that kills the assemblyRef-reset mutant at real reconnect call sites. Reviewer: react-native-ui-reviewer; standing test-quality-reviewer may re-probe production mutants.
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed by:** `react-native-ui-planner` (plus mastra-planner contract enrichments at consolidation)

## Agent Instructions

1. Capture RED evidence if tdd_mode=red_first before product changes.
2. Implement only WRITE-ALLOWED paths; close the source finding.
3. Run verification gates; write evidence under .tmp/sprint-25/ and/or sprint .gate-evidence/.
4. Do not re-open closed H1/H2 production writers unless this task explicitly requires it.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| NEW production-hook suite | `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` | Exit 0 on correct production code |
| Production mutant kill evidence | `test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-04-production-mutation.log` | File exists; production-assembly-reset non-zero |
| Non-regression pure + fix-03 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts` | Exit 0 |
| TDD evidence | `test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json` | RED log + path A |
| Lint/type scope (reactive) | `pnpm biome check hooks/use-resumable-sse-stream.ts tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` | Exit 0 on touched files |

## Dependencies

- **depends_on:** REDHAT-FIX-03, S-REACTIVE-01, REDHAT-FIX-01
- **blocks:** REDHAT-FIX-05, S-REACTIVE-05

## Review Criteria

- Every AC/TC stable; behavioral ACs pass `validate_scenario` with 0 CRITICAL
- Source finding closed with production-truth evidence (not harness simulation alone)
- Writes only under WRITE-ALLOWED
- Evidence artifacts at contract-mandated paths

## Notes

- Mastra enrichments folded at consolidation: backend afterSeq frozen; durable chat_messages authoritative; gate/evidence integrity.
- Contract: MUST-PRESERVE: chat-runs.ts afterSeq filter `seq > afterSeq` (listChatEvents/getChatRun :618-621) — FIX-04 must not re-litigate or rewrite the SSE backend.
- Contract: MUST-PRESERVE: finalizeChatRun durable chat_messages write + monotonic chat_run_events seq — durable row remains authoritative after terminal; client assembly is provisional.
- Contract: MUST-PRESERVE: SSE event type set token | terminal | blocked | error with monotonic seq as SSE id — client tests/stubs must honor the same set.
- Contract: MUST-PRESERVE: Client resume header Last-Event-ID = String(assemblyRef.current.lastSeq || afterSeq) via buildSseResumeHeaders — pure-function mutant A already killed; production openEventSource wiring at reconnect sites :608/:712 is the remaining gap.
- Contract: MUST-PROVE (FIX-04): Mutant that resets production assemblyRef.current before reconnect is KILLED by a test that exercises production code, not runReconnectWiring local variables.
- Contract: MUST-PROVE (FIX-04): Exactly-once = unique token concat + tokenCount==unique + single agent bubble + durable content diff==0.
- Contract: MUST-NOT: Trust harness-generated redhat-fix-03-mutation.log alone (baseline anomaly / simulation mode) as production mutant-kill evidence.
- Contract: MUST-NOT: Re-open H1 seed or H2 research/progress writer under FIX-04/05/06 — both PATH-A closed in production.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-04",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sse-stub-production-hook-reconnect": {
      "description": "Node http.createServer SSE stub that emits token events seq 1-3 on first connect (no Last-Event-ID), disconnects, then on reconnect with Last-Event-ID:3 emits remaining tokens seq 4-5 + terminal with unique final text. Captures request headers including Last-Event-ID. Used only by the production-hook/openEventSource test \u2014 not a local reimplementation of assembly.",
      "seed_method": "cli",
      "records": [
        "first connect emits tokens One,Two,Three with id/seq 1..3 then closes",
        "reconnect without Last-Event-ID or with wrong cursor yields wrong/incomplete assembly under mutant",
        "reconnect with Last-Event-ID:3 emits Four,Five + terminal unique text OneTwoThreeFourFive",
        "tokenCount unique == 5 on correct production path"
      ]
    },
    "production-assemblyref-reset-mutant": {
      "description": "Documented temporary production edit (or scripted probe) that sets assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 } immediately before both reconnect openEventSource calls in hooks/use-resumable-sse-stream.ts (or extracted unit call sites). Must be applied against the same tree the suite imports.",
      "seed_method": "cli",
      "records": [
        "mutant site A: XHR onError retry path (~line 608)",
        "mutant site B: online handler path (~line 711)",
        "mutant guarantees incomplete assembly / wrong tokenCount / missing Last-Event-ID continuity in production"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a real http.createServer SSE stub and the PRODUCTION useResumableSSEStream hook (or production-extracted openEventSource imported by the hook) WHEN first connect receives tokens seq 1-3, disconnects, then reconnects THEN Last-Event-ID equals '3' (or resume cursor lastSeq==3), final assembled text equals unique token concatenation, tokenCount equals unique count, and full-replay duplicates == 0",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real http SSE stub + production useResumableSSEStream (renderHook) or production-extracted openEventSource",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 production reconnect omits Last-Event-ID / loses assemblyRef.lastSeq",
            "stub \u2014 only runReconnectWiring local assembly is exercised (REDHAT-FIX-03 anti-pattern)",
            "empty \u2014 tokenCount == 0 after reconnect",
            "mock \u2014 EventSource/XHR mocked so headers unobservable",
            "static \u2014 status poll sole-greenwashes broken assembly without SSE resume"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-production-hook-reconnect",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Start http.createServer SSE stub with sequenced tokens",
                "Render production useResumableSSEStream via renderHook (or call production-extracted openEventSource) with platformUrl pointing at stub, disableStatusPollFallback=true",
                "connect({ runId, durableMessageId }) and wait until lastSeq==3 / streamedText=='OneTwoThree'",
                "Simulate mid-stream disconnect (close socket and/or flip useNetworkStatus isOnline false\u2192true, or trigger onError reconnect)",
                "Capture reconnect request headers from stub",
                "Receive remaining tokens; assert unique concat + tokenCount from production hook state (result.current), not a local harness assembly variable"
              ]
            },
            "end_state": {
              "must_observe": [
                "reconnect request header Last-Event-ID equals '3'",
                "production hook result.current.streamedText equals unique token concatenation 'OneTwoThreeFourFive'",
                "production hook result.current.tokenCount == 5 (unique token count)",
                "production hook result.current.lastSeq >= 5 after complete",
                "resumeTransport equals 'sse' (not 'poll') when disableStatusPollFallback=true"
              ],
              "must_not_observe": [
                "empty/start signature: Last-Event-ID header missing on reconnect (empty header)",
                "final text with duplicated prefix e.g. 'OneTwoThreeOneTwoThree'",
                "tokenCount == 0 after reconnect (empty assembly)",
                "tokenCount == 8 (full-replay duplicates)",
                "only local harness assembly mutated while production assemblyRef untested"
              ]
            }
          }
        ]
      },
      "flow_ref": "UC-SYNC-02"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the production assemblyRef-reset mutant inserted before reconnect openEventSource calls at hooks/use-resumable-sse-stream.ts:~608 and ~:711 (or extracted unit sites) WHEN the REDHAT-FIX-04 production-hook suite runs THEN assertion failure count >= 1 and process exit code != 0; WHEN the same suite runs against unmutated production code THEN exit code == 0",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-2-production-mutation' && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'production-assembly-reset' .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'exit_nonzero|exit=[1-9]|failures=[1-9]' .tmp/sprint-25/redhat-fix-04-production-mutation.log",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "production-code mutation probe + real http SSE stub",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 suite remains green under production assemblyRef wipe (SURVIVES as in cycle-2 probe)",
            "stub \u2014 only local harness mode 'assembly-reset' is simulated",
            "empty \u2014 no mutation.log / no exit code delta",
            "mock \u2014 self-generated harness simulation treated as production mutant kill"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "production-assemblyref-reset-mutant",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run production-hook suite against unmutated HEAD \u2192 expect exit 0; record correct line in mutation.log",
                "Apply production mutant: assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 } before reconnect openEventSource at both reconnect sites",
                "Re-run the SAME suite that imports production hook/unit \u2192 expect exit != 0 and failures >= 1",
                "Restore production source; re-run suite exit 0",
                "Write .tmp/sprint-25/redhat-fix-04-production-mutation.log with correct vs production-assembly-reset results"
              ]
            },
            "end_state": {
              "must_observe": [
                "correct path exit code == 0",
                "production-assembly-reset path exit code != 0",
                "production-assembly-reset assertion failure count >= 1",
                "mutation.log records correct exit_code==0 and production-assembly-reset exit_code!=0 with distinct outcomes",
                "mutant edit targets production file path equals 'hooks/use-resumable-sse-stream.ts' (or production-extracted unit), not tests/integration/redhat-fix-03 local assembly"
              ],
              "must_not_observe": [
                "empty/start signature: production mutant suite still 4 passed exit code == 0 (cycle-2 SURVIVES)",
                "only harness mode 'assembly-reset' failure count used as proof",
                "baseline anomaly: correct and mutant both failures==1 with no meaningful delta"
              ]
            }
          }
        ]
      },
      "flow_ref": "UC-SYNC-02"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the existing pure-function suites (buildSseResumeHeaders + redhat-fix-03 header-drop coverage + s-reactive-01 pure suite) WHEN REDHAT-FIX-04 lands THEN those suites remain exit 0 and header-drop mutant remains killed; pure-function coverage is retained but explicitly documented as non-substitutes for production-hook coverage",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest pure-function + redhat-fix-03 retained suite",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 pure suite deleted without production-hook replacement",
            "empty \u2014 buildSseResumeHeaders export removed",
            "stub \u2014 redhat-fix-03 suite deleted without replacement production coverage",
            "removed \u2014 pure-function coverage dropped after extraction"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-production-hook-reconnect",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run s-reactive-01-resumable-sse.test.ts",
                "Run redhat-fix-03-sse-reconnect-wiring.test.ts",
                "Confirm buildSseResumeHeaders still exported and tested"
              ]
            },
            "end_state": {
              "must_observe": [
                "s-reactive-01-resumable-sse.test.ts exit code == 0",
                "redhat-fix-03-sse-reconnect-wiring.test.ts exit code == 0 (or only obsolete harness tests removed with note if superseded)",
                "buildSseResumeHeaders export name equals 'buildSseResumeHeaders' from hooks/use-resumable-sse-stream.ts"
              ],
              "must_not_observe": [
                "empty/start signature: pure suite deleted with no production-hook replacement (exit non-zero or missing suite == empty)",
                "header-drop mutant no longer killed at pure-function layer (suite exit code != 0)"
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
      "description": "GIVEN disableStatusPollFallback=true on the production-hook reconnect test WHEN assembly/Last-Event-ID is broken THEN the suite fails (poll cannot sole-greenwash); WHEN correct production path runs THEN resumeTransport is 'sse'",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-4-poll-cannot-greenwash'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "production hook instrumentation + SSE stub",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 poll-only greenwash of wiped assemblyRef",
            "empty \u2014 disableStatusPollFallback ignored",
            "stub \u2014 poll path marks resumeTransport equals 'poll' while claims 'sse'",
            "mock \u2014 poll finalText sole-greens broken Last-Event-ID path"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-production-hook-reconnect",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Render production hook with disableStatusPollFallback=true",
                "Run correct reconnect path \u2192 expect resumeTransport 'sse'",
                "Run production assembly-reset mutant path \u2192 expect failure without poll rescue"
              ]
            },
            "end_state": {
              "must_observe": [
                "correct path resumeTransport equals 'sse'",
                "broken assembly/Last-Event-ID under poll-disabled mode: assertion failure count >= 1",
                "disableStatusPollFallback equals true and poll effect early-return (resumeTransport != 'poll' on correct path)"
              ],
              "must_not_observe": [
                "empty/start signature: broken path still passes via poll finalText only (tokenCount == 0 assembly rescued)",
                "M2 unaddressed with disableStatusPollFallback option missing (option == false or absent)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN RED-first discipline WHEN implementer starts THEN .tmp/sprint-25/redhat-fix-04-red.log exists showing that either the production-hook suite was absent OR the production assemblyRef-reset mutant survived the pre-fix suite (exit 0 under mutant); AFTER fix, green evidence and mutation.log prove kill",
      "verify": "test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "tdd evidence files under .tmp/sprint-25/",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 no red log",
            "stub \u2014 green claimed without red phase",
            "static \u2014 path B re-scope of H3 without production coverage",
            "mock \u2014 fabricated path.json without mutation evidence"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "production-assemblyref-reset-mutant",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Capture redhat-fix-04-red.log (pre-fix production mutant survives or suite missing)",
                "Implement production-hook/openEventSource test PATH-A",
                "Capture green + production-mutation.log",
                "Write redhat-fix-04-path.json {\"path\":\"A\"}"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-04-red.log exists and file size > 0",
                "redhat-fix-04-production-mutation.log exists and file size > 0",
                "path.json path field equals 'A'",
                "PATH-A production-truth coverage (path field == 'A', not PATH-B re-scope of CAP-SYNC-01 gate)"
              ],
              "must_not_observe": [
                "empty/start signature: only green logs without red evidence (red log missing or size == 0)",
                "path.json path field equals 'B' without amending gate claim (disallowed for H3)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Production hook/openEventSource reconnect: Last-Event-ID==3 and unique assembly from production state",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Production assemblyRef-reset mutant is killed (exit non-zero); correct path exit 0; mutation.log exists",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-2-production-mutation' && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -q 'production-assembly-reset' .tmp/sprint-25/redhat-fix-04-production-mutation.log",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Pure-function + redhat-fix-03 non-regression still green",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Poll cannot sole-greenwash production assembly/Last-Event-ID break under disableStatusPollFallback",
      "verify": "pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-4-poll-cannot-greenwash'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "TDD evidence chain: red log + production mutation log + path.json A present",
      "verify": "test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-04-path.json",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Adversarial re-probe command: suite fails under documented production mutant edit (manual or scripted)",
      "verify": "test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && rg -E 'production-assembly-reset.*(failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-04-production-mutation.log",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
