# FUL-INFRA-001 — Provision compliant Fulcrum roles on both inference minis

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** A
> **Assignee:** devops-engineer · **Reviewer:** devops-engineer (peer) + mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** devops-engineer
> **TDD mode:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

## What this does

Host and serve the three Fulcrum model roles on both inference minis and prove the expected role set on each node from its own real endpoint.

## Why

`holo fulcrum:substrate-check --json` run against the live tailnet reports `divergent`, `convergent`, and `embed` bound to their expected oMLX basenames on both `inference1` and `inference2`, exits 0, and exits non-zero naming the missing role whenever any node stops serving one.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale):

```
pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 | grep -F 'inference2 convergent=Muse-Glimmer-30B-4bit'
```

Full gate set: 5 acceptance criteria, 7 test criteria, 5 verification gates.

## Scope

- services/platform/deploy/fleet/fulcrum-roles.json
- services/platform/deploy/fleet/provision-fulcrum-roles.sh
- services/platform/src/fleet/fulcrum-role-readiness.ts
- services/platform/src/cli/commands/fulcrum-substrate-check.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/fulcrum-substrate-roles.test.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-INFRA-001 - Provision compliant Fulcrum roles on both inference minis
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=devops-engineer | reviewer=devops-engineer (peer) + mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave A)
PROPOSED_BY:devops-engineer
TDD_MODE:   skipped
RED_GREEN_REQUIRED: no

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

