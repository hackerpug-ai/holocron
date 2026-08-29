# FUL-PLAT-012 — Return the committed dossier through the Fulcrum CLI

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** I
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 3 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Make the operator's single command return the committed candidate dossier — and make every non-committed outcome legible and structurally distinguishable from a committed one.

## Why

holo fulcrum '<goal>' on a live platform prints status=committed, template=evidence-research, admission=admitted, a non-empty candidate_id and a non-empty dossier_path; the same command twice under one --idempotency-key returns "replay":true with identical ids; --budget-usd 0.000001 --fresh --json returns "status":"budget_exceeded" with no candidateId or dossierPath; and --claims <file> --fresh --json returns "errorCode":"FULCRUM_CORPUS_ONLY" with no candidateId or dossierPath.

## How to verify

Primary acceptance criterion **AC-1** (e2e tier, service: real holo CLI child process + real Postgres holocron_nonprod + real holocron corpus + live image-local LiteLLM router to both nodes):

```
PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "AC-1"
```

Full gate set: 5 acceptance criteria, 7 test criteria, 5 verification gates.

## Scope

- packages/platform/src/cli/commands/fulcrum-run.ts (NEW)
- packages/platform/src/cli/commands/fulcrum-dossier.ts (NEW)
- packages/platform/src/cli/holo.ts (MODIFY)
- packages/platform/src/cli/mission-idempotency-key.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-cli-surface.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-012 - Return the committed dossier through the Fulcrum CLI
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     3
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave I)
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

