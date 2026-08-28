# FUL-PLAT-009 — Commit the cycle atomically and replay safely

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** F
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Make one Fulcrum cycle's effects land in the evidence graph exactly once and atomically, so a killed process, a re-dispatch, or an exhausted budget each produce an explicit, non-partial outcome.

## Why

A completed cycle leaves one mission_runs row plus its sources, claims, belief_scores and lineage relations written together; a second run under the same idempotency key returns replay=true with the identical runId, candidateId and dossierPath and leaves the mission_runs count for that key at 1; a SIGKILL between assay and commit leaves zero candidate-side rows.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus):

```
PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "AC-1"
```

Full gate set: 5 acceptance criteria, 6 test criteria, 5 verification gates.

## Scope

- services/platform/src/mission/fulcrum/commit.ts (NEW)
- services/platform/src/mission/fulcrum/replay.ts (NEW)
- services/platform/src/mission/runtime.ts (MODIFY)
- services/platform/src/mission/repository.ts (MODIFY)
- services/platform/src/mission/registry.ts (MODIFY)
- services/platform/tests/integration/fulcrum-commit-replay.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-009 - Commit the cycle atomically and replay safely
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave F)
PROPOSED_BY:mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

A completed cycle leaves one mission_runs row plus its sources, claims, belief_scores and lineage relations written together; a second run under the same idempotency key returns replay=true with the identical runId, candidateId and dossierPath and leaves the mission_runs count for that key at 1; a SIGKILL between assay and commit leaves zero candidate-side rows.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: Wrap every candidate-side write of the commit stage in ONE Postgres transaction opened at the commit stage and closed once.
- MUST: Return the stored commit payload (runId, candidateId, dossierPath) on replay rather than re-executing the cycle.
- MUST: Write an explicit mission_runs row with a structured reason for every failed and budget_exceeded cycle.
- NEVER: Never write a candidates, claims, belief_scores or relations row outside the commit transaction.
- NEVER: Never treat a same-key re-dispatch with different args as a replay — refuse it instead.
- NEVER: Never delete or update an append-only row to make a replay look clean.
- NEVER: Never simulate the crash: the all-or-nothing test kills the real running process.
- STRICTLY: No advisory-lock-free double commit path; the lease columns on mission_runs are the only concurrency control.
- STRICTLY: No mocked Postgres and no transaction wrapper that swallows a rollback.

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-COMMIT-01
provides:             single-transaction cycle commit appending sources, claims, belief_scores, lineage relations and the mission_runs row, replay contract on (template_key, idempotency_key) returning the stored commit with replay=true and identical runId, candidateId and dossierPath, explicit non-partial outcome rows for failed and budget_exceeded cycles
consumes:             fulcrum-typed-stage-graph (FUL-PLAT-008), append-only Fulcrum ledger contract (FUL-PLAT-001), deterministic belief score (FUL-PLAT-004)
boundary_contracts:
  - All cycle effects land in one Postgres transaction — a killed process leaves either every row or none across sources, claims, belief_scores, relations and mission_runs
  - mission_runs is unique on (template_key, idempotency_key); a re-dispatch under the same key returns the stored commit rather than producing a second one
  - A replayed run returns the same runId, candidateId and dossierPath as the original and reports replay=true
  - A failed or budget_exceeded cycle writes an explicit mission_runs row and zero candidate-side effects — never a silent non-run

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): One cycle commits every effect in a single transaction
- [ ] AC-2: Same idempotency key replays the stored commit
- [ ] AC-3: A killed cycle leaves zero partial rows
- [ ] AC-4: A budget-exceeded cycle writes an explicit run row and no candidate effects
- [ ] AC-5: Same key with different args is refused, not replayed
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: One cycle commits every effect in a single transaction [PRIMARY]
  GIVEN: mission dev-revenue is seeded and no run exists for the idempotency key
  WHEN:  one Fulcrum cycle runs to completion against real Postgres
  THEN:  the sources, claims, belief_scores, lineage relations and mission_runs rows for that run all exist together

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus
  FLOW_REF:             CAP-COMMIT-01 hop: commit stage -> one Postgres transaction appending sources/claims/belief_scores/lineage + mission_runs
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "AC-1"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus
    NEGATIVE_CONTROL: would fail if the commit stage writes each table in its own transaction so a mid-write failure leaves partial rows; the commit is a no-op that returns a runId without persisting a candidate; the belief score is hardcoded rather than read from the gate stage output; Postgres is disconnected and the run still reports completed
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fulcrum_ready_to_commit
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json`
        STEP:      query sources, claims, belief_scores, relations and mission_runs for the returned runId
        MUST_OBSERVE:     1 mission_runs row with `status` = `completed`
        MUST_OBSERVE:     1 candidates row carrying the returned `candidateId`
        MUST_OBSERVE:     1 belief_scores row whose `run_id` equals the returned runId
        MUST_OBSERVE:     at least 1 claims row bound to a sources row through claim_evidence_bindings
        MUST_OBSERVE:     at least 1 relations row carrying the candidate lineage for the run
        MUST_NOT_OBSERVE: 0 belief_scores rows for the run
        MUST_NOT_OBSERVE: a claims row with no bound source
        MUST_NOT_OBSERVE: a candidates row with an empty `current_score_id`

AC-2: Same idempotency key replays the stored commit
  GIVEN: one Fulcrum cycle has already committed under idempotency key fulcrum-human-gate-01
  WHEN:  the same command runs a second time with the same key
  THEN:  the response reports replay true with the identical runId, candidateId and dossierPath and the run count for that key stays at one

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + real holo CLI subprocess
  FLOW_REF:             CAP-COMMIT-01 boundary contract: mission_runs unique on (template_key, idempotency_key), replay returns the stored commit
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "AC-2"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + real holo CLI subprocess
    NEGATIVE_CONTROL: would fail if the unique constraint is absent and the second dispatch writes a second run row; replay is hardcoded to false so the second response is indistinguishable from a fresh run; the replay path re-executes the cycle and returns a different candidateId; the stored dossierPath is empty on the replayed response
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: fulcrum_one_committed_run
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json` a second time
        STEP:      compare the second JSON response with the first and count mission_runs rows for that key
        MUST_OBSERVE:     the second response contains `"replay":true`
        MUST_OBSERVE:     the second `runId` equals the first `runId`
        MUST_OBSERVE:     the second `candidateId` equals the first `candidateId`
        MUST_OBSERVE:     the second `dossierPath` equals the first `dossierPath`
        MUST_OBSERVE:     1 mission_runs row for `evidence-research` + `fulcrum-human-gate-01`
        MUST_NOT_OBSERVE: `"replay":false` on the second response
        MUST_NOT_OBSERVE: 2 mission_runs rows for that key
        MUST_NOT_OBSERVE: an empty `candidateId` on the second response

