# REDHAT-FIX-11 — Close F-TEXT-DIFF-ORACLE (HIGH) — S-REACTIVE-01 AC-3 content byte-equal unverified. Add maestro oracle comparing rendered assistant text to Zero durable row, OR explicitly downgrade AC-3 text with tracked follow-up
> Status: ✅ Completed
> Cycle: 1
> Commit: 38a2100c
> Reviewer: product-manager+technical
> Completed: 2026-07-26T03:07:52Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 30 min
> Type: FEATURE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#F-TEXT-DIFF-ORACLE`
> Reviewer: react-native-ui-reviewer

## Outcome

PATH-A: maestro test .maestro/reactive/exactly-one-final-message.yml (and/or reconnect-exactly-once.yml) asserts content equality signal; a deliberate durable/render mismatch would fail; path.json path=A. PATH-B: AC-3 text no longer claims content byte-equal; path.json path=B with follow_up_task_id; residual risk documented.

## Background

- **Source finding:** `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#F-TEXT-DIFF-ORACLE`
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01
- **Agent rationale:** Owns S-REACTIVE-01 AC-3 e2e surface: components/chat/ChatThread.tsx testID oracles, .maestro/reactive/exactly-one-final-message.yml / reconnect-exactly-once.yml, and optional narrow durable-vs-stream content equality testIDs. F-TEXT-DIFF-ORACLE is an RN/Maestro oracle gap (bubble-count only; no content byte-equal). Reviewer: react-native-ui-reviewer.
- Prefer PATH-A if cheap (value-bearing equality testID + Maestro assert).
- PATH-B is acceptable this cycle if PATH-A is high risk; must be honest and tracked.
- redhat-fix-04 UNIQUE_TEXT equality is NOT a substitute for Zero durable content equality.
- [mastra-planner boundary] Durable chat_messages row is authoritative final text; SSE stream is live preview only.
- [mastra-planner boundary] Byte-equal requires comparing rendered bubble text to Postgres/Zero content of role=agent row — not stub UNIQUE_TEXT.
- [mastra-planner boundary] finalizeChatRun INSERT role='agent' content=finalText ON CONFLICT DO NOTHING is the durable write path.
- [mastra-planner boundary] PATH-A preferred (real oracle); PATH-B honest rescope allowed with tracked follow-up.
- [mastra-planner boundary] Do not claim Zero content equality if only UNIQUE_TEXT from redhat-fix-04 stub is compared.
- [mastra-planner boundary] Bubble count==1 is necessary but not sufficient for AC-3 content claim.
- [mastra-planner boundary] All three are cycle-5 blockers for unqualified Sprint 25 close; estimated total ~1.5–2h.
- [mastra-planner boundary] Shared evidence root: .tmp/sprint-25/ with path.json + red.log pattern from prior REDHAT-FIX tasks (cold-checkout TDD chain).
- [mastra-planner boundary] Do not re-litigate closed H1 Streaming seed, H2 writer existence, dual-site H3 core kill — these tasks close narrower residual gaps.
- [mastra-planner boundary] Verification stack: PLATFORM_IT Postgres for FIX-09; pnpm vitest redhat-fix-04 for FIX-10; maestro/integration+docs for FIX-11; biome + tsgo as touched-scope gates.
- [mastra-planner boundary] Fakeability: behavioral ACs carry full scenario objects (fixtures, start_ref, must_observe, must_not_observe empty/start, negative_control, evidence, topology single-node, test_tier integration|e2e on PRIMARY).
- Primary expansion: react-native-ui-planner; backend boundary enrichments from mastra-planner.

## Critical Constraints

### MUST
- MUST close F-TEXT-DIFF-ORACLE via PATH-A (content equality oracle) OR PATH-B (honest AC-3 downgrade + tracked follow-up)
- MUST record chosen path in .tmp/sprint-25/redhat-fix-11-path.json
- MUST capture RED evidence .tmp/sprint-25/redhat-fix-11-red.log showing current Maestro/integration does not fail when durable content would disagree with rendered text (or documents missing content oracle)
- PATH-A MUST add an e2e-observable equality signal (testID or Maestro assertion) that fails when rendered assistant content !== durable chat_messages.content for the latest agent turn
- PATH-A MUST keep bubble-count==1 assertions (exactly one final message) AND add content equality
- PATH-B MUST edit S-REACTIVE-01 AC-3 (and any gate claim that restates byte-equal) to remove unverified content byte-equal language and MUST file/track a follow-up task id in path.json
- MUST not leave S-REACTIVE-01 AC-3 claiming content byte-equal without an oracle that can fail on mismatch

