# REDHAT-FIX-01 — Fix fictional 'Streaming' seed conversation — referenced 4× in contract/gate/flow, 0× in seed-e2e.ts, masked by optional: true
> Status: ✅ Completed
> Cycle: 1
> Reviewer: product-manager+technical
> Completed: 2026-07-26T05:32:55Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 60 min
> Type: FEATURE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md#H1`

## Outcome

Either (A) holo seed:e2e --reset inserts 'Streaming' with >=1 prior message and Maestro asserts it without optional:true, or (B) all Streaming-seed claims are removed; path recorded in redhat-fix-01-path.json.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md#H1
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md`
- **Why it matters:** Unqualified Sprint 25 gate 5/5 pass is blocked until H1/H2/H3 are closed.
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST resolve H1 with PATH-A (add 'Streaming' row to seed-e2e.ts — preferred) OR PATH-B (rename fixture/AC-1 GIVEN, remove optional Streaming asserts, correct GATE-RESULTS/SPRINT step 1) and record path in .tmp/sprint-25/redhat-fix-01-path.json
- MUST exercise real holo seed:e2e --reset and observe concrete Postgres rows — never view-injection
- MUST make Maestro reconnect-exactly-once.yml / last-event-id-gap-fill.yml / token-streaming.yml / exactly-one-final-message.yml Streaming asserts non-optional under PATH-A
- MUST keep S-REACTIVE-01 seeded-streaming-conversation fixture true against post-fix seed

### NEVER
- NEVER leave optional: true on visible: 'Streaming' while contracts claim the conversation is seeded
- NEVER invent a second seed entrypoint or Maestro SQL outside seed-e2e.ts
- NEVER claim GATE-RESULTS step 1 seeds Streaming while seed only has Alpha/Beta/Gamma + Sprint 20 reference

### STRICTLY
- STRICTLY PATH-A: after seed, count(*) WHERE title='Streaming' equals 1 with chat_messages count >= 1
- STRICTLY PATH-B: zero uncorrected Streaming-seed claims in maestro/S-REACTIVE-01/SPRINT/GATE-RESULTS
- STRICTLY tdd_mode red_first: capture red evidence of 0 Streaming rows before fix

## Specification

**Objective:** Close red-hat H1 by making the Streaming conversation oracle true in seed (PATH-A) or honestly removing the claim (PATH-B).

**Success state:** Either (A) holo seed:e2e --reset inserts 'Streaming' with >=1 prior message and Maestro asserts it without optional:true, or (B) all Streaming-seed claims are removed; path recorded in redhat-fix-01-path.json.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** honest-streaming-seed-oracle
- **Consumes:** e2e-seed-substrate, resumable-sse-chat-client
- **Boundary contracts:**
- holo seed:e2e --reset creates title exactly 'Streaming' (PATH-A) OR all Streaming claims removed (PATH-B)
- Maestro Streaming assert non-optional under PATH-A
- Seed entrypoint services/platform/src/db/seed-e2e.ts via holo seed:e2e --reset only

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **GIVEN:** seed-e2e.ts
- **WHEN:** holo seed:e2e --reset
- **THEN:** PATH-A creates title Streaming count==1 with messages>=1 OR PATH-B path.json path=B with claims removed
- **Test tier:** `integration` · **Verification service:** `seeded Postgres + holo seed:e2e` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-1'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty, stub, static, disconnect, optional oracle only
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `pre-fix-seed-without-streaming`: actor `cli_user`
    - **Steps:**
    - Record PATH-A or PATH-B in .tmp/sprint-25/redhat-fix-01-path.json
    - Run holo seed:e2e --reset
    - SELECT count(*) FROM conversations WHERE title = 'Streaming'
    - If PATH-A, SELECT count(*) FROM chat_messages for that id
    - **MUST observe:**
    - `path.json path field equals 'A' or 'B'`
    - `PATH-A: conversations title='Streaming' count == 1`
    - `PATH-A: chat_messages count for Streaming id >= 1`
    - `PATH-B: path equals 'B' AND S-REACTIVE-01 AC-1 GIVEN no longer claims seeded 'Streaming'`
    - **MUST NOT observe:**
    - `empty/start signature: PATH-A with Streaming count == 0`
    - `PATH-A seed still only Alpha/Beta/Gamma + Sprint 20 reference`
    - `PATH-B GATE-RESULTS step 1 still claims seeds the Streaming conversation`

### AC-2: AC-2 [PRIMARY]
- **GIVEN:** PATH-A
- **WHEN:** Maestro flows assert Streaming
- **THEN:** optional:true count == 0 on those asserts
- **Test tier:** `integration` · **Verification service:** `Maestro flow source audit` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-2'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub — optional:true under PATH-A, empty — no assert and no PATH-B, static
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `reviewer`
    - **Steps:**
    - Read path.json
    - If PATH-A: count optional:true adjacent to Streaming asserts in reconnect-exactly-once.yml and last-event-id-gap-fill.yml
    - If PATH-B: count visible Streaming asserts in .maestro/reactive/
    - **MUST observe:**
    - `PATH-A: required Streaming assert count >= 1 in reconnect-exactly-once.yml`
    - `PATH-A: optional:true adjacent to Streaming asserts count == 0`
    - `PATH-B: visible Streaming assert count == 0 in .maestro/reactive/`
    - **MUST NOT observe:**
    - `empty/start signature: PATH-A optional:true count >= 1 on Streaming asserts`
    - `PATH-A WARN-only Streaming with exit 0 when title missing`

### AC-3: AC-3
- **GIVEN:** fixture and gate docs
- **WHEN:** path chosen
- **THEN:** language matches seed (Streaming title in seed under PATH-A, or claims removed under PATH-B)
- **Test tier:** `integration` · **Verification service:** `source + contract audit` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-3'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — SPRINT lies about Streaming seed, empty — fixture claims Streaming with 0 rows under PATH-A, stub
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `reviewer`
    - **Steps:**
    - Diff seed-e2e.ts titles vs S-REACTIVE-01 fixture
    - Read SPRINT.md step 1 and GATE-RESULTS.md step 1
    - **MUST observe:**
    - `PATH-A: seed-e2e.ts 'Streaming' title match count >= 1`
    - `PATH-A: SPRINT.md step 1 text agrees with seed count == 1`
    - `PATH-B: GATE-RESULTS step 1 no longer claims seeds the Streaming conversation`
    - **MUST NOT observe:**
    - `empty/start signature: contract claims Streaming while seed match count == 0 under PATH-A`
    - `PATH-B S-REACTIVE-01 AC-1 GIVEN still says seeded 'Streaming'`

### AC-4: AC-4
- **GIVEN:** PATH-A
- **WHEN:** Maestro reconnect-exactly-once runs
- **THEN:** exit 0 and required Streaming oracle fires
- **Test tier:** `e2e` · **Verification service:** `Maestro + Zero + seeded Postgres + named iOS Simulator` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty, disconnect, mock — optional true, stub
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`
    - **Steps:**
    - holo seed:e2e --reset
    - maestro test .maestro/reactive/reconnect-exactly-once.yml
    - **MUST observe:**
    - `PATH-A: Maestro exit code == 0`
    - `PATH-A: required Streaming assert fired (optional:true count == 0)`
    - `PATH-A: chat-assistant-message-latest assert count >= 1`
    - `PATH-B: path.json path equals 'B' and AC-1..AC-3 complete without this Maestro Streaming path`
    - **MUST NOT observe:**
    - `empty/start signature: PATH-A exit 0 with optional-only Streaming WARN`
    - `PATH-A pass with Streaming Postgres count == 0`


## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | After seed, PATH-A Streaming count==1 with messages>=1 OR path.json path=B | AC-1 | `holo seed:e2e --reset && pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-1'` |
| TC-2 | PATH-A optional:true count==0 on Streaming asserts OR PATH-B assert count==0 | AC-2 | `pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-2'` |
| TC-3 | Fixture + gate docs agree with seed reality | AC-3 | `pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-3'` |
| TC-4 | PATH-A Maestro reconnect exit 0 with required Streaming | AC-4 | `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml` |
| TC-5 | seed-e2e.test.ts live counts (PATH-A conversations==5) | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/seed-e2e.test.ts` |

## Reading List

- `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md:20-24` — H1
- `services/platform/src/db/seed-e2e.ts:499-550` — conversation inserts
- `services/platform/src/cli/__tests__/seed-e2e.test.ts:82-100` — conversations:4 → 5
- `.maestro/reactive/reconnect-exactly-once.yml:172-179` — optional Streaming
- `S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md:all` — AC-1 fixture
- `SPRINT.md:39-47` — gate step 1

## Guardrails

### WRITE-ALLOWED
- services/platform/src/db/seed-e2e.ts (MODIFY)
- services/platform/src/cli/__tests__/seed-e2e.test.ts (MODIFY)
- .maestro/reactive/reconnect-exactly-once.yml
- .maestro/reactive/last-event-id-gap-fill.yml
- .maestro/reactive/token-streaming.yml
- .maestro/reactive/exactly-one-final-message.yml
- S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md
- SPRINT.md (PATH-B step 1 honesty)
- GATE-RESULTS.md
- tests/integration/redhat-fix-01-streaming-seed.test.ts (NEW)
- .tmp/sprint-25/redhat-fix-01-path.json (NEW, not committed)

### WRITE-PROHIBITED
- hooks/use-resumable-sse-stream.ts — H3
- services/platform/src/http/chat-runs.ts
- components/chat/ChatThread.tsx — H3
- Other REDHAT-FIX-0{2,3} task files

## Design

- **References:** `./SPRINT.md`, `red-hat#H1`, `S-REACTIVE-01`, `seed-e2e.ts:499-550`
- **Pattern:** Seed matches contract (A) or contract matches seed (B); never optional greenwash
- **Pattern source:** Sprint 22 REDHAT-FIX-1 dual-path
- **Anti-pattern:** optional:true visible Streaming while gate claims seed creates it
- **Interaction notes:**
- PATH-A preferred: E2E_STREAMING_CONVERSATION_ID + title Streaming + >=1 message; bump E2E_SEED_VERSION and seed-e2e.test 4→5

