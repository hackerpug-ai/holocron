# FUL-PLAT-007 — Attest every Fulcrum inference call from router-truthful metadata

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** C
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Make every Fulcrum inference call carry a durable, router-truthful record of which node actually served it and which model identity answered, so ASSAY-vs-CHALLENGE distinctness and the no-cloud guarantee are auditable after the fact.

## Why

After a chat call on divergent and one on convergent through the image-local router, holo telemetry:tail --json shows one row per call whose endpoint is http://inference1.tail011a51.ts.net:8003/v1 or http://inference2.tail011a51.ts.net:8003/v1 and whose model_id is the header-derived x-litellm-model-id, with the two chat rows carrying two different model ids; an embed call records 1024 dimensions; a call whose header names a non-mini host is recorded with error_code MODEL_ENDPOINT_UNTRUSTED.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: live image-local LiteLLM router load-balancing to real oMLX on both nodes inference1 and inference2, plus real Postgres holocron_nonprod):

```
PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "AC-1"
```

Full gate set: 5 acceptance criteria, 6 test criteria, 5 verification gates.

## Scope

- packages/platform/src/inference/serving-attestation.ts (NEW)
- packages/platform/src/inference/model-info.ts (NEW)
- packages/platform/src/inference/telemetry.ts (MODIFY)
- packages/platform/src/inference/resolve-model.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-serving-attestation.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-007 - Attest every Fulcrum inference call from router-truthful metadata
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave C)
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