### NEVER
- NEVER claim content byte-equal closed by bubble-count visibility alone
- NEVER claim equality solely via redhat-fix-04 UNIQUE_TEXT stub comparison
- NEVER PATH-B without amending AC-3 contract text
- NEVER PATH-A that only hashes stream tokens without comparing to durable Zero/Postgres content source
- NEVER re-open SSE reconnect product architecture for this oracle gap

### STRICTLY
- STRICTLY PRIMARY AC test_tier e2e for PATH-A (Maestro) or integration+docs for PATH-B honesty; flow_ref UC-SYNC-02 on PRIMARY
- STRICTLY tdd_mode red_first
- STRICTLY prefer PATH-A if cheap; PATH-B acceptable with tracked follow-up
- STRICTLY seed via real holo seed:e2e / Streaming conversation — no view-injection of final text

## Specification

**Objective:** Close cycle-5 HIGH F-TEXT-DIFF-ORACLE by either (A) adding a Maestro/UI oracle that proves rendered final assistant content is byte-equal to the durable Zero/chat_messages row, or (B) honestly downgrading S-REACTIVE-01 AC-3 language away from content byte-equal with a tracked follow-up.

**Success state:** PATH-A: maestro test .maestro/reactive/exactly-one-final-message.yml (and/or reconnect-exactly-once.yml) asserts content equality signal; a deliberate durable/render mismatch would fail; path.json path=A. PATH-B: AC-3 text no longer claims content byte-equal; path.json path=B with follow_up_task_id; residual risk documented.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** assistant-content-byte-equal-oracle, s-reactive-01-ac3-honest-contract
- **Consumes:** resumable-sse-chat-client, honest-streaming-seed-oracle, zero-durable-message
- **Boundary contracts:**
  - S-REACTIVE-01 AC-3 claims: exactly ONE final assistant message matching durable chat_messages row (role=agent, content byte-equal).
  - Current Maestro (.maestro/reactive/exactly-one-final-message.yml:112,116 and reconnect-exactly-once.yml bubble-count) asserts visibility / bubble-count only — not content equality.
  - redhat-fix-04 compares snap.streamedText to stub UNIQUE_TEXT — not a Zero/Postgres durable row.
  - PATH-A (PREFERRED if cheap): Maestro oracle that compares rendered assistant text to durable Zero/chat_messages content — e.g. value-bearing testIDs chat-content-byte-equal when stream/final bubble === durable content, chat-content-byte-mismatch when not; or paired content-hash testIDs.
  - PATH-B (ACCEPTABLE escape): explicitly downgrade S-REACTIVE-01 AC-3 contract text from content byte-equal to exactly one bubble; content coordination deferred, with tracked follow-up task id recorded in path.json.
  - Prefer PATH-A if implementable within ~30 min using existing value-bearing testID pattern (chat-assistant-bubble-count-${n}). PATH-B is acceptable if PATH-A is high risk this cycle.
  - Product freeze: do not re-open H1/H2/H3 SSE product paths beyond narrow oracle testIDs / contract text; no chat-runs rewrite.
  - chat_messages schema (Zero): id, conversation_id, role, content, message_type, session_id, ...
  - finalizeChatRun (chat-runs.ts:149-154): INSERT chat_messages role='agent' content=finalText id=durable_message_id
  - Primary gate CAP-SYNC-01: reconnect reconciles to exactly one final assistant message matching Zero-synced row
  - PATH-A oracles may use PLATFORM_IT SELECT content FROM chat_messages WHERE role='agent' AND id=$durableId and/or e2e content-hash testIDs
  - PATH-B must purge unqualified 'content byte-equal' from S-REACTIVE-01 AC-3 + REQUIREMENT-CONTRACT and set follow_up
  - Never invent second durable store; never rewrite afterSeq filter for this task
  - CAP-SYNC-01 / UC-SYNC-02 remain the capability/flow spine
  - proposed_by tripwire: every expanded task sets proposed_by=mastra-planner
  - No stubs of core writer/SSE/durable finalize paths

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **Description:** GIVEN a completed streaming turn on the seeded Streaming conversation WHEN the thread renders final state THEN PATH-A: Maestro observes an explicit content-equality oracle proving rendered latest assistant text is byte-equal to durable chat_messages.content (e.g. assertVisible id chat-content-byte-equal and notVisible chat-content-byte-mismatch), OR PATH-B: S-REACTIVE-01 AC-3 no longer claims content byte-equal and path.json records follow_up_task_id
- **Test tier:** `e2e` · **Verification service:** `Maestro + Zero durable chat_messages + ChatThread equality testIDs (PATH-A) OR contract audit (PATH-B)` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-11-path.json && ( jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-11-path.json >/dev/null && maestro test .maestro/reactive/exactly-one-final-message.yml || ( jq -e '.path=="B" and (.follow_up_task_id|type=="string" and length>0)' .tmp/sprint-25/redhat-fix-11-path.json && rg -n 'content byte-equal|byte-equal' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md | rg -v 'deferred|downgrad|follow-up|PATH-B|historical' | wc -l | awk '{exit ($1>0)?1:0}' ) )`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — bubble-count visibility only still claimed as byte-equal, empty — no equality testID and AC-3 still says byte-equal, static — path A claimed without Maestro assertion on equality signal, mock — UNIQUE_TEXT stub equality treated as Zero durable equality, disconnect — durable row not written but e2e still green under PATH-A
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`
    - **Steps:**
      - PATH-A: after seed:e2e, run maestro exactly-one-final-message.yml
      - PATH-A: assert chat-assistant-message-latest visible AND content equality testID visible
      - PATH-A: assert chat-content-byte-mismatch not visible (or dual hashes equal)
      - PATH-B: edit S-REACTIVE-01 AC-3 text; write path.json B + follow_up_task_id
      - Record path A|B in redhat-fix-11-path.json
    - **MUST observe:**
      - `path.json path field equals 'A' or 'B'`
      - `PATH-A: Maestro flow exit code == 0 with content equality oracle assertion present in yml`
      - `PATH-A: greppable chat-content-byte-equal or dual content-hash testID wiring in ChatThread/chat screen`
      - `PATH-A: exactly-one-final-message.yml contains assert on content equality testID (not only bubble-count)`
      - `PATH-B: follow_up_task_id non-empty string in path.json`
      - `PATH-B: S-REACTIVE-01 AC-3 active claim text does not assert unverified content byte-equal`
    - **MUST NOT observe:**
      - `empty/start signature: AC-3 still claims content byte-equal with only bubble-count oracle`
      - `PATH-A yml asserts only chat-assistant-message-latest / bubble-count without equality signal`
      - `PATH-B without follow_up_task_id`
      - `equality proven only against SSE stub UNIQUE_TEXT without durable row`

