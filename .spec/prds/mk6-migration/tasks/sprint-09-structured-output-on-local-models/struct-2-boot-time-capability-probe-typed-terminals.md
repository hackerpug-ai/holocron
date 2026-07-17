# struct-2 — Boot-time per-role capability probe + typed terminal outcomes
> Status: ✅ Completed
> Cycle: 1
> Commit: e281601
> Reviewer: mastra-reviewer (struct-4 APPROVED)
> Completed: 2026-07-17T03:05:03Z

## What this does

Implement probeRoleCapability (holo probe:capabilities): probe each role endpoint with a REAL generateObject call at boot, record per-role json_schema support, and select constrained-decode vs repair-loop mode. Never a /health proxy or static cache.

Provides: per-role capability record (supportsJsonSchema, mode) consumed by resolveModel/extraction at boot; holo probe:capabilities operator command

## Why

- MUST Probe each role endpoint via a REAL generateObject call — the probe IS a structured-output round-trip, not a health check
- MUST Record per-role json_schema support and select constrained-decode vs repair-loop mode from the live result
- MUST Fail-closed when a role endpoint is unreachable — never optimistically assume a capability
- MUST Expose the capability record for resolveModel/extraction to consume at boot
- NEVER Use /health or /v1/models as a proxy for json_schema support
- NEVER Return a static/hardcoded capability cache without a real call
- NEVER Silently fall back to a cloud endpoint when a role is unreachable
- NEVER Assume capability=true on any probe failure (optimistic lie)
- STRICTLY PLATFORM_IT=1 — the probe hits the real :4545 fleet
- STRICTLY The probe is deterministic/idempotent across runs for the same endpoint state
- STRICTLY An unreachable endpoint is recorded so resolveModel/extraction degrades, not silently cloud
- Grounded in: UC-INFER-03 (T-INFER-009)

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts` → Exit 0 — real generateObject calls, 0 /health proxy, fail-closed on unreachable
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/probe-capability.ts (NEW) — probeRoleCapability real-call probe + capability record · services/platform/src/cli/holo.ts (MODIFY) — probe:capabilities command

Prohibited: services/platform/src/fleet/manifest.ts - Sprint 01 deliverable, schema locked, services/platform/src/fleet/manifest.schema.ts - Sprint 01 deliverable, schema locked, services/platform/src/inference/resolve-model.ts - Sprint 08 router contract, services/platform/src/mastra.ts - Sprint 05 compose root

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: struct-2 — Boot-time per-role capability probe + typed terminal outcomes
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      mastra-implementer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Implement probeRoleCapability (holo probe:capabilities) that detects per-role json_schema support via a real generateObject call at boot and records constrained vs repair mode
holo probe:capabilities reports divergent=json_schema supported (constrained-decode) and convergent=not supported (repair-loop); a second run is identical; an unreachable endpoint fails-closed with no cloud fallback

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Probe each role endpoint via a REAL generateObject call — the probe IS a structured-output round-trip, not a health check
- MUST Record per-role json_schema support and select constrained-decode vs repair-loop mode from the live result
- MUST Fail-closed when a role endpoint is unreachable — never optimistically assume a capability
- MUST Expose the capability record for resolveModel/extraction to consume at boot
- NEVER Use /health or /v1/models as a proxy for json_schema support
- NEVER Return a static/hardcoded capability cache without a real call
- NEVER Silently fall back to a cloud endpoint when a role is unreachable
- NEVER Assume capability=true on any probe failure (optimistic lie)
- STRICTLY PLATFORM_IT=1 — the probe hits the real :4545 fleet

- STRICTLY The probe is deterministic/idempotent across runs for the same endpoint state

- STRICTLY An unreachable endpoint is recorded so resolveModel/extraction degrades, not silently cloud

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: probes each role endpoint via REAL generateObject call (NOT /health proxy, NOT static cache) and reports per-role json_schema support; selects constrained vs repair mode (flow_ref T-INFER-009)
- [ ] AC-2: selects constrained-decode mode; WHEN structuredOutput=false THEN selects repair-loop mode (flow_ref T-INFER-009)
- [ ] AC-3: fails-closed (never silently assumes capability); records failure so resolveModel/extraction degrades, not silently cloud (flow_ref T-INFER-009)
- [ ] AC-4: result is deterministic/idempotent (no flapping); capability record stable across runs (flow_ref T-INFER-009)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 probes each role endpoint via REAL generateObject call (NOT /health proxy, NOT static cache) and reports per-role json_schema support; selects constrained vs repair mode (PRIMARY) (flow_ref T-INFER-009)
  GIVEN: fleet manifest loaded
  WHEN:  running holo probe:capabilities
  THEN:  probes each role endpoint via REAL generateObject call (NOT /health proxy, NOT static cache) and reports per-role json_schema support; selects constrained vs repair mode
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-structured · evidence: stdout
    NEGATIVE_CONTROL: would fail if Probe uses /health proxy instead of real generateObject call, Probe returns cached static capability data without real call, Probe stubbed to return fake capability data, generateObject call mocked so never reaches real endpoint, probeCapabilities is a no-op stub returning static default without real model call
    CASE[0] start_ref=seeded-fleet-structured · actor=operator
      ACTION: Run holo probe:capabilities → Capture stdout for per-role capability report → Verify network capture shows real generateObject calls to each endpoint → Verify no /health proxy calls made
      MUST_OBSERVE: stdout contains 'divergent: json_schema supported (constrained-decode mode)' | stdout contains 'convergent: json_schema NOT supported (repair-loop mode)' | network-capture shows generateObject requests to http://localhost:4545/v1/models/35B-A3B | network-capture shows generateObject requests to http://localhost:4545/v1/models/27B | network-capture row count for /health endpoint = 0
      MUST_NOT_OBSERVE: stdout contains 'cached capability data' | network-capture shows only /health proxy calls | network-capture shows zero generateObject requests | Probe completes in < 100ms (indicates no real call) | empty capability report (no probe performed) | no generateObject calls (0 made) | (0) network requests (start state)

AC-2 selects constrained-decode mode; WHEN structuredOutput=false THEN selects repair-loop mode (flow_ref T-INFER-009)
  GIVEN: role manifest with structuredOutput=true
  WHEN:  probe runs
  THEN:  selects constrained-decode mode; WHEN structuredOutput=false THEN selects repair-loop mode
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: divergent-endpoint · evidence: stdout
    NEGATIVE_CONTROL: would fail if Mode selection ignores manifest flag, All roles default to same mode regardless of flag, Mode selected incorrectly (constrained for unsupported role), Manifest structuredOutput field not read, probeCapabilities is a no-op stub returning static default without real model call
    CASE[0] start_ref=divergent-endpoint · actor=operator
      ACTION: Set divergent role manifest structuredOutput=true → Run holo probe:capabilities → Verify divergent mode is constrained-decode
      MUST_OBSERVE: Probe output contains "divergent: constrained-decode mode" | Probe output contains "structuredOutput=true -> constrained-decode" | Capability record.mode = "constrained-decode"
      MUST_NOT_OBSERVE: Probe output shows 'divergent: repair-loop mode' | Mode defaults to repair-loop regardless of flag | blank mode field (stub signature)
    CASE[1] start_ref=convergent-endpoint · actor=operator
      ACTION: Set convergent role manifest structuredOutput=false → Run holo probe:capabilities → Verify convergent mode is repair-loop
      MUST_OBSERVE: Probe output contains "convergent: repair-loop mode" | Probe output contains "structuredOutput=false -> repair-loop" | Capability record.mode = "repair-loop"
      MUST_NOT_OBSERVE: Probe output shows 'convergent: constrained-decode mode' | Mode defaults to constrained-decode regardless of flag | empty mode value (no selection made)

AC-3 fails-closed (never silently assumes capability); records failure so resolveModel/extraction degrades, not silently cloud (flow_ref T-INFER-009)
  GIVEN: role endpoint unreachable during boot probe
  WHEN:  probe runs
  THEN:  fails-closed (never silently assumes capability); records failure so resolveModel/extraction degrades, not silently cloud
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: unreachable-endpoint · evidence: stdout
    NEGATIVE_CONTROL: would fail if Probe assumes capability=true when unreachable (optimistic lie), Probe silently falls back to cloud endpoint, Probe continues without recording failure, resolveModel/extraction uses unreachable endpoint without degradation, probeCapabilities is a no-op stub returning static default without real model call
    CASE[0] start_ref=unreachable-endpoint · actor=operator
      ACTION: Take fleet endpoint down → Run holo probe:capabilities → Verify probe fails-closed → Verify failure recorded → Verify resolveModel degrades to surface-unavailable
      MUST_OBSERVE: Probe exits with error code = 1 | stdout contains "probe failed-closed: endpoint unreachable" | Capability record.status = "unreachable" | network-capture row count for host api.anthropic.com = 0
      MUST_NOT_OBSERVE: Probe exits with success (code 0) | Probe assumes capability=true for unreachable endpoint | network-capture shows requests to api.anthropic.com | resolveModel returns unreachable endpoint without error | no failure recorded (empty status)

AC-4 result is deterministic/idempotent (no flapping); capability record stable across runs (flow_ref T-INFER-009)
  GIVEN: boot probe completed
  WHEN:  probe runs a second time
  THEN:  result is deterministic/idempotent (no flapping); capability record stable across runs
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-structured · evidence: stdout
    NEGATIVE_CONTROL: would fail if Second probe returns different capability (flap), Probe returns random result each run, Capability record changes between runs without endpoint change, Probe depends on external state beyond endpoint health, probeCapabilities is a no-op stub returning static default without real model call
    CASE[0] start_ref=seeded-fleet-structured · actor=operator
      ACTION: Run holo probe:capabilities (first run) and capture output → Run holo probe:capabilities (second run) and capture output → Compare outputs for exact match → Verify capability records are identical
      MUST_OBSERVE: First run output string equals second run output string (diff = 0) | Divergent capability: supportsJsonSchema = true, mode = "constrained-decode" | Convergent capability: supportsJsonSchema = false, mode = "repair-loop" | Capability change count between runs = 0
      MUST_NOT_OBSERVE: Outputs differ between runs | Capability records show different values | Mode changes from constrained-decode to repair-loop or vice versa | Probe shows 'flapping' behavior | random capability values (stub signature) | no capability stability (empty/deterministic check)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [holo probe:capabilities probes each role via real generateObject call] (maps_to_ac AC-1)
- TC-2 [Probe reports per-role json_schema support correctly] (maps_to_ac AC-1)
- TC-3 [Probe selects constrained-decode mode when manifest structuredOutput=true] (maps_to_ac AC-2)
- TC-4 [Probe selects repair-loop mode when manifest structuredOutput=false] (maps_to_ac AC-2)
- TC-5 [Probe fails-closed when endpoint unreachable] (maps_to_ac AC-3)
- TC-6 [Probe result is deterministic/idempotent across runs] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/probe-capability.ts (NEW) — probeRoleCapability real-call probe + capability record
- services/platform/src/cli/holo.ts (MODIFY) — probe:capabilities command
writeProhibited: services/platform/src/fleet/manifest.ts - Sprint 01 deliverable, schema locked, services/platform/src/fleet/manifest.schema.ts - Sprint 01 deliverable, schema locked, services/platform/src/inference/resolve-model.ts - Sprint 08 router contract, services/platform/src/mastra.ts - Sprint 05 compose root

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/fleet/manifest.ts lines 1-109
   - focus: Fleet Role Manifest loader + fail-closed validation — roles the probe iterates
2. services/platform/src/fleet/manifest.schema.ts lines 1-91
   - focus: FleetRoleSchema Zod shape — structuredOutput/capability field surface
3. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel pattern — the consumer of the capability record
4. services/platform/src/cli/holo.ts lines 1-100
   - focus: holo command pattern — where probe:capabilities registers

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts` → Exit 0 — real generateObject calls, 0 /health proxy, fail-closed on unreachable
- Typecheck passes: `pnpm tsgo --noEmit` → Exit 0
- Lint passes: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: for each role → real generateObject(schema) → record supportsJsonSchema + mode (constrained-decode | repair-loop) → on unreachable, fail-closed (status=unreachable, no cloud)
- pattern_source: services/platform/src/fleet/manifest.ts:1-109
- anti_pattern: /health or /v1/models proxy; static/hardcoded capability cache; optimistic capability=true on failure; cloud fallback
- agent_rationale: The probe is itself a structured-output round-trip against the fleet — Mastra/AI-SDK v6 generateObject expertise + Fleet Role Manifest familiarity
- composes resolveModel(role) from Sprint 08; owns the CAP-INF-01 extraction segment

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: struct-3, struct-4

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "struct-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-fleet-structured": {
      "description": "Fleet Role Manifest loaded via loadFleetManifest() with divergent/convergent roles at :4545",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with roles divergent, convergent, judge, embed, rerank",
        "divergent.litellmModelId = '35B-A3B' with supportsJsonSchema = true",
        "convergent.litellmModelId = '27B' with supportsJsonSchema = false",
        "All roles have healthProbe.path, method, timeoutMs, expectStatus",
        "Fleet reachable at http://localhost:4545"
      ]
    },
    "divergent-endpoint": {
      "description": "Divergent role endpoint at :4545 that supports json_schema",
      "seed_method": "cli",
      "records": [
        "Divergent model '35B-A3B' accepts generateObject with Zod schema",
        "generateObject returns valid structured output",
        "Response time < 2000ms"
      ]
    },
    "convergent-endpoint": {
      "description": "Convergent role endpoint at :4545 that does not support json_schema",
      "seed_method": "cli",
      "records": [
        "Convergent model '27B' rejects generateObject with Zod schema",
        "Convergent model accepts generateText (non-structured)",
        "Error: 'json_schema not supported' when generateObject called"
      ]
    },
    "unreachable-endpoint": {
      "description": "Role endpoint that is unreachable during boot probe",
      "seed_method": "cli",
      "records": [
        "Endpoint returns ECONNREFUSED or timeout",
        "Health probe fails after timeoutMs",
        "No network route to host"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN fleet manifest loaded WHEN running holo probe:capabilities THEN probes each role endpoint via REAL generateObject call (NOT /health proxy, NOT static cache) and reports per-role json_schema support; selects constrained vs repair mode",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Probe uses /health proxy instead of real generateObject call",
            "Probe returns cached static capability data without real call",
            "Probe stubbed to return fake capability data",
            "generateObject call mocked so never reaches real endpoint",
            "probeCapabilities is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-fleet-structured",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo probe:capabilities",
                "Capture stdout for per-role capability report",
                "Verify network capture shows real generateObject calls to each endpoint",
                "Verify no /health proxy calls made"
              ]
            },
            "end_state": {
              "must_observe": [
                "stdout contains 'divergent: json_schema supported (constrained-decode mode)'",
                "stdout contains 'convergent: json_schema NOT supported (repair-loop mode)'",
                "network-capture shows generateObject requests to http://localhost:4545/v1/models/35B-A3B",
                "network-capture shows generateObject requests to http://localhost:4545/v1/models/27B",
                "network-capture row count for /health endpoint = 0"
              ],
              "must_not_observe": [
                "stdout contains 'cached capability data'",
                "network-capture shows only /health proxy calls",
                "network-capture shows zero generateObject requests",
                "Probe completes in < 100ms (indicates no real call)",
                "empty capability report (no probe performed)",
                "no generateObject calls (0 made)",
                "(0) network requests (start state)"
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
      "description": "GIVEN role manifest with structuredOutput=true WHEN probe runs THEN selects constrained-decode mode; WHEN structuredOutput=false THEN selects repair-loop mode",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Mode selection ignores manifest flag",
            "All roles default to same mode regardless of flag",
            "Mode selected incorrectly (constrained for unsupported role)",
            "Manifest structuredOutput field not read",
            "probeCapabilities is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "divergent-endpoint",
            "action": {
              "actor": "operator",
              "steps": [
                "Set divergent role manifest structuredOutput=true",
                "Run holo probe:capabilities",
                "Verify divergent mode is constrained-decode"
              ]
            },
            "end_state": {
              "must_observe": [
                "Probe output contains \"divergent: constrained-decode mode\"",
                "Probe output contains \"structuredOutput=true -> constrained-decode\"",
                "Capability record.mode = \"constrained-decode\""
              ],
              "must_not_observe": [
                "Probe output shows 'divergent: repair-loop mode'",
                "Mode defaults to repair-loop regardless of flag",
                "blank mode field (stub signature)"
              ]
            }
          },
          {
            "start_ref": "convergent-endpoint",
            "action": {
              "actor": "operator",
              "steps": [
                "Set convergent role manifest structuredOutput=false",
                "Run holo probe:capabilities",
                "Verify convergent mode is repair-loop"
              ]
            },
            "end_state": {
              "must_observe": [
                "Probe output contains \"convergent: repair-loop mode\"",
                "Probe output contains \"structuredOutput=false -> repair-loop\"",
                "Capability record.mode = \"repair-loop\""
              ],
              "must_not_observe": [
                "Probe output shows 'convergent: constrained-decode mode'",
                "Mode defaults to constrained-decode regardless of flag",
                "empty mode value (no selection made)"
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
      "description": "GIVEN role endpoint unreachable during boot probe WHEN probe runs THEN fails-closed (never silently assumes capability); records failure so resolveModel/extraction degrades, not silently cloud",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Probe assumes capability=true when unreachable (optimistic lie)",
            "Probe silently falls back to cloud endpoint",
            "Probe continues without recording failure",
            "resolveModel/extraction uses unreachable endpoint without degradation",
            "probeCapabilities is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "unreachable-endpoint",
            "action": {
              "actor": "operator",
              "steps": [
                "Take fleet endpoint down",
                "Run holo probe:capabilities",
                "Verify probe fails-closed",
                "Verify failure recorded",
                "Verify resolveModel degrades to surface-unavailable"
              ]
            },
            "end_state": {
              "must_observe": [
                "Probe exits with error code = 1",
                "stdout contains \"probe failed-closed: endpoint unreachable\"",
                "Capability record.status = \"unreachable\"",
                "network-capture row count for host api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "Probe exits with success (code 0)",
                "Probe assumes capability=true for unreachable endpoint",
                "network-capture shows requests to api.anthropic.com",
                "resolveModel returns unreachable endpoint without error",
                "no failure recorded (empty status)"
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
      "description": "GIVEN boot probe completed WHEN probe runs a second time THEN result is deterministic/idempotent (no flapping); capability record stable across runs",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Second probe returns different capability (flap)",
            "Probe returns random result each run",
            "Capability record changes between runs without endpoint change",
            "Probe depends on external state beyond endpoint health",
            "probeCapabilities is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-fleet-structured",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo probe:capabilities (first run) and capture output",
                "Run holo probe:capabilities (second run) and capture output",
                "Compare outputs for exact match",
                "Verify capability records are identical"
              ]
            },
            "end_state": {
              "must_observe": [
                "First run output string equals second run output string (diff = 0)",
                "Divergent capability: supportsJsonSchema = true, mode = \"constrained-decode\"",
                "Convergent capability: supportsJsonSchema = false, mode = \"repair-loop\"",
                "Capability change count between runs = 0"
              ],
              "must_not_observe": [
                "Outputs differ between runs",
                "Capability records show different values",
                "Mode changes from constrained-decode to repair-loop or vice versa",
                "Probe shows 'flapping' behavior",
                "random capability values (stub signature)",
                "no capability stability (empty/deterministic check)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "holo probe:capabilities probes each role via real generateObject call",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Probe reports per-role json_schema support correctly",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Probe selects constrained-decode mode when manifest structuredOutput=true",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Probe selects repair-loop mode when manifest structuredOutput=false",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Probe fails-closed when endpoint unreachable",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Probe result is deterministic/idempotent across runs",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