After a chat call on divergent and one on convergent through the image-local router, holo telemetry:tail --json shows one row per call whose endpoint is http://inference1.tail011a51.ts.net:8003/v1 or http://inference2.tail011a51.ts.net:8003/v1 and whose model_id is the header-derived x-litellm-model-id, with the two chat rows carrying two different model ids; an embed call records 1024 dimensions; a call whose header names a non-mini host is recorded with error_code MODEL_ENDPOINT_UNTRUSTED.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: Read the serving backend from the x-litellm-model-api-base and x-litellm-model-id response headers and confirm the pairing against a real GET /model/info call on the image-local router.
- MUST: Persist the header-derived serving api-base and resolved model id on every inference_telemetry row for chat calls.
- MUST: Fail closed with error_code MODEL_ENDPOINT_UNTRUSTED when the header is missing or names a host that is not inference1 or inference2.
- NEVER: Never read the response body model field as evidence of which backend served a call — it echoes the requested alias and passes against a live substitution.
- NEVER: Never write a hardcoded backend name, a default backend name, or a placeholder api-base into a telemetry row.
- NEVER: Never request the judge role or a coder role (reviewer/implementer/orchestrator/qwen-coder/verifier) from the Fulcrum path — the prohibition is on what Fulcrum REQUESTS, not on the shared platform vocabulary.
- NEVER: Never remove, narrow, or rename `judge` in the shared packages/platform/src/fleet/manifest.schema.ts or packages/platform/fleet/manifest.json — non-Fulcrum platform paths depend on it and ADR-008 forbids judge for Fulcrum only.
- NEVER: Never modify files outside packages/platform/src/inference/** — FUL-PLAT-003 and FUL-PLAT-006 share wave C and FUL-INFRA-001 owns packages/platform/deploy/fleet/**.
- STRICTLY: No z.any() in the attestation schemas — the serving-attestation record is a closed Zod object.
- STRICTLY: No mock of the LiteLLM router, no recorded HTTP fixtures: the integration test drives the live router on both nodes.

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-INFER-01
provides:             router-truthful-serving-attestation (per-call serving api-base read from x-litellm-model-api-base and confirmed against GET /model/info), resolved-model-identity-per-role (x-litellm-model-id persisted per chat call for after-the-fact ASSAY-vs-CHALLENGE audit), embedding-dimensionality-record (1024 recorded for embed-role calls that carry no model identifier), assay-challenge-distinctness-predicate on resolved identity
consumes:             image-local-litellm-router-endpoint (FUL-INFRA-002), fulcrum-expected-role-manifest at packages/platform/deploy/fleet/fulcrum-roles.json (FUL-INFRA-001), fulcrum-substrate-readiness-probe at packages/platform/src/fleet/fulcrum-role-readiness.ts (FUL-INFRA-001)
boundary_contracts:
  - Serving identity is read from the router response headers cross-referenced against GET /model/info — never from the response body model field, which LiteLLM 1.91.0 rewrites to the requested alias
  - Every persisted chat-call row names a serving api-base of inference1 or inference2; any other api-base is recorded with error_code MODEL_ENDPOINT_UNTRUSTED and never as success
  - divergent and convergent must resolve to two different served model identities; identical resolved identity fails closed before the cycle proceeds
  - The embed role receives only embedding calls and records 1024 dimensions; no chat role receives an embed call, and the Fulcrum role vocabulary in packages/platform/deploy/fleet/fulcrum-roles.json contains no `judge` entry while the shared platform manifest keeps its own `judge` untouched

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Serving backend attested from router headers across both nodes
- [ ] AC-2: ASSAY-vs-CHALLENGE distinctness enforced on resolved identity
- [ ] AC-3: Embed-role call records 1024 dimensions
- [ ] AC-4: Missing serving header fails closed
- [ ] AC-5: Fulcrum vocabulary excludes judge and no forbidden role is requested
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Serving backend attested from router headers across both nodes [PRIMARY]
  GIVEN: both nodes inference1 and inference2 serve divergent and convergent behind the image-local router
  WHEN:  one chat call runs on divergent and one on convergent through the router
  THEN:  each persisted telemetry row names a serving api-base taken from x-litellm-model-api-base and confirmed against GET /model/info

  TEST_TIER:            integration
  VERIFICATION_SERVICE: live image-local LiteLLM router load-balancing to real oMLX on both nodes inference1 and inference2, plus real Postgres holocron_nonprod
  FLOW_REF:             CAP-INFER-01 hop: stage -> modelRoleBindings -> image-local router -> inference1/inference2
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "AC-1"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          live image-local LiteLLM router + real oMLX on both nodes + real Postgres holocron_nonprod
    NEGATIVE_CONTROL: would fail if the serving api-base is hardcoded to a mini name in the attestation module instead of read from the response header; the attestation reads the response body `model` field, which is unchanged by a live substitution; the GET /model/info cross-reference is removed and the header is trusted alone; the router is disconnected and the code still records a success row
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fleet_roles_live_both_nodes
        ACTOR:     cli_user
        STEP:      run `holo infer:call --role divergent --json` against the image-local router
        STEP:      run `holo infer:call --role convergent --json` against the image-local router
        STEP:      run `holo telemetry:tail --run-id <probeRunId> --json` to read the durable rows
        MUST_OBSERVE:     `endpoint` equals `http://inference1.tail011a51.ts.net:8003/v1` or `http://inference2.tail011a51.ts.net:8003/v1` on both rows
        MUST_OBSERVE:     `model_id` on each row equals the `x-litellm-model-id` header value returned by that call
        MUST_OBSERVE:     2 rows with `status` = `success`
        MUST_OBSERVE:     the union of `endpoint` values across the calls covers both nodes when `GET /model/info` lists 2 entries for the role
        MUST_NOT_OBSERVE: `endpoint` equal to the loopback router base `http://127.0.0.1:4545/v1`
        MUST_NOT_OBSERVE: 0 rows carrying a header-derived api-base
        MUST_NOT_OBSERVE: an `endpoint` value of `none`, `default` or a blank string
      - START_REF: router_answering_from_untrusted_host
        ACTOR:     cli_user
        STEP:      run `holo infer:call --role divergent --json` while the router answers from an api-base that is not a mini
        STEP:      run `holo telemetry:tail --run-id <probeRunId> --json`
        MUST_OBSERVE:     1 row with `error_code` = `MODEL_ENDPOINT_UNTRUSTED`
        MUST_OBSERVE:     `status` = `error` on that row
        MUST_OBSERVE:     `error_message` naming `http://127.0.0.1:9999/v1`
        MUST_NOT_OBSERVE: `status` = `success` on that row
        MUST_NOT_OBSERVE: 0 rows recorded for the call
        MUST_NOT_OBSERVE: an `endpoint` of `http://inference1.tail011a51.ts.net:8003/v1`

AC-2: ASSAY-vs-CHALLENGE distinctness enforced on resolved identity
  GIVEN: the router binds divergent and convergent to a single served model
  WHEN:  the attestation module compares the two roles' resolved identities before a cycle proceeds
  THEN:  it refuses with a named error listing both roles and the shared model id

  TEST_TIER:            integration
  VERIFICATION_SERVICE: live image-local LiteLLM router GET /model/info + real chat calls
  FLOW_REF:             CAP-INFER-01 boundary contract: assert-distinct on resolved identity, fail closed
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "AC-2"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          live image-local LiteLLM router GET /model/info + real chat calls
    NEGATIVE_CONTROL: would fail if distinctness is compared on the configured role names instead of the resolved model id; the comparison is a no-op that returns true unconditionally; the resolved identity is read from the response body, which is unchanged when both roles share a model
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: router_roles_collapsed_to_one_model
        ACTOR:     cli_user
        STEP:      run `holo infer:call --role divergent --json` and `holo infer:call --role convergent --json`
        STEP:      call `assertRolesDistinct(['divergent','convergent'])` through the attestation module
        MUST_OBSERVE:     error code `FULCRUM_ROLE_IDENTITY_COLLISION`
        MUST_OBSERVE:     the message names both `divergent` and `convergent`
        MUST_OBSERVE:     the message names the shared `x-litellm-model-id` value
        MUST_NOT_OBSERVE: exit code `0`
        MUST_NOT_OBSERVE: an empty error message
        MUST_NOT_OBSERVE: a report of 2 distinct model ids
      - START_REF: fleet_roles_live_both_nodes
        ACTOR:     cli_user
        STEP:      run `holo infer:call --role divergent --json` and `holo infer:call --role convergent --json`
        STEP:      call `assertRolesDistinct(['divergent','convergent'])` through the attestation module
        MUST_OBSERVE:     2 distinct `x-litellm-model-id` values recorded
        MUST_OBSERVE:     exit code `0`
        MUST_NOT_OBSERVE: error code `FULCRUM_ROLE_IDENTITY_COLLISION`
        MUST_NOT_OBSERVE: 0 recorded model ids

AC-3: Embed-role call records 1024 dimensions
  GIVEN: the embed role is served behind the image-local router and embedding responses carry no model identifier
  WHEN:  an embedding call runs through the instrumented fleet client
  THEN:  the attestation records dimensionality 1024 for that call instead of a model identity

  TEST_TIER:            integration
  VERIFICATION_SERVICE: live image-local LiteLLM router embed role + real Postgres holocron_nonprod
  FLOW_REF:             CAP-INFER-01 boundary contract: embed used only for embedding, 1024-dim assertion replaces model identity
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "AC-3"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          live image-local LiteLLM router embed role + real Postgres holocron_nonprod
    NEGATIVE_CONTROL: would fail if the dimensionality is a hardcoded 1024 constant rather than the measured vector length; an all-zero or empty vector is accepted as a success; the embed role is served by a chat model and the mismatch is not detected
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: fleet_roles_live_both_nodes
        ACTOR:     api_client
        STEP:      call `embed('usage-based AI support automation gross margin', 'document')` through packages/platform/src/inference/embed.ts
        STEP:      run `holo telemetry:tail --run-id <embedRunId> --json`
        MUST_OBSERVE:     recorded `embeddingDimensions` equals `1024`
        MUST_OBSERVE:     1 row with `role` = `embed`
        MUST_OBSERVE:     `status` = `success` on that row
        MUST_NOT_OBSERVE: recorded `embeddingDimensions` equal to `0`
        MUST_NOT_OBSERVE: a `model_id` asserted from an embedding response body
        MUST_NOT_OBSERVE: 0 rows with `role` = `embed`

AC-4: Missing serving header fails closed
  GIVEN: the router answers a chat call without the x-litellm-model-api-base header
  WHEN:  the attestation module processes that response
  THEN:  it records error_code MODEL_ENDPOINT_UNTRUSTED and no success row

  TEST_TIER:            integration
  VERIFICATION_SERVICE: live image-local LiteLLM router with header suppression + real Postgres holocron_nonprod
  FLOW_REF:             CAP-INFER-01 failure mode: router-truthful metadata absent
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "AC-4"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          live image-local LiteLLM router with header suppression + real Postgres holocron_nonprod
    NEGATIVE_CONTROL: would fail if a missing header falls back to a default endpoint value; the failure path is a no-op that records nothing at all; the response body model field substitutes for the absent header
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: router_answering_from_untrusted_host
        ACTOR:     cli_user
        STEP:      configure the router to strip `x-litellm-model-api-base` from the chat response
        STEP:      run `holo infer:call --role convergent --json`
        STEP:      run `holo telemetry:tail --run-id <probeRunId> --json`
        MUST_OBSERVE:     1 row with `error_code` = `MODEL_ENDPOINT_UNTRUSTED`
        MUST_OBSERVE:     `error_message` reads `LiteLLM response omitted x-litellm-model-api-base`
        MUST_OBSERVE:     `status` = `error` on that row
        MUST_NOT_OBSERVE: `status` = `success` on that row
        MUST_NOT_OBSERVE: an `endpoint` defaulting to `http://inference1.tail011a51.ts.net:8003/v1`
        MUST_NOT_OBSERVE: 0 rows recorded for the call

AC-5: Fulcrum vocabulary excludes judge and no forbidden role is requested
  GIVEN: the Fulcrum role vocabulary is published at packages/platform/deploy/fleet/fulcrum-roles.json and the Fulcrum inference path is exercised across divergent, convergent and embed
  WHEN:  every requested role name is collected from the durable telemetry rows and the Fulcrum vocabulary file is read
  THEN:  the requested role set is exactly divergent, convergent and embed, and the Fulcrum vocabulary file declares no judge entry

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod telemetry rows + the real packages/platform/deploy/fleet/fulcrum-roles.json published by FUL-INFRA-001
  FLOW_REF:             CAP-INFER-01 boundary contract: judge is never requested (ADR-008)
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "AC-5"

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod telemetry rows + the real packages/platform/deploy/fleet/fulcrum-roles.json published by FUL-INFRA-001
    NEGATIVE_CONTROL: would fail if the role scan is a no-op returning an empty list regardless of input; the scan is disconnected from the durable telemetry rows and reads a hardcoded allowlist; the assertion is made against the shared platform manifest, which carries `judge` by design and would make the check wrong; a retry path silently substitutes a different role name and the scan misses it
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: fleet_roles_live_both_nodes
        ACTOR:     cli_user
        STEP:      run `holo infer:call --role divergent --json`, `--role convergent --json` and an embed call
        STEP:      run `holo telemetry:tail --run-id <probeRunId> --json` and collect the distinct `role` values
        STEP:      read the role keys declared in `packages/platform/deploy/fleet/fulcrum-roles.json`
        MUST_OBSERVE:     the distinct requested role set equals `['convergent','divergent','embed']`
        MUST_OBSERVE:     3 distinct role values recorded
        MUST_OBSERVE:     the role keys in `packages/platform/deploy/fleet/fulcrum-roles.json` equal `['convergent','divergent','embed']`
        MUST_OBSERVE:     `0` occurrences of the literal `judge` in `packages/platform/deploy/fleet/fulcrum-roles.json`
        MUST_NOT_OBSERVE: a requested `role` value of `judge`
        MUST_NOT_OBSERVE: a requested `role` value of `qwen-coder`
        MUST_NOT_OBSERVE: a `judge` key in `packages/platform/deploy/fleet/fulcrum-roles.json`
        MUST_NOT_OBSERVE: 0 telemetry rows collected for the scan

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "TC-1"` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "TC-2"` |
| TC-3 |  | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "TC-3"` |
| TC-4 |  | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "TC-4"` |
| TC-5 |  | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "TC-5"` |
| TC-6 |  | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t "TC-6"` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- packages/platform/src/inference/serving-attestation.ts (NEW)
- packages/platform/src/inference/model-info.ts (NEW)
- packages/platform/src/inference/telemetry.ts (MODIFY)
- packages/platform/src/inference/resolve-model.ts (MODIFY)
- packages/platform/tests/integration/fulcrum-serving-attestation.test.ts (NEW)

writeProhibited:
- packages/platform/src/fleet/manifest.schema.ts and packages/platform/fleet/manifest.json — the SHARED platform vocabulary that legitimately carries `judge` for non-Fulcrum paths; the Fulcrum role set now lives in packages/platform/deploy/fleet/fulcrum-roles.json (FUL-INFRA-001)
- packages/platform/deploy/fleet/** — published by FUL-INFRA-001; this task reads it and never writes it
- packages/platform/src/research/** — FUL-PLAT-003 owns the provenance/evidence gate modules in the same wave
- packages/platform/src/mission/** — FUL-PLAT-006 owns corpus fetch in the same wave
- packages/platform/src/db/schema/** — schema is owned by FUL-PLAT-001 (wave A); this task persists into existing inference_telemetry columns
- packages/platform/src/cli/holo.ts — FUL-PLAT-012 owns the CLI surface
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: packages/platform/src/inference/telemetry.ts:645-700 (wrapChatAgentModel + recordChatAgentModelCall)

Wrap-the-provider-model instrumentation: the existing wrapChatAgentModel already intercepts every doGenerate/doStream and reads response.headers. Attestation extends that single choke point rather than adding a second telemetry path.

ANTI-PATTERN: Reading result.response.body.model or the AI SDK modelId as the served identity — LiteLLM rewrites it to the requested alias, so the assertion passes while a different backend served the call.

References:
- .spec/prds/fulcrum/09-technical-requirements/09-e2e-testing.md — landmine ledger row: substitution test passes against a live substitution
- .spec/prds/fulcrum/09-technical-requirements/06-external-dependencies.md — LiteLLM 1.91.0 router settings and the three model roles

Notes:
- T
- h
- e
-  
- a
- t
- t
- e
- s
- t
- a
- t
- i
- o
- n
-  
- i
- s
-  
- a
-  
- p
- u
- r
- e
-  
- r
- e
- a
- d
-  
- o
- f
-  
- m
- e
- t
- a
- d
- a
- t
- a
-  
- a
- l
- r
- e
- a
- d
- y
-  
- c
- r
- o
- s
- s
- i
- n
- g
-  
- t
- h
- e
-  
- w
- i
- r
- e
- :
-  
- h
- e
- a
- d
- e
- r
- s
-  
- o
- n
-  
- t
- h
- e
-  
- c
- h
- a
- t
- /
- e
- m
- b
- e
- d
- d
- i
- n
- g
-  
- r
- e
- s
- p
- o
- n
- s
- e
-  
- p
- l
- u
- s
-  
- o
- n
- e
-  
- G
- E
- T
-  
- /
- m
- o
- d
- e
- l
- /
- i
- n
- f
- o
-  
- p
- e
- r
-  
- r
- o
- u
- t
- e
- r
-  
- b
- o
- o
- t
- ,
-  
- c
- a
- c
- h
- e
- d
-  
- p
- e
- r
-  
- p
- r
- o
- c
- e
- s
- s
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
- n
- e
- w
-  
- o
- u
- t
- b
- o
- u
- n
- d
-  
- h
- o
- s
- t
-  
- a
- n
- d
-  
- n
- o
-  
- n
- e
- w
-  
- m
- o
- d
- e
- l
-  
- c
- a
- l
- l
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. packages/platform/src/inference/telemetry.ts
   - Lines: 536-700
   - Focus: [PRIMARY PATTERN] responseHeaderApiBase / classifyModelInvocation / recordChatAgentModelCall already read x-litellm-model-api-base and set MODEL_ENDPOINT_UNTRUSTED — extend this path to persist the header-derived api-base as the row endpoint and add the /model/info cross-reference
2. packages/platform/src/inference/resolve-model.ts
   - Lines: 1-120
   - Focus: ResolvedModel shape (endpoint, litellmModelId, baseURL, provider) and the default-deny escape policy the attestation must not weaken
3. packages/platform/deploy/fleet/fulcrum-roles.json
   - Lines: whole file
   - Focus: FUL-INFRA-001's published Fulcrum role vocabulary (divergent/convergent/embed -> oMLX basenames). This — NOT the shared packages/platform/fleet/manifest.json — is what the attestation validates the requested role set against; the shared manifest keeps `judge` for non-Fulcrum paths
4. packages/platform/src/fleet/fulcrum-role-readiness.ts
   - Lines: whole file
   - Focus: FUL-INFRA-001's readiness probe asserting the expected role set on both minis (never mere liveness) — the attestation's gate for the integration lane reuses it instead of re-probing
5. packages/platform/tests/integration/inference-telemetry.test.ts
   - Lines: 1-120
   - Focus: Integration-lane pattern: PLATFORM_IT gating, real Postgres row assertions on inference_telemetry, real fleet calls

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
  Command:  PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts
  Expected: Exit 0

Gate 2:
  Command:  pnpm test:integration
  Expected: Exit 0

Gate 3:
  Command:  pnpm tsgo --noEmit
  Expected: Exit 0

Gate 4:
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error packages/platform/src/inference packages/platform/src/fleet packages/platform/tests/integration/fulcrum-serving-attestation.test.ts
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
Rationale:   Touches the instrumented fleet client (packages/platform/src/inference/telemetry.ts), the fleet role manifest, and durable Postgres telemetry rows — Mastra/Bun platform code verified against the live LiteLLM router and real Postgres. Reviewer: mastra-reviewer (no-cloud-leak, no-judge, header-vs-body audit).
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Closed Zod schemas for the attestation record — no z.any() on any field
- Fail closed on missing metadata; never default a value that would read as success
- Redact prompt/response bodies from every persisted field (reuse redactErrorMessage)
- Single instrumented client — do not add a second telemetry write path

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-INFRA-001, FUL-INFRA-002
Blocks:     FUL-PLAT-008, FUL-PLAT-010
Wave:       C

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
  "task_id": "FUL-PLAT-007",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fleet_roles_live_both_nodes": {
      "description": "Both nodes inference1 and inference2 serve divergent, convergent and embed behind the image-local LiteLLM router on loopback; no attestation rows exist yet for the probe run id",
      "seed_method": "cli",
      "records": [
        "holo probe:capabilities --json reports role coverage for `divergent`, `convergent` and `embed` on both nodes",
        "GET /model/info on the image-local router lists 2 model_list entries per role, one per node",
        "inference_telemetry holds 0 rows for the new probe run id",
        "`packages/platform/deploy/fleet/fulcrum-roles.json` declares exactly the 3 roles `divergent`, `convergent` and `embed`"
      ]
    },
    "router_roles_collapsed_to_one_model": {
      "description": "The image-local router config binds divergent and convergent to a single served model, so both roles resolve to one model identity",
      "seed_method": "cli",
      "records": [
        "GET /model/info returns the same `litellm_params.model` value for the `divergent` and `convergent` entries",
        "inference_telemetry holds 0 rows for the new probe run id"
      ]
    },
    "router_answering_from_untrusted_host": {
      "description": "The router answers a chat call but the response carries an x-litellm-model-api-base that is not a mini endpoint (substitution rehearsal), while the response body model field still echoes the requested alias",
      "seed_method": "cli",
      "records": [
        "response header `x-litellm-model-api-base` reads `http://127.0.0.1:9999/v1`",
        "response body `model` field reads `divergent`",
        "inference_telemetry holds 0 rows for the new probe run id"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN both nodes inference1 and inference2 serve divergent and convergent behind the image-local router WHEN one chat call runs on divergent and one on convergent through the router THEN each persisted telemetry row names a serving api-base taken from x-litellm-model-api-base and confirmed against GET /model/info",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"AC-1\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "live image-local LiteLLM router load-balancing to real oMLX on both nodes inference1 and inference2, plus real Postgres holocron_nonprod",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-007-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "multi-node",
        "verification_service": "live image-local LiteLLM router + real oMLX on both nodes + real Postgres holocron_nonprod",
        "negative_control": {
          "would_fail_if": [
            "the serving api-base is hardcoded to a mini name in the attestation module instead of read from the response header",
            "the attestation reads the response body `model` field, which is unchanged by a live substitution",
            "the GET /model/info cross-reference is removed and the header is trusted alone",
            "the router is disconnected and the code still records a success row"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_roles_live_both_nodes",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo infer:call --role divergent --json` against the image-local router",
                "run `holo infer:call --role convergent --json` against the image-local router",
                "run `holo telemetry:tail --run-id <probeRunId> --json` to read the durable rows"
              ]
            },
            "end_state": {
              "must_observe": [
                "`endpoint` equals `http://inference1.tail011a51.ts.net:8003/v1` or `http://inference2.tail011a51.ts.net:8003/v1` on both rows",
                "`model_id` on each row equals the `x-litellm-model-id` header value returned by that call",
                "2 rows with `status` = `success`",
                "the union of `endpoint` values across the calls covers both nodes when `GET /model/info` lists 2 entries for the role"
              ],
              "must_not_observe": [
                "`endpoint` equal to the loopback router base `http://127.0.0.1:4545/v1`",
                "0 rows carrying a header-derived api-base",
                "an `endpoint` value of `none`, `default` or a blank string"
              ]
            }
          },
          {
            "start_ref": "router_answering_from_untrusted_host",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo infer:call --role divergent --json` while the router answers from an api-base that is not a mini",
                "run `holo telemetry:tail --run-id <probeRunId> --json`"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 row with `error_code` = `MODEL_ENDPOINT_UNTRUSTED`",
                "`status` = `error` on that row",
                "`error_message` naming `http://127.0.0.1:9999/v1`"
              ],
              "must_not_observe": [
                "`status` = `success` on that row",
                "0 rows recorded for the call",
                "an `endpoint` of `http://inference1.tail011a51.ts.net:8003/v1`"
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
      "description": "GIVEN the router binds divergent and convergent to a single served model WHEN the attestation module compares the two roles' resolved identities before a cycle proceeds THEN it refuses with a named error listing both roles and the shared model id",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"AC-2\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "live image-local LiteLLM router GET /model/info + real chat calls",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-007-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "live image-local LiteLLM router GET /model/info + real chat calls",
        "negative_control": {
          "would_fail_if": [
            "distinctness is compared on the configured role names instead of the resolved model id",
            "the comparison is a no-op that returns true unconditionally",
            "the resolved identity is read from the response body, which is unchanged when both roles share a model"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "router_roles_collapsed_to_one_model",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo infer:call --role divergent --json` and `holo infer:call --role convergent --json`",
                "call `assertRolesDistinct(['divergent','convergent'])` through the attestation module"
              ]
            },
            "end_state": {
              "must_observe": [
                "error code `FULCRUM_ROLE_IDENTITY_COLLISION`",
                "the message names both `divergent` and `convergent`",
                "the message names the shared `x-litellm-model-id` value"
              ],
              "must_not_observe": [
                "exit code `0`",
                "an empty error message",
                "a report of 2 distinct model ids"
              ]
            }
          },
          {
            "start_ref": "fleet_roles_live_both_nodes",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo infer:call --role divergent --json` and `holo infer:call --role convergent --json`",
                "call `assertRolesDistinct(['divergent','convergent'])` through the attestation module"
              ]
            },
            "end_state": {
              "must_observe": [
                "2 distinct `x-litellm-model-id` values recorded",
                "exit code `0`"
              ],
              "must_not_observe": [
                "error code `FULCRUM_ROLE_IDENTITY_COLLISION`",
                "0 recorded model ids"
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
      "description": "GIVEN the embed role is served behind the image-local router and embedding responses carry no model identifier WHEN an embedding call runs through the instrumented fleet client THEN the attestation records dimensionality 1024 for that call instead of a model identity",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"AC-3\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "live image-local LiteLLM router embed role + real Postgres holocron_nonprod",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-007-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "live image-local LiteLLM router embed role + real Postgres holocron_nonprod",
        "negative_control": {
          "would_fail_if": [
            "the dimensionality is a hardcoded 1024 constant rather than the measured vector length",
            "an all-zero or empty vector is accepted as a success",
            "the embed role is served by a chat model and the mismatch is not detected"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_roles_live_both_nodes",
            "action": {
              "actor": "api_client",
              "steps": [
                "call `embed('usage-based AI support automation gross margin', 'document')` through packages/platform/src/inference/embed.ts",
                "run `holo telemetry:tail --run-id <embedRunId> --json`"
              ]
            },
            "end_state": {
              "must_observe": [
                "recorded `embeddingDimensions` equals `1024`",
                "1 row with `role` = `embed`",
                "`status` = `success` on that row"
              ],
              "must_not_observe": [
                "recorded `embeddingDimensions` equal to `0`",
                "a `model_id` asserted from an embedding response body",
                "0 rows with `role` = `embed`"
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
      "description": "GIVEN the router answers a chat call without the x-litellm-model-api-base header WHEN the attestation module processes that response THEN it records error_code MODEL_ENDPOINT_UNTRUSTED and no success row",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"AC-4\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "live image-local LiteLLM router with header suppression + real Postgres holocron_nonprod",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-007-4",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "live image-local LiteLLM router with header suppression + real Postgres holocron_nonprod",
        "negative_control": {
          "would_fail_if": [
            "a missing header falls back to a default endpoint value",
            "the failure path is a no-op that records nothing at all",
            "the response body model field substitutes for the absent header"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "router_answering_from_untrusted_host",
            "action": {
              "actor": "cli_user",
              "steps": [
                "configure the router to strip `x-litellm-model-api-base` from the chat response",
                "run `holo infer:call --role convergent --json`",
                "run `holo telemetry:tail --run-id <probeRunId> --json`"
              ]
            },
            "end_state": {
              "must_observe": [
                "1 row with `error_code` = `MODEL_ENDPOINT_UNTRUSTED`",
                "`error_message` reads `LiteLLM response omitted x-litellm-model-api-base`",
                "`status` = `error` on that row"
              ],
              "must_not_observe": [
                "`status` = `success` on that row",
                "an `endpoint` defaulting to `http://inference1.tail011a51.ts.net:8003/v1`",
                "0 rows recorded for the call"
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
      "description": "GIVEN the Fulcrum role vocabulary is published at packages/platform/deploy/fleet/fulcrum-roles.json and the Fulcrum inference path is exercised across divergent, convergent and embed WHEN every requested role name is collected from the durable telemetry rows and the Fulcrum vocabulary file is read THEN the requested role set is exactly divergent, convergent and embed, and the Fulcrum vocabulary file declares no judge entry",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"AC-5\"",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "real Postgres holocron_nonprod telemetry rows + the real packages/platform/deploy/fleet/fulcrum-roles.json published by FUL-INFRA-001",
      "unit_test_justified": null,
      "scenario": {
        "id": "SC-FUL-PLAT-007-5",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "topology": "single-node",
        "verification_service": "real Postgres holocron_nonprod telemetry rows + the real packages/platform/deploy/fleet/fulcrum-roles.json published by FUL-INFRA-001",
        "negative_control": {
          "would_fail_if": [
            "the role scan is a no-op returning an empty list regardless of input",
            "the scan is disconnected from the durable telemetry rows and reads a hardcoded allowlist",
            "the assertion is made against the shared platform manifest, which carries `judge` by design and would make the check wrong",
            "a retry path silently substitutes a different role name and the scan misses it"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_roles_live_both_nodes",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo infer:call --role divergent --json`, `--role convergent --json` and an embed call",
                "run `holo telemetry:tail --run-id <probeRunId> --json` and collect the distinct `role` values",
                "read the role keys declared in `packages/platform/deploy/fleet/fulcrum-roles.json`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the distinct requested role set equals `['convergent','divergent','embed']`",
                "3 distinct role values recorded",
                "the role keys in `packages/platform/deploy/fleet/fulcrum-roles.json` equal `['convergent','divergent','embed']`",
                "`0` occurrences of the literal `judge` in `packages/platform/deploy/fleet/fulcrum-roles.json`"
              ],
              "must_not_observe": [
                "a requested `role` value of `judge`",
                "a requested `role` value of `qwen-coder`",
                "a `judge` key in `packages/platform/deploy/fleet/fulcrum-roles.json`",
                "0 telemetry rows collected for the scan"
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
      "description": "The persisted telemetry endpoint equals the x-litellm-model-api-base header value when the router returns that header",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"TC-1\"",
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
      "description": "The attestation module contains zero reads of the response body model field when scanned for identity resolution",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"TC-2\"",
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
      "description": "assertRolesDistinct throws FULCRUM_ROLE_IDENTITY_COLLISION when divergent and convergent resolve to one model id",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"TC-3\"",
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
      "description": "The recorded embedding dimensionality equals the measured vector length when an embed call succeeds",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"TC-4\"",
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
      "description": "The telemetry row status equals error when the serving header is absent",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"TC-5\"",
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
      "description": "The Fulcrum role vocabulary file declares zero judge entries when a full role sweep is recorded",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/fulcrum-serving-attestation.test.ts -t \"TC-6\"",
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

- [ ] AC-1 (PRIMARY): Serving backend attested from router headers across both nodes
- [ ] AC-2: ASSAY-vs-CHALLENGE distinctness enforced on resolved identity
- [ ] AC-3: Embed-role call records 1024 dimensions
- [ ] AC-4: Missing serving header fails closed
- [ ] AC-5: Fulcrum vocabulary excludes judge and no forbidden role is requested
