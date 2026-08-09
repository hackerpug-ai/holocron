# S31-09: Feed real model output into the evidence gate; assert ASSAY≠CHALLENGE on resolved roles

> **Task ID:** S31-09
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 480 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-INF-01
**PRD refs:** UC-INFER-03, UC-INFER-04 · 07-uc-infer.md ASSAY≠CHALLENGE · R13

## What this does

Wires the research mission so ASSAY and CHALLENGE stages call distinct resolved fleet model instances, and so the deterministic evidence gate admits or rejects claims derived from real model output — never hand-authored JSON that bypasses the fleet path.

## Why

CAP-INF-01 requires real evidence into the deterministic gate and ASSAY≠CHALLENGE on resolved roles. Today `gate:eval` can pass on synthetic JSON that never touched a model, and role bindings can resolve ASSAY and CHALLENGE to the same instance id. A green gate on fabricated evidence is the integrity failure this sprint exists to kill.

## How to verify

- `cd services/platform && bun src/cli/holo.ts mission run research --goal 's31-09-assay-challenge' --json` completes a cycle whose inspection report shows `assayInstanceId !== challengeInstanceId` and both ids are live fleet endpoints.
- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts` exits 0.
- A run that forces identical ASSAY/CHALLENGE instance ids exits non-zero with `ASSAY_CHALLENGE_COLLISION`.

## Scope

Touches mission runtime research stages, role resolution for assay/challenge, inspection report fields, and the integration proof. Does not re-author the pure-TS gate algorithm (`evaluateEvidenceGate`) beyond ensuring its inputs come from real model output.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-09 - Real model output into evidence gate; ASSAY≠CHALLENGE
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
ESTIMATE:   480 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-INF-01
PRD_REFS:   UC-INFER-03 · UC-INFER-04 · 07-uc-infer.md · R13

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

A research mission cycle feeds fleet-produced ASSAY/CHALLENGE text into evaluateEvidenceGate and refuses identical instance ids.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER satisfy the gate AC by constructing EvidenceGateInput in the test and calling evaluateEvidenceGate directly as the sole proof — drive the mission CLI/HTTP entrypoint (R29).
- NEVER allow ASSAY and CHALLENGE to share a concrete instance id when both roles resolve.
- NEVER call Anthropic/cloud on the default path (local-first; escape hatch remains default-deny).
- NEVER mock the fleet for the PRIMARY AC; PLATFORM_IT live path is required.
- NEVER rewrite evaluateEvidenceGate to call a model — it stays pure-TS.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Live research mission yields assayInstanceId !== challengeInstanceId with both non-empty — AC-1 (PRIMARY)
- [ ] Gate input evidence quote appears in model-produced sourceText from the same cycle — AC-2
- [ ] Forced identical instance ids exit non-zero with ASSAY_CHALLENGE_COLLISION — AC-3
- [ ] holo research:inspect <id> reports assayChallengeDistinct:true — AC-4
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Live research cycle uses distinct ASSAY and CHALLENGE instances [PRIMARY]
  GIVEN: fleet up, research template registered, nonprod Postgres
  WHEN:  holo mission run research --goal 's31-09-assay-challenge' --json
  THEN:  cycle completes with assayInstanceId !== challengeInstanceId, both length >= 1

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mission-cli+fleet
  TEST_FILE:     services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts
  TEST_FUNCTION: researchCycleUsesDistinctAssayChallengeInstances

  SCENARIO:
    START_REF:        live_fleet_research_ready
    NEGATIVE_CONTROL: would fail if same instance id | empty ids | mock fleet | skip under PLATFORM_IT
    EVIDENCE:         api_response
    CASES:
      - ACTION: run mission CLI; parse JSON; read inspection or stage metadata for instance ids
        MUST_OBSERVE:
          - assayInstanceId length >= 1
          - challengeInstanceId length >= 1
          - assayInstanceId !== challengeInstanceId
          - neither id contains the substrings 'assay' or 'challenge' as a placeholder token
        MUST_NOT_OBSERVE:
          - assayInstanceId === challengeInstanceId
          - empty string instance ids
          - test calling evaluateEvidenceGate with hand-built claims as the only evidence

AC-2: Evidence gate input is derived from real model output
  GIVEN: the same research run from AC-1
  WHEN:  stage artifacts for ASSAY/CHALLENGE are inspected
  THEN:  at least one admitted or rejected evidence item has quote ⊆ sourceText from model output

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres+mission
  TEST_FILE:     services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts
  TEST_FUNCTION: gateInputDerivedFromModelOutput

  SCENARIO:
    START_REF:        live_fleet_research_ready
    NEGATIVE_CONTROL: would fail if fabricated JSON fixture | empty assayText | scaffold-only commit
    EVIDENCE:         db_query
    CASES:
      - ACTION: load mission_stage_runs / inspection for the run; verify evidence quotes subset of model text
        MUST_OBSERVE:
          - assayText length >= 1 from fleet path
          - at least one evidence item with quote contained in sourceText
          - evaluateEvidenceGate reason field present (admitted or rejected)
        MUST_NOT_OBSERVE:
          - gate input loaded only from a static JSON fixture file
          - assayText equal to a scaffold placeholder with no fleet call

AC-3: Identical resolved roles fail closed
  GIVEN: a test hook or config that forces ASSAY and CHALLENGE to the same instance id
  WHEN:  the research cycle attempts CHALLENGE after ASSAY
  THEN:  exit non-zero with ASSAY_CHALLENGE_COLLISION and no commit of a successful gate pass

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mission-cli
  TEST_FILE:     services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts
  TEST_FUNCTION: assayChallengeCollisionFailsClosed

AC-4: research:inspect reports assayChallengeDistinct
  GIVEN: a successful AC-1 run id
  WHEN:  holo research:inspect <id> --json
  THEN:  assayChallengeDistinct is true and both instance ids are echoed

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts
  TEST_FUNCTION: researchInspectReportsDistinctFlag

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

live_fleet_research_ready (seed_method: public_api)
  - nonprod DATABASE_URL
  - fleet roles divergent/convergent resolvable
  - research mission template present
  - PLATFORM_IT=1

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mission/runtime.ts (MODIFY — ASSAY/CHALLENGE distinctness + gate wiring)
- services/platform/src/mission/cycle.ts (MODIFY if instance id helpers live here)
- services/platform/src/research/inspection.ts (MODIFY — assayChallengeDistinct field)
- services/platform/src/cli/holo.ts (MODIFY only if inspect/run flags need wiring)
- services/platform/src/mission/templates/** (MODIFY role bindings only if assay/challenge collide today)
- services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts (NEW)

writeProhibited:
- services/platform/src/research/evidence-gate.ts algorithm rewrite to call models
- Cloud Anthropic default path
- Business-pipeline scaffold labels (R38 / out of scope market data)
- whatsNew/assimilate/shop retrieval (S31-10)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/mission/runtime.ts — ASSAY/CHALLENGE stages ~963-1050
2. services/platform/src/research/evidence-gate.ts — pure-TS evaluateEvidenceGate
3. services/platform/src/research/inspection.ts — assayInstanceId !== challengeInstanceId
4. services/platform/src/cli/commands/fulcrum-authorable-check.ts — assay/challenge role binding checks
5. .spec/prds/mk6-migration/07-uc-infer.md — ASSAY≠CHALLENGE AC

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Replacing scaffolded market figures in business reports (R38 deferred)
- Real retrieval for whatsNew/assimilate/shop (S31-10)
- Chat specialist rewrite (S31-04)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-09",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live_fleet_research_ready": {
      "description": "Nonprod DB + live fleet roles for research mission",
      "seed_method": "public_api",
      "records": [
        "PLATFORM_IT=1",
        "divergent and convergent roles resolve",
        "research template registered"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Live research cycle uses distinct ASSAY and CHALLENGE instances",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "mission-cli+fleet",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "same instance id",
          "empty ids",
          "mock fleet",
          "skip under PLATFORM_IT"
        ]
      },
      "evidence": {
        "artifact_type": "api_response",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "live_fleet_research_ready",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run holo mission run research --goal 's31-09-assay-challenge' --json",
              "read assayInstanceId and challengeInstanceId from the run"
            ]
          },
          "end_state": {
            "must_observe": [
              "assayInstanceId length >= 1",
              "challengeInstanceId length >= 1",
              "assayInstanceId !== challengeInstanceId"
            ],
            "must_not_observe": [
              "assayInstanceId === challengeInstanceId",
              "empty instance ids",
              "proof only via direct evaluateEvidenceGate unit call"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Evidence gate input is derived from real model output",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "live_fleet_research_ready",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-2",
              "Assert prose AC: Evidence gate input is derived from real model output"
            ]
          },
          "end_state": {
            "must_observe": [
              "Evidence gate input is derived from real model output"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Identical resolved roles fail closed",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "mission-cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "collision ignored",
          "exit 0 on identical ids",
          "silent continue"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "live_fleet_research_ready",
          "action": {
            "actor": "cli_user",
            "steps": [
              "force identical ASSAY/CHALLENGE instance ids",
              "run research cycle"
            ]
          },
          "end_state": {
            "must_observe": [
              "exit code != 0",
              "output contains ASSAY_CHALLENGE_COLLISION"
            ],
            "must_not_observe": [
              "exit 0",
              "gate admitted under collision"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "research:inspect reports assayChallengeDistinct",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "live_fleet_research_ready",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-4",
              "Assert prose AC: research:inspect reports assayChallengeDistinct"
            ]
          },
          "end_state": {
            "must_observe": [
              "research:inspect reports assayChallengeDistinct"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead once RED evidence and GREEN closeout are recorded.
