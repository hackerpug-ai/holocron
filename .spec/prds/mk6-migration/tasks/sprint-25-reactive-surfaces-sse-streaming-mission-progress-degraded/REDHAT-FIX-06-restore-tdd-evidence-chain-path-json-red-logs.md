# REDHAT-FIX-06 — Restore the broken TDD evidence chain — commit .tmp/sprint-25/redhat-fix-{01,02}-path.json + RED evidence logs at the TC-5-mandated paths (currently only exist in stale .kb-run-sprint/worktrees/REDHAT-FIX-0{1,2,3}/.tmp/ dirs, or at the wrong path for REDHAT-FIX-02), so TC-5 verify commands pass on a cold checkout
> Status: Backlog
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 45 min
> Type: CHORE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#G-3`

## Outcome

On primary checkout: .tmp/sprint-25/redhat-fix-01-path.json and redhat-fix-02-path.json exist with path A|B (prefer A); RED logs present; FIX-02 test no longer fails existsSync(PATH_JSON) on cold checkout after bootstrap; durable copies under .gate-evidence/tdd/; TC-5 shell verifies exit 0.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#G-3
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md`
- **Why it matters:** Unqualified Sprint 25 gate close is blocked until cycle-2 H3-NOT-CLOSED / G-2 / G-3 are closed.
- **PRD refs:** UC-SYNC-02, T-SYNC-005, T-SYNC-006
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST place redhat-fix-01-path.json and redhat-fix-02-path.json at .tmp/sprint-25/ (exact TC-5 paths) with .path equal to 'A' or 'B' (prefer 'A' matching landed production fixes)
- MUST restore or re-capture RED evidence logs redhat-fix-01-red.log and redhat-fix-02-red.log under .tmp/sprint-25/
- MUST make cold-checkout TC-5 commands pass: either by force-committing the path.json files (git add -f, since .tmp/ is gitignored) OR by ensuring each suite creates them in beforeAll unconditionally (FIX-01 already does; FIX-02 must gain the same beforeAll write of PATH-A when progress.ts writer exists)
- MUST copy/source path content from worktree truth: .kb-run-sprint/worktrees/REDHAT-FIX-01/.tmp/sprint-25/redhat-fix-01-path.json and REDHAT-FIX-02/.tmp/sprint-25/redhat-fix-02-path.json (not from wrong .tmp/REDHAT-FIX-02/path.json alone unless content verified equal)
- MUST leave dual durable copies under .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/ so reviewers can audit without worktrees
- MUST keep path honesty: PATH-A for both H1 and H2 as production code already landed

### NEVER
- NEVER leave path.json only at .tmp/REDHAT-FIX-02/path.json as the sole artifact
- NEVER claim TC-5 pass while primary-checkout .tmp/sprint-25/redhat-fix-0N-path.json is missing
- NEVER change path to 'B' without performing PATH-B product re-scope (disallowed — H1/H2 PATH-A already closed)
- NEVER invent empty red logs (0-byte without RED content) as proof of red_first
- NEVER delete worktree evidence until primary-checkout mandated paths are restored

### STRICTLY
- STRICTLY tdd_mode skipped for this chore — proof is file existence + jq, not a new product feature
- STRICTLY if force-commit of .tmp/ is rejected by policy, implement beforeAll self-seed in FIX-02 test + committed durable copies under .gate-evidence/tdd/ and document that TC-5 must be run after a single test bootstrap OR amend FIX-02 TC-5 to accept either location with identical content
- STRICTLY prefer PATH-A production truth over PATH-B re-scope
- STRICTLY no UI product changes — process/evidence only (SafeArea/touch N/A)

## Specification

**Objective:** Close cycle-2 G-3 by restoring the REDHAT-FIX-01/02 TDD evidence chain at the TC-5-mandated .tmp/sprint-25/ paths (and durable sprint .gate-evidence/tdd/ copies) so a cold checkout can satisfy path.json verify commands without depending on stale worktrees.

**Success state:** On primary checkout: .tmp/sprint-25/redhat-fix-01-path.json and redhat-fix-02-path.json exist with path A|B (prefer A); RED logs present; FIX-02 test no longer fails existsSync(PATH_JSON) on cold checkout after bootstrap; durable copies under .gate-evidence/tdd/; TC-5 shell verifies exit 0.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** cold-checkout-tdd-evidence-chain, redhat-fix-path-json-at-tc5-paths
- **Consumes:** honest-streaming-seed-oracle, research-iteration-writer
- **Boundary contracts:**
- TC-5 FIX-01 path check: test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-01-path.json
- TC-5 FIX-02 path check: test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json
- Wrong path .tmp/REDHAT-FIX-02/path.json is NOT a substitute for .tmp/sprint-25/redhat-fix-02-path.json
- .tmp/ is gitignored — either git add -f the mandated files OR dual-write committed copies under sprint .gate-evidence/tdd/ AND ensure tests/beforeAll regenerate .tmp copies so cold-checkout TC-5 still passes after test run
- PATH-A preferred: path field must remain 'A' (H1/H2 production truth already landed) — do not silently flip to B
- RED logs: .tmp/sprint-25/redhat-fix-01-red.log and redhat-fix-02-red.log restored from worktrees or re-captured
- path.json: { "path": "A" | "B" } required. Landed truth for both FIX-01 and FIX-02 is A. Location: .tmp/sprint-25/redhat-fix-0N-path.json.
- RED logs: Non-empty .tmp/sprint-25/redhat-fix-0N-red.log capturing pre-fix failing suite (or recorded red baseline).
- product freeze: No edits to seed-e2e.ts, research/progress.ts, chat-runs.ts for G-3.

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **Description:** GIVEN a primary checkout without relying on .kb-run-sprint/worktrees WHEN TC-5 path checks for REDHAT-FIX-01 and REDHAT-FIX-02 run THEN both .tmp/sprint-25/redhat-fix-0N-path.json files exist and jq accepts path A or B (prefer A)
- **Test tier:** `integration` · **Verification service:** `filesystem + jq TC-5 commands on primary checkout` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-01-path.json && test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — files only in worktrees (current G-3), stub — wrong path .tmp/REDHAT-FIX-02/path.json only, disconnect — path field missing or not A|B, static — path.json never written on cold checkout
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `tc5-mandated-paths`: actor `cli_user`
    - **Steps:**
    - Copy or regenerate path.json files into .tmp/sprint-25/
    - Prefer path A content from worktree PATH-A records
    - Run both TC-5 shell verifies
    - **MUST observe:**
    - `.tmp/sprint-25/redhat-fix-01-path.json exists and file size > 0`
    - `.tmp/sprint-25/redhat-fix-02-path.json exists and file size > 0`
    - `jq path field equals 'A' or path field equals 'B' for both (prefer path == 'A')`
    - `FIX-02 path is NOT only at .tmp/REDHAT-FIX-02/path.json (mandated path file size > 0)`
    - **MUST NOT observe:**
    - `empty/start signature: test -f fails on primary checkout (path.json missing, size == 0)`
    - `path.json only under worktrees (primary path empty)`
    - `path field equals null or empty string ''`

### AC-2: AC-2
- **Description:** GIVEN RED evidence was captured only in worktrees WHEN this task completes THEN .tmp/sprint-25/redhat-fix-01-red.log and redhat-fix-02-red.log exist and are non-empty on primary checkout (copied from worktrees or re-captured)
- **Test tier:** `integration` · **Verification service:** `filesystem RED log presence`
- **Verify:** `test -s .tmp/sprint-25/redhat-fix-01-red.log && test -s .tmp/sprint-25/redhat-fix-02-red.log`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — red logs only in worktrees, stub — 0-byte files, static — files not created on primary checkout, mock — invented empty red logs as red_first proof
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `worktree-tdd-evidence`: actor `cli_user`
    - **Steps:**
    - Copy redhat-fix-01-red.log and redhat-fix-02-red.log from worktrees into .tmp/sprint-25/
    - Or re-run historical RED captures if worktrees gone
    - Verify non-empty size
    - **MUST observe:**
    - `redhat-fix-01-red.log size > 0`
    - `redhat-fix-02-red.log size > 0`
    - **MUST NOT observe:**
    - `empty/start signature: only worktree paths hold red logs (primary size == 0)`
    - `0-byte placeholders (size == 0)`

### AC-3: AC-3
- **Description:** GIVEN FIX-02 test currently fails existsSync(PATH_JSON) on cold checkout WHEN suite is updated THEN beforeAll (or equivalent) writes .tmp/sprint-25/redhat-fix-02-path.json with path A when production writer exists — matching FIX-01 self-seed behavior — so subsequent TC-5 and suite asserts pass without manual copy
- **Test tier:** `integration` · **Verification service:** `vitest FIX-02 suite bootstrap + path.json self-seed`
- **Verify:** `pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'path.json' ; test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — beforeAll still does not create path.json, stub — only writes under .tmp/REDHAT-FIX-02/path.json, static — PLATFORM_IT-only write leaves non-live path check failing forever, mock — path.json self-seed skipped when progress.ts writer greppable
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `tc5-mandated-paths`: actor `cli_user`
    - **Steps:**
    - Update redhat-fix-02-research-iteration-writer.test.ts beforeAll to ensure PATH_JSON at .tmp/sprint-25/redhat-fix-02-path.json when PATH-A writer greppable
    - Run path.json unit/bootstrap test without requiring worktrees
    - Confirm FIX-01 still self-seeds redhat-fix-01-path.json
    - **MUST observe:**
    - `FIX-02 beforeAll or dedicated unit test creates .tmp/sprint-25/redhat-fix-02-path.json with file size > 0`
    - `path field equals 'A' when progress.ts writer present`
    - `existsSync(PATH_JSON) == true on cold checkout after suite bootstrap`
    - **MUST NOT observe:**
    - `empty/start signature: path.json only after PLATFORM_IT live AC-1 and only if that path was taken (mandated path size == 0 before live)`
    - `wrong-path-only artifact at .tmp/REDHAT-FIX-02/path.json with mandated path empty`