### AC-2: AC-2 [PRIMARY]
- **Description:** GIVEN PATH-A equality helper/testIDs WHEN durable content and rendered assistant text diverge THEN equality signal fails (chat-content-byte-mismatch visible or unit/integration assertion fails); GIVEN PATH-B WHEN contract audited THEN no greppable live byte-equal claim remains without oracle
- **Test tier:** `integration` · **Verification service:** `vitest equality helper and/or Maestro negative control + contract rg` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-11-content-byte-equal-oracle.test.ts -t 'AC-2' || ( jq -e '.path=="B"' .tmp/sprint-25/redhat-fix-11-path.json && rg -n 'content byte-equal' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md | head -20 )`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — equality helper always returns equal, empty — no negative control under PATH-A, stub — PATH-B docs claim equality still verified
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `content-mismatch-negative-control`: actor `cli_user`
    - **Steps:**
      - PATH-A: unit/integration: equal strings → equality true / testID equal
      - PATH-A: unit/integration: 'OneTwoThreeFourFive' vs 'Completely different text' → equality false
      - PATH-B: rg AC-3 for residual unverified byte-equal claims
    - **MUST observe:**
      - `PATH-A: mismatch case returns equal===false or emits mismatch testID id`
      - `PATH-A: match case returns equal===true`
      - `PATH-B: path.json follow_up_task_id present and AC-3 downgraded`
    - **MUST NOT observe:**
      - `empty/start signature: PATH-A mismatch still equal===true`
      - `PATH-A only bubble count without string compare`
      - `PATH-B AC-3 still primary-claims content byte-equal`

### AC-3: AC-3
- **Description:** GIVEN existing bubble-count / latest-message oracles WHEN FIX-11 lands THEN they remain; reconnect-exactly-once still asserts exactly one final bubble; no regression of REDHAT-FIX-01 Streaming seed title oracle
- **Test tier:** `e2e` · **Verification service:** `Maestro reactive flows retained oracles` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `rg -n 'chat-assistant-message-latest|chat-assistant-bubble-count-1' .maestro/reactive/exactly-one-final-message.yml .maestro/reactive/reconnect-exactly-once.yml && rg -n 'Streaming' .maestro/reactive/exactly-one-final-message.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty — bubble-count oracle deleted, stub — Streaming seed oracle removed, static — only docs changed under PATH-A without yml update
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `cli_user`
    - **Steps:**
      - Confirm bubble-count and latest-message asserts remain in yml
      - Confirm Streaming title oracle remains (REDHAT-FIX-01)
      - PATH-A: equality assert is additive
    - **MUST observe:**
      - `exactly-one-final-message.yml match count >= 1 for literal 'chat-assistant-message-latest'`
      - `reconnect-exactly-once.yml contains chat-assistant-bubble-count-1 or equivalent count oracle`
      - `exactly-one-final-message.yml match count >= 1 for literal 'Streaming'`
    - **MUST NOT observe:**
      - `empty/start signature: bubble-count oracle removed without replacement`
      - `Streaming seed oracle deleted`