## Agent Assignment

- **Agent:** `react-native-ui-implementer`
- **Rationale:** Owns Maestro reactive flows and S-REACTIVE-01 oracles; PATH-A seed may reassign to mastra-implementer (record in path.json).
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed by:** `react-native-ui-planner` (plus cross-specialist enrichments at consolidation: react-native-ui-planner + mastra-planner)

## Agent Instructions

1. RED first: redhat-fix-01-streaming-seed.test.ts expecting Streaming count==1 after seed — fail on HEAD (count==0). Capture .tmp/sprint-25/redhat-fix-01-red.log.
2. PATH-A: add E2E_STREAMING_CONVERSATION_ID, INSERT title Streaming + >=1 message, bump fingerprint/counts/E2E_SEED_VERSION, fix seed-e2e.test 4→5; strip optional:true on Maestro Streaming asserts.
3. PATH-B only if seed blocked: retitle all claims; remove Streaming asserts.
4. Write path.json {path:'A'|'B'}. Do not implement H2/H3.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| RED baseline | `rg -n "'Streaming'|\"Streaming\"" services/platform/src/db/seed-e2e.ts; echo exit:$?` | Pre-fix: 0 matches |
| AC suite | `holo seed:e2e --reset && pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts` | Exit 0 |
| seed-e2e live | `PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/seed-e2e.test.ts` | Exit 0; PATH-A conversations==5 |
| Maestro PATH-A | `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml` | Exit 0 |
| path.json | `test -f .tmp/sprint-25/redhat-fix-01-path.json && jq -r .path .tmp/sprint-25/redhat-fix-01-path.json | grep -E '^[AB]$'` | Exit 0 |

## Dependencies

- **depends_on:** S-REACTIVE-01
- **blocks:** S-REACTIVE-05, REDHAT-FIX-03

## Review Criteria

- Every AC/TC stable; behavioral ACs pass `validate_scenario` with 0 CRITICAL
- Red-hat finding closed (PATH-A production truth or PATH-B honest re-scope)
- Writes only under WRITE-ALLOWED
- RED evidence captured under `.tmp/sprint-25/`

## Notes