### AC-4: AC-4
- **Description:** GIVEN .tmp/ is gitignored WHEN durability is required for cold checkout without running tests THEN durable copies exist under sprint .gate-evidence/tdd/ (committed) and a documented bootstrap (script or test beforeAll) copies them to .tmp/sprint-25/, OR path.json files are force-added with git add -f and present after clone
- **Test tier:** `integration` · **Verification service:** `git-tracked durable evidence OR force-added path.json + cold-checkout simulation`
- **Verify:** `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && jq -e '.path=="A" or .path=="B"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — only gitignored .tmp holds artifacts with no durable copy and no self-seed, stub — durable copies empty/wrong path, static — worktree-only evidence, mock — durable path.json content not matching mandated path
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `worktree-tdd-evidence`: actor `cli_user`
    - **Steps:**
    - Write durable copies under .gate-evidence/tdd/
    - Ensure .tmp/sprint-25/ copies exist for TC-5
    - Document force-add or bootstrap strategy in task notes / SPRINT if needed
    - **MUST observe:**
    - `durable .gate-evidence/tdd/redhat-fix-01-path.json exists and file size > 0`
    - `durable .gate-evidence/tdd/redhat-fix-02-path.json exists and file size > 0`
    - `TC-5-mandated .tmp paths still satisfied (file size > 0 for both)`
    - `path field equals 'A' for both durable copies (prefer A)`
    - **MUST NOT observe:**
    - `empty/start signature: no durable and no .tmp files (all sizes == 0)`
    - `evidence only under .kb-run-sprint/worktrees/ (primary durable empty)`

## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Both TC-5 path.json files exist under .tmp/sprint-25 with path A\|B | AC-1 | `test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-01-path.json && test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json` |
| TC-2 | RED logs non-empty for FIX-01 and FIX-02 under .tmp/sprint-25 | AC-2 | `test -s .tmp/sprint-25/redhat-fix-01-red.log && test -s .tmp/sprint-25/redhat-fix-02-red.log` |
| TC-3 | FIX-02 suite bootstrap creates path.json at mandated path (prefer path A) | AC-3 | `pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'path.json' ; test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json` |
| TC-4 | Durable committed copies exist under sprint .gate-evidence/tdd/ | AC-4 | `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && jq -e '.path=="A" or .path=="B"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json` |
| TC-5 | Prefer PATH-A content for both files (H1/H2 production truth) | AC-1 | `jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-02-path.json` |

