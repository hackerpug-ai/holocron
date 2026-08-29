# FUL-PLAT-008 — Execute the typed Fulcrum cycle

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** E
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 8 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Execute one complete Fulcrum cycle through the mapped nine-stage graph on local inference against real Postgres, with typed I/O at every stage boundary and an explicit non-partial outcome when the budget is exhausted.

## Why

A run of the fulcrum alias drives plan, retrieve, GENERATE, extract, assay, challenge, MAP, gate and commit; mission_stage_runs holds one row per stage carrying its role and endpoint; GENERATE and MAP outputs validate against their declared schemas; and a run launched under a 0.000001 USD cap ends with mission_runs.status='budget_exceeded' and zero candidates rows.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod + live image-local LiteLLM router to real oMLX on inference1 and inference2 + real holocron corpus):

```
PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "AC-1"
```

Full gate set: 5 acceptance criteria, 7 test criteria, 5 verification gates.

## Scope

- packages/platform/src/mission/fulcrum/schemas.ts (NEW)
- packages/platform/src/mission/fulcrum/generate.ts (NEW)
- packages/platform/src/mission/fulcrum/map.ts (NEW)
- packages/platform/src/mission/templates/evidence-research.ts (MODIFY)
- packages/platform/src/mission/registry.ts (MODIFY)
- packages/platform/src/mission/runtime.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-typed-cycle.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-008 - Execute the typed Fulcrum cycle
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     8
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave E)
PROPOSED_BY:mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

SIZING_RATIONALE (8 pts): 8 is one atomic unit, not two: GENERATE, MAP, the corpus-only toolGrants list and the per-cycle budget policy all live in a SINGLE evidence-research template version (currently 1.0.6). A compiled mission template version is registered whole — there is no intermediate version that carries GENERATE but not MAP, or the new stage graph but not the budget policy, without leaving a registered template whose stage graph cannot execute. Splitting produces a broken intermediate registration, not two shippable tasks.

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

