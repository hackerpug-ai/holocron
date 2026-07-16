# REDHAT-FIX-H3 — Structural local-first: wire ≥1 in-service path through resolveModel+createFleetChatModel (or restated scope honesty) (fresh red-hat H3: seam-only structural claim)

## What this does

Close red-hat H3 by making local-first structural for at least one in-service path: compat agent models come from resolveModel+createFleetChatModel so the sprint claim is no longer seam-only.

Provides: structural-local-first-compat-agent, createFleetChatModel-production-caller, in-service-resolveModel-path, fleet-chat-model-via-role-router.

## Why

- MUST Wire compat/cells/agent.ts (preferred) or another real in-service Mastra path through await resolveModel(role) then createFleetChatModel(resolved)
- MUST Remove sole hard-coded createOpenAICompatible({ baseURL: FLEET_URL }) + static compat-spike as the only agent model source on that path
- MUST Prove with PLATFORM_IT=1 that agent generate contacts fleet (:4545) and anthropicCount:0
- MUST Prove createFleetChatModel is referenced/called from production path outside resolve-model.ts
- MUST Keep createFleetChatModel refuse non-fleet provider (escape remains Anthropic SDK path)
- MUST Write red evidence that pre-fix createFleetChatModel had zero external callers / agent hardcoded FLEET_URL
- NEVER only document seam-only if wiring is feasible — prefer real production caller
- NEVER leave createFleetChatModel dead export while SPRINT claims structural local-first for all call sites without scope rewrite
- NEVER hard-code api.anthropic.com on default agent path
- NEVER mock resolveModel to return static fleet model without live probe when test claims structural routing
- NEVER expand verify:no-provider-refs scope so aggressively it breaks legitimate @ai-sdk usage without plan — optional expand only if justified
- STRICTLY ≥1 production call site uses resolveModel + createFleetChatModel
- STRICTLY network proof: fleet hits >=1 and anthropicCount:0 on default agent path
- STRICTLY red_first with .spec/evidence/redhat-fix-h3* or .tmp/redhat-fix-h3*
- STRICTLY If scope rewrite chosen instead of wiring (discouraged), ACs must grep-drop structural claims from SPRINT/goal-state — wiring is preferred and planned here
- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05, T-INFER-001, T-INFER-002, T-INFER-003, T-INFER-013, CAP-INF-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts tests/integration/service/infer-router-zero-cloud.test.ts tests/integration/service/infer-router-fail-closed.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/compat/cells/agent.ts (MODIFY) · services/platform/src/compat/spike.ts (MODIFY if registration needs async factory) · services/platform/src/inference/resolve-model.ts (MODIFY only if createFleetChatModel API needs minor export tweak) · tests/integration/service/infer-structural-compat-agent.test.ts (NEW) · tests/integration/service/infer-router-*.test.ts (MODIFY if needed) · .tmp/redhat-fix-h3*/** (NEW) · .spec/evidence/redhat-fix-h3* (NEW/MODIFY)

Prohibited: Implementing mission engine — Sprint 15 · services/platform/src/db/migrations/** — not required for H3 · app/** — out of scope · Dropping structural language from SPRINT without wiring (discouraged alternative — only if wiring blocked and re-planned)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H3 — Structural local-first: wire ≥1 in-service path through resolveModel+createFleetChatModel (or restated scope honesty) (fresh red-hat H3: seam-only structural claim)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 8 — Role Router, Local-First and Degraded Modes](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
createFleetAgent (or equivalent) builds its model via resolveModel(role)+createFleetChatModel; live agent generate hits :4545 with anthropicCount:0; createFleetChatModel is no longer an unused export.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Wire compat/cells/agent.ts (preferred) or another real in-service Mastra path through await resolveModel(role) then createFleetChatModel(resolved)
- MUST Remove sole hard-coded createOpenAICompatible({ baseURL: FLEET_URL }) + static compat-spike as the only agent model source on that path
- MUST Prove with PLATFORM_IT=1 that agent generate contacts fleet (:4545) and anthropicCount:0
- MUST Prove createFleetChatModel is referenced/called from production path outside resolve-model.ts
- MUST Keep createFleetChatModel refuse non-fleet provider (escape remains Anthropic SDK path)
- MUST Write red evidence that pre-fix createFleetChatModel had zero external callers / agent hardcoded FLEET_URL
- NEVER only document seam-only if wiring is feasible — prefer real production caller
- NEVER leave createFleetChatModel dead export while SPRINT claims structural local-first for all call sites without scope rewrite
- NEVER hard-code api.anthropic.com on default agent path
- NEVER mock resolveModel to return static fleet model without live probe when test claims structural routing
- NEVER expand verify:no-provider-refs scope so aggressively it breaks legitimate @ai-sdk usage without plan — optional expand only if justified
- STRICTLY ≥1 production call site uses resolveModel + createFleetChatModel
- STRICTLY network proof: fleet hits >=1 and anthropicCount:0 on default agent path
- STRICTLY red_first with .spec/evidence/redhat-fix-h3* or .tmp/redhat-fix-h3*
- STRICTLY If scope rewrite chosen instead of wiring (discouraged), ACs must grep-drop structural claims from SPRINT/goal-state — wiring is preferred and planned here

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- At least one in-service production path (prefer compat/cells/agent.ts createFleetAgent / runAgentCell) MUST obtain models via resolveModel(role)+createFleetChatModel — not hard-coded FLEET_URL+compat-spike only
- createFleetChatModel MUST have a production caller outside resolve-model.ts definition site
- Default path remains fleet-only: anthropicCount:0 on structural agent generate
- Sprint structural claim becomes true for the wired path (prefer wiring over dropping structural language)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: compat agent models via resolveModel+createFleetChatModel (PRIMARY)
- [ ] AC-2: In-service generate: fleet hits, zero Anthropic
- [ ] AC-3: createFleetChatModel is no longer dead
- [ ] AC-4: Unknown/unreachable role still fail-closed for structural path
- [ ] AC-5: RED evidence seam-only → structural
- [ ] Verification gates green + typecheck + lint (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 compat agent models via resolveModel+createFleetChatModel [PRIMARY] (flow_ref UC-INFER-01)
  GIVEN: createFleetAgent / runAgentCell production path after fix
  WHEN:  Agent is constructed for fleet reasoning
  THEN:  Construction awaits resolveModel(role) with allowEscape false/default and passes ResolvedModel into createFleetChatModel; provider=fleet baseURL from resolved endpoint
  TEST_TIER: integration · VERIFICATION_SERVICE: fleet · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts
  SCENARIO — start_ref: live-fleet-divergent · evidence: api_response
    NEGATIVE_CONTROL: would fail if agent still hardcodes FLEET_URL without resolveModel; createFleetChatModel still never called outside resolve-model.ts; stub agent with static model id ignoring manifest; mock resolveModel returning fake without live endpoint
    EVIDENCE: api_response (required_capture=True)
    CASE[0] start_ref: live-fleet-divergent
      actor: operator
      - Call createFleetAgent or async factory that resolves role
      - Capture resolved.endpoint / litellmModelId / provider
      - Assert createFleetChatModel invoked with provider=fleet
      MUST_OBSERVE:
        - resolved.provider === 'fleet'
        - resolved.endpoint contains :4545 OR host 127.0.0.1/localhost fleet
        - litellmModelId non-empty string from manifest (not only hard-coded 'compat-spike' without resolve)
      MUST_NOT_OBSERVE:
        - provider: anthropic on default agent path
        - endpoint https://api.anthropic.com
        - createFleetChatModel never invoked
AC-2 In-service generate: fleet hits, zero Anthropic (flow_ref T-INFER-001)
  GIVEN: Wired compat agent registered on Mastra and live fleet
  WHEN:  runAgentCell / agent.generate executes a short prompt with network capture
  THEN:  fleetHits>=1 (or :4545 URL observed); anthropicCount:0; tripwire handled if present
  TEST_TIER: integration · VERIFICATION_SERVICE: fleet · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts
  SCENARIO — start_ref: live-fleet-divergent · evidence: network_capture
    NEGATIVE_CONTROL: would fail if hard-coded anthropicCount:0 without capture; agent still can hit cloud on default path; test skips generate and only checks imports; stub generate returning ok without network
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: live-fleet-divergent
      actor: operator
      - installNetworkCapture
      - run agent generate short prompt
      - Assert fleet and anthropic counters
      MUST_OBSERVE:
        - anthropicCount:0 OR anthropicHits:0
        - fleetHits >= 1 OR capture URL contains :4545
        - agent result text non-empty OR ok:true with non-empty response field
      MUST_NOT_OBSERVE:
        - api.anthropic.com contact
        - anthropicCount >= 1
        - empty capture with forced zero
AC-3 createFleetChatModel is no longer dead (flow_ref T-INFER-002)
  GIVEN: Repository production sources after wiring
  WHEN:  Static inventory counts call sites of createFleetChatModel outside resolve-model.ts definition
  THEN:  caller_count >= 1 in production path (compat agent or Mastra service)
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts
  SCENARIO — start_ref: compat-agent-hardcoded-baseline · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if only definition site references createFleetChatModel; test-only caller counted as production; comment-only mention without call
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: compat-agent-hardcoded-baseline
      actor: operator
      - Grep services/platform/src for createFleetChatModel(
      - Exclude definition-only line in resolve-model.ts
      - Require production caller in compat or service path
      MUST_OBSERVE:
        - production_createFleetChatModel_callers >= 1
        - caller path includes compat/cells/agent.ts OR other approved in-service path
      MUST_NOT_OBSERVE:
        - production_createFleetChatModel_callers === 0
        - only tests reference createFleetChatModel
AC-4 Unknown/unreachable role still fail-closed for structural path (flow_ref T-INFER-017)
  GIVEN: Wired agent factory uses resolveModel
  WHEN:  resolveModel called with unknown role or dead endpointOverride
  THEN:  Factory/construction fails closed (UnknownFleetRoleError / RoleUnavailableError); no Anthropic fallback
  TEST_TIER: integration · VERIFICATION_SERVICE: fleet · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts tests/integration/service/infer-router-fail-closed.test.ts
  SCENARIO — start_ref: live-fleet-divergent · evidence: network_capture
    NEGATIVE_CONTROL: would fail if structural path swallows RoleUnavailableError and uses hard-coded FLEET_URL fallback; unknown role still builds agent with compat-spike; cloud fallback on failure
    EVIDENCE: network_capture (required_capture=True)
    CASE[0] start_ref: live-fleet-divergent
      actor: adversary
      - Attempt agent construct with role '__no_such_role__' or dead endpoint
      - Capture error and anthropicHits
      MUST_OBSERVE:
        - error name UnknownFleetRoleError OR RoleUnavailableError (or message containing unknown role / unavailable)
        - anthropicHits:0
      MUST_NOT_OBSERVE:
        - agent successfully generated with cloud model
        - api.anthropic.com contact
AC-5 RED evidence seam-only → structural (flow_ref UC-INFER-01)
  GIVEN: red_first baseline and post-wiring green
  WHEN:  Evidence is written
  THEN:  .spec/evidence/redhat-fix-h3* or .tmp/redhat-fix-h3* shows pre-fix dead createFleetChatModel / hardcoded agent and post-fix callers+network proof
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts
  SCENARIO — start_ref: compat-agent-hardcoded-baseline · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if no red artifact; green claims structural without network proof; empty evidence
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: compat-agent-hardcoded-baseline
      actor: operator
      - Write red: external createFleetChatModel callers=0 / agent hardcodes FLEET_URL
      - Write green: callers>=1 + anthropicCount:0 + fleetHits>=1
      MUST_OBSERVE:
        - artifact path matches redhat-fix-h3*
        - green includes production_createFleetChatModel_callers >= 1
        - green includes anthropicCount:0
      MUST_NOT_OBSERVE:
        - empty evidence file
        - green without fleet proof

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | createFleetAgent path uses resolveModel + createFleetChatModel with provider=fleet and :4545 endpoint | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts` | happy_path |
| TC-2 | Agent generate under capture has fleetHits>=1 and anthropicCount===0 | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts` | invariant |
| TC-3 | production_createFleetChatModel_callers >= 1 outside resolve-model.ts | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts` | invariant |
| TC-4 | Unknown/unreachable role on structural path fails closed with anthropicHits===0 | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts tests/integration/service/infer-router-fail-closed.test.ts` | negative |
| TC-5 | redhat-fix-h3* red/green evidence artifacts exist with structural network proof on green | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/compat/cells/agent.ts (MODIFY)
- services/platform/src/compat/spike.ts (MODIFY if registration needs async factory)
- services/platform/src/inference/resolve-model.ts (MODIFY only if createFleetChatModel API needs minor export tweak)
- tests/integration/service/infer-structural-compat-agent.test.ts (NEW)
- tests/integration/service/infer-router-*.test.ts (MODIFY if needed)
- .tmp/redhat-fix-h3*/** (NEW)
- .spec/evidence/redhat-fix-h3* (NEW/MODIFY)