## Reading List

- .spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md — G-3 (lines 36-39, 133)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-01-fix-fictional-streaming-seed-conversation.md — path.json TC / not committed note
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-02-research-sessions-current-iteration-writer-or-rescope.md — TC-5 path.json command
- tests/integration/redhat-fix-01-streaming-seed.test.ts:28,123-127 — PATH_JSON self-seed pattern
- services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts:27-29,193-196,326-329,379 — PATH_JSON asserts; missing beforeAll write
- .kb-run-sprint/worktrees/REDHAT-FIX-01/.tmp/sprint-25/ — source evidence
- .kb-run-sprint/worktrees/REDHAT-FIX-02/.tmp/sprint-25/ — source evidence
- .gitignore — .tmp/ gitignore implication for commit strategy

## Guardrails

### WRITE-ALLOWED
- .tmp/sprint-25/redhat-fix-01-path.json (RESTORE)
- .tmp/sprint-25/redhat-fix-02-path.json (RESTORE)
- .tmp/sprint-25/redhat-fix-01-red.log (RESTORE)
- .tmp/sprint-25/redhat-fix-02-red.log (RESTORE)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/** (NEW durable copies)
- services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts (MODIFY — beforeAll self-seed path.json at mandated path)
- tests/integration/redhat-fix-01-streaming-seed.test.ts (MODIFY only if dual-write to .gate-evidence/tdd needed)
- .gitignore (MODIFY only if team decides to un-ignore .tmp/sprint-25/redhat-fix-*-path.json — prefer durable .gate-evidence + self-seed over broad .tmp un-ignore)

### WRITE-PROHIBITED
- services/platform/src/research/progress.ts — H2 production writer already closed; do not re-open
- services/platform/src/db/seed-e2e.ts — H1 closed
- hooks/use-resumable-sse-stream.ts — H3 is REDHAT-FIX-04
- Flipping path to B without PATH-B product re-scope
- Leaving only .tmp/REDHAT-FIX-02/path.json as the FIX-02 artifact
- services/platform/src/db/seed-e2e.ts
- services/platform/src/research/progress.ts
- services/platform/src/http/chat-runs.ts

## Design

- **References:** `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#G-3`, `REDHAT-FIX-01 path self-seed pattern`, `REDHAT-FIX-02 TC-5 verify command`, `.gitignore .tmp/`, `.kb-run-sprint/worktrees/REDHAT-FIX-01/.tmp/sprint-25/redhat-fix-01-path.json`, `.kb-run-sprint/worktrees/REDHAT-FIX-02/.tmp/sprint-25/redhat-fix-02-path.json`, `.tmp/REDHAT-FIX-02/path.json (WRONG path — migrate)`, `REDHAT-FIX-01/02 TC-5 verify commands`
- **Pattern:** Restore TC-5-mandated path.json + RED logs at .tmp/sprint-25/; dual durable copies under sprint .gate-evidence/tdd/; FIX-02 self-seed parity with FIX-01
- **Pattern source:** red-hat cycle-2 G-3 fix recommendation (line 39, 133)
- **Anti-pattern:** Wrong-path-only .tmp/REDHAT-FIX-02/path.json; worktree-only evidence; 0-byte red logs; silent PATH-B flip
- **Interaction notes:**
- Recommended procedure: mkdir -p .tmp/sprint-25 and .gate-evidence/tdd; cp from worktrees; git add durable .gate-evidence/tdd/*; git add -f .tmp/sprint-25/redhat-fix-0{1,2}-path.json if policy allows; patch FIX-02 beforeAll to write PATH_JSON when missing
- Can run in parallel with REDHAT-FIX-04/05 for artifact restore; FIX-05 gate re-run does not depend on path.json for Maestro, but process completeness does
- No mobile UI changes
- Evidence durability only: restore path.json + RED logs; do not re-implement seed or research writer (H1/H2 closed).
- path.json schema: required key path with enum A|B. Minimal {"path":"A"} satisfies TC-5. Optional agent/productionCallSites ok if present but worktree-absolute paths should be normalized or stripped.
- Canonical dir: .tmp/sprint-25/ — NOT .tmp/REDHAT-FIX-0N/, NOT only worktrees.
- RED logs prove red_first happened; empty files fail integrity.
- Optional self-heal: beforeAll writes path.json (FIX-01 already does; FIX-02 does not) — still place durable files for standalone test -f.

## Agent Assignment

- **Agent:** `react-native-ui-implementer`
- **Rationale:** Owns restoring contract-mandated TDD artifacts for REDHAT-FIX-01/02 (and ensuring FIX-02 path.json self-seeding parity with FIX-01). Path artifacts are process evidence under .tmp/sprint-25/ required by TC-5 cold-checkout verify. Reviewer: react-native-ui-reviewer (process + path honesty); mastra-reviewer optional dual-lens on FIX-02 path A content.
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
| TC-5 path.json both tasks | `test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-01-path.json && test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json` | Exit 0 |
| RED logs present | `test -s .tmp/sprint-25/redhat-fix-01-red.log && test -s .tmp/sprint-25/redhat-fix-02-red.log` | Exit 0 |
| Durable copies | `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json` | Exit 0 |
| Prefer PATH-A | `jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-02-path.json` | Exit 0 |

## Dependencies

- **depends_on:** REDHAT-FIX-01, REDHAT-FIX-02
- **blocks:** —

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
  "task_id": "REDHAT-FIX-06",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "worktree-tdd-evidence": {
      "description": "Source-of-truth artifacts currently only in stale worktrees",
      "seed_method": "cli",
      "records": [
        ".kb-run-sprint/worktrees/REDHAT-FIX-01/.tmp/sprint-25/redhat-fix-01-path.json \u2192 {\"path\":\"A\"}",
        ".kb-run-sprint/worktrees/REDHAT-FIX-01/.tmp/sprint-25/redhat-fix-01-red.log",
        ".kb-run-sprint/worktrees/REDHAT-FIX-02/.tmp/sprint-25/redhat-fix-02-path.json \u2192 path A + productionCallSites",
        ".kb-run-sprint/worktrees/REDHAT-FIX-02/.tmp/sprint-25/redhat-fix-02-red.log",
        "wrong-path alternate: .tmp/REDHAT-FIX-02/path.json (must not be the only location)"
      ]
    },
    "tc5-mandated-paths": {
      "description": "Contract-mandated primary-checkout locations",
      "seed_method": "cli",
      "records": [
        ".tmp/sprint-25/redhat-fix-01-path.json",
        ".tmp/sprint-25/redhat-fix-02-path.json",
        "jq '.path==\"A\" or .path==\"B\"' must succeed"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a primary checkout without relying on .kb-run-sprint/worktrees WHEN TC-5 path checks for REDHAT-FIX-01 and REDHAT-FIX-02 run THEN both .tmp/sprint-25/redhat-fix-0N-path.json files exist and jq accepts path A or B (prefer A)",
      "verify": "test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-01-path.json && test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-02-path.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + jq TC-5 commands on primary checkout",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 files only in worktrees (current G-3)",
            "stub \u2014 wrong path .tmp/REDHAT-FIX-02/path.json only",
            "disconnect \u2014 path field missing or not A|B",
            "static \u2014 path.json never written on cold checkout"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tc5-mandated-paths",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Copy or regenerate path.json files into .tmp/sprint-25/",
                "Prefer path A content from worktree PATH-A records",
                "Run both TC-5 shell verifies"
              ]
            },
            "end_state": {
              "must_observe": [
                ".tmp/sprint-25/redhat-fix-01-path.json exists and file size > 0",
                ".tmp/sprint-25/redhat-fix-02-path.json exists and file size > 0",
                "jq path field equals 'A' or path field equals 'B' for both (prefer path == 'A')",
                "FIX-02 path is NOT only at .tmp/REDHAT-FIX-02/path.json (mandated path file size > 0)"
              ],
              "must_not_observe": [
                "empty/start signature: test -f fails on primary checkout (path.json missing, size == 0)",
                "path.json only under worktrees (primary path empty)",
                "path field equals null or empty string ''"
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
      "primary": false,
      "description": "GIVEN RED evidence was captured only in worktrees WHEN this task completes THEN .tmp/sprint-25/redhat-fix-01-red.log and redhat-fix-02-red.log exist and are non-empty on primary checkout (copied from worktrees or re-captured)",
      "verify": "test -s .tmp/sprint-25/redhat-fix-01-red.log && test -s .tmp/sprint-25/redhat-fix-02-red.log",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem RED log presence",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 red logs only in worktrees",
            "stub \u2014 0-byte files",
            "static \u2014 files not created on primary checkout",
            "mock \u2014 invented empty red logs as red_first proof"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "worktree-tdd-evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Copy redhat-fix-01-red.log and redhat-fix-02-red.log from worktrees into .tmp/sprint-25/",
                "Or re-run historical RED captures if worktrees gone",
                "Verify non-empty size"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-01-red.log size > 0",
                "redhat-fix-02-red.log size > 0"
              ],
              "must_not_observe": [
                "empty/start signature: only worktree paths hold red logs (primary size == 0)",
                "0-byte placeholders (size == 0)"
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
      "description": "GIVEN FIX-02 test currently fails existsSync(PATH_JSON) on cold checkout WHEN suite is updated THEN beforeAll (or equivalent) writes .tmp/sprint-25/redhat-fix-02-path.json with path A when production writer exists \u2014 matching FIX-01 self-seed behavior \u2014 so subsequent TC-5 and suite asserts pass without manual copy",
      "verify": "pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'path.json' ; test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-02-path.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest FIX-02 suite bootstrap + path.json self-seed",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 beforeAll still does not create path.json",
            "stub \u2014 only writes under .tmp/REDHAT-FIX-02/path.json",
            "static \u2014 PLATFORM_IT-only write leaves non-live path check failing forever",
            "mock \u2014 path.json self-seed skipped when progress.ts writer greppable"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tc5-mandated-paths",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Update redhat-fix-02-research-iteration-writer.test.ts beforeAll to ensure PATH_JSON at .tmp/sprint-25/redhat-fix-02-path.json when PATH-A writer greppable",
                "Run path.json unit/bootstrap test without requiring worktrees",
                "Confirm FIX-01 still self-seeds redhat-fix-01-path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "FIX-02 beforeAll or dedicated unit test creates .tmp/sprint-25/redhat-fix-02-path.json with file size > 0",
                "path field equals 'A' when progress.ts writer present",
                "existsSync(PATH_JSON) == true on cold checkout after suite bootstrap"
              ],
              "must_not_observe": [
                "empty/start signature: path.json only after PLATFORM_IT live AC-1 and only if that path was taken (mandated path size == 0 before live)",
                "wrong-path-only artifact at .tmp/REDHAT-FIX-02/path.json with mandated path empty"
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
      "description": "GIVEN .tmp/ is gitignored WHEN durability is required for cold checkout without running tests THEN durable copies exist under sprint .gate-evidence/tdd/ (committed) and a documented bootstrap (script or test beforeAll) copies them to .tmp/sprint-25/, OR path.json files are force-added with git add -f and present after clone",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && jq -e '.path==\"A\" or .path==\"B\"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git-tracked durable evidence OR force-added path.json + cold-checkout simulation",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 only gitignored .tmp holds artifacts with no durable copy and no self-seed",
            "stub \u2014 durable copies empty/wrong path",
            "static \u2014 worktree-only evidence",
            "mock \u2014 durable path.json content not matching mandated path"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "worktree-tdd-evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Write durable copies under .gate-evidence/tdd/",
                "Ensure .tmp/sprint-25/ copies exist for TC-5",
                "Document force-add or bootstrap strategy in task notes / SPRINT if needed"
              ]
            },
            "end_state": {
              "must_observe": [
                "durable .gate-evidence/tdd/redhat-fix-01-path.json exists and file size > 0",
                "durable .gate-evidence/tdd/redhat-fix-02-path.json exists and file size > 0",
                "TC-5-mandated .tmp paths still satisfied (file size > 0 for both)",
                "path field equals 'A' for both durable copies (prefer A)"
              ],
              "must_not_observe": [
                "empty/start signature: no durable and no .tmp files (all sizes == 0)",
                "evidence only under .kb-run-sprint/worktrees/ (primary durable empty)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Both TC-5 path.json files exist under .tmp/sprint-25 with path A|B",
      "verify": "test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-01-path.json && test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-02-path.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "RED logs non-empty for FIX-01 and FIX-02 under .tmp/sprint-25",
      "verify": "test -s .tmp/sprint-25/redhat-fix-01-red.log && test -s .tmp/sprint-25/redhat-fix-02-red.log",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "FIX-02 suite bootstrap creates path.json at mandated path (prefer path A)",
      "verify": "pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'path.json' ; test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-02-path.json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Durable committed copies exist under sprint .gate-evidence/tdd/",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-01-path.json && jq -e '.path==\"A\" or .path==\"B\"' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/tdd/redhat-fix-02-path.json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Prefer PATH-A content for both files (H1/H2 production truth)",
      "verify": "jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-01-path.json && jq -e '.path==\"A\"' .tmp/sprint-25/redhat-fix-02-path.json",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