A run of the fulcrum alias drives plan, retrieve, GENERATE, extract, assay, challenge, MAP, gate and commit; mission_stage_runs holds one row per stage carrying its role and endpoint; GENERATE and MAP outputs validate against their declared schemas; and a run launched under a 0.000001 USD cap ends with mission_runs.status='budget_exceeded' and zero candidates rows.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: Register GENERATE and MAP as typed stages with closed Zod schemas under schemaRefs mission.fulcrum.generate.* and mission.fulcrum.map.*.
- MUST: Fill the evidence-research template's toolGrants with exactly the six named registry tools SENSE may call.
- MUST: Record mission_runs.status='budget_exceeded' with an explicit reason on the run row whenever a cap is hit.
- NEVER: Never introduce a new template key — fulcrum stays an instantiation alias of evidence-research.
- NEVER: Never call generateText or address a model role inside the gate or commit stages.
- NEVER: Never request the judge role or a coder role from any stage.
- NEVER: Never let a budget-exceeded cycle write a candidates row, a belief_scores row, or a dossier path — a partial cycle is the failure this AC exists to catch.
- STRICTLY: No z.any() in the GENERATE or MAP schemas; mutationKind and action are closed enums.
- STRICTLY: No mocked fleet, no mocked Postgres, no recorded model responses in the primary lane.

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-COMMIT-01, CAP-INFER-01
provides:             fulcrum-typed-stage-graph (plan -> retrieve -> GENERATE -> extract -> assay -> challenge -> MAP -> gate -> commit) as a registered evidence-research template version, mission.fulcrum.generate.input/output and mission.fulcrum.map.input/output closed Zod schemas, per-cycle budget policy producing mission_runs.status='budget_exceeded' with no partial candidate effects, corpus-only toolGrants list for SENSE retrieval
consumes:             router-truthful-serving-attestation (FUL-PLAT-007), versioned Fulcrum mission contract (FUL-PLAT-005), governed corpus fetch artifact (FUL-PLAT-006), deterministic belief score (FUL-PLAT-004)
boundary_contracts:
  - Every stage declares a closed input and output schemaRef; a stage output that fails its schema fails the stage rather than passing an untyped payload downstream
  - ASSAY/extract requests divergent and SENSE-plan/GENERATE/CHALLENGE request convergent; the cycle refuses when the two resolve to one served model identity
  - A cycle that hits its wall-clock, token or cost cap records mission_runs.status='budget_exceeded' and writes no candidates and no belief_scores rows
  - SENSE retrieval calls only the named registry tools listed in toolGrants; the cycle makes no outbound host call

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Nine-stage typed cycle runs end-to-end on local inference
- [ ] AC-2: GENERATE emits a schema-valid typed output
- [ ] AC-3: MAP emits a schema-valid niche action
- [ ] AC-4: Budget cap ends the cycle as budget_exceeded with no partial candidate effects
- [ ] AC-5: SENSE retrieval is corpus-only through the named registry tools
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Nine-stage typed cycle runs end-to-end on local inference [PRIMARY]
  GIVEN: mission dev-revenue is seeded, the corpus holds documents, and both nodes serve the chat and embed roles
  WHEN:  the fulcrum alias runs one cycle against real Postgres and the image-local router
  THEN:  all nine stages record a mission_stage_runs row carrying role and endpoint, and the run reaches status completed

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + live image-local LiteLLM router to real oMLX on inference1 and inference2 + real holocron corpus
  FLOW_REF:             CAP-COMMIT-01 hop: mission:execute -> stage graph -> evidence-gate -> commit
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "AC-1"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus
    NEGATIVE_CONTROL: would fail if GENERATE or MAP is a no-op executor that echoes its input unchanged; the stage graph is unchanged from version 1.0.6 and the two new stages are absent; the corpus is empty and the cycle still reports a completed run; the fleet is disconnected and the cycle still records chat stage rows
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fulcrum_mission_seeded_corpus
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json`
        STEP:      query mission_stage_runs for the returned runId ordered by stage index
        MUST_OBSERVE:     9 mission_stage_runs rows for the run
        MUST_OBSERVE:     the ordered stage ids equal `['plan','retrieve','generate','extract','assay','challenge','map','gate','commit']`
        MUST_OBSERVE:     `mission_runs.template_key` = `evidence-research`
        MUST_OBSERVE:     a mission_run_tags row with tag `fulcrum`
        MUST_OBSERVE:     `mission_runs.status` = `completed`
        MUST_OBSERVE:     the `extract` stage row carries `role` = `divergent` and the `challenge` stage row carries `role` = `convergent`
        MUST_NOT_OBSERVE: 0 mission_stage_runs rows for the run
        MUST_NOT_OBSERVE: a `mission_runs.template_key` value of `fulcrum`
        MUST_NOT_OBSERVE: a stage row with an empty `endpoint`
        MUST_NOT_OBSERVE: `mission_runs.status` = `pending`

AC-2: GENERATE emits a schema-valid typed output
  GIVEN: the GENERATE stage declares schemaRef mission.fulcrum.generate.output
  WHEN:  the cycle runs GENERATE on convergent
  THEN:  the persisted stage output carries proposedTitle, proposedQuestion, a mutationKind inside the closed enum, and rationale

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + live image-local LiteLLM router convergent role
  FLOW_REF:             UC-CYC-01 stage map: GENERATE typed I/O
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "AC-2"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live image-local LiteLLM router convergent role
    NEGATIVE_CONTROL: would fail if the output schema is z.any() so any payload is accepted; the schema check is a no-op and a mutationKind outside the enum passes downstream; the GENERATE row is absent and the cycle still completes
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fulcrum_mission_seeded_corpus
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json`
        STEP:      read the GENERATE stage row output_json from mission_stage_runs
        MUST_OBSERVE:     `proposedTitle` is a non-empty string of at least 3 characters
        MUST_OBSERVE:     `mutationKind` is one of `['narrow','broaden','pivot','deepen']`
        MUST_OBSERVE:     4 keys on the GENERATE output payload
        MUST_OBSERVE:     the GENERATE stage row carries `role` = `convergent`
        MUST_NOT_OBSERVE: an empty GENERATE output payload
        MUST_NOT_OBSERVE: a `mutationKind` of `sideways`
        MUST_NOT_OBSERVE: 0 GENERATE stage rows for the run
      - START_REF: fulcrum_generate_schema_violating_output
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json` with the violating GENERATE executor registered
        STEP:      read mission_stage_runs and mission_runs for the returned runId
        MUST_OBSERVE:     the GENERATE stage row carries `status` = `failed`
        MUST_OBSERVE:     the failure message names `mutationKind`
        MUST_OBSERVE:     `mission_runs.status` = `failed`
        MUST_NOT_OBSERVE: `mission_runs.status` = `completed`
        MUST_NOT_OBSERVE: a downstream `extract` stage row for the run
        MUST_NOT_OBSERVE: an empty failure message

AC-3: MAP emits a schema-valid niche action
  GIVEN: the MAP stage declares schemaRef mission.fulcrum.map.output
  WHEN:  the cycle runs MAP after the challenge stage
  THEN:  the persisted stage output carries a nicheKey and an action inside the closed enum place, retire or hold

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + live image-local LiteLLM router
  FLOW_REF:             UC-CYC-01 stage map: MAP typed I/O
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "AC-3"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the MAP executor is a no-op returning an empty object; the action enum is unchecked so an unknown action passes to commit; the MAP stage is absent from the registered stage graph
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fulcrum_mission_seeded_corpus
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json`
        STEP:      read the MAP stage row output_json from mission_stage_runs
        MUST_OBSERVE:     `action` is one of `['place','retire','hold']`
        MUST_OBSERVE:     `nicheKey` is a non-empty string of at least 3 characters
        MUST_OBSERVE:     1 MAP stage row for the run
        MUST_OBSERVE:     the MAP stage row `beliefScoreId` equals the `belief_scores.id` written by the gate stage of the same run
        MUST_NOT_OBSERVE: 0 MAP stage rows for the run
        MUST_NOT_OBSERVE: an empty `nicheKey`
        MUST_NOT_OBSERVE: an `action` value of `unknown`