holo fulcrum '<goal>' on a live platform prints status=committed, template=evidence-research, admission=admitted, a non-empty candidate_id and a non-empty dossier_path; the same command twice under one --idempotency-key returns "replay":true with identical ids; --budget-usd 0.000001 --fresh --json returns "status":"budget_exceeded" with no candidateId or dossierPath; and --claims <file> --fresh --json returns "errorCode":"FULCRUM_CORPUS_ONLY" with no candidateId or dossierPath.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: Print the literal keys `status=`, `template=`, `admission=`, `candidate_id=` and `dossier_path=` in the human-readable output of a committed run.
- MUST: Omit the candidateId and dossierPath keys entirely from any non-committed JSON response.
- MUST: Surface the upstream errorCode verbatim — FULCRUM_CORPUS_ONLY is emitted by the corpus-only guard, not invented by the CLI.
- NEVER: Never print a candidate_id or dossier_path value that no committed row backs.
- NEVER: Never print status=committed for a run whose mission_runs status is not completed.
- NEVER: Never accept --claims as a source of evidence — canned claims are refused, not merged into the corpus path.
- NEVER: Never mock the mission runtime in the CLI test; the test spawns the real holo process.
- STRICTLY: The JSON response shape is a closed Zod object; absent fields are omitted rather than emitted as null.
- STRICTLY: Exit codes are explicit: 0 on committed and on replay, non-zero on budget_exceeded and on the corpus-only refusal.

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-COMMIT-01, CAP-PUBLISH-01
provides:             holo fulcrum '<goal>' operator output carrying status, template, admission, candidate_id and dossier_path, holo fulcrum --json response shape with runId, candidateId, dossierPath, replay, status and errorCode, --budget-usd cost cap flag and the budget_exceeded response with no candidate keys, holo fulcrum dossier <candidateId> read helper printing the committed Markdown
consumes:             single-transaction cycle commit and replay contract (FUL-PLAT-009), published and embedded dossier (FUL-PLAT-011), deterministic dossier Markdown (FUL-PLAT-010), corpus-only refusal errorCode FULCRUM_CORPUS_ONLY (FUL-PLAT-006)
boundary_contracts:
  - A committed run prints status=committed, template=evidence-research, admission=admitted, a non-empty candidate_id and a non-empty dossier_path
  - A replayed run returns replay true with the same runId, candidateId and dossierPath as the first run
  - A budget-exceeded run returns status budget_exceeded and emits no candidateId and no dossierPath key
  - A run supplying canned claims is refused with errorCode FULCRUM_CORPUS_ONLY and emits no candidateId and no dossierPath key

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): A committed run prints the five operator literals
- [ ] AC-2: A second run under one idempotency key replays the same ids
- [ ] AC-3: A budget-exceeded run emits no candidate keys
- [ ] AC-4: Canned claims are refused with FULCRUM_CORPUS_ONLY
- [ ] AC-5: holo fulcrum dossier prints the committed dossier surface
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: A committed run prints the five operator literals [PRIMARY]
  GIVEN: the platform runs against real Postgres, the real corpus and the live fleet with no prior run for the goal
  WHEN:  the operator runs holo fulcrum with the gate goal
  THEN:  stdout carries status=committed, template=evidence-research, admission=admitted, a non-empty candidate_id and a non-empty dossier_path

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: real holo CLI child process + real Postgres holocron_nonprod + real holocron corpus + live image-local LiteLLM router to both nodes
  FLOW_REF:             CAP-COMMIT-01 operator boundary: holo fulcrum '<goal>' -> POST /api/missions -> committed cycle -> dossier path
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "AC-1"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real holo CLI child process + real Postgres holocron_nonprod + real corpus + live image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the CLI prints the literals from a static output template with no committed row behind them; the candidate_id is a generated uuid that no candidates row carries; Postgres is disconnected and the command still prints status=committed; the dossier_path names a file that is absent on disk
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: platform_live_no_prior_run
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'`
        STEP:      read stdout and then query candidates and mission_runs for the printed candidate_id
        MUST_OBSERVE:     stdout contains the literal `status=committed`
        MUST_OBSERVE:     stdout contains the literal `template=evidence-research`
        MUST_OBSERVE:     stdout contains the literal `admission=admitted`
        MUST_OBSERVE:     the `candidate_id=` value is a 36-character uuid
        MUST_OBSERVE:     the `dossier_path=` value ends with `.md` and names a file that is readable on disk
        MUST_OBSERVE:     1 candidates row carries the printed candidate_id
        MUST_OBSERVE:     exit code `0`
        MUST_NOT_OBSERVE: a `candidate_id=` line with an empty value
        MUST_NOT_OBSERVE: a `dossier_path=` line with an empty value
        MUST_NOT_OBSERVE: the literal `status=pending`
        MUST_NOT_OBSERVE: 0 candidates rows for the printed candidate_id