AC-3: A killed cycle leaves zero partial rows
  GIVEN: a Fulcrum cycle is running and its assay stage row has appeared
  WHEN:  the platform process is killed with SIGKILL before the commit stage row appears
  THEN:  zero candidates, belief_scores and lineage relations rows exist for that run

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + a real platform child process killed with SIGKILL
  FLOW_REF:             CAP-COMMIT-01 failure mode: process killed mid-cycle — the transaction either commits or does not
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "AC-3"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + a real platform child process killed with SIGKILL
    NEGATIVE_CONTROL: would fail if the commit writes candidate rows before the gate result is known so a kill leaves them behind; the kill is simulated by returning early instead of terminating the real process; the run row is absent after the kill so nothing records that a cycle was attempted; an autocommit connection is used and each statement persists independently
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fulcrum_cycle_killed_before_commit
        ACTOR:     cli_user
        STEP:      launch `holo fulcrum '<goal>' --idempotency-key fulcrum-kill-01 --fresh --json` as a real child process
        STEP:      poll mission_stage_runs until the `assay` row appears, then send SIGKILL to that process
        STEP:      reopen Postgres and query candidates, belief_scores and relations for the run
        MUST_OBSERVE:     0 candidates rows for the killed run
        MUST_OBSERVE:     0 belief_scores rows for the killed run
        MUST_OBSERVE:     0 relations rows for the killed run
        MUST_OBSERVE:     1 mission_runs row for `fulcrum-kill-01` whose `lease_expires_at` is set
        MUST_NOT_OBSERVE: 1 candidates row for the killed run
        MUST_NOT_OBSERVE: a belief_scores row for the killed run
        MUST_NOT_OBSERVE: 0 mission_runs rows for `fulcrum-kill-01`
      - START_REF: fulcrum_ready_to_commit
        ACTOR:     cli_user
        STEP:      run `holo fulcrum '<goal>' --idempotency-key fulcrum-human-gate-01 --json` to completion without a kill
        STEP:      query candidates and belief_scores for the run
        MUST_OBSERVE:     1 candidates row for the run
        MUST_OBSERVE:     1 belief_scores row for the run
        MUST_OBSERVE:     `mission_runs.status` = `completed`
        MUST_NOT_OBSERVE: 0 candidates rows for the run
        MUST_NOT_OBSERVE: a partial run with claims but no belief_scores row