AC-4: Budget cap ends the cycle as budget_exceeded with no partial candidate effects
  GIVEN: the cycle is launched with a 0.000001 USD cost cap
  WHEN:  the first chat stage exceeds that cap
  THEN:  the run records status budget_exceeded and writes no candidates row and no belief_scores row

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod + live image-local LiteLLM router
  FLOW_REF:             CAP-COMMIT-01 boundary contract: a budget_exceeded cycle still writes an explicit run row
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "AC-4"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod + live image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the budget check is a no-op and the cycle completes normally under a micro cap; the cap is hit and the run row is absent — a silent non-run; a candidates row is written before the budget check and left behind
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: fulcrum_cycle_under_micro_budget
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json`
        STEP:      query mission_runs, candidates and belief_scores for the returned runId
        MUST_OBSERVE:     the JSON response contains `"status":"budget_exceeded"`
        MUST_OBSERVE:     1 mission_runs row with `status` = `budget_exceeded`
        MUST_OBSERVE:     the run row carries a non-empty budget breach reason naming `cost`
        MUST_NOT_OBSERVE: a `candidateId` key in the JSON response
        MUST_NOT_OBSERVE: a `dossierPath` key in the JSON response
        MUST_NOT_OBSERVE: 0 mission_runs rows for the run
        MUST_NOT_OBSERVE: a candidates row for the run

AC-5: SENSE retrieval is corpus-only through the named registry tools
  GIVEN: the template declares toolGrants listing the six named registry tools
  WHEN:  the retrieve stage runs
  THEN:  the executed tool ids are a subset of the declared grants and no outbound host is contacted

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod corpus + outbound-host capture on the running process
  FLOW_REF:             UC-CYC-04 retrieval contract: SENSE is corpus-only
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "AC-5"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod corpus + outbound-host capture on the running process
    NEGATIVE_CONTROL: would fail if toolGrants is left empty so any tool call is unconstrained; the retrieve stage is disconnected from the corpus and returns a hardcoded result set; an outbound host call is made and the capture records nothing
    EVIDENCE:         event_log (required_capture=True)
    CASES:
      - START_REF: fulcrum_mission_seeded_corpus
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json` with outbound-host capture armed
        STEP:      read the registered template toolGrants and the captured outbound hosts
        MUST_OBSERVE:     toolGrants equals `['hybrid_search','search_fts','search_vector','search_research','get_research_session','get_document']`
        MUST_OBSERVE:     6 declared tool grants
        MUST_OBSERVE:     the executed tool ids are a subset of the 6 declared grants
        MUST_OBSERVE:     the captured outbound host set contains only the loopback router `127.0.0.1` and the two mini hosts
        MUST_NOT_OBSERVE: an empty toolGrants array
        MUST_NOT_OBSERVE: a captured outbound host of `api.exa.ai`
        MUST_NOT_OBSERVE: a captured outbound host of `r.jina.ai`

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-1"` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-2"` |
| TC-3 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-3"` |
| TC-4 |  | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-4"` |
| TC-5 |  | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-5"` |
| TC-6 |  | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-6"` |
| TC-7 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t "TC-7"` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- packages/platform/src/mission/fulcrum/schemas.ts (NEW)
- packages/platform/src/mission/fulcrum/generate.ts (NEW)
- packages/platform/src/mission/fulcrum/map.ts (NEW)
- packages/platform/src/mission/templates/evidence-research.ts (MODIFY)
- packages/platform/src/mission/registry.ts (MODIFY)
- packages/platform/src/mission/runtime.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-typed-cycle.test.ts (NEW)

writeProhibited:
- packages/platform/src/db/schema/** — owned by FUL-PLAT-001
- packages/platform/src/research/evidence-gate.ts and packages/platform/src/research/provenance.ts — owned by FUL-PLAT-002 / FUL-PLAT-003
- packages/platform/src/inference/** and packages/platform/src/fleet/** — owned by FUL-PLAT-007
- packages/platform/src/cli/holo.ts — owned by FUL-PLAT-012
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: packages/platform/src/mission/templates/evidence-research.ts:30-86 (stageGraph entries) + packages/platform/src/mission/registry.ts:353-395 (executor registration)

Closed mission-template DSL: a stage is data (id, stageKind, executorRef, inputSchema, outputSchema, checkpointKey) registered against an executor in the registry. Adding a stage never adds executable payload to the template.

ANTI-PATTERN: Creating a distinct fulcrum template key, or declaring a stage output as z.any() so the model's prose passes downstream unvalidated.

References:
- .spec/prds/fulcrum/05-uc-cyc.md#stage-map — GENERATE and MAP typed I/O schemas verbatim
- .spec/prds/fulcrum/09-technical-requirements/09-e2e-testing.md#the-determinism-seam — fixture the model signal, assert the engine outcome

Notes:
- G
- E
- N
- E
- R
- A
- T
- E
-  
- a
- n
- d
-  
- M
- A
- P
-  
- a
- r
- e
-  
- a
- g
- e
- n
- t
-  
- s
- t
- a
- g
- e
- s
-  
- o
- n
-  
- c
- o
- n
- v
- e
- r
- g
- e
- n
- t
- ;
-  
- t
- h
- e
-  
- g
- a
- t
- e
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
-  
- s
- t
- a
- g
- e
- s
-  
- r
- e
- m
- a
- i
- n
-  
- d
- e
- t
- e
- r
- m
- i
- n
- i
- s
- t
- i
- c
-  
- c
- o
- d
- e
- .
-  
- T
- h
- e
-  
- b
- u
- d
- g
- e
- t
-  
- c
- h
- e
- c
- k
-  
- r
- u
- n
- s
-  
- b
- e
- f
- o
- r
- e
-  
- e
- a
- c
- h
-  
- s
- t
- a
- g
- e
-  
- t
- r
- a
- n
- s
- i
- t
- i
- o
- n
- ,
-  
- s
- o
-  
- a
-  
- c
- a
- p
-  
- h
- i
- t
-  
- i
- s
-  
- d
- e
- t
- e
- c
- t
- e
- d
-  
- b
- e
- f
- o
- r
- e
-  
- a
- n
- y
-  
- c
- a
- n
- d
- i
- d
- a
- t
- e
-  
- e
- f
- f
- e
- c
- t
-  
- i
- s
-  
- w
- r
- i
- t
- t
- e
- n
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. packages/platform/src/mission/templates/evidence-research.ts
   - Lines: 20-100
   - Focus: [PRIMARY PATTERN] the live seven-stage template definition, modelRoleBindings, budgets and the empty toolGrants this task fills — bump version and insert GENERATE after retrieve and MAP after challenge
2. packages/platform/src/mission/contract.ts
   - Lines: 39-125
   - Focus: MissionStageSchema / MissionBudgetsSchema / parseMissionTemplateDefinition — the closed DSL that rejects executable payloads and requires a schemaRef pair per stage
3. packages/platform/src/mission/registry.ts
   - Lines: 353-395
   - Focus: How builtin.research-plan@1 .. builtin.research-commit@1 are registered with their schemas — GENERATE and MAP executors follow this registration shape
4. packages/platform/src/mission/runtime.ts
   - Lines: 2352-2432
   - Focus: detectBudgetBlockBeforeStage / detectBudgetExceeded — the existing cost/wall/token breach detection the --budget-usd cap plugs into
5. packages/platform/tests/integration/evidence-research-template.test.ts
   - Lines: 1-120
   - Focus: Integration-lane pattern for asserting a registered template's stage graph and a real run's mission_stage_runs rows

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
  Command:  PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts
  Expected: Exit 0

Gate 2:
  Command:  pnpm test:integration
  Expected: Exit 0

Gate 3:
  Command:  pnpm tsgo --noEmit
  Expected: Exit 0

Gate 4:
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error packages/platform/src/mission packages/platform/tests/integration/fulcrum-typed-cycle.test.ts
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
Rationale:   Adds two typed stages and a stage-graph version to the Mastra mission template DSL, registers their executors, and wires budget enforcement in mission/runtime.ts — Mastra-native work verified against the live fleet and real Postgres. Reviewer: mastra-reviewer (typed I/O, no z.any(), no agent tool in the gate path).
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Closed Zod schemas for GENERATE and MAP; mutationKind and action are z.enum, never z.string()
- Template stays pure data — no inline Zod, raw SQL, or function payloads (parseMissionTemplateDefinition rejects them)
- Bump the template version string when the stage graph changes; never mutate a registered version in place
- Budget breach reasons are structured (metric, limit, actual), not free prose

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-004, FUL-PLAT-005, FUL-PLAT-006, FUL-PLAT-007
Blocks:     FUL-PLAT-009
Wave:       E

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
  "task_id": "FUL-PLAT-008",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fulcrum_mission_seeded_corpus": {
      "description": "Mission dev-revenue is registered with a versioned fitness contract, the holocron corpus holds 12 documents with 1024-dim passage embeddings, and no cycle has run for this idempotency key",
      "seed_method": "cli",
      "records": [
        "`holo db seed:e2e` loads 12 documents and their passages into holocron_nonprod",
        "mission_runs holds 0 rows for idempotency key `fulcrum:<goal>:default`",
        "candidates holds 0 rows for mission `dev-revenue`",
        "both nodes serve `divergent`, `convergent` and `embed` per `holo probe:capabilities --json`"
      ]
    },
    "fulcrum_cycle_under_micro_budget": {
      "description": "Same seeded mission and corpus, but the cycle is launched with a 0.000001 USD cost cap that the first chat stage exceeds",
      "seed_method": "cli",
      "records": [
        "`holo db seed:e2e` loads 12 documents and their passages into holocron_nonprod",
        "the run is launched with `--budget-usd 0.000001 --fresh`",
        "candidates holds 0 rows for mission `dev-revenue`",
        "belief_scores holds 0 rows for mission `dev-revenue`"
      ]
    },
    "fulcrum_generate_schema_violating_output": {
      "description": "Same seeded mission and corpus, with the GENERATE stage executor returning a payload whose mutationKind is outside the declared enum",
      "seed_method": "cli",
      "records": [
        "`holo db seed:e2e` loads 12 documents and their passages into holocron_nonprod",
        "the GENERATE executor returns `{ proposedTitle: 'x', proposedQuestion: 'y', mutationKind: 'sideways', rationale: 'z' }`",
        "mission_stage_runs holds 0 rows for the GENERATE stage of this run"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN mission dev-revenue is seeded, the corpus holds documents, and both nodes serve the chat and embed roles WHEN the fulcrum alias runs one cycle against real Postgres and the image-local router THEN all nine stages record a mission_stage_runs row carrying role and endpoint, and the run reaches status completed",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"AC-1\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router to real oMLX on inference1 and inference2 + real holocron corpus",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-008-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router + real holocron corpus",
        "negative_control": {
          "would_fail_if": [
            "GENERATE or MAP is a no-op executor that echoes its input unchanged",
            "the stage graph is unchanged from version 1.0.6 and the two new stages are absent",
            "the corpus is empty and the cycle still reports a completed run",
            "the fleet is disconnected and the cycle still records chat stage rows"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_mission_seeded_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json`",
                "query mission_stage_runs for the returned runId ordered by stage index"
              ]
            },
            "end_state": {
              "must_observe": [
                "9 mission_stage_runs rows for the run",
                "the ordered stage ids equal `['plan','retrieve','generate','extract','assay','challenge','map','gate','commit']`",
                "`mission_runs.template_key` = `evidence-research`",
                "a mission_run_tags row with tag `fulcrum`",
                "`mission_runs.status` = `completed`",
                "the `extract` stage row carries `role` = `divergent` and the `challenge` stage row carries `role` = `convergent`"
              ],
              "must_not_observe": [
                "0 mission_stage_runs rows for the run",
                "a `mission_runs.template_key` value of `fulcrum`",
                "a stage row with an empty `endpoint`",
                "`mission_runs.status` = `pending`"
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
      "description": "GIVEN the GENERATE stage declares schemaRef mission.fulcrum.generate.output WHEN the cycle runs GENERATE on convergent THEN the persisted stage output carries proposedTitle, proposedQuestion, a mutationKind inside the closed enum, and rationale",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"AC-2\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router convergent role",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-008-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router convergent role",
        "negative_control": {
          "would_fail_if": [
            "the output schema is z.any() so any payload is accepted",
            "the schema check is a no-op and a mutationKind outside the enum passes downstream",
            "the GENERATE row is absent and the cycle still completes"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_mission_seeded_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json`",
                "read the GENERATE stage row output_json from mission_stage_runs"
              ]
            },
            "end_state": {
              "must_observe": [
                "`proposedTitle` is a non-empty string of at least 3 characters",
                "`mutationKind` is one of `['narrow','broaden','pivot','deepen']`",
                "4 keys on the GENERATE output payload",
                "the GENERATE stage row carries `role` = `convergent`"
              ],
              "must_not_observe": [
                "an empty GENERATE output payload",
                "a `mutationKind` of `sideways`",
                "0 GENERATE stage rows for the run"
              ]
            }
          },
          {
            "start_ref": "fulcrum_generate_schema_violating_output",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json` with the violating GENERATE executor registered",
                "read mission_stage_runs and mission_runs for the returned runId"
              ]
            },
            "end_state": {
              "must_observe": [
                "the GENERATE stage row carries `status` = `failed`",
                "the failure message names `mutationKind`",
                "`mission_runs.status` = `failed`"
              ],
              "must_not_observe": [
                "`mission_runs.status` = `completed`",
                "a downstream `extract` stage row for the run",
                "an empty failure message"
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
      "description": "GIVEN the MAP stage declares schemaRef mission.fulcrum.map.output WHEN the cycle runs MAP after the challenge stage THEN the persisted stage output carries a nicheKey and an action inside the closed enum place, retire or hold",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"AC-3\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-008-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the MAP executor is a no-op returning an empty object",
            "the action enum is unchecked so an unknown action passes to commit",
            "the MAP stage is absent from the registered stage graph"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_mission_seeded_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json`",
                "read the MAP stage row output_json from mission_stage_runs"
              ]
            },
            "end_state": {
              "must_observe": [
                "`action` is one of `['place','retire','hold']`",
                "`nicheKey` is a non-empty string of at least 3 characters",
                "1 MAP stage row for the run",
                "the MAP stage row `beliefScoreId` equals the `belief_scores.id` written by the gate stage of the same run"
              ],
              "must_not_observe": [
                "0 MAP stage rows for the run",
                "an empty `nicheKey`",
                "an `action` value of `unknown`"
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
      "description": "GIVEN the cycle is launched with a 0.000001 USD cost cap WHEN the first chat stage exceeds that cap THEN the run records status budget_exceeded and writes no candidates row and no belief_scores row",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"AC-4\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-008-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod + live image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the budget check is a no-op and the cycle completes normally under a micro cap",
            "the cap is hit and the run row is absent \u2014 a silent non-run",
            "a candidates row is written before the budget check and left behind"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_cycle_under_micro_budget",
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
                "the run row carries a non-empty budget breach reason naming `cost`"
              ],
              "must_not_observe": [
                "a `candidateId` key in the JSON response",
                "a `dossierPath` key in the JSON response",
                "0 mission_runs rows for the run",
                "a candidates row for the run"
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
      "description": "GIVEN the template declares toolGrants listing the six named registry tools WHEN the retrieve stage runs THEN the executed tool ids are a subset of the declared grants and no outbound host is contacted",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"AC-5\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod corpus + outbound-host capture on the running process",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-008-5",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod corpus + outbound-host capture on the running process",
        "negative_control": {
          "would_fail_if": [
            "toolGrants is left empty so any tool call is unconstrained",
            "the retrieve stage is disconnected from the corpus and returns a hardcoded result set",
            "an outbound host call is made and the capture records nothing"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fulcrum_mission_seeded_corpus",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json` with outbound-host capture armed",
                "read the registered template toolGrants and the captured outbound hosts"
              ]
            },
            "end_state": {
              "must_observe": [
                "toolGrants equals `['hybrid_search','search_fts','search_vector','search_research','get_research_session','get_document']`",
                "6 declared tool grants",
                "the executed tool ids are a subset of the 6 declared grants",
                "the captured outbound host set contains only the loopback router `127.0.0.1` and the two mini hosts"
              ],
              "must_not_observe": [
                "an empty toolGrants array",
                "a captured outbound host of `api.exa.ai`",
                "a captured outbound host of `r.jina.ai`"
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
      "description": "The ordered mission_stage_runs stage ids equal the nine-stage Fulcrum graph when one cycle completes",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-1\"",
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
      "description": "The extract stage role equals divergent when the cycle runs on the live router",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-2\"",
      "maps_to_ac": "AC-1",
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
      "description": "The GENERATE stage fails when its output carries a mutationKind outside the declared enum",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-3\"",
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
      "description": "The MAP stage output action is a member of the place, retire, hold enum when the cycle completes",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-4\"",
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
      "description": "The candidates row count for the run equals zero when the run status is budget_exceeded",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-5\"",
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
      "description": "The captured outbound host set excludes every non-fleet host when one cycle runs",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-6\"",
      "maps_to_ac": "AC-5",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "primary": false,
      "description": "The registered template key equals evidence-research when the fulcrum alias runs",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-typed-cycle.test.ts -t \"TC-7\"",
      "maps_to_ac": "AC-1",
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

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): Nine-stage typed cycle runs end-to-end on local inference
- [ ] AC-2: GENERATE emits a schema-valid typed output
- [ ] AC-3: MAP emits a schema-valid niche action
- [ ] AC-4: Budget cap ends the cycle as budget_exceeded with no partial candidate effects
- [ ] AC-5: SENSE retrieval is corpus-only through the named registry tools