AC-2: A second run under one idempotency key replays the same ids
  GIVEN: one run has committed under idempotency key fulcrum-human-gate-01
  WHEN:  the same command runs a second time with that key and --json
  THEN:  the response contains replay true and the same runId, candidateId and dossierPath

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: real holo CLI child process + real Postgres holocron_nonprod
  FLOW_REF:             CAP-COMMIT-01 boundary contract: replay returns the stored commit
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "AC-2"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real holo CLI child process + real Postgres holocron_nonprod
    NEGATIVE_CONTROL: would fail if replay is hardcoded false so the second response is indistinguishable from a fresh run; the second run re-executes and returns a different candidateId; the dossierPath is empty on the replayed response; the mission_runs uniqueness is removed and a second row is written
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: platform_live_one_gate_run_committed
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json` a second time
        STEP:      compare the second response body with the first and count mission_runs rows for that key
        MUST_OBSERVE:     the response contains `"replay":true`
        MUST_OBSERVE:     the second `runId` equals the first `runId`
        MUST_OBSERVE:     the second `candidateId` equals the first `candidateId`
        MUST_OBSERVE:     the second `dossierPath` equals the first `dossierPath`
        MUST_OBSERVE:     1 mission_runs row for `evidence-research` + `fulcrum-human-gate-01`
        MUST_OBSERVE:     exit code `0`
        MUST_NOT_OBSERVE: `"replay":false` on the second response
        MUST_NOT_OBSERVE: an empty `candidateId` on the second response
        MUST_NOT_OBSERVE: 2 mission_runs rows for that key

AC-3: A budget-exceeded run emits no candidate keys
  GIVEN: the platform is live and the run is launched under a 0.000001 USD cost cap
  WHEN:  the cap is hit before commit
  THEN:  the JSON response carries status budget_exceeded and contains no candidateId and no dossierPath key

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: real holo CLI child process + real Postgres holocron_nonprod + live image-local LiteLLM router
  FLOW_REF:             CAP-COMMIT-01 boundary contract: budget failure produces an explicit non-partial outcome
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "AC-3"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real holo CLI child process + real Postgres holocron_nonprod + live image-local LiteLLM router
    NEGATIVE_CONTROL: would fail if the budget flag is unwired so the run completes and prints a candidate_id; the response emits candidateId as an empty string instead of omitting the key; the budget path returns a no-op success and no mission_runs row is written
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: platform_live_no_prior_run
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json`
        STEP:      parse the response keys and query mission_runs for the returned runId
        MUST_OBSERVE:     the response contains `"status":"budget_exceeded"`
        MUST_OBSERVE:     the response key set contains 0 occurrences of `candidateId`
        MUST_OBSERVE:     the response key set contains 0 occurrences of `dossierPath`
        MUST_OBSERVE:     1 mission_runs row with `status` = `budget_exceeded`
        MUST_OBSERVE:     exit code `2`
        MUST_NOT_OBSERVE: a `candidateId` key in the response
        MUST_NOT_OBSERVE: a `dossierPath` key in the response
        MUST_NOT_OBSERVE: the literal `"status":"completed"`
        MUST_NOT_OBSERVE: 0 mission_runs rows for the run

