# FUL-INFRA-003 — Verify the dossier with real-service playback and evals

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** J
> **Assignee:** devops-engineer · **Reviewer:** devops-engineer (peer) + mastra-reviewer
> **Priority:** P0 · **Points:** 8 · **Type:** FEATURE
> **Proposed by:** devops-engineer
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Independently prove the committed dossier is backed by the real ledger and real local inference, and prove the check rejects every way the product could fake success.

## Why

`pnpm test:live` executes the two Fulcrum verification files: a real `holo fulcrum` run's dossier is confirmed literal-for-literal against recomputed Postgres and `/model/info` truth, and five real fault exercises — orphan dossier, role collision, both minis stopped, canned claims, non-deterministic measurement path — each produce an explicit reject with a named reason code.

## How to verify

Primary acceptance criterion **AC-1** (e2e tier, service: Postgres 18 holocron_nonprod + fulcrum-router /model/info on 127.0.0.1:4547 + oMLX on inference1 and inference2):

```
pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 | grep -F '"verdict":"match" "dossierMatchesLedger":true "embeddingDimensions":1024'
```

Full gate set: 6 acceptance criteria, 10 test criteria, 6 verification gates.

## Scope

- services/platform/src/evals/fulcrum-dossier-verify.ts
- services/platform/src/cli/commands/fulcrum-verify.ts
- services/platform/src/cli/holo.ts
- services/platform/evals/thresholds/fulcrum_dossier_v1.json
- services/platform/tests/live/fulcrum-dossier-playback.test.ts
- services/platform/tests/live/fulcrum-negative-controls.test.ts
- services/platform/tests/integration/fulcrum-verify-purity.test.ts
- vitest.workspace.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-INFRA-003 - Verify the dossier with real-service playback and evals
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     8
AGENT:      implementer=devops-engineer | reviewer=devops-engineer (peer) + mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave J)
PROPOSED_BY:devops-engineer
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/6 ACs complete

SIZING_RATIONALE (8 pts): 8 is the honest size and it does not split: the value of this task is a SINGLE independent rejector, and every acceptance criterion is the same failure report — 'the dossier claims something the ledger does not support'. Splitting the positive recompute from the negative controls would ship a verifier whose teeth are unproven, which is exactly the failure mode this task exists to prevent. It is one module (`fulcrum-dossier-verify.ts`), one CLI command, and one live lane; the size comes from driving five real fault states (orphan dossier, role collision, no-host, canned claims, purity scan) against real Postgres, the real router, and both real minis, not from breadth of surface area.

DARK_JUSTIFICATION: No stranger-verbatim human test step invokes a test runner, a fault exercise, or an evaluation harness — the five human steps drive only the product CLI and read the dossier. This task is intentionally dark because its job is to independently REJECT false product success: it recomputes every dossier literal from the committed Postgres ledger and fails when the product fakes success (stubbed or absent inference, canned claims, an empty dossier, or a dossier written without a committed ledger row). A human step that exercised it would make the rejector part of the thing it judges. It is 8 of 69 committed points (11.6%), under the 30% dark ceiling.

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

`pnpm test:live` executes the two Fulcrum verification files: a real `holo fulcrum` run's dossier is confirmed literal-for-literal against recomputed Postgres and `/model/info` truth, and five real fault exercises — orphan dossier, role collision, both minis stopped, canned claims, non-deterministic measurement path — each produce an explicit reject with a named reason code.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST recompute every asserted dossier literal — belief score, admitted-claim count, verified-quote flag, embedding dimensions, requested roles, resolved model identities, serving backends — from Postgres and `/model/info`, never by re-reading the dossier's own text as its own evidence
- MUST: MUST prove each negative control actually bites by driving a real fault (a stopped oMLX service, a real router-config rebind, a real orphan file, a real canned-claims run) and observing the verifier reject
- MUST: MUST keep the verification path deterministic: zero `generateText`, zero model roles, zero `judge` (ADR-008)
- NEVER: NEVER disconnect any host from the internet, disable Wi-Fi, change network settings, or toggle a network interface; every fault in this task is a stopped service, a restricted model directory, or a router-config edit (AGENTS.md Network Continuity)
- NEVER: NEVER weaken an assertion, add `.skip`, or widen a tolerance to make the verifier pass; a failing verdict is the product's problem, never the verifier's
- NEVER: NEVER leave a fault state in place — every case restores oMLX on both minis and restores the router config before it ends
- NEVER: NEVER write a credential value into a fixture, threshold file, or captured artifact; credential-bearing names only, per the `AGENTS.md` secret index
- STRICTLY: STRICTLY treat this task as read-only with respect to product code: it may not edit `services/platform/src/mission/`, `services/platform/src/research/`, or `services/platform/src/db/` to make a verdict pass
- STRICTLY: STRICTLY register the two live files in the `live` lane of `vitest.workspace.ts` so `pnpm test:live` actually executes them; a verifier no lane runs is not a verifier

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-INFER-01, CAP-COMMIT-01, CAP-EVIDENCE-01, CAP-PUBLISH-01
provides:             fulcrum-dossier-ledger-verifier, fulcrum-live-verification-lane, fulcrum-substitution-rehearsal
consumes:             fulcrum-loopback-router-base-url, fulcrum-router-model-info-ids, fulcrum-role-set-on-both-minis, fulcrum-committed-dossier
boundary_contracts:
  - CONSUMES from FUL-INFRA-002: serving identity is recomputed from `x-litellm-model-id` and `x-litellm-model-api-base` recorded on `mission_stage_runs`, cross-referenced against `GET /model/info`; the response body `model` field is never accepted as identity
  - CONSUMES from FUL-PLAT-012 and FUL-PLAT-010: the dossier file named by `dossier_path` is the artifact under judgment; a dossier with no matching committed `mission_runs` row is rejected
  - PROVIDES to the sprint: a verdict that is a pure function of the committed Postgres ledger and the dossier bytes, with zero `generateText` and zero `judge` on the measurement path

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Every dossier literal is recomputed from the committed ledger [PRIMARY]
- [ ] AC-2: A dossier with no committed ledger row is rejected
- [ ] AC-3: A deliberate role collision is detected from headers, not the response body
- [ ] AC-4: With no inference backend nothing is committed and nothing is published
- [ ] AC-5: A canned-claims run leaves the ledger and the dossier directory untouched
- [ ] AC-6: The measurement path is deterministic and the live lane actually runs it
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Every dossier literal is recomputed from the committed ledger [PRIMARY] [PRIMARY]
  GIVEN: GIVEN one real `holo fulcrum` run has committed against real Postgres with both minis serving
  WHEN:  WHEN `holo fulcrum:verify --run-id <runId> --json` recomputes the belief score, admitted claims, quote verification, embedding dimensions, and serving backends from Postgres and `/model/info`
  THEN:  THEN the verdict is `match` and every recomputed value equals the literal printed in the dossier file

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: Postgres 18 holocron_nonprod + fulcrum-router /model/info on 127.0.0.1:4547 + oMLX on inference1 and inference2
  FLOW_REF:             UC-LIS-05 / T-LIS-021, T-LIS-023; 09-e2e-testing.md proven-reference-flow
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 | grep -F '"verdict":"match" "dossierMatchesLedger":true "embeddingDimensions":1024'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          Postgres 18 holocron_nonprod + fulcrum-router /model/info on 127.0.0.1:4547 + oMLX on inference1 and inference2
    NEGATIVE_CONTROL: would fail if the verifier re-reads the dossier text as its own evidence instead of querying Postgres, so a hardcoded dossier passes; the ledger query is stubbed or the database is empty, so the recomputed score has nothing to compare; the serving backend is taken from the response body model field, which LiteLLM rewrites and is therefore static
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: committed_fulcrum_run
        ACTOR:     cli_user
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json` against real Postgres, the real corpus, and the deployed router
        STEP:      capture the returned runId and dossierPath
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:verify --run-id <runId> --json`, which SELECTs from mission_runs, claims, belief_scores, and mission_stage_runs and reads GET http://127.0.0.1:4547/model/info
        MUST_OBSERVE:     `"verdict":"match" "dossierMatchesLedger":true "embeddingDimensions":1024`
        MUST_OBSERVE:     `"admittedClaims"` value of `1` or greater, equal to the count in `claims`
        MUST_OBSERVE:     `"beliefScore"` equal to the numeric `belief_scores.score` value to `6` decimal places
        MUST_OBSERVE:     `"requestedRoles":["convergent","divergent"]`
        MUST_OBSERVE:     `"resolvedModelIds"` holding `2` distinct values from the six pinned deployment ids
        MUST_OBSERVE:     `"servingBackends"` where every entry ends with `.tail011a51.ts.net:8003/v1`
        MUST_NOT_OBSERVE: `"admittedClaims":0`
        MUST_NOT_OBSERVE: `"verdict":"reject"`
        MUST_NOT_OBSERVE: an empty `resolvedModelIds` list