AC-4: A budget-exceeded cycle writes an explicit run row and no candidate effects
  GIVEN: a cycle is launched under a 0.000001 USD cost cap
  WHEN:  the cap is hit before the commit stage
  THEN:  one mission_runs row with status budget_exceeded exists and zero candidates and belief_scores rows exist for that run

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + live image-local LiteLLM router
  FLOW_REF:             CAP-COMMIT-01 boundary contract: a budget_exceeded cycle still writes an explicit run row
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "AC-4"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the budget path returns early and the run row is absent — a silent non-run; the budget check is a no-op so the cycle commits a candidate under a micro cap; a candidates row is written before the cap check and left behind
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: fulcrum_ready_to_commit
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json`
        STEP:      query mission_runs, candidates and belief_scores for the returned runId
        MUST_OBSERVE:     the JSON response contains `"status":"budget_exceeded"`
        MUST_OBSERVE:     1 mission_runs row with `status` = `budget_exceeded`
        MUST_OBSERVE:     the run row carries a structured breach reason naming metric `cost` with limit `0.000001`
        MUST_NOT_OBSERVE: a `candidateId` key in the JSON response
        MUST_NOT_OBSERVE: a `dossierPath` key in the JSON response
        MUST_NOT_OBSERVE: 0 mission_runs rows for the run
        MUST_NOT_OBSERVE: 1 candidates row for the run

AC-5: Same key with different args is refused, not replayed
  GIVEN: one cycle has committed under idempotency key fulcrum-human-gate-01 for a given goal
  WHEN:  the same key is dispatched with a different goal
  THEN:  the dispatch is refused with a named args-mismatch error and no second run row is written

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + real holo CLI subprocess
  FLOW_REF:             CAP-COMMIT-01 failure mode: double-run collapses to one commit only when the request is identical
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "AC-5"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + real holo CLI subprocess
    NEGATIVE_CONTROL: would fail if the args comparison is removed so a different goal silently replays the stored commit; the mismatch path is a no-op that returns the stored commit anyway; a second run row is written for the same key
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: fulcrum_one_committed_run
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'A completely different goal about warehouse robotics' --idempotency-key fulcrum-human-gate-01 --json`
        STEP:      count mission_runs rows for `evidence-research` + `fulcrum-human-gate-01`
        MUST_OBSERVE:     the response carries an `errorCode` naming an idempotency args mismatch
        MUST_OBSERVE:     the error message contains `persisted args differ from this request`
        MUST_OBSERVE:     1 mission_runs row for that key
        MUST_NOT_OBSERVE: 2 mission_runs rows for that key
        MUST_NOT_OBSERVE: `"replay":true` on the mismatched response
        MUST_NOT_OBSERVE: an empty `errorCode`

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "TC-1"` |
| TC-2 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "TC-2"` |
| TC-3 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "TC-3"` |
| TC-4 |  | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "TC-4"` |
| TC-5 |  | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "TC-5"` |
| TC-6 |  | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t "TC-6"` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mission/fulcrum/commit.ts (NEW)
- services/platform/src/mission/fulcrum/replay.ts (NEW)
- services/platform/src/mission/runtime.ts (MODIFY)
- services/platform/src/mission/repository.ts (MODIFY)
- services/platform/src/mission/registry.ts (MODIFY)
- services/platform/tests/integration/fulcrum-commit-replay.test.ts (NEW)