### AC-4: AC-4
- **Description:** GIVEN RED-first discipline WHEN implementer starts THEN redhat-fix-11-red.log documents that current oracles do not compare content to durable row; AFTER fix path.json + (PATH-A yml/testIDs | PATH-B contract edits) prove closure
- **Test tier:** `integration` · **Verification service:** `tdd evidence files under .tmp/sprint-25/` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-11-red.log && test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-11-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — no red log, stub — green without documenting pre-fix oracle gap, static — path A without yml content assert
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `content-mismatch-negative-control`: actor `cli_user`
    - **Steps:**
      - Document pre-fix: Maestro only visibility/bubble-count; integration only UNIQUE_TEXT
      - Implement PATH-A or PATH-B
      - Write path.json with finding F-TEXT-DIFF-ORACLE
    - **MUST observe:**
      - `redhat-fix-11-red.log size > 0`
      - `path.json path equals 'A' or 'B'`
      - `path.json field finding equals 'F-TEXT-DIFF-ORACLE' OR match count >= 1 for literal 'F-TEXT-DIFF-ORACLE'`
      - `PATH-B implies follow_up_task_id length > 0`
    - **MUST NOT observe:**
      - `empty/start signature: red log missing`
      - `path A without any content equality artifact change`

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | PATH-A Maestro content equality oracle OR PATH-B honest AC-3 downgrade with follow_up_task_id | AC-1 | `test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-11-path.json` |
| TC-2 | PATH-A: Maestro exactly-one-final-message includes content equality assert; PATH-B: AC-3 no live byte-equal claim | AC-1 | `python3 -c "import json,pathlib,re; p=json.loads(pathlib.Path('.tmp/sprint-25/redhat-fix-11-path.json').read_text()); yml=pathlib.Path('.maestro/reactive/exactly-one-final-message.yml').read_text(); ac=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md').read_text();
assert p['path'] in ('A','B');

if p['path']=='A':
  assert re.search(r'chat-content-byte-equal|content-hash|byte-equal', yml), 'PATH-A yml missing content equality oracle'
else:
  assert p.get('follow_up_task_id'), 'PATH-B needs follow_up_task_id'"` |
