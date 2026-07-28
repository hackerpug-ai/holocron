# REDHAT-FIX-S27-14 — [F-16] Bound webhook fetch time and prevent alert-sweep hangs

## What this does

Bound backup alert webhook HTTP time so a black-holed provider cannot hang alert-sweep or the gate.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-14).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts` → Exit 0
- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/alerting.ts (MODIFY — postBackupAlert timeout), services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts (NEW), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if shared helpers needed), .tmp/redhat-fix-s27-14/** (NEW evidence)

Prohibited: services/platform/src/backup/r2-provision.ts — separate F-16 note on Cloudflare fetch is out of scope unless trivial shared helper, gate-plan.json, mocking fetch globally for green

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-14 — [F-16] Bound webhook fetch time and prevent alert-sweep hangs
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (75 min)
AGENT:      implementer=mastra-implementer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
postBackupAlert aborts around 10s against a non-responsive server; successful POSTs still deliver to a real sink; existing D04-01 RED suite stays green.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST wrap postBackupAlert fetch in AbortController with ~10_000 ms timeout (clearTimeout in finally)
- MUST fail the POST (throw) on abort/timeout so sweep error accounting still fail-closes
- MUST prove with a real local http.Server that intentionally never responds that postBackupAlert rejects within ~10s (+ small slack), not hang indefinitely
- MUST prove happy path still POSTs to a real responding http.Server receiver (method POST, JSON body)
- MUST keep RED suite sprint27-backup-alerting-red.test.ts green for existing failure/silence cases after timeout wiring
- NEVER leave fetch without signal/timeout
- NEVER swallow timeout errors as successful delivery
- NEVER mock fetch/global to fake timeout behavior without a real slow server
- NEVER set timeout so low that healthy loopback receivers flake under load (default ~10s)
- STRICTLY use AbortController + signal on fetch (Bun/Node compatible)
- STRICTLY PLATFORM_IT=1 integration test with real Server
- STRICTLY write_allowed limited to alerting + tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Hung webhook aborts ~10s (PRIMARY)
- [ ] AC-2: Healthy webhook still delivers
- [ ] AC-3: AbortController wired in source
- [ ] AC-4: Existing D04-01 RED suite remains green
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Hung webhook aborts ~10s (PRIMARY) (flow_ref T-PLAT-024)
  GIVEN A real local http.Server that accepts connections but never calls res.end (or delays >>10s)
  WHEN  postBackupAlert is invoked with that server URL and a valid BackupAlertPayload
  THEN  The promise rejects with abort/timeout-related error within ~10s (+<=2s slack), and does not remain pending beyond 12s
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t "timeout"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if fetch has no AbortSignal; timeout never fires; test uses fake timers without real socket; error swallowed as ok:true
  START_REF: hanging_webhook_server
  MUST_OBSERVE: promise rejected; elapsed_ms <= 12000; error message matches /abort|timeout|AbortError/i
  MUST_NOT_OBSERVE: promise still pending after 12s; return {ok:true}; silent resolve
  EVIDENCE: stdout (required_capture=True)

### AC-2 — Healthy webhook still delivers (flow_ref T-PLAT-024)
  GIVEN Real http.Server receiver that responds 200 immediately
  WHEN  postBackupAlert posts a payload
  THEN  Receiver captures method=POST, JSON body with job_name, and function returns {ok:true,status:200}
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t "happy"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if timeout aborts healthy posts; mocked sink without HTTP; payload not received
  START_REF: responsive_webhook_server
  MUST_OBSERVE: captured.method === POST; captured.json.job_name present; result.ok === true; result.status === 200
  MUST_NOT_OBSERVE: AbortError on healthy path; zero captures
  EVIDENCE: api_response (required_capture=True)

### AC-3 — AbortController wired in source (flow_ref T-PLAT-024)
  GIVEN alerting.ts postBackupAlert implementation
  WHEN  Reviewer inspects fetch call site
  THEN  AbortController is constructed, signal passed to fetch, setTimeout ~10000 aborts, finally clearTimeout
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: filesystem-source
  VERIFY: `rg -n "AbortController|signal:|10_000|10000" services/platform/src/backup/alerting.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if timeout only in tests not production code; signal omitted from fetch
  START_REF: alerting_source
  MUST_OBSERVE: AbortController present; fetch options include signal; timeout ~10000
  MUST_NOT_OBSERVE: fetch(url, { method, headers, body }) without signal
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Existing D04-01 RED suite remains green (flow_ref T-PLAT-024)
  GIVEN Timeout wiring landed
  WHEN  PLATFORM_IT=1 runs sprint27-backup-alerting-red.test.ts with short overdue window
  THEN  Suite exits 0 (failure alerts + healthy silence still hold)
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if timeout breaks healthy POST; sweep hangs in RED suite
  START_REF: responsive_webhook_server
  MUST_OBSERVE: vitest exit 0
  MUST_NOT_OBSERVE: test timeout hang; failed healthy silence
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | postBackupAlert rejects within 12s against a non-responsive HTTP server | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t "timeout"` |
| TC-2 | postBackupAlert returns ok true for a real 200 webhook receiver | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t "happy"` |
| TC-3 | postBackupAlert fetch call site passes AbortController signal | AC-3 | `rg -n "AbortController" services/platform/src/backup/alerting.ts && rg -n "signal" services/platform/src/backup/alerting.ts` |
| TC-4 | sprint27-backup-alerting-red.test.ts exits 0 after timeout wiring | AC-4 | `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts (MODIFY — postBackupAlert timeout)
- services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts (NEW)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if shared helpers needed)
- .tmp/redhat-fix-s27-14/** (NEW evidence)
writeProhibited:
- services/platform/src/backup/r2-provision.ts — separate F-16 note on Cloudflare fetch is out of scope unless trivial shared helper
- gate-plan.json
- mocking fetch globally for green

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:135-139 — F-16 fetch no timeout
2. services/platform/src/backup/alerting.ts:332-360 — postBackupAlert fetch without AbortController
3. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:1-170 — Real http.Server webhook receiver pattern to reuse

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: F-16, D04-05 postBackupAlert
Interaction notes:
- Default timeout 10_000ms; optional env BACKUP_ALERT_WEBHOOK_TIMEOUT_MS if needed for tests only
Pattern: const controller = new AbortController(); const t = setTimeout(() => controller.abort(), 10_000); try { await fetch(url, { ..., signal: controller.signal }); } finally { clearTimeout(t); }
Pattern source: red-hat F-16 fix recommendation
Anti-pattern: await fetch(url, { method, headers, body }) with no signal — hang forever on black-hole webhook

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Timeout integration suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts` → Exit 0
- RED suite regression: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: code-reviewer
- Rationale: Owns backup alerting webhook POST; must add AbortController timeout so hung providers cannot block alert-sweep/gate.
- Proposed by: mastra-planner

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['webhook-post-timeout-bound', 'alert-sweep-nonhang-contract']
- consumes: ['postBackupAlert', 'ALERT_WEBHOOK_URL']
- boundary_contracts: ['hung-webhook-aborts-within-timeout', 'successful-webhook-still-delivers-to-real-http-server']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/backup/alerting.ts

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: []
- blocks: ['REDHAT-FIX-S27-15']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Finding F-16 HIGH (bun-reviewer) — hang blocks sweep/gate
- Handoff: dispatch mastra-implementer; reviewer = mastra-reviewer + bun-reviewer optional

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-14",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "hanging_webhook_server": {
      "description": "Real node:http Server that never ends the response",
      "seed_method": "public_api",
      "records": [
        "createServer((req,res) => { /* intentionally no res.end */ })",
        "listen on 127.0.0.1 ephemeral port"
      ]
    },
    "responsive_webhook_server": {
      "description": "Real node:http Server responding 200 + capturing body",
      "seed_method": "public_api",
      "records": [
        "createServer responds 200",
        "captures method/url/headers/rawBody"
      ]
    },
    "alerting_source": {
      "description": "postBackupAlert implementation in alerting.ts",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/backup/alerting.ts postBackupAlert"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN hanging real HTTP server WHEN postBackupAlert runs THEN rejects within ~10s with abort/timeout error",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t \"timeout\"",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "no AbortSignal",
            "hang forever",
            "ok:true on timeout"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "hanging_webhook_server",
            "action": {
              "actor": "system",
              "steps": [
                "start hang server",
                "time postBackupAlert",
                "assert reject"
              ]
            },
            "end_state": {
              "must_observe": [
                "rejected",
                "elapsed_ms <= 12000",
                "abort/timeout error"
              ],
              "must_not_observe": [
                "pending >12s",
                "ok:true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN responsive real webhook WHEN postBackupAlert runs THEN POST delivered and ok:true",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t \"happy\"",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "timeout aborts healthy post",
            "mock sink"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "responsive_webhook_server",
            "action": {
              "actor": "system",
              "steps": [
                "start 200 server",
                "postBackupAlert",
                "assert capture"
              ]
            },
            "end_state": {
              "must_observe": [
                "method POST",
                "ok true",
                "job_name in body"
              ],
              "must_not_observe": [
                "AbortError",
                "zero captures"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN alerting.ts WHEN inspecting postBackupAlert THEN AbortController+signal+~10s timeout present",
      "verify": "rg -n \"AbortController|signal:|10_000|10000\" services/platform/src/backup/alerting.ts",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-source",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "timeout only in test harness"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "alerting_source",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg AbortController in postBackupAlert"
              ]
            },
            "end_state": {
              "must_observe": [
                "AbortController",
                "signal",
                "~10000 timeout"
              ],
              "must_not_observe": [
                "fetch without signal"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN timeout wiring WHEN D04-01 RED suite runs THEN exit 0",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "timeout breaks existing suite"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "responsive_webhook_server",
            "action": {
              "actor": "system",
              "steps": [
                "run RED suite"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit 0"
              ],
              "must_not_observe": [
                "hang",
                "false silence failures"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "postBackupAlert rejects within 12s against a non-responsive HTTP server",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t \"timeout\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "postBackupAlert returns ok true for a real 200 webhook receiver",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts -t \"happy\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "postBackupAlert fetch call site passes AbortController signal",
      "verify": "rg -n \"AbortController\" services/platform/src/backup/alerting.ts && rg -n \"signal\" services/platform/src/backup/alerting.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "sprint27-backup-alerting-red.test.ts exits 0 after timeout wiring",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