- Mastra enrichment: seed ownership under services/platform/src/db/seed-e2e.ts; export deterministic UUID for deep links.
- Coordinate with REDHAT-FIX-03 before claiming Maestro Streaming non-optional is the sole reconnect oracle.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-01",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-streaming-conversation": {
      "description": "PATH-A Streaming conversation from holo seed:e2e --reset with >=1 message; PATH-B fixture retired",
      "seed_method": "public_api",
      "records": [
        "PATH-A: title exactly 'Streaming' count == 1",
        "PATH-A: chat_messages count >= 1",
        "PATH-B: AC-1 GIVEN no longer says Streaming"
      ]
    },
    "pre-fix-seed-without-streaming": {
      "description": "RED baseline: Alpha/Beta/Gamma + Sprint 20 reference; 0 Streaming",
      "seed_method": "public_api",
      "records": [
        "title Streaming count == 0 before fix"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN seed-e2e.ts WHEN holo seed:e2e --reset THEN PATH-A creates title Streaming count==1 with messages>=1 OR PATH-B path.json path=B with claims removed",
      "verify": "holo seed:e2e --reset && pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "seeded Postgres + holo seed:e2e",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "static",
            "disconnect",
            "optional oracle only"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre-fix-seed-without-streaming",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Record PATH-A or PATH-B in .tmp/sprint-25/redhat-fix-01-path.json",
                "Run holo seed:e2e --reset",
                "SELECT count(*) FROM conversations WHERE title = 'Streaming'",
                "If PATH-A, SELECT count(*) FROM chat_messages for that id"
              ]
            },
            "end_state": {
              "must_observe": [
                "path.json path field equals 'A' or 'B'",
                "PATH-A: conversations title='Streaming' count == 1",
                "PATH-A: chat_messages count for Streaming id >= 1",
                "PATH-B: path equals 'B' AND S-REACTIVE-01 AC-1 GIVEN no longer claims seeded 'Streaming'"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A with Streaming count == 0",
                "PATH-A seed still only Alpha/Beta/Gamma + Sprint 20 reference",
                "PATH-B GATE-RESULTS step 1 still claims seeds the Streaming conversation"
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
      "description": "GIVEN PATH-A WHEN Maestro flows assert Streaming THEN optional:true count == 0 on those asserts",
      "verify": "pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Maestro flow source audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 optional:true under PATH-A",
            "empty \u2014 no assert and no PATH-B",
            "static"
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
              "actor": "reviewer",
              "steps": [
                "Read path.json",
                "If PATH-A: count optional:true adjacent to Streaming asserts in reconnect-exactly-once.yml and last-event-id-gap-fill.yml",
                "If PATH-B: count visible Streaming asserts in .maestro/reactive/"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: required Streaming assert count >= 1 in reconnect-exactly-once.yml",
                "PATH-A: optional:true adjacent to Streaming asserts count == 0",
                "PATH-B: visible Streaming assert count == 0 in .maestro/reactive/"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A optional:true count >= 1 on Streaming asserts",
                "PATH-A WARN-only Streaming with exit 0 when title missing"
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
      "description": "GIVEN fixture and gate docs WHEN path chosen THEN language matches seed (Streaming title in seed under PATH-A, or claims removed under PATH-B)",
      "verify": "pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "source + contract audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 SPRINT lies about Streaming seed",
            "empty \u2014 fixture claims Streaming with 0 rows under PATH-A",
            "stub"
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
              "actor": "reviewer",
              "steps": [
                "Diff seed-e2e.ts titles vs S-REACTIVE-01 fixture",
                "Read SPRINT.md step 1 and GATE-RESULTS.md step 1"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: seed-e2e.ts 'Streaming' title match count >= 1",
                "PATH-A: SPRINT.md step 1 text agrees with seed count == 1",
                "PATH-B: GATE-RESULTS step 1 no longer claims seeds the Streaming conversation"
              ],
              "must_not_observe": [
                "empty/start signature: contract claims Streaming while seed match count == 0 under PATH-A",
                "PATH-B S-REACTIVE-01 AC-1 GIVEN still says seeded 'Streaming'"
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
      "description": "GIVEN PATH-A WHEN Maestro reconnect-exactly-once runs THEN exit 0 and required Streaming oracle fires",
      "verify": "holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro + Zero + seeded Postgres + named iOS Simulator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "disconnect",
            "mock \u2014 optional true",
            "stub"
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
                "holo seed:e2e --reset",
                "maestro test .maestro/reactive/reconnect-exactly-once.yml"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: Maestro exit code == 0",
                "PATH-A: required Streaming assert fired (optional:true count == 0)",
                "PATH-A: chat-assistant-message-latest assert count >= 1",
                "PATH-B: path.json path equals 'B' and AC-1..AC-3 complete without this Maestro Streaming path"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A exit 0 with optional-only Streaming WARN",
                "PATH-A pass with Streaming Postgres count == 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "After seed, PATH-A Streaming count==1 with messages>=1 OR path.json path=B",
      "verify": "holo seed:e2e --reset && pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "PATH-A optional:true count==0 on Streaming asserts OR PATH-B assert count==0",
      "verify": "pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Fixture + gate docs agree with seed reality",
      "verify": "pnpm vitest run tests/integration/redhat-fix-01-streaming-seed.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "PATH-A Maestro reconnect exit 0 with required Streaming",
      "verify": "holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "seed-e2e.test.ts live counts (PATH-A conversations==5)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/seed-e2e.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