AC-2: A dossier with no committed ledger row is rejected
  GIVEN: GIVEN a dossier file exists on disk whose candidate id has no `mission_runs` row
  WHEN:  WHEN `holo fulcrum:verify --dossier .holocron/fulcrum/dossiers/cand-orphan-001.md --json` runs
  THEN:  THEN the verdict is `reject` with reason code `FULCRUM_DOSSIER_ORPHAN` and the command exits 1

  TEST_TIER:            integration
  VERIFICATION_SERVICE: Postgres 18 holocron_nonprod + real .holocron/fulcrum/dossiers filesystem
  FLOW_REF:             CAP-COMMIT-01 boundary — a dossier without a committed cycle is not a result
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-2' 2>&1 | grep -F '"verdict":"reject" "reasonCode":"FULCRUM_DOSSIER_ORPHAN" exit=1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          Postgres 18 holocron_nonprod + real .holocron/fulcrum/dossiers filesystem
    NEGATIVE_CONTROL: would fail if the verifier trusts the dossier text, so a hand-written file with the right literals is accepted; the ledger lookup is a no-op that returns a synthetic row for any candidate id; the reject path is unreachable because the verifier only ever emits a match verdict
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: orphan_dossier_file
        ACTOR:     cli_user
        STEP:      write `.holocron/fulcrum/dossiers/cand-orphan-001.md` containing `Admission: admitted`, `Verified quote: true`, and `Belief score: 0.83`
        STEP:      run `psql "$DATABASE_URL" -Atc "select count(*) from mission_runs where candidate_id = 'cand-orphan-001'"`
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:verify --dossier .holocron/fulcrum/dossiers/cand-orphan-001.md --json; echo exit=$?`
        MUST_OBSERVE:     `"verdict":"reject" "reasonCode":"FULCRUM_DOSSIER_ORPHAN" exit=1`
        MUST_OBSERVE:     `"missingRunFor":"cand-orphan-001"`
        MUST_OBSERVE:     `mission_runs` count of `0` for that candidate id
        MUST_NOT_OBSERVE: `"verdict":"match"`
        MUST_NOT_OBSERVE: `exit=0`
        MUST_NOT_OBSERVE: an empty `reasonCode`

AC-3: A deliberate role collision is detected from headers, not the response body
  GIVEN: GIVEN the router config is rebound so `convergent` resolves to the same deployment as `divergent-inference1`
  WHEN:  WHEN a Fulcrum cycle runs and `holo fulcrum:verify --run-id <runId> --json` recomputes ASSAY-versus-CHALLENGE distinctness from recorded `x-litellm-model-id` values cross-referenced against `/model/info`
  THEN:  THEN the verdict is `reject` with reason code `FULCRUM_ROLE_COLLISION` naming both roles and the shared deployment id

  TEST_TIER:            integration
  VERIFICATION_SERVICE: fulcrum-router /model/info on 127.0.0.1:4547 + Postgres 18 holocron_nonprod mission_stage_runs
  FLOW_REF:             UC-LIS-02 / T-LIS-006, T-LIS-022 substitution rehearsal
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-3' 2>&1 | grep -F '"reasonCode":"FULCRUM_ROLE_COLLISION" "sharedDeploymentId":"divergent-inference1"'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          fulcrum-router /model/info on 127.0.0.1:4547 + Postgres 18 holocron_nonprod mission_stage_runs
    NEGATIVE_CONTROL: would fail if distinctness is checked against the requested role names, which stay different even under a live substitution; distinctness is checked against the response body model field, which LiteLLM rewrites to the requested alias and is therefore static; the recorded deployment id column is empty so the comparison silently passes
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: role_collision_router_config
        ACTOR:     cli_user
        STEP:      edit `services/platform/deploy/compose/fulcrum-router.config.yaml` so both convergent rows carry the divergent model and the inference1 api_base, then run `docker compose restart fulcrum-router`
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json`
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:verify --run-id <runId> --json; echo exit=$?`
        STEP:      restore the config file from git and run `docker compose restart fulcrum-router`
        MUST_OBSERVE:     `"reasonCode":"FULCRUM_ROLE_COLLISION" "sharedDeploymentId":"divergent-inference1"`
        MUST_OBSERVE:     `"collidingRoles":["convergent","divergent"]`
        MUST_OBSERVE:     `"identitySource":"x-litellm-model-id"`
        MUST_OBSERVE:     `exit=1`
        MUST_NOT_OBSERVE: `"identitySource":"response.body.model"`
        MUST_NOT_OBSERVE: `"verdict":"match"`
        MUST_NOT_OBSERVE: an empty `collidingRoles` list

AC-4: With no inference backend nothing is committed and nothing is published
  GIVEN: GIVEN oMLX is stopped on both minis and `FULCRUM_CLOUD_FALLBACK` is off
  WHEN:  WHEN `holo fulcrum '<goal>' --fresh --json` runs and the ledger and dossier directory are re-counted
  THEN:  THEN the command fails closed with a role-unavailable code, the committed run count is unchanged, and no new dossier file exists

  TEST_TIER:            e2e
  VERIFICATION_SERVICE: oMLX stopped on inference1 and inference2 + Postgres 18 holocron_nonprod + .holocron/fulcrum/dossiers filesystem
  FLOW_REF:             UC-LIS-04 / T-LIS-016, T-LIS-020; CAP-COMMIT-01 non-partial outcome
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-4' 2>&1 | grep -F 'committed_runs_delta=0 dossier_files_delta=0 cloud_calls=0'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         multi-node
    SERVICE:          oMLX stopped on inference1 and inference2 + Postgres 18 holocron_nonprod + .holocron/fulcrum/dossiers filesystem
    NEGATIVE_CONTROL: would fail if the cycle writes a partial dossier from empty model output, so a file appears with no committed run; a cloud provider silently serves the call while both backends are stopped; only the first node is stopped and the second real node quietly serves the cycle, so the fail-closed path is never exercised
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: both_minis_stopped_for_verify
        ACTOR:     cli_user
        STEP:      record the committed run count and the dossier file count before the exercise
        STEP:      run `ssh inference1 'pkill -f "omlx serve"'` to stop the real service on the first node
        STEP:      run `ssh inference2 'pkill -f "omlx serve"'` to stop the real service on the second real node, changing no network setting on either host
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json; echo exit=$?`
        STEP:      re-count committed runs and dossier files, count cloud host hits in the router log, then restore both nodes with `ssh inference1 'bash ~/start-omlx-node.sh'` and `ssh inference2 'bash ~/start-omlx-node.sh'`
        MUST_OBSERVE:     `committed_runs_delta=0 dossier_files_delta=0 cloud_calls=0`
        MUST_OBSERVE:     `"errorCode":"FULCRUM_ROLE_UNAVAILABLE"`
        MUST_OBSERVE:     `"role":"divergent"` named in the failure payload
        MUST_OBSERVE:     `exit=1`
        MUST_NOT_OBSERVE: `"status":"committed"`
        MUST_NOT_OBSERVE: `dossier_files_delta=1`
        MUST_NOT_OBSERVE: an empty `errorCode`
      - START_REF: committed_fulcrum_run
        ACTOR:     cli_user
        STEP:      restore oMLX on the first real node and on the second real node, confirming each through its own `:8003/v1/models` endpoint
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json`
        STEP:      re-count committed runs and dossier files
        MUST_OBSERVE:     `committed_runs_delta=1 dossier_files_delta=1`
        MUST_OBSERVE:     `"status":"committed"`
        MUST_OBSERVE:     `"template":"evidence-research"`
        MUST_NOT_OBSERVE: `committed_runs_delta=0`
        MUST_NOT_OBSERVE: `"errorCode":"FULCRUM_ROLE_UNAVAILABLE"`
        MUST_NOT_OBSERVE: an empty `dossierPath`

AC-5: A canned-claims run leaves the ledger and the dossier directory untouched
  GIVEN: GIVEN a file of fabricated claims and an otherwise healthy stack
  WHEN:  WHEN `holo fulcrum '<goal>' --claims /tmp/fulcrum-canned.json --fresh --json` runs and the ledger is re-counted
  THEN:  THEN the run is refused with `FULCRUM_CORPUS_ONLY`, the `claims` row count is unchanged, and no new dossier file exists

  TEST_TIER:            integration
  VERIFICATION_SERVICE: Postgres 18 holocron_nonprod claims table + .holocron/fulcrum/dossiers filesystem
  FLOW_REF:             CAP-EVIDENCE-01 boundary — corpus-only retrieval; human step 5 side-effect audit
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-5' 2>&1 | grep -F 'claims_delta=0 dossier_files_delta=0 errorCode=FULCRUM_CORPUS_ONLY'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          Postgres 18 holocron_nonprod claims table + .holocron/fulcrum/dossiers filesystem
    NEGATIVE_CONTROL: would fail if the refusal is printed but the fabricated claim is still appended, so the ledger changes; the row counts are static constants rather than two real queries taken before and after; the dossier generator runs anyway and leaves an empty file behind
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: canned_claims_file
        ACTOR:     cli_user
        STEP:      run `psql "$DATABASE_URL" -Atc 'select count(*) from claims'` and record the value as claims_before
        STEP:      write `/tmp/fulcrum-canned.json` containing `[{"claim":"invented success"}]`
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --claims /tmp/fulcrum-canned.json --fresh --json`
        STEP:      run `psql "$DATABASE_URL" -Atc 'select count(*) from claims'` again and re-count files under .holocron/fulcrum/dossiers
        MUST_OBSERVE:     `claims_delta=0 dossier_files_delta=0 errorCode=FULCRUM_CORPUS_ONLY`
        MUST_OBSERVE:     `claims_before` equal to `claims_after`, both `1` or greater
        MUST_OBSERVE:     zero rows in `claims` whose text is `invented success`
        MUST_NOT_OBSERVE: `claims_after=0`
        MUST_NOT_OBSERVE: `"status":"committed"`
        MUST_NOT_OBSERVE: a claim row containing the literal `invented success`