| TC-3 | PATH-A mismatch negative control (helper/integration) fails equality; PATH-B skip with path B | AC-2 | `pnpm vitest run tests/integration/redhat-fix-11-content-byte-equal-oracle.test.ts -t 'AC-2' || jq -e '.path=="B"' .tmp/sprint-25/redhat-fix-11-path.json` |
| TC-4 | Retained bubble-count + Streaming seed oracles | AC-3 | `rg -n 'chat-assistant-message-latest' .maestro/reactive/exactly-one-final-message.yml && rg -n 'Streaming' .maestro/reactive/exactly-one-final-message.yml` |
| TC-5 | TDD evidence chain red log + path.json | AC-4 | `test -f .tmp/sprint-25/redhat-fix-11-red.log && test -s .tmp/sprint-25/redhat-fix-11-red.log && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-11-path.json` |

## Fixtures

### `seeded-streaming-conversation`
- **seed_method:** `public_api`
- **description:** Streaming conversation from holo seed:e2e --reset used by existing Maestro reactive flows; produces a real durable agent chat_messages row after terminal.
  - conversation title Streaming
  - real POST /api/chat-runs + SSE token stream
  - durable chat_messages row role=agent after terminal
  - Maestro flows: exactly-one-final-message.yml, reconnect-exactly-once.yml

### `content-mismatch-negative-control`
- **seed_method:** `cli`
- **description:** PATH-A negative control: if durable content and rendered bubble text diverge (or equality testID forced to mismatch), Maestro must fail. May be proven via unit/integration of the equality helper plus e2e assertVisible of chat-content-byte-equal on happy path.
  - happy path renders chat-content-byte-equal (or matching dual hashes)
  - mismatch path renders chat-content-byte-mismatch or fails assertion
  - bubble-count oracle alone insufficient

## Reading List

- .spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#F-TEXT-DIFF-ORACLE
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md — AC-3 content byte-equal claim
- .maestro/reactive/exactly-one-final-message.yml — visibility-only final oracle
- .maestro/reactive/reconnect-exactly-once.yml — bubble-count oracle
- components/chat/ChatThread.tsx — value-bearing testID pattern (bubble-count, last-seq)
- app/(drawer)/chat/[conversationId].tsx — durable vs stream reconcile
- tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:373 — UNIQUE_TEXT stub equality (not Zero)
- .spec/prds/mk6-migration/08-uc-sync.md — UC-SYNC-02
- .spec/prds/mk6-migration/11-e2e-testing-criteria.md — T-SYNC-006

## Guardrails

### WRITE-ALLOWED
- components/chat/ChatThread.tsx (MODIFY — PATH-A: content equality / hash / byte-equal testIDs using theme-safe hidden oracle pattern)
- app/(drawer)/chat/[conversationId].tsx (MODIFY — PATH-A only if durable content must be plumbed into equality oracle)
- .maestro/reactive/exactly-one-final-message.yml (MODIFY — PATH-A equality asserts)
- .maestro/reactive/reconnect-exactly-once.yml (MODIFY optional PATH-A equality assert)
- tests/integration/redhat-fix-11-content-byte-equal-oracle.test.ts (NEW PATH-A helper/negative control)
- S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md (PATH-B contract downgrade or PATH-A footnote)
- SPRINT.md / GATE-RESULTS.md (only if they restate AC-3 byte-equal — PATH-B honesty)
- .tmp/sprint-25/redhat-fix-11-red.log
- .tmp/sprint-25/redhat-fix-11-path.json

### WRITE-PROHIBITED
- services/platform/src/http/chat-runs.ts
- services/platform/src/research/progress.ts
- hooks/use-resumable-sse-stream.ts product reconnect rewrite (oracle-only hooks changes discouraged; equality belongs at durable reconcile UI)
- Claiming byte-equal via bubble-count alone
- PATH-B without AC-3 text change and follow_up_task_id
- Removing REDHAT-FIX-01 Streaming seed oracle

## Design / Pattern