`holo fulcrum:substrate-check --json` run against the live tailnet reports `divergent`, `convergent`, and `embed` bound to their expected oMLX basenames on both `inference1` and `inference2`, exits 0, and exits non-zero naming the missing role whenever any node stops serving one.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST provision `Qwen3.8-27B-8bit`, `Muse-Glimmer-30B-4bit`, and `Qwen3-Embedding-0.6B-4bit-DWQ` on BOTH `inference1` and `inference2`, because the load-balanced pool requires every backend to serve every role
- MUST: MUST assert the expected role set per node from a real `/v1/models` response on that node's own `:8003` endpoint; mere liveness is a false pass (landmine: server answers but serves nothing)
- MUST: MUST reach the minis only through the `ssh inference1` / `ssh inference2` aliases documented in `~/models/DEVICES.md`
- NEVER: NEVER disconnect any host from the internet, disable Wi-Fi, change network settings, or toggle a network interface; every degradation in this task is produced by stopping an oMLX process or restricting a model directory (AGENTS.md Network Continuity)
- NEVER: NEVER write a Tailscale key, SSH password, or API key value into a file, log, test fixture, or commit; refer to credential-bearing names only (`INFERENCE1_SSH_PASSWORD`, `INFERENCE2_SSH_PASSWORD`)
- NEVER: NEVER add `judge`, `reviewer`, `implementer`, `orchestrator`, `qwen-coder`, or `verifier` to the Fulcrum expected role set (ADR-008)
- NEVER: NEVER treat the laptop as a Fulcrum backend or add it to the expected node set (ADR-007)
- STRICTLY: STRICTLY keep writes inside `guardrails.write_allowed`; `services/platform/src/db/**` belongs to FUL-PLAT-001 in the same wave
- STRICTLY: STRICTLY pin model directory basenames as literals in `fulcrum-roles.json`; never derive role expectations from oMLX basenames at runtime (two namespaces, never one built from the other)

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-INFER-01
provides:             fulcrum-role-set-on-both-minis, fulcrum-expected-role-manifest, fulcrum-substrate-readiness-probe
consumes:             models-fleet-provisioning-tooling
boundary_contracts:
  - PROVIDES to FUL-INFRA-002 and FUL-PLAT-007: both `inference1` and `inference2` serve every Fulcrum role basename (`Qwen3.8-27B-8bit`, `Muse-Glimmer-30B-4bit`, `Qwen3-Embedding-0.6B-4bit-DWQ`) on `:8003`, asserted as an expected role set per node rather than mere liveness
  - PROVIDES to FUL-INFRA-002: `services/platform/deploy/fleet/fulcrum-roles.json` is the single declaration of role name to oMLX basename, and the router config is built from it, never from a second vocabulary
  - No coder role name and no `judge` appears in the Fulcrum expected role set or in any requested role name on the Fulcrum path

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Both minis serve the full Fulcrum role set [PRIMARY]
- [ ] AC-2: Coder weights are cleared so the Fulcrum set fits each mini
- [ ] AC-3: A stopped oMLX on one mini is reported per node, not hidden
- [ ] AC-4: A serving endpoint with a short model list fails closed by role name
- [ ] AC-5: The Fulcrum role vocabulary excludes judge and every coder role
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Both minis serve the full Fulcrum role set [PRIMARY] [PRIMARY]
  GIVEN: GIVEN `inference1` and `inference2` serve only the coder basename and no Fulcrum role basename
  WHEN:  WHEN `provision-fulcrum-roles.sh` is run against each mini through its own SSH alias and `holo fulcrum:substrate-check --json` is run
  THEN:  THEN the check reports all three Fulcrum roles bound to their expected basenames on both nodes and exits 0

  TEST_TIER:            integration
  VERIFICATION_SERVICE: oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
  FLOW_REF:             UC-LIS-01 / T-LIS-001
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 | grep -F 'inference2 convergent=Muse-Glimmer-30B-4bit'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
    NEGATIVE_CONTROL: would fail if the readiness check asserts liveness only, so an empty or short /v1/models list passes; the role expectations are stubbed constants instead of a real per-node HTTP response; only the first node is provisioned and the second real node is assumed rather than probed
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: minis_before_fulcrum_provisioning
        ACTOR:     cli_user
        STEP:      run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference1` so the first real node farms and serves the three Fulcrum basenames through its own entrypoint
        STEP:      run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference2` so the second real node farms and serves the same three basenames through its own entrypoint
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --json`, which issues one GET to each node's own `http://inferenceN.tail011a51.ts.net:8003/v1/models`
        MUST_OBSERVE:     `inference1 divergent=Qwen3.8-27B-8bit`
        MUST_OBSERVE:     `inference2 divergent=Qwen3.8-27B-8bit`
        MUST_OBSERVE:     `inference1 convergent=Muse-Glimmer-30B-4bit`
        MUST_OBSERVE:     `inference2 convergent=Muse-Glimmer-30B-4bit`
        MUST_OBSERVE:     `inference2 embed=Qwen3-Embedding-0.6B-4bit-DWQ`
        MUST_OBSERVE:     `"nodes_ready":2`
        MUST_OBSERVE:     `"roles_per_node":3`
        MUST_NOT_OBSERVE: `"roles_per_node":0`
        MUST_NOT_OBSERVE: `"nodes_ready":1`
        MUST_NOT_OBSERVE: an empty `models` array from either node