AC-6: The measurement path is deterministic and the live lane actually runs it
  GIVEN: GIVEN the verifier module, CLI command, and live lane registration have landed
  WHEN:  WHEN the verification path is scanned for model calls and `pnpm test:live` is executed
  THEN:  THEN the scan finds 0 `generateText` calls and 0 `judge` references on the measurement path, and the live lane executes both Fulcrum verification files

  TEST_TIER:            integration
  VERIFICATION_SERVICE: Real repository worktree scanned with git grep plus the vitest live project resolver
  FLOW_REF:             UC-LIS-03 / T-LIS-013; ADR-008 no model judges a model
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-verify-purity.test.ts -t 'AC-6' 2>&1 | grep -F 'generateText_hits=0 judge_hits=0 live_lane_fulcrum_files=2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          Real repository worktree scanned with git grep plus the vitest live project resolver
    NEGATIVE_CONTROL: would fail if the verifier calls a model to grade the dossier, so the measurement is no longer deterministic; the scan targets a path that does not exist, so the tally is empty for a reason unrelated to purity; the live files are never registered in the lane, so the whole verifier is dead code no runner reaches
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: repo_worktree_with_verifier
        ACTOR:     cli_user
        STEP:      run `git grep -c -E 'generateText|\bjudge\b' -- services/platform/src/evals/fulcrum-dossier-verify.ts services/platform/src/cli/commands/fulcrum-verify.ts`
        STEP:      run `pnpm vitest list --project live 2>&1 | grep -c fulcrum`
        STEP:      run `pnpm test:live 2>&1 | tail -20`
        MUST_OBSERVE:     `generateText_hits=0 judge_hits=0 live_lane_fulcrum_files=2`
        MUST_OBSERVE:     `services/platform/tests/live/fulcrum-dossier-playback.test.ts` listed by the live project
        MUST_OBSERVE:     `services/platform/tests/live/fulcrum-negative-controls.test.ts` listed by the live project
        MUST_OBSERVE:     `Test Files  4 passed (4)`
        MUST_NOT_OBSERVE: `live_lane_fulcrum_files=0`
        MUST_NOT_OBSERVE: `generateText_hits=1`
        MUST_NOT_OBSERVE: an empty live project file list

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | The verifier emits `"verdict":"match"` when every dossier literal equals its recomputed ledger value. | AC-1 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 \| grep -F '"verdict":"match"'` |
| TC-2 | The verifier reports `"embeddingDimensions":1024` when the published dossier embedding is read from the ledger. | AC-1 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 \| grep -F '"embeddingDimensions":1024'` |
| TC-3 | The verifier emits reason code `FULCRUM_DOSSIER_ORPHAN` when the dossier candidate id has no `mission_runs` row. | AC-2 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-2' 2>&1 \| grep -F '"reasonCode":"FULCRUM_DOSSIER_ORPHAN"'` |
| TC-4 | The verifier reports `"identitySource":"x-litellm-model-id"` when it recomputes role distinctness. | AC-3 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-3' 2>&1 \| grep -F '"identitySource":"x-litellm-model-id"'` |
| TC-5 | The verifier names `divergent-inference1` as the shared deployment id when both chat roles resolve to one deployment. | AC-3 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-3' 2>&1 \| grep -F '"sharedDeploymentId":"divergent-inference1"'` |
| TC-6 | The committed run count is unchanged when oMLX is stopped on both minis. | AC-4 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-4' 2>&1 \| grep -F 'committed_runs_delta=0'` |
| TC-7 | The router log records `cloud_calls=0` when the cycle fails closed for role unavailability. | AC-4 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-4' 2>&1 \| grep -F 'cloud_calls=0'` |
| TC-8 | The `claims` row count is unchanged when the run supplies a canned claims file. | AC-5 | `pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-5' 2>&1 \| grep -F 'claims_delta=0'` |
| TC-9 | The verification path scan reports `generateText_hits=0 judge_hits=0` when run over the verifier module. | AC-6 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-verify-purity.test.ts -t 'AC-6' 2>&1 \| grep -F 'generateText_hits=0 judge_hits=0'` |
| TC-10 | The live project lists `live_lane_fulcrum_files=2` when the lane registration has landed. | AC-6 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-verify-purity.test.ts -t 'AC-6' 2>&1 \| grep -F 'live_lane_fulcrum_files=2'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/evals/fulcrum-dossier-verify.ts
- services/platform/src/cli/commands/fulcrum-verify.ts
- services/platform/src/cli/holo.ts
- services/platform/evals/thresholds/fulcrum_dossier_v1.json
- services/platform/tests/live/fulcrum-dossier-playback.test.ts
- services/platform/tests/live/fulcrum-negative-controls.test.ts
- services/platform/tests/integration/fulcrum-verify-purity.test.ts
- vitest.workspace.ts

writeProhibited:
- services/platform/src/mission/** — product code under judgment; editing it to make a verdict pass is the failure this task exists to catch
- services/platform/src/research/** — product code under judgment
- services/platform/src/db/** — the ledger under judgment
- services/platform/deploy/compose/fulcrum-router.config.yaml — may be rebound temporarily for the AC-3 rehearsal and MUST be restored from git; no committed change
- services/platform/src/evals/scorers.ts and services/platform/src/evals/research-scorers.ts — the local-judge path is forbidden on the Fulcrum measurement path
- .spec/** — the orchestrator owns sprint artifacts
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/evals/deterministic-scorers.ts:15

Independent oracle: recompute every asserted artifact literal from the system of record, compare byte-for-byte, and prove the comparison bites by driving each real fault state and observing a named reject reason code.

ANTI-PATTERN: Reading the dossier as its own evidence, grading with a model, asserting only that the command exited 0, or leaving a negative control unproven so the verifier can never actually fail.

References:
- .spec/prds/fulcrum/09-technical-requirements/09-e2e-testing.md
- .spec/prds/fulcrum/09-technical-requirements/08-capability-chains.md

Notes:
- N
- o
-  
- U
- I
-  
- s
- u
- r
- f
- a
- c
- e
- .
-  
- T
- h
- e
-  
- o
- p
- e
- r
- a
- t
- o
- r
-  
- s
- u
- r
- f
- a
- c
- e
-  
- i
- s
-  
- `
- h
- o
- l
- o
-  
- f
- u
- l
- c
- r
- u
- m
- :
- v
- e
- r
- i
- f
- y
-  
- -
- -
- j
- s
- o
- n
- `
- ,
-  
- w
- h
- o
- s
- e
-  
- s
- t
- d
- o
- u
- t
-  
- p
- l
- u
- s
-  
- t
- h
- e
-  
- c
- a
- p
- t
- u
- r
- e
- d
-  
- S
- Q
- L
-  
- r
- e
- s
- u
- l
- t
-  
- s
- e
- t
-  
- i
- s
-  
- t
- h
- e
-  
- e
- v
- i
- d
- e
- n
- c
- e
-  
- a
- r
- t
- i
- f
- a
- c
- t
- ;
-  
- t
- h
- e
-  
- v
- e
- r
- d
- i
- c
- t
-  
- i
- s
-  
- m
- a
- c
- h
- i
- n
- e
- -
- r
- e
- a
- d
- a
- b
- l
- e
-  
- s
- o
-  
- a
-  
- C
- I
-  
- l
- a
- n
- e
-  
- c
- a
- n
-  
- g
- a
- t
- e
-  
- o
- n
-  
- t
- h
- e
-  
- r
- e
- a
- s
- o
- n
-  
- c
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
- o
- n
-  
- p
- r
- o
- s
- e
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/evals/deterministic-scorers.ts
   - Lines: 1-60
   - Focus: [PRIMARY PATTERN] deterministic invariant scorer shape — structured failures with an invariantId, fail-closed, independent of any model prose; the dossier verifier is the same shape over ledger values
2. services/platform/src/inference/infer-trace.ts
   - Lines: 1-60
   - Focus: How committed model-call evidence is loaded from `inference_telemetry` against holocron_nonprod without inventing rows; the verifier must resolve the same database identity
3. services/platform/src/evals/ci-gate.ts
   - Lines: 1-40
   - Focus: Fail-closed CI gate conventions: versioned thresholds, non-zero exit on regression, no soft-warn; the anti-pattern list at the top applies directly
4. vitest.workspace.ts
   - Lines: 108-135
   - Focus: The live project include list — the two Fulcrum live files must be registered here or `pnpm test:live` never reaches them
5. .spec/prds/fulcrum/09-technical-requirements/09-e2e-testing.md
   - Lines: 1-60
   - Focus: Harness constitution, the determinism seam, the substitution landmine, and the flake policy for live-inference lanes

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

Gate 1: Live lane
  Command:  pnpm test:live
  Expected: `Test Files  4 passed (4)` including both Fulcrum live files, with stdout containing `"verdict":"match"`

Gate 2: Integration lane
  Command:  pnpm test:integration
  Expected: `fulcrum-verify-purity.test.ts` passes and stdout contains `generateText_hits=0 judge_hits=0 live_lane_fulcrum_files=2`

Gate 3: Typecheck
  Command:  pnpm tsgo --noEmit
  Expected: No diagnostics referencing `fulcrum-dossier-verify.ts` or `fulcrum-verify.ts`

Gate 4: Lint
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/evals/fulcrum-dossier-verify.ts services/platform/src/cli/commands/fulcrum-verify.ts services/platform/tests/live/fulcrum-dossier-playback.test.ts services/platform/tests/live/fulcrum-negative-controls.test.ts services/platform/tests/integration/fulcrum-verify-purity.test.ts
  Expected: Checked 5 files with 0 errors

Gate 5: Lane conformance
  Command:  pnpm test:lanes
  Expected: The two Fulcrum live files are counted in the live lane, not the unit lane

Gate 6: Negative-control proof
  Command:  pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts 2>&1 | grep -F '"reasonCode":"FULCRUM_ROLE_COLLISION"'
  Expected: The substitution rehearsal produced a real reject reason code, proving the identity check reads headers rather than the response body

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: devops-engineer
Rationale:   This is verification infrastructure — a live CI lane, real-service fault exercises against both minis and the router, and a deterministic eval gate wired into the test lanes. devops-engineer owns CI lane wiring and infrastructure fault exercises; the task deliberately does NOT implement product behavior, so it must not be owned by the same mastra-implementer agent that wrote the code it judges.
Reviewer:    devops-engineer (peer) + mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- AGENTS.md
- docs/LAY-OF-THE-LAND.md
- .spec/prds/fulcrum/09-technical-requirements/09-e2e-testing.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-INFRA-001, FUL-INFRA-002, FUL-PLAT-011, FUL-PLAT-012
Blocks:     none
Wave:       J

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
  "task_id": "FUL-INFRA-003",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "committed_fulcrum_run": {
      "description": "One real holo fulcrum run committed against real Postgres with both minis serving and the fulcrum-router up, leaving a mission_runs row and a dossier file on disk",
      "seed_method": "cli",
      "records": [
        "mission_runs has 1 row with template_key evidence-research and tag fulcrum",
        "claims has at least 1 admitted row with verified_quote true",
        "belief_scores has 1 numeric row stamping domain_tier_version",
        "mission_stage_runs records x-litellm-model-id and x-litellm-model-api-base per chat stage",
        ".holocron/fulcrum/dossiers/{candidateId}.md exists and names the same candidate id"
      ]
    },
    "orphan_dossier_file": {
      "description": "A dossier markdown file written directly to .holocron/fulcrum/dossiers/cand-orphan-001.md whose candidate id has no mission_runs row in Postgres",
      "seed_method": "cli",
      "records": [
        "the file contains the literals Admission: admitted and Verified quote: true and Belief score: 0.83",
        "SELECT count(*) FROM mission_runs WHERE candidate_id = 'cand-orphan-001' returns 0"
      ]
    },
    "role_collision_router_config": {
      "description": "The fulcrum-router config rebound so both convergent rows carry the same api_base and served model as divergent-inference1, then the router reloaded; both minis keep serving normally",
      "seed_method": "cli",
      "records": [
        "GET /model/info reports convergent-inference1 and convergent-inference2 pointing at the divergent model on inference1",
        "the response body model field still echoes the requested alias convergent",
        "both minis still serve all three Fulcrum basenames on :8003"
      ]
    },
    "both_minis_stopped_for_verify": {
      "description": "Both minis have oMLX stopped with pkill over SSH and FULCRUM_CLOUD_FALLBACK is off; every network interface stays up and the stack keeps running",
      "seed_method": "cli",
      "records": [
        "inference1 :8003 refuses TCP connections",
        "inference2 :8003 refuses TCP connections",
        "the pre-existing dossier file count under .holocron/fulcrum/dossiers is recorded before the run"
      ]
    },
    "canned_claims_file": {
      "description": "A file /tmp/fulcrum-canned.json containing one fabricated claim, with a real corpus and real Postgres otherwise available",
      "seed_method": "cli",
      "records": [
        "/tmp/fulcrum-canned.json contains [{\"claim\":\"invented success\"}]",
        "the claims row count and dossier file count are recorded before the run"
      ]
    },
    "repo_worktree_with_verifier": {
      "description": "The repository worktree after the verifier module, CLI command, live tests, and live lane registration have landed",
      "seed_method": "cli",
      "records": [
        "services/platform/src/evals/fulcrum-dossier-verify.ts exists",
        "vitest.workspace.ts live project include lists the two fulcrum live test files",
        "services/platform/evals/thresholds/fulcrum_dossier_v1.json declares the accepted reason codes"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN one real `holo fulcrum` run has committed against real Postgres with both minis serving WHEN `holo fulcrum:verify --run-id <runId> --json` recomputes the belief score, admitted claims, quote verification, embedding dimensions, and serving backends from Postgres and `/model/info` THEN the verdict is `match` and every recomputed value equals the literal printed in the dossier file",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 | grep -F '\"verdict\":\"match\" \"dossierMatchesLedger\":true \"embeddingDimensions\":1024'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "Postgres 18 holocron_nonprod + fulcrum-router /model/info on 127.0.0.1:4547 + oMLX on inference1 and inference2",
      "scenario": {
        "id": "SC-FUL-INFRA-003-AC1",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Postgres 18 holocron_nonprod + fulcrum-router /model/info on 127.0.0.1:4547 + oMLX on inference1 and inference2",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the verifier re-reads the dossier text as its own evidence instead of querying Postgres, so a hardcoded dossier passes",
            "the ledger query is stubbed or the database is empty, so the recomputed score has nothing to compare",
            "the serving backend is taken from the response body model field, which LiteLLM rewrites and is therefore static"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "committed_fulcrum_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --json` against real Postgres, the real corpus, and the deployed router",
                "capture the returned runId and dossierPath",
                "run `bun services/platform/src/cli/holo.ts fulcrum:verify --run-id <runId> --json`, which SELECTs from mission_runs, claims, belief_scores, and mission_stage_runs and reads GET http://127.0.0.1:4547/model/info"
              ]
            },
            "end_state": {
              "must_observe": [
                "`\"verdict\":\"match\" \"dossierMatchesLedger\":true \"embeddingDimensions\":1024`",
                "`\"admittedClaims\"` value of `1` or greater, equal to the count in `claims`",
                "`\"beliefScore\"` equal to the numeric `belief_scores.score` value to `6` decimal places",
                "`\"requestedRoles\":[\"convergent\",\"divergent\"]`",
                "`\"resolvedModelIds\"` holding `2` distinct values from the six pinned deployment ids",
                "`\"servingBackends\"` where every entry ends with `.tail011a51.ts.net:8003/v1`"
              ],
              "must_not_observe": [
                "`\"admittedClaims\":0`",
                "`\"verdict\":\"reject\"`",
                "an empty `resolvedModelIds` list"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a dossier file exists on disk whose candidate id has no `mission_runs` row WHEN `holo fulcrum:verify --dossier .holocron/fulcrum/dossiers/cand-orphan-001.md --json` runs THEN the verdict is `reject` with reason code `FULCRUM_DOSSIER_ORPHAN` and the command exits 1",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-2' 2>&1 | grep -F '\"verdict\":\"reject\" \"reasonCode\":\"FULCRUM_DOSSIER_ORPHAN\" exit=1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "Postgres 18 holocron_nonprod + real .holocron/fulcrum/dossiers filesystem",
      "scenario": {
        "id": "SC-FUL-INFRA-003-AC2",
        "primary": true,
        "tier": "holdout",
        "test_tier": "integration",
        "verification_service": "Postgres 18 holocron_nonprod + real .holocron/fulcrum/dossiers filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the verifier trusts the dossier text, so a hand-written file with the right literals is accepted",
            "the ledger lookup is a no-op that returns a synthetic row for any candidate id",
            "the reject path is unreachable because the verifier only ever emits a match verdict"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "orphan_dossier_file",
            "action": {
              "actor": "cli_user",
              "steps": [
                "write `.holocron/fulcrum/dossiers/cand-orphan-001.md` containing `Admission: admitted`, `Verified quote: true`, and `Belief score: 0.83`",
                "run `psql \"$DATABASE_URL\" -Atc \"select count(*) from mission_runs where candidate_id = 'cand-orphan-001'\"`",
                "run `bun services/platform/src/cli/holo.ts fulcrum:verify --dossier .holocron/fulcrum/dossiers/cand-orphan-001.md --json; echo exit=$?`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`\"verdict\":\"reject\" \"reasonCode\":\"FULCRUM_DOSSIER_ORPHAN\" exit=1`",
                "`\"missingRunFor\":\"cand-orphan-001\"`",
                "`mission_runs` count of `0` for that candidate id"
              ],
              "must_not_observe": [
                "`\"verdict\":\"match\"`",
                "`exit=0`",
                "an empty `reasonCode`"
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
      "description": "GIVEN the router config is rebound so `convergent` resolves to the same deployment as `divergent-inference1` WHEN a Fulcrum cycle runs and `holo fulcrum:verify --run-id <runId> --json` recomputes ASSAY-versus-CHALLENGE distinctness from recorded `x-litellm-model-id` values cross-referenced against `/model/info` THEN the verdict is `reject` with reason code `FULCRUM_ROLE_COLLISION` naming both roles and the shared deployment id",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-3' 2>&1 | grep -F '\"reasonCode\":\"FULCRUM_ROLE_COLLISION\" \"sharedDeploymentId\":\"divergent-inference1\"'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "fulcrum-router /model/info on 127.0.0.1:4547 + Postgres 18 holocron_nonprod mission_stage_runs",
      "scenario": {
        "id": "SC-FUL-INFRA-003-AC3",
        "primary": true,
        "tier": "holdout",
        "test_tier": "integration",
        "verification_service": "fulcrum-router /model/info on 127.0.0.1:4547 + Postgres 18 holocron_nonprod mission_stage_runs",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "distinctness is checked against the requested role names, which stay different even under a live substitution",
            "distinctness is checked against the response body model field, which LiteLLM rewrites to the requested alias and is therefore static",
            "the recorded deployment id column is empty so the comparison silently passes"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "role_collision_router_config",
            "action": {
              "actor": "cli_user",
              "steps": [
                "edit `services/platform/deploy/compose/fulcrum-router.config.yaml` so both convergent rows carry the divergent model and the inference1 api_base, then run `docker compose restart fulcrum-router`",
                "run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json`",
                "run `bun services/platform/src/cli/holo.ts fulcrum:verify --run-id <runId> --json; echo exit=$?`",
                "restore the config file from git and run `docker compose restart fulcrum-router`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`\"reasonCode\":\"FULCRUM_ROLE_COLLISION\" \"sharedDeploymentId\":\"divergent-inference1\"`",
                "`\"collidingRoles\":[\"convergent\",\"divergent\"]`",
                "`\"identitySource\":\"x-litellm-model-id\"`",
                "`exit=1`"
              ],
              "must_not_observe": [
                "`\"identitySource\":\"response.body.model\"`",
                "`\"verdict\":\"match\"`",
                "an empty `collidingRoles` list"
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
      "description": "GIVEN oMLX is stopped on both minis and `FULCRUM_CLOUD_FALLBACK` is off WHEN `holo fulcrum '<goal>' --fresh --json` runs and the ledger and dossier directory are re-counted THEN the command fails closed with a role-unavailable code, the committed run count is unchanged, and no new dossier file exists",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-4' 2>&1 | grep -F 'committed_runs_delta=0 dossier_files_delta=0 cloud_calls=0'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "verification_service": "oMLX stopped on inference1 and inference2 + Postgres 18 holocron_nonprod + .holocron/fulcrum/dossiers filesystem",
      "scenario": {
        "id": "SC-FUL-INFRA-003-AC4",
        "primary": true,
        "tier": "holdout",
        "test_tier": "e2e",
        "verification_service": "oMLX stopped on inference1 and inference2 + Postgres 18 holocron_nonprod + .holocron/fulcrum/dossiers filesystem",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the cycle writes a partial dossier from empty model output, so a file appears with no committed run",
            "a cloud provider silently serves the call while both backends are stopped",
            "only the first node is stopped and the second real node quietly serves the cycle, so the fail-closed path is never exercised"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "both_minis_stopped_for_verify",
            "action": {
              "actor": "cli_user",
              "steps": [
                "record the committed run count and the dossier file count before the exercise",
                "run `ssh inference1 'pkill -f \"omlx serve\"'` to stop the real service on the first node",
                "run `ssh inference2 'pkill -f \"omlx serve\"'` to stop the real service on the second real node, changing no network setting on either host",
                "run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json; echo exit=$?`",
                "re-count committed runs and dossier files, count cloud host hits in the router log, then restore both nodes with `ssh inference1 'bash ~/start-omlx-node.sh'` and `ssh inference2 'bash ~/start-omlx-node.sh'`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`committed_runs_delta=0 dossier_files_delta=0 cloud_calls=0`",
                "`\"errorCode\":\"FULCRUM_ROLE_UNAVAILABLE\"`",
                "`\"role\":\"divergent\"` named in the failure payload",
                "`exit=1`"
              ],
              "must_not_observe": [
                "`\"status\":\"committed\"`",
                "`dossier_files_delta=1`",
                "an empty `errorCode`"
              ]
            }
          },
          {
            "start_ref": "committed_fulcrum_run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "restore oMLX on the first real node and on the second real node, confirming each through its own `:8003/v1/models` endpoint",
                "run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json`",
                "re-count committed runs and dossier files"
              ]
            },
            "end_state": {
              "must_observe": [
                "`committed_runs_delta=1 dossier_files_delta=1`",
                "`\"status\":\"committed\"`",
                "`\"template\":\"evidence-research\"`"
              ],
              "must_not_observe": [
                "`committed_runs_delta=0`",
                "`\"errorCode\":\"FULCRUM_ROLE_UNAVAILABLE\"`",
                "an empty `dossierPath`"
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
      "description": "GIVEN a file of fabricated claims and an otherwise healthy stack WHEN `holo fulcrum '<goal>' --claims /tmp/fulcrum-canned.json --fresh --json` runs and the ledger is re-counted THEN the run is refused with `FULCRUM_CORPUS_ONLY`, the `claims` row count is unchanged, and no new dossier file exists",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-5' 2>&1 | grep -F 'claims_delta=0 dossier_files_delta=0 errorCode=FULCRUM_CORPUS_ONLY'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "Postgres 18 holocron_nonprod claims table + .holocron/fulcrum/dossiers filesystem",
      "scenario": {
        "id": "SC-FUL-INFRA-003-AC5",
        "primary": true,
        "tier": "holdout",
        "test_tier": "integration",
        "verification_service": "Postgres 18 holocron_nonprod claims table + .holocron/fulcrum/dossiers filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the refusal is printed but the fabricated claim is still appended, so the ledger changes",
            "the row counts are static constants rather than two real queries taken before and after",
            "the dossier generator runs anyway and leaves an empty file behind"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "canned_claims_file",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `psql \"$DATABASE_URL\" -Atc 'select count(*) from claims'` and record the value as claims_before",
                "write `/tmp/fulcrum-canned.json` containing `[{\"claim\":\"invented success\"}]`",
                "run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --claims /tmp/fulcrum-canned.json --fresh --json`",
                "run `psql \"$DATABASE_URL\" -Atc 'select count(*) from claims'` again and re-count files under .holocron/fulcrum/dossiers"
              ]
            },
            "end_state": {
              "must_observe": [
                "`claims_delta=0 dossier_files_delta=0 errorCode=FULCRUM_CORPUS_ONLY`",
                "`claims_before` equal to `claims_after`, both `1` or greater",
                "zero rows in `claims` whose text is `invented success`"
              ],
              "must_not_observe": [
                "`claims_after=0`",
                "`\"status\":\"committed\"`",
                "a claim row containing the literal `invented success`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the verifier module, CLI command, and live lane registration have landed WHEN the verification path is scanned for model calls and `pnpm test:live` is executed THEN the scan finds 0 `generateText` calls and 0 `judge` references on the measurement path, and the live lane executes both Fulcrum verification files",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-verify-purity.test.ts -t 'AC-6' 2>&1 | grep -F 'generateText_hits=0 judge_hits=0 live_lane_fulcrum_files=2'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "Real repository worktree scanned with git grep plus the vitest live project resolver",
      "scenario": {
        "id": "SC-FUL-INFRA-003-AC6",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Real repository worktree scanned with git grep plus the vitest live project resolver",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the verifier calls a model to grade the dossier, so the measurement is no longer deterministic",
            "the scan targets a path that does not exist, so the tally is empty for a reason unrelated to purity",
            "the live files are never registered in the lane, so the whole verifier is dead code no runner reaches"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo_worktree_with_verifier",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `git grep -c -E 'generateText|\\bjudge\\b' -- services/platform/src/evals/fulcrum-dossier-verify.ts services/platform/src/cli/commands/fulcrum-verify.ts`",
                "run `pnpm vitest list --project live 2>&1 | grep -c fulcrum`",
                "run `pnpm test:live 2>&1 | tail -20`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`generateText_hits=0 judge_hits=0 live_lane_fulcrum_files=2`",
                "`services/platform/tests/live/fulcrum-dossier-playback.test.ts` listed by the live project",
                "`services/platform/tests/live/fulcrum-negative-controls.test.ts` listed by the live project",
                "`Test Files  4 passed (4)`"
              ],
              "must_not_observe": [
                "`live_lane_fulcrum_files=0`",
                "`generateText_hits=1`",
                "an empty live project file list"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The verifier emits `\"verdict\":\"match\"` when every dossier literal equals its recomputed ledger value.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 | grep -F '\"verdict\":\"match\"'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The verifier reports `\"embeddingDimensions\":1024` when the published dossier embedding is read from the ledger.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-dossier-playback.test.ts -t 'AC-1' 2>&1 | grep -F '\"embeddingDimensions\":1024'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The verifier emits reason code `FULCRUM_DOSSIER_ORPHAN` when the dossier candidate id has no `mission_runs` row.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-2' 2>&1 | grep -F '\"reasonCode\":\"FULCRUM_DOSSIER_ORPHAN\"'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The verifier reports `\"identitySource\":\"x-litellm-model-id\"` when it recomputes role distinctness.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-3' 2>&1 | grep -F '\"identitySource\":\"x-litellm-model-id\"'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The verifier names `divergent-inference1` as the shared deployment id when both chat roles resolve to one deployment.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-3' 2>&1 | grep -F '\"sharedDeploymentId\":\"divergent-inference1\"'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The committed run count is unchanged when oMLX is stopped on both minis.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-4' 2>&1 | grep -F 'committed_runs_delta=0'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The router log records `cloud_calls=0` when the cycle fails closed for role unavailability.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-4' 2>&1 | grep -F 'cloud_calls=0'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The `claims` row count is unchanged when the run supplies a canned claims file.",
      "verify": "pnpm vitest run --project live services/platform/tests/live/fulcrum-negative-controls.test.ts -t 'AC-5' 2>&1 | grep -F 'claims_delta=0'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "The verification path scan reports `generateText_hits=0 judge_hits=0` when run over the verifier module.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-verify-purity.test.ts -t 'AC-6' 2>&1 | grep -F 'generateText_hits=0 judge_hits=0'",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The live project lists `live_lane_fulcrum_files=2` when the lane registration has landed.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-verify-purity.test.ts -t 'AC-6' 2>&1 | grep -F 'live_lane_fulcrum_files=2'",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->

</details>

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): Every dossier literal is recomputed from the committed ledger [PRIMARY]
- [ ] AC-2: A dossier with no committed ledger row is rejected
- [ ] AC-3: A deliberate role collision is detected from headers, not the response body
- [ ] AC-4: With no inference backend nothing is committed and nothing is published
- [ ] AC-5: A canned-claims run leaves the ledger and the dossier directory untouched
- [ ] AC-6: The measurement path is deterministic and the live lane actually runs it
