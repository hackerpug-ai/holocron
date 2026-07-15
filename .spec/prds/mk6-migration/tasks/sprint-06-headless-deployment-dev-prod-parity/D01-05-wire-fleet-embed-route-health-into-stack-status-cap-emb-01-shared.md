# D01-05 — Wire fleet embed-route health into stack status (CAP-EMB-01 shared)

## What this does

Wire the fleet embed-route health probe (from Sprint 01 Fleet Role Manifest) into holo stack status, providing ops-visibility share for CAP-EMB-01 - the embed health surfaced alongside Postgres/Mastra/scheduler/zero-cache in the stack supervisor.

Provides: Fleet embed-route health probe wired into holo stack status, CAP-EMB-01 ops-visibility share (embed health surfaced alongside other services).

## Why

- This sprint owns ONLY the ops-visibility share (health probe wiring) - chunk+embed pass is Sprint 10
- Embed health uses Fleet Role Manifest healthProbe.path=/v1/models and healthProbe.expectStatus=200
- Embed health is a real HTTP GET to :4545/v1/models - not mocked
- MUST extend holo stack status to include embed-route health
- MUST probe fleet :4545/v1/models using Fleet Role Manifest healthProbe contract (method=GET, expectStatus=200, timeoutMs=3000)
- Grounded in: CAP-EMB-01, CAP-EMB-01, CAP-EMB-01

## How to verify

- `bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*healthy'` → Exit 0 (embed: healthy in output)
- `curl http://127.0.0.1:4545/v1/models | jq '.object' | grep -q 'list'` → Exit 0 (fleet /v1/models responds with model list)
- `pkill -f ':4545'; bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*unhealthy'` → Exit 0 (embed: unhealthy when fleet down)
- `iptables -A INPUT -p tcp --dport 4545 -j DROP; time bun services/platform/src/cli/holo.ts stack status; iptables -D INPUT -p tcp --dport 4545 -j DROP` → Command completes within ~3000ms (timeout enforced, not hanging)

## Scope

Writes: services/platform/src/cli/holo.ts (MODIFY - extend stack:status to include embed health) · services/platform/src/stack/ (MODIFY - add embed health probe if extracted from holo.ts) · services/platform/src/fleet/ (MODIFY - add health probe loader if needed)