AC-2: Coder weights are cleared so the Fulcrum set fits each mini
  GIVEN: GIVEN each mini has 48 GB usable capacity and the Fulcrum set needs about 46 GB
  WHEN:  WHEN provisioning completes on both nodes
  THEN:  THEN neither node serves the coder basename `Qwen3.6-35B-A3B-MLX-8bit` and both still serve the three Fulcrum basenames

  TEST_TIER:            integration
  VERIFICATION_SERVICE: oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
  FLOW_REF:             UC-LIS-02 / ADR-008 memory arithmetic
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-2' 2>&1 | grep -F 'coder_basenames_served=0 fulcrum_basenames_served=6'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
    NEGATIVE_CONTROL: would fail if the coder weights are left in the model root, so the Fulcrum set cannot stay resident and the count is static; the served-basename tally is a hardcoded constant rather than two real per-node responses; only one node is measured and the second real node is assumed
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: minis_before_fulcrum_provisioning
        ACTOR:     cli_user
        STEP:      run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference1 --clear-coder-weights` on the first real node
        STEP:      run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference2 --clear-coder-weights` on the second real node
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --json --report-basenames` which tallies ids from both nodes' own `/v1/models` responses
        MUST_OBSERVE:     `coder_basenames_served=0 fulcrum_basenames_served=6`
        MUST_OBSERVE:     `inference1 resident_gb=46`
        MUST_OBSERVE:     `inference2 resident_gb=46`
        MUST_NOT_OBSERVE: `Qwen3.6-35B-A3B-MLX-8bit` in either node's model id list
        MUST_NOT_OBSERVE: `fulcrum_basenames_served=0`
        MUST_NOT_OBSERVE: an empty basename tally

AC-3: A stopped oMLX on one mini is reported per node, not hidden
  GIVEN: GIVEN both minis are provisioned and serving all three Fulcrum roles
  WHEN:  WHEN the oMLX process on `inference1` is stopped over SSH and `holo fulcrum:substrate-check --json` is run
  THEN:  THEN the check names `inference1` unreachable, still reports the three roles on `inference2`, and exits 1

  TEST_TIER:            integration
  VERIFICATION_SERVICE: oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
  FLOW_REF:             UC-LIS-04 / T-LIS-015
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-3' 2>&1 | grep -F '"unreachable_nodes":["inference1"]'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
    NEGATIVE_CONTROL: would fail if the readiness result is cached from a previous probe, so a stopped node still reports ready; node status is a static map rather than a real per-node probe result; the second real node is never contacted and both nodes share one aggregated answer
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: inference1_omlx_stopped
        ACTOR:     cli_user
        STEP:      run `ssh inference1 'pkill -f "omlx serve"'` to stop the real service on the first node, changing no network setting
        STEP:      run `ssh inference2 'curl -sS http://127.0.0.1:8003/v1/models'` so the second real node answers through its own entrypoint
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --json; echo exit=$?`
        MUST_OBSERVE:     `"unreachable_nodes":["inference1"]`
        MUST_OBSERVE:     `inference2 convergent=Muse-Glimmer-30B-4bit`
        MUST_OBSERVE:     `exit=1`
        MUST_NOT_OBSERVE: `exit=0`
        MUST_NOT_OBSERVE: `"nodes_ready":2`
        MUST_NOT_OBSERVE: an empty `unreachable_nodes` list

AC-4: A serving endpoint with a short model list fails closed by role name
  GIVEN: GIVEN an oMLX endpoint that answers `/v1/models` successfully with only the embedding basename
  WHEN:  WHEN `holo fulcrum:substrate-check` probes that endpoint
  THEN:  THEN the check exits 1 naming the missing roles `convergent` and `divergent` instead of passing on liveness

  TEST_TIER:            integration
  VERIFICATION_SERVICE: oMLX 0.5.7 restricted-model-dir process on inference2 (:8013)
  FLOW_REF:             UC-LIS-01 / 09-e2e-testing.md landmine: server answers but serves nothing
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-4' 2>&1 | grep -F 'FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         single-node
    SERVICE:          oMLX 0.5.7 restricted-model-dir process on inference2 (:8013)
    NEGATIVE_CONTROL: would fail if readiness passes on HTTP 200 alone, so an empty or short model list is treated as ready; the missing-role list is a static placeholder string rather than the difference between expectation and the real response
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: restricted_model_dir_endpoint
        ACTOR:     cli_user
        STEP:      run `ssh inference2 'omlx serve --port 8013 --model-dir ~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ'` to start a real restricted process, leaving :8003 alone
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --endpoint http://inference2.tail011a51.ts.net:8013/v1 --json; echo exit=$?`
        MUST_OBSERVE:     `FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent`
        MUST_OBSERVE:     `present=embed`
        MUST_OBSERVE:     `exit=1`
        MUST_NOT_OBSERVE: `exit=0`
        MUST_NOT_OBSERVE: `"ready":true`
        MUST_NOT_OBSERVE: an empty `missing` list