AC-4: Canned claims are refused with FULCRUM_CORPUS_ONLY
  GIVEN: a canned claims file exists on disk and the platform is live
  WHEN:  the operator passes that file with --claims and --fresh --json
  THEN:  the response carries errorCode FULCRUM_CORPUS_ONLY and contains no candidateId and no dossierPath key

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: real holo CLI child process + real Postgres holocron_nonprod + real filesystem claims file
  FLOW_REF:             UC-CYC-04: SENSE is corpus-only; canned evidence never enters the ledger
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "AC-4"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real holo CLI child process + real Postgres holocron_nonprod + real filesystem claims file
    NEGATIVE_CONTROL: would fail if the --claims path is still accepted and the canned claim is merged into the ledger; the refusal is a no-op that returns success with an empty errorCode; the errorCode is invented by the CLI while the runtime silently accepted the canned claims; a candidates row is written before the refusal and left behind
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: canned_claims_file_on_disk
        ACTOR:     cli_user
        STEP:      run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --claims /tmp/fulcrum-canned.json --fresh --json`
        STEP:      parse the response keys and query candidates and claims for the run
        MUST_OBSERVE:     the response contains `"errorCode":"FULCRUM_CORPUS_ONLY"`
        MUST_OBSERVE:     the response key set contains 0 occurrences of `candidateId`
        MUST_OBSERVE:     the response key set contains 0 occurrences of `dossierPath`
        MUST_OBSERVE:     0 claims rows carrying the text `invented success`
        MUST_OBSERVE:     exit code `2`
        MUST_NOT_OBSERVE: a `candidateId` key in the response
        MUST_NOT_OBSERVE: a `dossierPath` key in the response
        MUST_NOT_OBSERVE: a claims row carrying the text `invented success`
        MUST_NOT_OBSERVE: the literal `"status":"completed"`
        MUST_NOT_OBSERVE: an empty `errorCode` value

AC-5: holo fulcrum dossier prints the committed dossier surface
  GIVEN: one run has committed and its dossier has been rendered and published
  WHEN:  the operator runs holo fulcrum dossier with that candidate id
  THEN:  stdout carries the dossier surface literals read from the committed file

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: real holo CLI child process + real filesystem dossier + real Postgres holocron_nonprod
  FLOW_REF:             UC-GATE-05 / T-CYC-005: committed effects observable through holo fulcrum dossier
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "AC-5"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real holo CLI child process + real filesystem dossier + real Postgres holocron_nonprod
    NEGATIVE_CONTROL: would fail if the command prints a static help shell instead of the rendered file; the dossier file is absent and the command still prints admitted lines; the printed body is empty while the exit code reports success; the reader is disconnected from the dossier directory and echoes a hardcoded sample
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: platform_live_one_gate_run_committed
        ACTOR:     cli_user
        STEP:      run `holo fulcrum dossier <candidateId>`
        STEP:      compare stdout with the bytes of `.holocron/fulcrum/dossiers/{candidateId}.md`
        MUST_OBSERVE:     stdout contains the literal `Admission: admitted`
        MUST_OBSERVE:     stdout contains the literal `Verified quote: true`
        MUST_OBSERVE:     stdout contains a `Belief score:` line followed by a number
        MUST_OBSERVE:     stdout contains a `Domain tier version:` line followed by a number
        MUST_OBSERVE:     stdout contains the literal `Embedding dimensions: 1024`
        MUST_OBSERVE:     stdout names a serving backend of `inference1` or `inference2` for every chat stage line
        MUST_OBSERVE:     the sha256 of stdout equals the sha256 of `.holocron/fulcrum/dossiers/{candidateId}.md`
        MUST_OBSERVE:     exit code `0`
        MUST_NOT_OBSERVE: an empty stdout body
        MUST_NOT_OBSERVE: a `Belief score:` line with an empty value
        MUST_NOT_OBSERVE: the literal `Admission: none`
        MUST_NOT_OBSERVE: a serving backend of `127.0.0.1`
      - START_REF: platform_live_no_prior_run
        ACTOR:     cli_user
        STEP:      run `holo fulcrum dossier 00000000-0000-7000-8000-000000000000`
        STEP:      read stderr and the exit code
        MUST_OBSERVE:     error code `FULCRUM_DOSSIER_NOT_FOUND`
        MUST_OBSERVE:     the message names candidate id `00000000-0000-7000-8000-000000000000`
        MUST_OBSERVE:     exit code `2`
        MUST_NOT_OBSERVE: the literal `Admission: admitted`
        MUST_NOT_OBSERVE: exit code `0`
        MUST_NOT_OBSERVE: an empty error message

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-1"` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-2"` |
| TC-3 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-3"` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-4"` |
| TC-5 |  | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-5"` |
| TC-6 |  | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-6"` |
| TC-7 |  | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t "TC-7"` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- packages/platform/src/cli/commands/fulcrum-run.ts (NEW)
- packages/platform/src/cli/commands/fulcrum-dossier.ts (NEW)
- packages/platform/src/cli/holo.ts (MODIFY)
- packages/platform/src/cli/mission-idempotency-key.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-cli-surface.test.ts (NEW)

writeProhibited:
- packages/platform/src/mission/** — the runtime, commit and dossier modules are owned by FUL-PLAT-008 through FUL-PLAT-011
- packages/platform/src/research/** — gate and corpus modules are owned by FUL-PLAT-002/003/006
- packages/platform/src/inference/** and packages/platform/src/fleet/** — owned by FUL-PLAT-007
- packages/platform/src/db/schema/** — owned by FUL-PLAT-001
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: packages/platform/src/cli/holo.ts:7220-7303 (case 'fulcrum') + packages/platform/src/cli/holo.ts:1352-1368 (printMissionRuntimeResult)

Alias-command block delegating to runMissionTemplate, with one printer for humans and JSON.stringify of the closed payload for --json. Absent fields are omitted from the payload rather than emitted as null.

ANTI-PATTERN: Printing candidate_id / dossier_path from a locally generated value, or emitting candidateId as an empty string on a budget_exceeded run — the gate distinguishes a committed run from a failed one by key presence, not by value emptiness.

References:
- .spec/prds/fulcrum/09-technical-requirements/04-api-design.md — holo fulcrum '<goal>' [--claims <json>] [--json] over POST /api/missions; holo fulcrum dossier <candidateId> prints the file
- .spec/prds/fulcrum/01-scope.md#mvp-operator-surface — MVP reads are generated Markdown, writes are named CLI over mission APIs; no RN screen

Notes:
- T
- h
- e
-  
- C
- L
- I
-  
- i
- s
-  
- a
-  
- t
- h
- i
- n
-  
- p
- r
- o
- j
- e
- c
- t
- i
- o
- n
-  
- o
- f
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
-  
- r
- u
- n
- t
- i
- m
- e
-  
- r
- e
- s
- u
- l
- t
- .
-  
- I
- t
-  
- a
- d
- d
- s
-  
- n
- o
-  
- b
- u
- s
- i
- n
- e
- s
- s
-  
- l
- o
- g
- i
- c
- :
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
- I
- d
-  
- a
- n
- d
-  
- d
- o
- s
- s
- i
- e
- r
- P
- a
- t
- h
-  
- c
- o
- m
- e
-  
- f
- r
- o
- m
-  
- t
- h
- e
-  
- c
- o
- m
- m
- i
- t
- t
- e
- d
-  
- r
- u
- n
-  
- p
- a
- y
- l
- o
- a
- d
- ,
-  
- a
- n
- d
-  
- t
- h
- e
-  
- c
- o
- r
- p
- u
- s
- -
- o
- n
- l
- y
-  
- r
- e
- f
- u
- s
- a
- l
-  
- i
- s
-  
- s
- u
- r
- f
- a
- c
- e
- d
-  
- f
- r
- o
- m
-  
- t
- h
- e
-  
- r
- u
- n
- t
- i
- m
- e
- '
- s
-  
- e
- r
- r
- o
- r
- C
- o
- d
- e
-  
- r
- a
- t
- h
- e
- r
-  
- t
- h
- a
- n
-  
- r
- e
- -
- d
- e
- r
- i
- v
- e
- d
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. packages/platform/src/cli/holo.ts
   - Lines: 7220-7303
   - Focus: [PRIMARY PATTERN] the existing `case 'fulcrum'` alias block — goal parsing, --components validation, defaultMissionIdempotencyKey, runMissionTemplate, exitMissionJsonError. Extend this block; do not add a second command
2. packages/platform/src/cli/holo.ts
   - Lines: 1352-1368
   - Focus: printMissionRuntimeResult — today it prints runId/templateKey/status/replay only. The five operator literals are added here (or in a Fulcrum-specific printer it delegates to)
3. packages/platform/src/cli/mission-idempotency-key.ts
   - Lines: 56-100
   - Focus: Deterministic key precedence: --idempotency-key override, pure base key, --fresh suffix. The gate's replay step depends on this precedence being unchanged
4. packages/platform/src/mission/runtime.ts
   - Lines: 160-185
   - Focus: MissionStatusPayload — the response shape the CLI serializes; candidateId and dossierPath are added as optional fields that are omitted when absent
5. packages/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts
   - Lines: 1-80
   - Focus: Integration-lane pattern for spawning the real holo CLI as a child process and asserting on its stdout and on Postgres rows

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
  Command:  PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts
  Expected: Exit 0

Gate 2:
  Command:  pnpm test:integration
  Expected: Exit 0

Gate 3:
  Command:  pnpm tsgo --noEmit
  Expected: Exit 0

Gate 4:
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error packages/platform/src/cli packages/platform/tests/integration/fulcrum-cli-surface.test.ts
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
Rationale:   Owns the operator surface: the holo fulcrum command's human-readable and --json output, the new --budget-usd flag, and the corpus-only refusal for --claims. Every AC is proven by spawning the real holo CLI against real Postgres and the live fleet. Reviewer: mastra-reviewer (output-literal fidelity, no key emitted on a non-committed outcome).
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Closed Zod response schema; omit absent keys rather than emitting null
- Exit codes are explicit and asserted — never rely on an implicit 0
- Reuse defaultMissionIdempotencyKey; never embed Date.now outside --fresh
- Keep the fulcrum alias mapped to templateKey evidence-research — never introduce a fulcrum template key

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-006, FUL-PLAT-009, FUL-PLAT-010, FUL-PLAT-011
Blocks:     FUL-INFRA-003
Wave:       I

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
  "task_id": "FUL-PLAT-012",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "platform_live_no_prior_run": {
      "description": "The platform is running against real Postgres with the seeded corpus and the live fleet, and no Fulcrum run exists for the gate goal",
      "seed_method": "cli",
      "records": [
        "`holo db seed:e2e` loads 12 documents and their passages into holocron_nonprod",
        "mission_runs holds 0 rows for idempotency key `fulcrum-human-gate-01`",
        "`.holocron/fulcrum/dossiers/` holds 0 files",
        "both nodes serve `divergent`, `convergent` and `embed` per `holo probe:capabilities --json`"
      ]
    },
    "platform_live_one_gate_run_committed": {
      "description": "One Fulcrum run has already committed under idempotency key fulcrum-human-gate-01, with its dossier rendered and published",
      "seed_method": "cli",
      "records": [
        "`holo fulcrum '<goal>' --idempotency-key fulcrum-human-gate-01 --json` returned a runId, candidateId and dossierPath",
        "mission_runs holds 1 row for `evidence-research` + `fulcrum-human-gate-01` with `status` = `completed`",
        "`.holocron/fulcrum/dossiers/{candidateId}.md` exists and contains `Admission: admitted`",
        "documents holds 1 row for that `source_run_id`"
      ]
    },
    "canned_claims_file_on_disk": {
      "description": "A canned claims file exists on disk carrying an invented claim, and the platform is otherwise live with the seeded corpus",
      "seed_method": "cli",
      "records": [
        "`/tmp/fulcrum-canned.json` contains `[{\"claim\":\"invented success\"}]`",
        "`holo db seed:e2e` loads 12 documents and their passages into holocron_nonprod",
        "candidates holds 0 rows for the canned-claims idempotency key",
        "`.holocron/fulcrum/dossiers/` holds 0 files for the canned-claims run"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the platform runs against real Postgres, the real corpus and the live fleet with no prior run for the goal WHEN the operator runs holo fulcrum with the gate goal THEN stdout carries status=committed, template=evidence-research, admission=admitted, a non-empty candidate_id and a non-empty dossier_path",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"AC-1\"",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "real holo CLI child process + real Postgres holocron_nonprod + real holocron corpus + live image-local LiteLLM router to both nodes",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-012-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "topology": "single-node",
        "verification_service": "real holo CLI child process + real Postgres holocron_nonprod + real corpus + live image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the CLI prints the literals from a static output template with no committed row behind them",
            "the candidate_id is a generated uuid that no candidates row carries",
            "Postgres is disconnected and the command still prints status=committed",
            "the dossier_path names a file that is absent on disk"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform_live_no_prior_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'`",
                "read stdout and then query candidates and mission_runs for the printed candidate_id"
              ]
            },
            "end_state": {
              "must_observe": [
                "stdout contains the literal `status=committed`",
                "stdout contains the literal `template=evidence-research`",
                "stdout contains the literal `admission=admitted`",
                "the `candidate_id=` value is a 36-character uuid",
                "the `dossier_path=` value ends with `.md` and names a file that is readable on disk",
                "1 candidates row carries the printed candidate_id",
                "exit code `0`"
              ],
              "must_not_observe": [
                "a `candidate_id=` line with an empty value",
                "a `dossier_path=` line with an empty value",
                "the literal `status=pending`",
                "0 candidates rows for the printed candidate_id"
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
      "description": "GIVEN one run has committed under idempotency key fulcrum-human-gate-01 WHEN the same command runs a second time with that key and --json THEN the response contains replay true and the same runId, candidateId and dossierPath",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"AC-2\"",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "real holo CLI child process + real Postgres holocron_nonprod",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-012-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "topology": "single-node",
        "verification_service": "real holo CLI child process + real Postgres holocron_nonprod",
        "negative_control": {
          "would_fail_if": [
            "replay is hardcoded false so the second response is indistinguishable from a fresh run",
            "the second run re-executes and returns a different candidateId",
            "the dossierPath is empty on the replayed response",
            "the mission_runs uniqueness is removed and a second row is written"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform_live_one_gate_run_committed",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json` a second time",
                "compare the second response body with the first and count mission_runs rows for that key"
              ]
            },
            "end_state": {
              "must_observe": [
                "the response contains `\"replay\":true`",
                "the second `runId` equals the first `runId`",
                "the second `candidateId` equals the first `candidateId`",
                "the second `dossierPath` equals the first `dossierPath`",
                "1 mission_runs row for `evidence-research` + `fulcrum-human-gate-01`",
                "exit code `0`"
              ],
              "must_not_observe": [
                "`\"replay\":false` on the second response",
                "an empty `candidateId` on the second response",
                "2 mission_runs rows for that key"
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
      "description": "GIVEN the platform is live and the run is launched under a 0.000001 USD cost cap WHEN the cap is hit before commit THEN the JSON response carries status budget_exceeded and contains no candidateId and no dossierPath key",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"AC-3\"",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "real holo CLI child process + real Postgres holocron_nonprod + live image-local LiteLLM router",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-012-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "topology": "single-node",
        "verification_service": "real holo CLI child process + real Postgres holocron_nonprod + live image-local LiteLLM router",
        "negative_control": {
          "would_fail_if": [
            "the budget flag is unwired so the run completes and prints a candidate_id",
            "the response emits candidateId as an empty string instead of omitting the key",
            "the budget path returns a no-op success and no mission_runs row is written"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform_live_no_prior_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json`",
                "parse the response keys and query mission_runs for the returned runId"
              ]
            },
            "end_state": {
              "must_observe": [
                "the response contains `\"status\":\"budget_exceeded\"`",
                "the response key set contains 0 occurrences of `candidateId`",
                "the response key set contains 0 occurrences of `dossierPath`",
                "1 mission_runs row with `status` = `budget_exceeded`",
                "exit code `2`"
              ],
              "must_not_observe": [
                "a `candidateId` key in the response",
                "a `dossierPath` key in the response",
                "the literal `\"status\":\"completed\"`",
                "0 mission_runs rows for the run"
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
      "description": "GIVEN a canned claims file exists on disk and the platform is live WHEN the operator passes that file with --claims and --fresh --json THEN the response carries errorCode FULCRUM_CORPUS_ONLY and contains no candidateId and no dossierPath key",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"AC-4\"",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "real holo CLI child process + real Postgres holocron_nonprod + real filesystem claims file",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-012-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "topology": "single-node",
        "verification_service": "real holo CLI child process + real Postgres holocron_nonprod + real filesystem claims file",
        "negative_control": {
          "would_fail_if": [
            "the --claims path is still accepted and the canned claim is merged into the ledger",
            "the refusal is a no-op that returns success with an empty errorCode",
            "the errorCode is invented by the CLI while the runtime silently accepted the canned claims",
            "a candidates row is written before the refusal and left behind"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "canned_claims_file_on_disk",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --claims /tmp/fulcrum-canned.json --fresh --json`",
                "parse the response keys and query candidates and claims for the run"
              ]
            },
            "end_state": {
              "must_observe": [
                "the response contains `\"errorCode\":\"FULCRUM_CORPUS_ONLY\"`",
                "the response key set contains 0 occurrences of `candidateId`",
                "the response key set contains 0 occurrences of `dossierPath`",
                "0 claims rows carrying the text `invented success`",
                "exit code `2`"
              ],
              "must_not_observe": [
                "a `candidateId` key in the response",
                "a `dossierPath` key in the response",
                "a claims row carrying the text `invented success`",
                "the literal `\"status\":\"completed\"`",
                "an empty `errorCode` value"
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
      "description": "GIVEN one run has committed and its dossier has been rendered and published WHEN the operator runs holo fulcrum dossier with that candidate id THEN stdout carries the dossier surface literals read from the committed file",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"AC-5\"",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "real holo CLI child process + real filesystem dossier + real Postgres holocron_nonprod",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-012-5",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "topology": "single-node",
        "verification_service": "real holo CLI child process + real filesystem dossier + real Postgres holocron_nonprod",
        "negative_control": {
          "would_fail_if": [
            "the command prints a static help shell instead of the rendered file",
            "the dossier file is absent and the command still prints admitted lines",
            "the printed body is empty while the exit code reports success",
            "the reader is disconnected from the dossier directory and echoes a hardcoded sample"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform_live_one_gate_run_committed",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum dossier <candidateId>`",
                "compare stdout with the bytes of `.holocron/fulcrum/dossiers/{candidateId}.md`"
              ]
            },
            "end_state": {
              "must_observe": [
                "stdout contains the literal `Admission: admitted`",
                "stdout contains the literal `Verified quote: true`",
                "stdout contains a `Belief score:` line followed by a number",
                "stdout contains a `Domain tier version:` line followed by a number",
                "stdout contains the literal `Embedding dimensions: 1024`",
                "stdout names a serving backend of `inference1` or `inference2` for every chat stage line",
                "the sha256 of stdout equals the sha256 of `.holocron/fulcrum/dossiers/{candidateId}.md`",
                "exit code `0`"
              ],
              "must_not_observe": [
                "an empty stdout body",
                "a `Belief score:` line with an empty value",
                "the literal `Admission: none`",
                "a serving backend of `127.0.0.1`"
              ]
            }
          },
          {
            "start_ref": "platform_live_no_prior_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo fulcrum dossier 00000000-0000-7000-8000-000000000000`",
                "read stderr and the exit code"
              ]
            },
            "end_state": {
              "must_observe": [
                "error code `FULCRUM_DOSSIER_NOT_FOUND`",
                "the message names candidate id `00000000-0000-7000-8000-000000000000`",
                "exit code `2`"
              ],
              "must_not_observe": [
                "the literal `Admission: admitted`",
                "exit code `0`",
                "an empty error message"
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
      "description": "The committed run stdout contains the literal status=committed when the cycle completes",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-1\"",
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
      "description": "The printed candidate_id matches exactly one candidates row when the run commits",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-2\"",
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
      "description": "The printed dossier_path names a readable file when the run commits",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-3\"",
      "maps_to_ac": "AC-1",
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
      "description": "The second JSON response contains replay true when the same idempotency key is reused",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-4\"",
      "maps_to_ac": "AC-2",
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
      "description": "The JSON response omits the candidateId key when the status is budget_exceeded",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-5\"",
      "maps_to_ac": "AC-3",
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
      "description": "The JSON response contains errorCode FULCRUM_CORPUS_ONLY when --claims supplies a canned file",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-6\"",
      "maps_to_ac": "AC-4",
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
      "description": "The dossier command stdout equals the rendered dossier file bytes when the candidate is committed",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-cli-surface.test.ts -t \"TC-7\"",
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

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): A committed run prints the five operator literals
- [ ] AC-2: A second run under one idempotency key replays the same ids
- [ ] AC-3: A budget-exceeded run emits no candidate keys
- [ ] AC-4: Canned claims are refused with FULCRUM_CORPUS_ONLY
- [ ] AC-5: holo fulcrum dossier prints the committed dossier surface