- **References:** red-hat cycle-5 #F-TEXT-DIFF-ORACLE, S-REACTIVE-01 AC-3, ChatThread value-bearing testIDs, exactly-one-final-message.yml
- **Pattern:** Value-bearing testID oracles (already used for bubble-count and last-seq) extended to content equality
- **Pattern source:** ChatThread chat-assistant-bubble-count-${n}; red-hat remediation PATH-A hash testIDs
- **Anti-pattern:** Visibility-only latest bubble as proof of byte-equal; UNIQUE_TEXT stub as Zero durable; PATH-B silent leave of AC-3 claim
- **Note:** PATH-A preferred cheap design: after terminal+durable reconcile, render hidden oracle View testID='chat-content-byte-equal' when normalize(renderedLatestAgentText)===normalize(durableContent), else testID='chat-content-byte-mismatch'. Maestro assertVisible equal; optional assertNotVisible mismatch.
- **Note:** Alternative PATH-A: dual testIDs chat-streamed-content-hash-${h} and chat-durable-content-hash-${h} with same h on equality — Maestro assertVisible both.
- **Note:** Durable source must be Zero-synced chat_messages content for the latest agent turn (not SSE assembly alone).
- **Note:** PATH-B: change AC-3 THEN to 'exactly one final assistant bubble; content byte-equal deferred to follow-up {id}' and stop gate language that claims content equality verified.

## Verification Gates

- **Path selection recorded:** `test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-11-path.json` → expected: path A or B
- **PATH-A Maestro equality (when path A):** `jq -e '.path=="B"' .tmp/sprint-25/redhat-fix-11-path.json >/dev/null || (rg -n 'chat-content-byte-equal|content-hash|byte-equal' .maestro/reactive/exactly-one-final-message.yml && maestro test .maestro/reactive/exactly-one-final-message.yml)` → expected: PATH-A: yml oracle + maestro exit 0; PATH-B: skipped via path B
- **PATH-B honesty (when path B):** `jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-11-path.json >/dev/null || jq -e '.path=="B" and (.follow_up_task_id|type=="string" and length>0)' .tmp/sprint-25/redhat-fix-11-path.json` → expected: PATH-B: follow_up_task_id present
- **TDD red evidence:** `test -s .tmp/sprint-25/redhat-fix-11-red.log` → expected: non-empty red log
- **Retained oracles:** `rg -n 'chat-assistant-message-latest' .maestro/reactive/exactly-one-final-message.yml && rg -n 'Streaming' .maestro/reactive/exactly-one-final-message.yml` → expected: Exit 0

## Agent Assignment

- **Implementer:** react-native-ui-implementer
- **Rationale:** Owns S-REACTIVE-01 AC-3 e2e surface: components/chat/ChatThread.tsx testID oracles, .maestro/reactive/exactly-one-final-message.yml / reconnect-exactly-once.yml, and optional narrow durable-vs-stream content equality testIDs. F-TEXT-DIFF-ORACLE is an RN/Maestro oracle gap (bubble-count only; no content byte-equal). Reviewer: react-native-ui-reviewer.
- **Reviewer:** react-native-ui-reviewer
- **Proposed by:** react-native-ui-planner

## Coding Standards

- brain/docs/TDD-METHODOLOGY.md
- RULES.md

## Dependencies