AC-5: The Fulcrum role vocabulary excludes judge and every coder role
  GIVEN: GIVEN `services/platform/deploy/fleet/fulcrum-roles.json` is the only declaration of Fulcrum role expectations
  WHEN:  WHEN `holo fulcrum:substrate-check --print-expected --json` is run against the live substrate
  THEN:  THEN the expected role list is exactly `convergent`, `divergent`, `embed` and the forbidden-name tally is 0

  TEST_TIER:            integration
  VERIFICATION_SERVICE: oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
  FLOW_REF:             UC-LIS-02 / T-LIS-007
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-5' 2>&1 | grep -F '"expected_roles":["convergent","divergent","embed"]'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale
    NEGATIVE_CONTROL: would fail if the expected role list is read from the platform fleet manifest, which still carries `judge`; the forbidden-name tally is a hardcoded zero rather than a scan of the emitted request role names; the run never contacts the second real node so no requested role names are captured from it
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: minis_fulcrum_provisioned
        ACTOR:     cli_user
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --print-expected --json --trace-requested-roles` which probes the first real node and the second real node through their own `:8003/v1/models` endpoints
        STEP:      capture every requested role name emitted during the probe
        MUST_OBSERVE:     `"expected_roles":["convergent","divergent","embed"]`
        MUST_OBSERVE:     `"requested_roles":["convergent","divergent","embed"]`
        MUST_OBSERVE:     `forbidden_role_hits=0`
        MUST_NOT_OBSERVE: `judge` in `expected_roles`
        MUST_NOT_OBSERVE: `qwen-coder` in `requested_roles`
        MUST_NOT_OBSERVE: an empty `expected_roles` list

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | The substrate check binds role `convergent` to basename `Muse-Glimmer-30B-4bit` on `inference2` when both minis are provisioned. | AC-1 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 \| grep -F 'inference2 convergent=Muse-Glimmer-30B-4bit'` |
| TC-2 | The substrate check emits `"nodes_ready":2` when both minis serve all three Fulcrum basenames. | AC-1 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 \| grep -F '"nodes_ready":2'` |
| TC-3 | The served-basename tally reports `coder_basenames_served=0` when provisioning has cleared the coder weights. | AC-2 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-2' 2>&1 \| grep -F 'coder_basenames_served=0'` |
| TC-4 | The substrate check exits `1` when the oMLX process on `inference1` is stopped. | AC-3 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-3' 2>&1 \| grep -F 'exit=1'` |
| TC-5 | The substrate check emits `FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent` when the probed endpoint serves only the embedding basename. | AC-4 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-4' 2>&1 \| grep -F 'FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent'` |
| TC-6 | The expected role list equals `["convergent","divergent","embed"]` when `fulcrum-roles.json` is loaded. | AC-5 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-5' 2>&1 \| grep -F '"expected_roles":["convergent","divergent","embed"]'` |
| TC-7 | The requested-role trace reports `forbidden_role_hits=0` when the probe runs against both minis. | AC-5 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-5' 2>&1 \| grep -F 'forbidden_role_hits=0'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/deploy/fleet/fulcrum-roles.json
- services/platform/deploy/fleet/provision-fulcrum-roles.sh
- services/platform/src/fleet/fulcrum-role-readiness.ts
- services/platform/src/cli/commands/fulcrum-substrate-check.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/fulcrum-substrate-roles.test.ts