Prohibited: services/platform/fleet/manifest.json (MODIFY - Sprint 01 owns manifest structure) · services/platform/src/inference/resolve-model.ts (MODIFY - Sprint 05 owns resolveModel) · app/** (MODIFY - not this sprint) · holocron-mcp/** (MODIFY - not this sprint)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D01-05 — Wire fleet embed-route health into stack status (CAP-EMB-01 shared)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     S  (60 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-EMB-01
SPRINT:     [Sprint 6 — Headless Deployment and Dev/Prod Parity](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Wire the fleet embed-route health probe (from Sprint 01 Fleet Role Manifest) into holo stack status, providing ops-visibility share for CAP-EMB-01 - the embed health surfaced alongside Postgres/Mastra/scheduler/zero-cache in the stack supervisor.
holo stack status includes embed-route health; probes real :4545/v1/models endpoint using Fleet Role Manifest healthProbe contract (GET, expectStatus=200, timeoutMs=3000); reports healthy if fleet up, unhealthy if fleet down; included in JSON and human-readable output - all verified with real HTTP probe to fleet endpoint, not mocked.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST extend holo stack status to include embed-route health
- MUST probe fleet :4545/v1/models using Fleet Role Manifest healthProbe contract (method=GET, expectStatus=200, timeoutMs=3000)
- MUST report embed health in stack status output (JSON and human-readable)
- MUST use real HTTP GET to :4545/v1/models - not mocked
- MUST report unhealthy if fleet is down (degraded mode, not fake-healthy)
- NEVER mock the embed health probe - must use real HTTP GET to :4545/v1/models
- NEVER report embed healthy if fleet is down - must report unhealthy
- NEVER implement chunk+embed pass (Sprint 10 owns that) - this is ONLY health wiring
- NEVER hardcode embed health - must read from Fleet Role Manifest healthProbe contract
- NEVER stub or fake the fleet :4545/v1/models response
- STRICTLY embed health uses Fleet Role Manifest healthProbe.path=/v1/models (not /embed - verify from manifest)
- STRICTLY embed health uses healthProbe.expectStatus=200 (from manifest)
- STRICTLY embed health uses healthProbe.timeoutMs=3000 (from manifest, fail fast if fleet down)
- STRICTLY stack status includes embed: healthy/unhealthy alongside postgres/mastra/scheduler/zerocache
- STRICTLY this is ops-visibility ONLY - Sprint 10 owns the chunk+embed pass

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): holo stack status includes fleet embed-route health from real HTTP probe
- [x] AC-2 (PRIMARY): embed health uses Fleet Role Manifest healthProbe contract correctly
- [x] AC-3: embed health outputs in both JSON and human-readable formats
- [x] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] holo stack status includes fleet embed-route health from real HTTP probe (flow_ref CAP-EMB-01)
  GIVEN Fleet is running at :4545; Fleet Role Manifest has embed role with healthProbe.path=/v1/models
  WHEN  operator runs holo stack status
  THEN  Stack status probes :4545/v1/models using healthProbe contract (GET, expectStatus=200, timeoutMs=3000); includes embed: healthy in output; if fleet down, reports embed: unhealthy; probe is real HTTP GET (not mocked); healthProbe contract read from manifest (not hardcoded)
  TEST_TIER: integration · VERIFICATION_SERVICE: fleet-embed-route · TDD_STATE: green
  SCENARIO — start_ref: fleet_running_at_4545 · evidence: stdout
    NEGATIVE_CONTROL: would fail if probe stubbed (always healthy); fleet endpoint absent (not running); health hardcoded (static); exit code 0 with fleet down (false pass)
    MUST_OBSERVE: fleet running: `holo stack status | grep 'embed.*healthy'` exits code 0; fleet running: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4545/v1/models` prints 200; stop fleet: kill fleet process (kill -9 <fleet-pid>); fleet down: `holo stack status | grep 'embed.*unhealthy'` exits code 0; fleet down: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4545/v1/models` prints (0) or ≠ 200
    MUST_NOT_OBSERVE: fleet down: stack status prints embed healthy (stubbed); fleet down: HTTP response is 200 (false positive); fleet running: HTTP response is (0) (fleet not reachable); fleet down: (0) unhealthy services (stubbed healthy)

AC-2 [PRIMARY] embed health uses Fleet Role Manifest healthProbe contract correctly (flow_ref CAP-EMB-01)
  GIVEN Fleet Role Manifest has embed role with healthProbe.path=/v1/models, healthProbe.expectStatus=200, healthProbe.timeoutMs=3000
  WHEN  operator runs holo stack status
  THEN  Health probe uses manifest contract: GET /v1/models (not /embed), expects status 200, times out after 3000ms; contract read from services/platform/fleet/manifest.json (not hardcoded); if manifest changes, probe respects new values
  TEST_TIER: integration · VERIFICATION_SERVICE: fleet-embed-route · TDD_STATE: green
  SCENARIO — start_ref: fleet_role_manifest_exists · evidence: stdout
    NEGATIVE_CONTROL: would fail if path hardcoded (not read from manifest); manifest absent (deleted); probe uses wrong path (stubbed); exit code 0 with wrong path (false pass)
    MUST_OBSERVE: `jq -r '.roles[] | select(.name=="embed") | .healthProbe.path' services/platform/fleet/manifest.json` prints `/v1/models`; `jq -r '.roles[] | select(.name=="embed") | .healthProbe.port' services/platform/fleet/manifest.json` prints `4545`; stack status probes http://127.0.0.1:4545/v1/models (manifest path); change manifest path to /v1/health; stack status probes http://127.0.0.1:4545/v1/health (uses manifest path)
    MUST_NOT_OBSERVE: stack status probes /v1/models when manifest has /v1/health (hardcoded); stack status probes wrong port (not reading manifest); stack status prints embed healthy when path is wrong (stubbed); manifest prints (0) healthProbe.path (path missing)

AC-3 embed health outputs in both JSON and human-readable formats (flow_ref CAP-EMB-01)
  GIVEN stack status includes embed health from AC-1
  WHEN  operator runs holo stack status with and without --json
  THEN  Default (no --json) outputs human-readable text with embed: healthy; --json outputs valid JSON with embed: healthy; both formats include embed health alongside postgres/mastra/scheduler/zerocache
  TEST_TIER: integration · VERIFICATION_SERVICE: fleet-embed-route · TDD_STATE: green
  SCENARIO — start_ref: fleet_running_at_4545 · evidence: stdout
    NEGATIVE_CONTROL: would fail if --json outputs invalid JSON (malformed); embed key omitted (absent); JSON and human outputs disagree (inconsistent); exit code 0 with missing key (false pass)
    MUST_OBSERVE: `holo stack status --json | jq .` exits code 0 (valid JSON); `holo stack status --json | jq -r .embed` prints `healthy`; `holo stack status --json | jq -r .postgres` prints `healthy`; `holo stack status --json | jq -r .mastra` prints `healthy`; `holo stack status | grep embed` exits code 0 (embed in human output); `holo stack status | grep 'embed.*healthy'` exits code 0 (healthy in human output); both outputs agree on embed status (JSON healthy == human healthy)
    MUST_NOT_OBSERVE: jq exits code ≠ 0 (invalid JSON); embed key is (0) or absent (key missing); JSON prints healthy but human prints unhealthy (inconsistent); human prints embed but JSON has (0) embed key (missing); embed key is `null` or `undefined` (no value)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cli/holo.ts (MODIFY - extend stack:status to include embed health)
- services/platform/src/stack/ (MODIFY - add embed health probe if extracted from holo.ts)
- services/platform/src/fleet/ (MODIFY - add health probe loader if needed)
writeProhibited: services/platform/fleet/manifest.json (MODIFY - Sprint 01 owns manifest structure), services/platform/src/inference/resolve-model.ts (MODIFY - Sprint 05 owns resolveModel), app/** (MODIFY - not this sprint), holocron-mcp/** (MODIFY - not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:34-42 [CAP-EMB-01 (ops-visibility share this sprint, chunk+embed pass Sprint 10)]
2. /Users/justinrich/Projects/holocron/services/platform/fleet/manifest.json:56-78 [embed role healthProbe contract (path=/v1/models, expectStatus=200, timeoutMs=3000)]
3. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/SPRINT.md:74-76 [CAP-EMB-01 coverage (ops-visibility share)]
4. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-01-mastra-compat-lock-fleet-manifest/compat-3-fleet-role-manifest-and-resolvemodel.md:all [Sprint 01 Fleet Role Manifest structure and healthProbe contract]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Stack Status Includes Embed Health: `bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*healthy'` → Exit 0 (embed: healthy in output)
- Embed Health Probes Real Fleet Endpoint: `curl http://127.0.0.1:4545/v1/models | jq '.object' | grep -q 'list'` → Exit 0 (fleet /v1/models responds with model list)
- Embed Health Reports Unhealthy When Fleet Down: `pkill -f ':4545'; bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*unhealthy'` → Exit 0 (embed: unhealthy when fleet down)
- Embed Health Timeout Enforced: `iptables -A INPUT -p tcp --dport 4545 -j DROP; time bun services/platform/src/cli/holo.ts stack status; iptables -D INPUT -p tcp --dport 4545 -j DROP` → Command completes within ~3000ms (timeout enforced, not hanging)

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: This is ops-visibility ONLY - Sprint 10 owns the chunk+embed pass implementation; Health probe reads from Fleet Role Manifest healthProbe contract - not hardcoded; Health probe is real HTTP GET to :4545/v1/models - not mocked
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D01-03 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D01-05",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fleet_running_at_4545": {
      "description": "Fleet embedder running at http://127.0.0.1:4545 with /v1/models endpoint",
      "seed_method": "recorded_external",
      "records": [
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4545/v1/models prints 200",
        "fleet process exists (ps aux | grep fleet)",
        "fleet role manifest exists at services/platform/fleet/manifest.json"
      ]
    },
    "fleet_role_manifest_exists": {
      "description": "Fleet role manifest with healthProbe contract for embed role",
      "seed_method": "recorded_external",
      "records": [
        "test -f services/platform/fleet/manifest.json exits code 0",
        "jq -r '.roles[] | select(.name==\"embed\") | .healthProbe.path' services/platform/fleet/manifest.json prints /v1/models",
        "jq -r '.roles[] | select(.name==\"embed\") | .healthProbe.port' services/platform/fleet/manifest.json prints 4545",
        "jq -r '.roles[] | select(.name==\"embed\") | .healthProbe.scheme' services/platform/fleet/manifest.json prints http"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "CAP-EMB-01",
      "description": "GIVEN Fleet is running at :4545; Fleet Role Manifest has embed role with healthProbe.path=/v1/models WHEN operator runs holo stack status THEN Stack status probes :4545/v1/models using healthProbe contract (GET, expectStatus=200, timeoutMs=3000); includes embed: healthy in output; if fleet down, reports embed: unhealthy; probe is real HTTP GET (not mocked); healthProbe contract read from manifest (not hardcoded)",
      "verify": "bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*healthy'; curl http://127.0.0.1:4545/v1/models returns 200; stop fleet; run status again \u2192 shows embed: unhealthy",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "CAP-EMB-01",
        "negative_control": {
          "would_fail_if": [
            "probe stubbed (always healthy)",
            "fleet endpoint absent (not running)",
            "health hardcoded (static)",
            "exit code 0 with fleet down (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_running_at_4545",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo stack status | grep 'embed.*healthy'`",
                "verify fleet is healthy",
                "stop fleet",
                "run `holo stack status | grep 'embed.*unhealthy'`",
                "verify fleet is unhealthy"
              ]
            },
            "end_state": {
              "must_observe": [
                "fleet running: `holo stack status | grep 'embed.*healthy'` exits code 0",
                "fleet running: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4545/v1/models` prints 200",
                "stop fleet: kill fleet process (kill -9 <fleet-pid>)",
                "fleet down: `holo stack status | grep 'embed.*unhealthy'` exits code 0",
                "fleet down: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4545/v1/models` prints (0) or \u2260 200"
              ],
              "must_not_observe": [
                "fleet down: stack status prints embed healthy (stubbed)",
                "fleet down: HTTP response is 200 (false positive)",
                "fleet running: HTTP response is (0) (fleet not reachable)",
                "fleet down: (0) unhealthy services (stubbed healthy)"
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
      "flow_ref": "CAP-EMB-01",
      "description": "GIVEN Fleet Role Manifest has embed role with healthProbe.path=/v1/models, healthProbe.expectStatus=200, healthProbe.timeoutMs=3000 WHEN operator runs holo stack status THEN Health probe uses manifest contract: GET /v1/models (not /embed), expects status 200, times out after 3000ms; contract read from services/platform/fleet/manifest.json (not hardcoded); if manifest changes, probe respects new values",
      "verify": "grep healthProbe in services/platform/fleet/manifest.json shows path=/v1/models; holo stack status uses that path; timeout enforced at 3000ms",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "CAP-EMB-01",
        "negative_control": {
          "would_fail_if": [
            "path hardcoded (not read from manifest)",
            "manifest absent (deleted)",
            "probe uses wrong path (stubbed)",
            "exit code 0 with wrong path (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_role_manifest_exists",
            "action": {
              "actor": "operator",
              "steps": [
                "read manifest healthProbe path",
                "verify stack status probes that path",
                "modify manifest path",
                "verify stack status uses new path"
              ]
            },
            "end_state": {
              "must_observe": [
                "`jq -r '.roles[] | select(.name==\"embed\") | .healthProbe.path' services/platform/fleet/manifest.json` prints `/v1/models`",
                "`jq -r '.roles[] | select(.name==\"embed\") | .healthProbe.port' services/platform/fleet/manifest.json` prints `4545`",
                "stack status probes http://127.0.0.1:4545/v1/models (manifest path)",
                "change manifest path to /v1/health",
                "stack status probes http://127.0.0.1:4545/v1/health (uses manifest path)"
              ],
              "must_not_observe": [
                "stack status probes /v1/models when manifest has /v1/health (hardcoded)",
                "stack status probes wrong port (not reading manifest)",
                "stack status prints embed healthy when path is wrong (stubbed)",
                "manifest prints (0) healthProbe.path (path missing)"
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
      "flow_ref": "CAP-EMB-01",
      "description": "GIVEN stack status includes embed health from AC-1 WHEN operator runs holo stack status with and without --json THEN Default (no --json) outputs human-readable text with embed: healthy; --json outputs valid JSON with embed: healthy; both formats include embed health alongside postgres/mastra/scheduler/zerocache",
      "verify": "bun services/platform/src/cli/holo.ts stack status | grep embed; bun services/platform/src/cli/holo.ts stack status --json | jq '.embed' \u2192 healthy",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "CAP-EMB-01",
        "negative_control": {
          "would_fail_if": [
            "--json outputs invalid JSON (malformed)",
            "embed key omitted (absent)",
            "JSON and human outputs disagree (inconsistent)",
            "exit code 0 with missing key (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_running_at_4545",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo stack status --json`",
                "verify JSON output",
                "run `holo stack status` (human)",
                "verify human output matches JSON"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo stack status --json | jq .` exits code 0 (valid JSON)",
                "`holo stack status --json | jq -r .embed` prints `healthy`",
                "`holo stack status --json | jq -r .postgres` prints `healthy`",
                "`holo stack status --json | jq -r .mastra` prints `healthy`",
                "`holo stack status | grep embed` exits code 0 (embed in human output)",
                "`holo stack status | grep 'embed.*healthy'` exits code 0 (healthy in human output)",
                "both outputs agree on embed status (JSON healthy == human healthy)"
              ],
              "must_not_observe": [
                "jq exits code \u2260 0 (invalid JSON)",
                "embed key is (0) or absent (key missing)",
                "JSON prints healthy but human prints unhealthy (inconsistent)",
                "human prints embed but JSON has (0) embed key (missing)",
                "embed key is `null` or `undefined` (no value)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "holo stack status includes embed health from real HTTP probe",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*healthy'; curl http://127.0.0.1:4545/v1/models returns 200"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "embed health reports unhealthy when fleet is down",
      "maps_to_ac": "AC-1",
      "verify": "Stop fleet; bun services/platform/src/cli/holo.ts stack status | grep -q 'embed.*unhealthy'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "embed health uses Fleet Role Manifest healthProbe contract",
      "maps_to_ac": "AC-2",
      "verify": "grep healthProbe in services/platform/fleet/manifest.json shows path=/v1/models; status probes that path"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "embed health outputs in JSON and human-readable formats",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts stack status | grep embed; bun services/platform/src/cli/holo.ts stack status --json | jq '.embed' \u2192 healthy"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "embed health timeout enforced at 3000ms per manifest",
      "maps_to_ac": "AC-2",
      "verify": "Block fleet port; bun services/platform/src/cli/holo.ts stack status fails fast within ~3000ms (not hanging)"
    }
  ]
}
-->
</details>