- **depends_on:** S-REACTIVE-01, REDHAT-FIX-01
- **blocks:** —

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-11",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-streaming-conversation": {
      "description": "Streaming conversation from holo seed:e2e --reset used by existing Maestro reactive flows; produces a real durable agent chat_messages row after terminal.",
      "seed_method": "public_api",
      "records": [
        "conversation title Streaming",
        "real POST /api/chat-runs + SSE token stream",
        "durable chat_messages row role=agent after terminal",
        "Maestro flows: exactly-one-final-message.yml, reconnect-exactly-once.yml"
      ]
    },
    "content-mismatch-negative-control": {
      "description": "PATH-A negative control: if durable content and rendered bubble text diverge (or equality testID forced to mismatch), Maestro must fail. May be proven via unit/integration of the equality helper plus e2e assertVisible of chat-content-byte-equal on happy path.",
      "seed_method": "cli",
      "records": [
        "happy path renders chat-content-byte-equal (or matching dual hashes)",
        "mismatch path renders chat-content-byte-mismatch or fails assertion",
        "bubble-count oracle alone insufficient"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a completed streaming turn on the seeded Streaming conversation WHEN the thread renders final state THEN PATH-A: Maestro observes an explicit content-equality oracle proving rendered latest assistant text is byte-equal to durable chat_messages.content (e.g. assertVisible id chat-content-byte-equal and notVisible chat-content-byte-mismatch), OR PATH-B: S-REACTIVE-01 AC-3 no longer claims content byte-equal and path.json records follow_up_task_id",
      "verify": "test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-11-path.json && ( jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-11-path.json >/dev/null && maestro test .maestro/reactive/exactly-one-final-message.yml || ( jq -e '.path==\"B\" and (.follow_up_task_id|type==\"string\" and length>0)' .tmp/sprint-25/redhat-fix-11-path.json && rg -n 'content byte-equal|byte-equal' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md | rg -v 'deferred|downgrad|follow-up|PATH-B|historical' | wc -l | awk '{exit ($1>0)?1:0}' ) )",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro + Zero durable chat_messages + ChatThread equality testIDs (PATH-A) OR contract audit (PATH-B)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 bubble-count visibility only still claimed as byte-equal",
            "empty \u2014 no equality testID and AC-3 still says byte-equal",
            "static \u2014 path A claimed without Maestro assertion on equality signal",
            "mock \u2014 UNIQUE_TEXT stub equality treated as Zero durable equality",
            "disconnect \u2014 durable row not written but e2e still green under PATH-A"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-streaming-conversation",
            "action": {
              "actor": "user",
              "steps": [
                "PATH-A: after seed:e2e, run maestro exactly-one-final-message.yml",
                "PATH-A: assert chat-assistant-message-latest visible AND content equality testID visible",
                "PATH-A: assert chat-content-byte-mismatch not visible (or dual hashes equal)",
                "PATH-B: edit S-REACTIVE-01 AC-3 text; write path.json B + follow_up_task_id",
                "Record path A|B in redhat-fix-11-path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "path.json path field equals 'A' or 'B'",
                "PATH-A: Maestro flow exit code == 0 with content equality oracle assertion present in yml",
                "PATH-A: greppable chat-content-byte-equal or dual content-hash testID wiring in ChatThread/chat screen",
                "PATH-A: exactly-one-final-message.yml contains assert on content equality testID (not only bubble-count)",
                "PATH-B: follow_up_task_id non-empty string in path.json",
                "PATH-B: S-REACTIVE-01 AC-3 active claim text does not assert unverified content byte-equal"
              ],
              "must_not_observe": [
                "empty/start signature: AC-3 still claims content byte-equal with only bubble-count oracle",
                "PATH-A yml asserts only chat-assistant-message-latest / bubble-count without equality signal",
                "PATH-B without follow_up_task_id",
                "equality proven only against SSE stub UNIQUE_TEXT without durable row"
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
      "description": "GIVEN PATH-A equality helper/testIDs WHEN durable content and rendered assistant text diverge THEN equality signal fails (chat-content-byte-mismatch visible or unit/integration assertion fails); GIVEN PATH-B WHEN contract audited THEN no greppable live byte-equal claim remains without oracle",
      "verify": "pnpm vitest run tests/integration/redhat-fix-11-content-byte-equal-oracle.test.ts -t 'AC-2' || ( jq -e '.path==\"B\"' .tmp/sprint-25/redhat-fix-11-path.json && rg -n 'content byte-equal' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md | head -20 )",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest equality helper and/or Maestro negative control + contract rg",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 equality helper always returns equal",
            "empty \u2014 no negative control under PATH-A",
            "stub \u2014 PATH-B docs claim equality still verified"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "content-mismatch-negative-control",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PATH-A: unit/integration: equal strings \u2192 equality true / testID equal",
                "PATH-A: unit/integration: 'OneTwoThreeFourFive' vs 'Completely different text' \u2192 equality false",
                "PATH-B: rg AC-3 for residual unverified byte-equal claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: mismatch case returns equal===false or emits mismatch testID id",
                "PATH-A: match case returns equal===true",
                "PATH-B: path.json follow_up_task_id present and AC-3 downgraded"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A mismatch still equal===true",
                "PATH-A only bubble count without string compare",
                "PATH-B AC-3 still primary-claims content byte-equal"
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
      "description": "GIVEN existing bubble-count / latest-message oracles WHEN FIX-11 lands THEN they remain; reconnect-exactly-once still asserts exactly one final bubble; no regression of REDHAT-FIX-01 Streaming seed title oracle",
      "verify": "rg -n 'chat-assistant-message-latest|chat-assistant-bubble-count-1' .maestro/reactive/exactly-one-final-message.yml .maestro/reactive/reconnect-exactly-once.yml && rg -n 'Streaming' .maestro/reactive/exactly-one-final-message.yml",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro reactive flows retained oracles",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 bubble-count oracle deleted",
            "stub \u2014 Streaming seed oracle removed",
            "static \u2014 only docs changed under PATH-A without yml update"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-streaming-conversation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Confirm bubble-count and latest-message asserts remain in yml",
                "Confirm Streaming title oracle remains (REDHAT-FIX-01)",
                "PATH-A: equality assert is additive"
              ]
            },
            "end_state": {
              "must_observe": [
                "exactly-one-final-message.yml match count >= 1 for literal 'chat-assistant-message-latest'",
                "reconnect-exactly-once.yml contains chat-assistant-bubble-count-1 or equivalent count oracle",
                "exactly-one-final-message.yml match count >= 1 for literal 'Streaming'"
              ],
              "must_not_observe": [
                "empty/start signature: bubble-count oracle removed without replacement",
                "Streaming seed oracle deleted"
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
      "description": "GIVEN RED-first discipline WHEN implementer starts THEN redhat-fix-11-red.log documents that current oracles do not compare content to durable row; AFTER fix path.json + (PATH-A yml/testIDs | PATH-B contract edits) prove closure",
      "verify": "test -f .tmp/sprint-25/redhat-fix-11-red.log && test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-11-path.json",
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
            "stub \u2014 green without documenting pre-fix oracle gap",
            "static \u2014 path A without yml content assert"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "content-mismatch-negative-control",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Document pre-fix: Maestro only visibility/bubble-count; integration only UNIQUE_TEXT",
                "Implement PATH-A or PATH-B",
                "Write path.json with finding F-TEXT-DIFF-ORACLE"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-11-red.log size > 0",
                "path.json path equals 'A' or 'B'",
                "path.json field finding equals 'F-TEXT-DIFF-ORACLE' OR match count >= 1 for literal 'F-TEXT-DIFF-ORACLE'",
                "PATH-B implies follow_up_task_id length > 0"
              ],
              "must_not_observe": [
                "empty/start signature: red log missing",
                "path A without any content equality artifact change"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "PATH-A Maestro content equality oracle OR PATH-B honest AC-3 downgrade with follow_up_task_id",
      "verify": "test -f .tmp/sprint-25/redhat-fix-11-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-11-path.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "PATH-A: Maestro exactly-one-final-message includes content equality assert; PATH-B: AC-3 no live byte-equal claim",
      "verify": "python3 -c \"import json,pathlib,re; p=json.loads(pathlib.Path('.tmp/sprint-25/redhat-fix-11-path.json').read_text()); yml=pathlib.Path('.maestro/reactive/exactly-one-final-message.yml').read_text(); ac=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md').read_text();\nassert p['path'] in ('A','B');\n\nif p['path']=='A':\n  assert re.search(r'chat-content-byte-equal|content-hash|byte-equal', yml), 'PATH-A yml missing content equality oracle'\nelse:\n  assert p.get('follow_up_task_id'), 'PATH-B needs follow_up_task_id'\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "PATH-A mismatch negative control (helper/integration) fails equality; PATH-B skip with path B",
      "verify": "pnpm vitest run tests/integration/redhat-fix-11-content-byte-equal-oracle.test.ts -t 'AC-2' || jq -e '.path==\"B\"' .tmp/sprint-25/redhat-fix-11-path.json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Retained bubble-count + Streaming seed oracles",
      "verify": "rg -n 'chat-assistant-message-latest' .maestro/reactive/exactly-one-final-message.yml && rg -n 'Streaming' .maestro/reactive/exactly-one-final-message.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "TDD evidence chain red log + path.json",
      "verify": "test -f .tmp/sprint-25/redhat-fix-11-red.log && test -s .tmp/sprint-25/redhat-fix-11-red.log && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-11-path.json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