writeProhibited:
- services/platform/src/db/** — FUL-PLAT-001 owns the ledger in this same wave
- services/platform/deploy/compose/** — FUL-INFRA-002 owns the router packaging
- services/platform/src/mission/** and services/platform/src/research/** — mastra-implementer tasks own cycle code
- services/platform/fleet/manifest.json — the platform manifest still carries `judge` for non-Fulcrum paths and is out of scope
- ~/models/fleet/** — fleet tooling is consumed as a tool, never edited by this task
- .spec/** — the orchestrator owns sprint artifacts
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/inference/probe-fleet-roles.ts:70

Expected-role-set readiness: one bounded HTTP GET per node, compared against a checked-in role expectation file, fail-closed on any missing role and on any unreachable node.

ANTI-PATTERN: Liveness-only readiness (`/v1/models` returns 200 therefore ready), building role expectations from the observed oMLX basenames, or aggregating both minis into a single status that hides one dead node.

References:
- .spec/prds/fulcrum/09-technical-requirements/06-external-dependencies.md
- .spec/prds/fulcrum/09-technical-requirements/05-architecture-diagram.md

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
- a
-  
- s
- i
- n
- g
- l
- e
-  
- C
- L
- I
-  
- c
- o
- m
- m
- a
- n
- d
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
- J
- S
- O
- N
-  
- m
- o
- d
- e
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
- f
- o
- r
-  
- t
- h
- e
-  
- i
- n
- t
- e
- g
- r
- a
- t
- i
- o
- n
-  
- l
- a
- n
- e
-  
- a
- n
- d
-  
- t
- h
- e
-  
- h
- u
- m
- a
- n
- -
- g
- a
- t
- e
-  
- t
- r
- a
- n
- s
- c
- r
- i
- p
- t
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/inference/probe-fleet-roles.ts
   - Lines: 1-80
   - Focus: [PRIMARY PATTERN] expected-role-set comparison against one observed /v1/models id list with fail-closed readiness; mirror this shape per node instead of adding network fan-out
2. services/platform/src/fleet/manifest.schema.ts
   - Lines: 1-60
   - Focus: Zod role-manifest shape and FLEET_ROLE_NAMES; the Fulcrum expectation file is a separate narrower vocabulary that must not import `judge` from here
3. services/platform/src/cli/commands/fulcrum-authorable-check.ts
   - Lines: 1-60
   - Focus: Existing Fulcrum CLI command shape: typed result, PASS/FAIL lines, concrete citations, fail-fast exit code
4. .spec/prds/fulcrum/09-technical-requirements/06-external-dependencies.md
   - Lines: 1-60
   - Focus: INFRA-1 and INFRA-4 provisioning obligations, the exact model bindings, quantization, and the 46 GB memory arithmetic
5. services/platform/tests/integration/inference-telemetry.test.ts
   - Lines: 1-80
   - Focus: Integration-lane conventions for live fleet tests: PLATFORM_IT gating, loud skip, real endpoint assertions

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

This task is infra-class: the RED→GREEN ceremony is SKIPPED (tdd_mode=skipped).

The integration/E2E reality proof is NOT waived. Every AC above with a SCENARIO must
still be verified against the real service named in VERIFICATION_SERVICE, with the
MUST_OBSERVE value captured as evidence. Work the VERIFICATION CHECKLIST below in order.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Gate 1: Integration lane
  Command:  pnpm test:integration
  Expected: `fulcrum-substrate-roles.test.ts` reports 5 passed and stdout contains `inference2 convergent=Muse-Glimmer-30B-4bit`

Gate 2: Typecheck
  Command:  pnpm tsgo --noEmit
  Expected: No diagnostics referencing `fulcrum-role-readiness.ts` or `fulcrum-substrate-check.ts`

Gate 3: Lint
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/fleet/fulcrum-role-readiness.ts services/platform/src/cli/commands/fulcrum-substrate-check.ts services/platform/tests/integration/fulcrum-substrate-roles.test.ts
  Expected: Checked 3 files with 0 errors

Gate 4: Lane conformance
  Command:  pnpm test:lanes
  Expected: `fulcrum-substrate-roles.test.ts` is counted in the integration lane, not the unit lane

Gate 5: Live substrate proof
  Command:  pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 | grep -F '"nodes_ready":2'
  Expected: stdout line `"nodes_ready":2` captured from two real per-node responses

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: devops-engineer
Rationale:   Host provisioning over SSH to two Apple-silicon minis, oMLX/LiteLLM serving topology, memory budgeting, and an idempotent provisioning script are infrastructure work; devops-engineer owns fleet provisioning and deployment automation while mastra-implementer owns the cycle code that consumes the substrate.
Reviewer:    devops-engineer (peer) + mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- AGENTS.md
- services/platform/deploy/compose/README.md
- .spec/prds/fulcrum/09-technical-requirements/00-architecture-decisions.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     FUL-INFRA-002, FUL-PLAT-007, FUL-PLAT-008, FUL-INFRA-003
Wave:       A

--------------------------------------------------------------------------------
REVIEW
--------------------------------------------------------------------------------

Must pass:
- One test per AC; tests verify behavior, not implementation
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
  "task_id": "FUL-INFRA-001",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "minis_before_fulcrum_provisioning": {
      "description": "Both minis run oMLX on :8003 serving only the coder basename Qwen3.6-35B-A3B-MLX-8bit; no Fulcrum role basename is served on either node",
      "seed_method": "cli",
      "records": [
        "inference1 :8003/v1/models lists id Qwen3.6-35B-A3B-MLX-8bit",
        "inference2 :8003/v1/models lists id Qwen3.6-35B-A3B-MLX-8bit",
        "neither node lists Qwen3.8-27B-8bit, Muse-Glimmer-30B-4bit, or Qwen3-Embedding-0.6B-4bit-DWQ"
      ]
    },
    "minis_fulcrum_provisioned": {
      "description": "Both minis run oMLX on :8003 serving the three Fulcrum basenames after provision-fulcrum-roles.sh has completed on each node",
      "seed_method": "cli",
      "records": [
        "inference1 :8003/v1/models lists Qwen3.8-27B-8bit, Muse-Glimmer-30B-4bit, Qwen3-Embedding-0.6B-4bit-DWQ",
        "inference2 :8003/v1/models lists Qwen3.8-27B-8bit, Muse-Glimmer-30B-4bit, Qwen3-Embedding-0.6B-4bit-DWQ",
        "services/platform/deploy/fleet/fulcrum-roles.json declares divergent, convergent, embed for nodes inference1 and inference2"
      ]
    },
    "inference1_omlx_stopped": {
      "description": "Both minis provisioned, then the oMLX service on inference1 is stopped with pkill over SSH while inference2 keeps serving all three Fulcrum basenames; no network setting is touched",
      "seed_method": "cli",
      "records": [
        "inference1 :8003 refuses TCP connections",
        "inference2 :8003/v1/models still lists the three Fulcrum basenames",
        "Tailscale and Wi-Fi remain untouched on every host"
      ]
    },
    "restricted_model_dir_endpoint": {
      "description": "A separate oMLX process started on inference2 port 8013 whose --model-dir contains only the embedding weights, leaving :8003 untouched",
      "seed_method": "cli",
      "records": [
        "inference2 :8013/v1/models lists exactly 1 id: Qwen3-Embedding-0.6B-4bit-DWQ",
        "inference2 :8003 continues to serve all three Fulcrum basenames"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN `inference1` and `inference2` serve only the coder basename and no Fulcrum role basename WHEN `provision-fulcrum-roles.sh` is run against each mini through its own SSH alias and `holo fulcrum:substrate-check --json` is run THEN the check reports all three Fulcrum roles bound to their expected basenames on both nodes and exits 0",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 | grep -F 'inference2 convergent=Muse-Glimmer-30B-4bit'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
      "scenario": {
        "id": "SC-FUL-INFRA-001-AC1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the readiness check asserts liveness only, so an empty or short /v1/models list passes",
            "the role expectations are stubbed constants instead of a real per-node HTTP response",
            "only the first node is provisioned and the second real node is assumed rather than probed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "minis_before_fulcrum_provisioning",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference1` so the first real node farms and serves the three Fulcrum basenames through its own entrypoint",
                "run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference2` so the second real node farms and serves the same three basenames through its own entrypoint",
                "run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --json`, which issues one GET to each node's own `http://inferenceN.tail011a51.ts.net:8003/v1/models`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`inference1 divergent=Qwen3.8-27B-8bit`",
                "`inference2 divergent=Qwen3.8-27B-8bit`",
                "`inference1 convergent=Muse-Glimmer-30B-4bit`",
                "`inference2 convergent=Muse-Glimmer-30B-4bit`",
                "`inference2 embed=Qwen3-Embedding-0.6B-4bit-DWQ`",
                "`\"nodes_ready\":2`",
                "`\"roles_per_node\":3`"
              ],
              "must_not_observe": [
                "`\"roles_per_node\":0`",
                "`\"nodes_ready\":1`",
                "an empty `models` array from either node"
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
      "description": "GIVEN each mini has 48 GB usable capacity and the Fulcrum set needs about 46 GB WHEN provisioning completes on both nodes THEN neither node serves the coder basename `Qwen3.6-35B-A3B-MLX-8bit` and both still serve the three Fulcrum basenames",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-2' 2>&1 | grep -F 'coder_basenames_served=0 fulcrum_basenames_served=6'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
      "scenario": {
        "id": "SC-FUL-INFRA-001-AC2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the coder weights are left in the model root, so the Fulcrum set cannot stay resident and the count is static",
            "the served-basename tally is a hardcoded constant rather than two real per-node responses",
            "only one node is measured and the second real node is assumed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "minis_before_fulcrum_provisioning",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference1 --clear-coder-weights` on the first real node",
                "run `bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node inference2 --clear-coder-weights` on the second real node",
                "run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --json --report-basenames` which tallies ids from both nodes' own `/v1/models` responses"
              ]
            },
            "end_state": {
              "must_observe": [
                "`coder_basenames_served=0 fulcrum_basenames_served=6`",
                "`inference1 resident_gb=46`",
                "`inference2 resident_gb=46`"
              ],
              "must_not_observe": [
                "`Qwen3.6-35B-A3B-MLX-8bit` in either node's model id list",
                "`fulcrum_basenames_served=0`",
                "an empty basename tally"
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
      "description": "GIVEN both minis are provisioned and serving all three Fulcrum roles WHEN the oMLX process on `inference1` is stopped over SSH and `holo fulcrum:substrate-check --json` is run THEN the check names `inference1` unreachable, still reports the three roles on `inference2`, and exits 1",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-3' 2>&1 | grep -F '\"unreachable_nodes\":[\"inference1\"]'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
      "scenario": {
        "id": "SC-FUL-INFRA-001-AC3",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the readiness result is cached from a previous probe, so a stopped node still reports ready",
            "node status is a static map rather than a real per-node probe result",
            "the second real node is never contacted and both nodes share one aggregated answer"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "inference1_omlx_stopped",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `ssh inference1 'pkill -f \"omlx serve\"'` to stop the real service on the first node, changing no network setting",
                "run `ssh inference2 'curl -sS http://127.0.0.1:8003/v1/models'` so the second real node answers through its own entrypoint",
                "run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --json; echo exit=$?`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`\"unreachable_nodes\":[\"inference1\"]`",
                "`inference2 convergent=Muse-Glimmer-30B-4bit`",
                "`exit=1`"
              ],
              "must_not_observe": [
                "`exit=0`",
                "`\"nodes_ready\":2`",
                "an empty `unreachable_nodes` list"
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
      "description": "GIVEN an oMLX endpoint that answers `/v1/models` successfully with only the embedding basename WHEN `holo fulcrum:substrate-check` probes that endpoint THEN the check exits 1 naming the missing roles `convergent` and `divergent` instead of passing on liveness",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-4' 2>&1 | grep -F 'FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "oMLX 0.5.7 restricted-model-dir process on inference2 (:8013)",
      "scenario": {
        "id": "SC-FUL-INFRA-001-AC4",
        "primary": true,
        "tier": "holdout",
        "test_tier": "integration",
        "verification_service": "oMLX 0.5.7 restricted-model-dir process on inference2 (:8013)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "readiness passes on HTTP 200 alone, so an empty or short model list is treated as ready",
            "the missing-role list is a static placeholder string rather than the difference between expectation and the real response"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "restricted_model_dir_endpoint",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `ssh inference2 'omlx serve --port 8013 --model-dir ~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ'` to start a real restricted process, leaving :8003 alone",
                "run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --endpoint http://inference2.tail011a51.ts.net:8013/v1 --json; echo exit=$?`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent`",
                "`present=embed`",
                "`exit=1`"
              ],
              "must_not_observe": [
                "`exit=0`",
                "`\"ready\":true`",
                "an empty `missing` list"
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
      "description": "GIVEN `services/platform/deploy/fleet/fulcrum-roles.json` is the only declaration of Fulcrum role expectations WHEN `holo fulcrum:substrate-check --print-expected --json` is run against the live substrate THEN the expected role list is exactly `convergent`, `divergent`, `embed` and the forbidden-name tally is 0",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-5' 2>&1 | grep -F '\"expected_roles\":[\"convergent\",\"divergent\",\"embed\"]'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
      "scenario": {
        "id": "SC-FUL-INFRA-001-AC5",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX 0.5.7 on inference1 and inference2 (:8003) over Tailscale",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the expected role list is read from the platform fleet manifest, which still carries `judge`",
            "the forbidden-name tally is a hardcoded zero rather than a scan of the emitted request role names",
            "the run never contacts the second real node so no requested role names are captured from it"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "minis_fulcrum_provisioned",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `bun services/platform/src/cli/holo.ts fulcrum:substrate-check --print-expected --json --trace-requested-roles` which probes the first real node and the second real node through their own `:8003/v1/models` endpoints",
                "capture every requested role name emitted during the probe"
              ]
            },
            "end_state": {
              "must_observe": [
                "`\"expected_roles\":[\"convergent\",\"divergent\",\"embed\"]`",
                "`\"requested_roles\":[\"convergent\",\"divergent\",\"embed\"]`",
                "`forbidden_role_hits=0`"
              ],
              "must_not_observe": [
                "`judge` in `expected_roles`",
                "`qwen-coder` in `requested_roles`",
                "an empty `expected_roles` list"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The substrate check binds role `convergent` to basename `Muse-Glimmer-30B-4bit` on `inference2` when both minis are provisioned.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 | grep -F 'inference2 convergent=Muse-Glimmer-30B-4bit'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The substrate check emits `\"nodes_ready\":2` when both minis serve all three Fulcrum basenames.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-1' 2>&1 | grep -F '\"nodes_ready\":2'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The served-basename tally reports `coder_basenames_served=0` when provisioning has cleared the coder weights.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-2' 2>&1 | grep -F 'coder_basenames_served=0'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The substrate check exits `1` when the oMLX process on `inference1` is stopped.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-3' 2>&1 | grep -F 'exit=1'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The substrate check emits `FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent` when the probed endpoint serves only the embedding basename.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-4' 2>&1 | grep -F 'FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The expected role list equals `[\"convergent\",\"divergent\",\"embed\"]` when `fulcrum-roles.json` is loaded.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-5' 2>&1 | grep -F '\"expected_roles\":[\"convergent\",\"divergent\",\"embed\"]'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The requested-role trace reports `forbidden_role_hits=0` when the probe runs against both minis.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-substrate-roles.test.ts -t 'AC-5' 2>&1 | grep -F 'forbidden_role_hits=0'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>