writeProhibited:
- services/platform/src/db/schema/** — the append-only tables and triggers are owned by FUL-PLAT-001
- services/platform/src/research/** — gate and score modules are owned by FUL-PLAT-002 / FUL-PLAT-004
- services/platform/src/inference/** and services/platform/src/fleet/** — owned by FUL-PLAT-007
- services/platform/src/cli/holo.ts — owned by FUL-PLAT-012
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/mission/document-publish.ts:60-128 (ON CONFLICT DO NOTHING + read-back) and services/platform/src/mission/runtime.ts:2919-2945 (args-mismatch refusal)

Insert-on-conflict-then-read-back for the idempotent row, wrapped in a single transaction for the multi-table append. The existing publishDocumentForRun is the canonical shape for the conflict/read-back half.

ANTI-PATTERN: Writing each table on its own connection, or catching the transaction error and reporting completed — both turn a crash into silent partial state.

References:
- .spec/prds/fulcrum/09-technical-requirements/08-capability-chains.md#CAP-COMMIT-01 — real-service proof: SIGKILL between ASSAY and COMMIT, assert all-or-nothing
- .spec/prds/fulcrum/09-technical-requirements/03-data-schema.md#invariants-postgres-enforced — append-only triggers and the (template_key, idempotency_key) uniqueness

Notes:
- T
- h
- e
-  
- c
- o
- m
- m
- i
- t
-  
- s
- t
- a
- g
- e
-  
- o
- p
- e
- n
- s
-  
- o
- n
- e
-  
- t
- r
- a
- n
- s
- a
- c
- t
- i
- o
- n
- ,
-  
- w
- r
- i
- t
- e
- s
-  
- s
- o
- u
- r
- c
- e
- s
- /
- c
- l
- a
- i
- m
- s
- /
- c
- l
- a
- i
- m
- _
- e
- v
- i
- d
- e
- n
- c
- e
- _
- b
- i
- n
- d
- i
- n
- g
- s
- /
- b
- e
- l
- i
- e
- f
- _
- s
- c
- o
- r
- e
- s
- /
- r
- e
- l
- a
- t
- i
- o
- n
- s
- /
- c
- a
- n
- d
- i
- d
- a
- t
- e
- s
- ,
-  
- u
- p
- d
- a
- t
- e
- s
-  
- t
- h
- e
-  
- m
- i
- s
- s
- i
- o
- n
- _
- r
- u
- n
- s
-  
- r
- o
- w
- ,
-  
- a
- n
- d
-  
- c
- o
- m
- m
- i
- t
- s
-  
- o
- n
- c
- e
- .
-  
- T
- h
- e
-  
- d
- o
- s
- s
- i
- e
- r
-  
- p
- a
- t
- h
-  
- i
- s
-  
- c
- o
- m
- p
- u
- t
- e
- d
-  
- i
- n
- s
- i
- d
- e
-  
- t
- h
- e
-  
- t
- r
- a
- n
- s
- a
- c
- t
- i
- o
- n
-  
- s
- o
-  
- a
-  
- r
- e
- p
- l
- a
- y
-  
- c
- a
- n
-  
- r
- e
- t
- u
- r
- n
-  
- i
- t
-  
- w
- i
- t
- h
- o
- u
- t
-  
- r
- e
- -
- r
- e
- n
- d
- e
- r
- i
- n
- g
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/mission/runtime.ts
   - Lines: 2760-2950
   - Focus: [PRIMARY PATTERN] selectMissionRunByTemplateAndIdempotency + the terminal-replay read path and the canonical-JSON args comparison that raises 'persisted args differ from this request'
2. services/platform/src/mission/runtime.ts
   - Lines: 4095-4310
   - Focus: Lease acquisition, replayRun resolution and the created/replay branches that decide whether a dispatch executes or returns the stored commit
3. services/platform/src/mission/document-publish.ts
   - Lines: 36-100
   - Focus: The INSERT … ON CONFLICT DO NOTHING / read-back idempotency shape this commit reuses for the candidate write
4. services/platform/src/mission/repository.ts
   - Lines: 1-120
   - Focus: Transaction helpers and the Sql/TransactionSql executor type the commit stage must thread through every write
5. services/platform/tests/integration/queue-exactly-once.test.ts
   - Lines: 1-90
   - Focus: Existing exactly-once integration pattern against real Postgres — row-count assertions after a repeated dispatch

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

FOR EACH ACCEPTANCE CRITERION, in order:

  RED    — write ONE test exercising GIVEN-WHEN-THEN against the REAL service named in
           VERIFICATION_SERVICE. Run it. It must FAIL (fail, not error) against the
           start state. Capture the failure output. Write NO implementation code.
  GREEN  — write the MINIMAL code that turns that test green. Nothing beyond the AC.
  REFACTOR — improve without introducing new behavior. Tests stay green.

  The RED proof must be observed against the scenario's start state — a test that
  passes without the seeded behavior present is a FAIL, not a pass.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Gate 1:
  Command:  PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts
  Expected: Exit 0

Gate 2:
  Command:  pnpm test:integration
  Expected: Exit 0

Gate 3:
  Command:  pnpm tsgo --noEmit
  Expected: Exit 0

Gate 4:
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/mission services/platform/tests/integration/fulcrum-commit-replay.test.ts
  Expected: Exit 0

Gate 5:
  Command:  pnpm test:lanes
  Expected: Exit 0

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Owns the single Postgres transaction at the commit stage plus the (template_key, idempotency_key) replay contract in mission/runtime.ts — Mastra mission-engine work proven against real Postgres with a real kill of the running process. Reviewer: mastra-reviewer (idempotency + lease + all-or-nothing audit).
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- One transaction per cycle commit; thread the TransactionSql executor, never reach for a fresh client mid-commit
- Structured breach and refusal reasons (code, metric, limit, actual) — no free-prose error strings
- Idempotency keys are pure functions of template identity and operator params (no Date.now outside --fresh)
- Never UPDATE or DELETE an append-only row; supersede instead

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-001, FUL-PLAT-004, FUL-PLAT-008
Blocks:     FUL-PLAT-010, FUL-PLAT-011, FUL-PLAT-012
Wave:       F

--------------------------------------------------------------------------------
REVIEW
--------------------------------------------------------------------------------

Must pass:
- One test per AC; tests verify behavior, not implementation
- RED evidence present for every AC before its GREEN
- PRIMARY AC scenario passes validate_scenario (exit 0), evidence artifact captured
- Minimal implementation; no gold-plating
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Verdict: [APPROVED | NEEDS_FIXES]

================================================================================
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "FUL-PLAT-009",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fulcrum_ready_to_commit": {
      "description": "Mission dev-revenue is seeded, the corpus holds documents, the nine-stage template version is registered, and no run exists for the chosen idempotency key",
      "seed_method": "cli",
      "records": [
        "`holo db seed:e2e` loads 12 documents and their passages into holocron_nonprod",
        "mission_runs holds 0 rows for idempotency key `fulcrum-human-gate-01`",
        "candidates holds 0 rows for mission `dev-revenue`",
        "belief_scores holds 0 rows for mission `dev-revenue`"
      ]
    },
    "fulcrum_one_committed_run": {
      "description": "Exactly one Fulcrum cycle has already committed under idempotency key fulcrum-human-gate-01, leaving one candidate and one belief score",
      "seed_method": "cli",
      "records": [
        "`holo fulcrum '<goal>' --idempotency-key fulcrum-human-gate-01 --json` has run once and returned a runId",
        "mission_runs holds 1 row for `evidence-research` + `fulcrum-human-gate-01`",
        "candidates holds 1 row carrying the returned candidateId",
        "belief_scores holds 1 row referencing that candidateId"
      ]
    },
    "fulcrum_cycle_killed_before_commit": {
      "description": "A Fulcrum cycle is launched and the running platform process is killed with SIGKILL after the assay stage row appears and before the commit stage row appears",
      "seed_method": "cli",
      "records": [
        "`holo fulcrum '<goal>' --idempotency-key fulcrum-kill-01 --fresh --json` is launched as a real child process",
        "mission_stage_runs holds an `assay` row for the run before the kill",
        "candidates holds 0 rows for the run at kill time",
        "belief_scores holds 0 rows for the run at kill time"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN mission dev-revenue is seeded and no run exists for the idempotency key WHEN one Fulcrum cycle runs to completion against real Postgres THEN the sources, claims, belief_scores, lineage relations and mission_runs rows for that run all exist together",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"AC-1\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-009-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus",
        "negative_control": {
          "would_fail_if": [
            "the commit stage writes each table in its own transaction so a mid-write failure leaves partial rows",
            "the commit is a no-op that returns a runId without persisting a candidate",
            "the belief score is hardcoded rather than read from the gate stage output",
            "Postgres is disconnected and the run still reports completed"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_ready_to_commit",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json`",
                "query sources, claims, belief_scores, relations and mission_runs for the returned runId"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 mission_runs row with `status` = `completed`",
                "1 candidates row carrying the returned `candidateId`",
                "1 belief_scores row whose `run_id` equals the returned runId",
                "at least 1 claims row bound to a sources row through claim_evidence_bindings",
                "at least 1 relations row carrying the candidate lineage for the run"
              ],
              "must_not_observe": [
                "0 belief_scores rows for the run",
                "a claims row with no bound source",
                "a candidates row with an empty `current_score_id`"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN one Fulcrum cycle has already committed under idempotency key fulcrum-human-gate-01 WHEN the same command runs a second time with the same key THEN the response reports replay true with the identical runId, candidateId and dossierPath and the run count for that key stays at one",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"AC-2\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + real holo CLI subprocess",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-009-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + real holo CLI subprocess",
        "negative_control": {
          "would_fail_if": [
            "the unique constraint is absent and the second dispatch writes a second run row",
            "replay is hardcoded to false so the second response is indistinguishable from a fresh run",
            "the replay path re-executes the cycle and returns a different candidateId",
            "the stored dossierPath is empty on the replayed response"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_one_committed_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json` a second time",
                "compare the second JSON response with the first and count mission_runs rows for that key"
              ]
            },
            "end_state": {
              "must_observe": [
                "the second response contains `\"replay\":true`",
                "the second `runId` equals the first `runId`",
                "the second `candidateId` equals the first `candidateId`",
                "the second `dossierPath` equals the first `dossierPath`",
                "1 mission_runs row for `evidence-research` + `fulcrum-human-gate-01`"
              ],
              "must_not_observe": [
                "`\"replay\":false` on the second response",
                "2 mission_runs rows for that key",
                "an empty `candidateId` on the second response"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a Fulcrum cycle is running and its assay stage row has appeared WHEN the platform process is killed with SIGKILL before the commit stage row appears THEN zero candidates, belief_scores and lineage relations rows exist for that run",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"AC-3\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + a real platform child process killed with SIGKILL",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-009-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + a real platform child process killed with SIGKILL",
        "negative_control": {
          "would_fail_if": [
            "the commit writes candidate rows before the gate result is known so a kill leaves them behind",
            "the kill is simulated by returning early instead of terminating the real process",
            "the run row is absent after the kill so nothing records that a cycle was attempted",
            "an autocommit connection is used and each statement persists independently"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_cycle_killed_before_commit",
            "action": {
              "actor": "cli_user",
              "steps": [
                "launch `holo fulcrum '<goal>' --idempotency-key fulcrum-kill-01 --fresh --json` as a real child process",
                "poll mission_stage_runs until the `assay` row appears, then send SIGKILL to that process",
                "reopen Postgres and query candidates, belief_scores and relations for the run"
              ]
            },
            "end_state": {
              "must_observe": [
                "0 candidates rows for the killed run",
                "0 belief_scores rows for the killed run",
                "0 relations rows for the killed run",
                "1 mission_runs row for `fulcrum-kill-01` whose `lease_expires_at` is set"
              ],
              "must_not_observe": [
                "1 candidates row for the killed run",
                "a belief_scores row for the killed run",
                "0 mission_runs rows for `fulcrum-kill-01`"
              ]
            }
          },
          {
            "start_ref": "fulcrum_ready_to_commit",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum '<goal>' --idempotency-key fulcrum-human-gate-01 --json` to completion without a kill",
                "query candidates and belief_scores for the run"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 candidates row for the run",
                "1 belief_scores row for the run",
                "`mission_runs.status` = `completed`"
              ],
              "must_not_observe": [
                "0 candidates rows for the run",
                "a partial run with claims but no belief_scores row"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a cycle is launched under a 0.000001 USD cost cap WHEN the cap is hit before the commit stage THEN one mission_runs row with status budget_exceeded exists and zero candidates and belief_scores rows exist for that run",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"AC-4\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-009-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the budget path returns early and the run row is absent \u2014 a silent non-run",
            "the budget check is a no-op so the cycle commits a candidate under a micro cap",
            "a candidates row is written before the cap check and left behind"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_ready_to_commit",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json`",
                "query mission_runs, candidates and belief_scores for the returned runId"
              ]
            },
            "end_state": {
              "must_observe": [
                "the JSON response contains `\"status\":\"budget_exceeded\"`",
                "1 mission_runs row with `status` = `budget_exceeded`",
                "the run row carries a structured breach reason naming metric `cost` with limit `0.000001`"
              ],
              "must_not_observe": [
                "a `candidateId` key in the JSON response",
                "a `dossierPath` key in the JSON response",
                "0 mission_runs rows for the run",
                "1 candidates row for the run"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN one cycle has committed under idempotency key fulcrum-human-gate-01 for a given goal WHEN the same key is dispatched with a different goal THEN the dispatch is refused with a named args-mismatch error and no second run row is written",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"AC-5\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + real holo CLI subprocess",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-009-5",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + real holo CLI subprocess",
        "negative_control": {
          "would_fail_if": [
            "the args comparison is removed so a different goal silently replays the stored commit",
            "the mismatch path is a no-op that returns the stored commit anyway",
            "a second run row is written for the same key"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_one_committed_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'A completely different goal about warehouse robotics' --idempotency-key fulcrum-human-gate-01 --json`",
                "count mission_runs rows for `evidence-research` + `fulcrum-human-gate-01`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the response carries an `errorCode` naming an idempotency args mismatch",
                "the error message contains `persisted args differ from this request`",
                "1 mission_runs row for that key"
              ],
              "must_not_observe": [
                "2 mission_runs rows for that key",
                "`\"replay\":true` on the mismatched response",
                "an empty `errorCode`"
              ]
            }
          }
        ]
      },
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "primary": false,
      "description": "The belief_scores row count for a completed run equals one when the cycle commits",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"TC-1\"",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "primary": false,
      "description": "The second response replay field equals true when the same idempotency key is dispatched twice",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"TC-2\"",
      "maps_to_ac": "AC-2",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "primary": false,
      "description": "The mission_runs row count for one idempotency key equals one after two dispatches",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"TC-3\"",
      "maps_to_ac": "AC-2",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "primary": false,
      "description": "The candidates row count for the run equals zero when the process is killed before the commit stage",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"TC-4\"",
      "maps_to_ac": "AC-3",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "primary": false,
      "description": "The JSON response omits dossierPath when the run status is budget_exceeded",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"TC-5\"",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "primary": false,
      "description": "The dispatch is refused when the same idempotency key carries a different goal",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-commit-replay.test.ts -t \"TC-6\"",
      "maps_to_ac": "AC-5",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    }
  ]
}
-->

</details>