writeProhibited:
- Implementing mission engine — Sprint 15
- services/platform/src/db/migrations/** — not required for H3
- app/** — out of scope
- Dropping structural language from SPRINT without wiring (discouraged alternative — only if wiring blocked and re-planned)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
- `.spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md` (H3 section) — Seam-only structural claim; dead createFleetChatModel
- `services/platform/src/compat/cells/agent.ts` (74-110) — Hardcoded FLEET_URL / createOpenAICompatible / compat-spike
- `services/platform/src/inference/resolve-model.ts` (217-236, 250-380) — createFleetChatModel + resolveModel default fleet path
- `services/platform/src/compat/spike.ts` (all) — Registers createFleetAgent on Mastra — wiring target chain
- `services/platform/src/inference/verify-no-provider-refs.ts` (all) — Current ban surface (claudeFlash|Pro|Ultra only)

--------------------------------------------------------------------------------
DESIGN / PATTERN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md, UC-INFER-01, T-INFER-001, CAP-INF-01
- Independent of H1 process choke but benefits from resolveModel escape safety — no hard depends_on
- createFleetAgent may need async factory (await resolveModel) — update spike registration accordingly
Pattern: resolveModel(role) → createFleetChatModel(resolved) → Agent({ model }) instead of hard-coded FLEET_URL provider
Pattern source: services/platform/src/inference/resolve-model.ts:221-236
Anti-pattern: Dead createFleetChatModel; hard-coded FLEET_URL; structural claim without production caller; mock fleet for structural proof

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: mastra-implementer — In-service Mastra/compat production wiring through resolveModel+createFleetChatModel; integration proof against live fleet :4545.
Reviewer: mastra-reviewer
Proposed by: mastra-planner

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- All Tests Pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts tests/integration/service/infer-router-zero-cloud.test.ts tests/integration/service/infer-router-fail-closed.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
depends_on: []
blocks: ["REDHAT-FIX-H2"]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- brain/docs/mastra/README.md

--------------------------------------------------------------------------------
FIXTURES (shared seed map for scenario start_ref)
--------------------------------------------------------------------------------
- live-fleet-divergent: Live fleet role divergent healthy on :4545 per Fleet Role Manifest [seed_method=real_service]
  - manifest role divergent endpoint :4545
  - PLATFORM_IT=1 environment
- compat-agent-hardcoded-baseline: Pre-fix agent.ts uses FLEET_URL + createOpenAICompatible + chatModel('compat-spike') without resolveModel [seed_method=public_api]
  - services/platform/src/compat/cells/agent.ts:74-84 baseline

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H3",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live-fleet-divergent": {
      "description": "Live fleet role divergent healthy on :4545 per Fleet Role Manifest",
      "seed_method": "real_service",
      "records": [
        "manifest role divergent endpoint :4545",
        "PLATFORM_IT=1 environment"
      ]
    },
    "compat-agent-hardcoded-baseline": {
      "description": "Pre-fix agent.ts uses FLEET_URL + createOpenAICompatible + chatModel('compat-spike') without resolveModel",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/compat/cells/agent.ts:74-84 baseline"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN live fleet WHEN creating compat agent THEN model from resolveModel+createFleetChatModel provider=fleet",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fleet",
        "negative_control": {
          "would_fail_if": [
            "agent still hardcodes FLEET_URL without resolveModel",
            "createFleetChatModel still never called outside resolve-model.ts",
            "stub agent with static model id ignoring manifest",
            "mock resolveModel returning fake without live endpoint"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-fleet-divergent",
            "action": {
              "actor": "operator",
              "steps": [
                "Call createFleetAgent or async factory that resolves role",
                "Capture resolved.endpoint / litellmModelId / provider",
                "Assert createFleetChatModel invoked with provider=fleet"
              ]
            },
            "end_state": {
              "must_observe": [
                "resolved.provider === 'fleet'",
                "resolved.endpoint contains :4545 OR host 127.0.0.1/localhost fleet",
                "litellmModelId non-empty string from manifest (not only hard-coded 'compat-spike' without resolve)"
              ],
              "must_not_observe": [
                "provider: anthropic on default agent path",
                "endpoint https://api.anthropic.com",
                "createFleetChatModel never invoked"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "fleet",
      "flow_ref": "UC-INFER-01"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN wired agent WHEN generate THEN fleetHits>=1 and anthropicCount:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fleet",
        "negative_control": {
          "would_fail_if": [
            "hard-coded anthropicCount:0 without capture",
            "agent still can hit cloud on default path",
            "test skips generate and only checks imports",
            "stub generate returning ok without network"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-fleet-divergent",
            "action": {
              "actor": "operator",
              "steps": [
                "installNetworkCapture",
                "run agent generate short prompt",
                "Assert fleet and anthropic counters"
              ]
            },
            "end_state": {
              "must_observe": [
                "anthropicCount:0 OR anthropicHits:0",
                "fleetHits >= 1 OR capture URL contains :4545",
                "agent result text non-empty OR ok:true with non-empty response field"
              ],
              "must_not_observe": [
                "api.anthropic.com contact",
                "anthropicCount >= 1",
                "empty capture with forced zero"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "fleet",
      "flow_ref": "T-INFER-001"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN sources WHEN counting createFleetChatModel callers THEN production callers>=1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "only definition site references createFleetChatModel",
            "test-only caller counted as production",
            "comment-only mention without call"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "compat-agent-hardcoded-baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "Grep services/platform/src for createFleetChatModel(",
                "Exclude definition-only line in resolve-model.ts",
                "Require production caller in compat or service path"
              ]
            },
            "end_state": {
              "must_observe": [
                "production_createFleetChatModel_callers >= 1",
                "caller path includes compat/cells/agent.ts OR other approved in-service path"
              ],
              "must_not_observe": [
                "production_createFleetChatModel_callers === 0",
                "only tests reference createFleetChatModel"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "T-INFER-002"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN unknown/dead role WHEN structural factory runs THEN fail-closed and anthropicHits:0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts tests/integration/service/infer-router-fail-closed.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fleet",
        "negative_control": {
          "would_fail_if": [
            "structural path swallows RoleUnavailableError and uses hard-coded FLEET_URL fallback",
            "unknown role still builds agent with compat-spike",
            "cloud fallback on failure"
          ]
        },
        "evidence": {
          "artifact_type": "network_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-fleet-divergent",
            "action": {
              "actor": "adversary",
              "steps": [
                "Attempt agent construct with role '__no_such_role__' or dead endpoint",
                "Capture error and anthropicHits"
              ]
            },
            "end_state": {
              "must_observe": [
                "error name UnknownFleetRoleError OR RoleUnavailableError (or message containing unknown role / unavailable)",
                "anthropicHits:0"
              ],
              "must_not_observe": [
                "agent successfully generated with cloud model",
                "api.anthropic.com contact"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "fleet",
      "flow_ref": "T-INFER-017"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN red_first WHEN complete THEN redhat-fix-h3* evidence shows dead-export red and structural green",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "no red artifact",
            "green claims structural without network proof",
            "empty evidence"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "compat-agent-hardcoded-baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "Write red: external createFleetChatModel callers=0 / agent hardcodes FLEET_URL",
                "Write green: callers>=1 + anthropicCount:0 + fleetHits>=1"
              ]
            },
            "end_state": {
              "must_observe": [
                "artifact path matches redhat-fix-h3*",
                "green includes production_createFleetChatModel_callers >= 1",
                "green includes anthropicCount:0"
              ],
              "must_not_observe": [
                "empty evidence file",
                "green without fleet proof"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "UC-INFER-01"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Agent construction uses resolveModel+createFleetChatModel",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Generate: fleetHits>=1 anthropicCount===0",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "production_createFleetChatModel_callers>=1",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Fail-closed structural path on unknown role",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "redhat-fix-h3* evidence present",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-structural-compat-agent.test.ts"
    }
  ],
  "proposed_by": "mastra-planner",
  "dependencies": {
    "depends_on": [],
    "blocks": [
      "REDHAT-FIX-H2"
    ]
  },
  "touches_capabilities": [
    "CAP-INF-01"
  ],
  "provides": [
    "structural-local-first-compat-agent",
    "createFleetChatModel-production-caller",
    "in-service-resolveModel-path",
    "fleet-chat-model-via-role-router"
  ],
  "consumes": [
    "resolveModel",
    "createFleetChatModel",
    "Fleet Role Manifest",
    "compat/cells/agent.ts",
    "infer-network-capture"
  ],
  "boundary_contracts": [
    "At least one in-service production path (prefer compat/cells/agent.ts createFleetAgent / runAgentCell) MUST obtain models via resolveModel(role)+createFleetChatModel \u2014 not hard-coded FLEET_URL+compat-spike only",
    "createFleetChatModel MUST have a production caller outside resolve-model.ts definition site",
    "Default path remains fleet-only: anthropicCount:0 on structural agent generate",
    "Sprint structural claim becomes true for the wired path (prefer wiring over dropping structural language)"
  ]
}
-->
