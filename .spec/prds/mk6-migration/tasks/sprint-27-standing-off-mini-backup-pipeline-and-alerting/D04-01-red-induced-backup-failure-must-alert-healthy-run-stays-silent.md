# D04-01 — RED: induced backup failure must alert, healthy run must stay silent

## What this does

Write the **RED integration test** that proves the CAP-BAK-01 alerting contract *before* D04-05 implements it. The test is two-sided: (1) an induced backup-job failure MUST produce an alert (webhook/push received) within 15 minutes at a **real** alert sink; (2) a healthy backup run MUST stay silent (ZERO alerts emitted) — the anti-fake-healthy negative control. It covers the three PRD failure modes that must NEVER go silently healthy: (a) WAL archiving falls behind / job killed mid-archive; (b) bucket credential expires; (c) backup config removed entirely → overdue alert still fires.

Provides: RED integration test file at `services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`; a real webhook receiver the test stands up (no mocks); a two-sided oracle asserting failure-alerts AND healthy-silence; coverage of three failure modes.

## Why

- This test FAILS in current greenfield state (no backup module exists) — that is the point of TDD RED.
- The oracle is strong enough that fake/stub alerting cannot pass: it must observe a real alert artifact at a real sink AND must not observe alerts during a healthy run.
- The three silent-failure modes from the PRD must surface as loud alerts, never false-healthy states.
- D04-05 satisfies this RED by implementing real alerting — the test gates D04-05's GREEN.
- Grounded in: UC-PLAT-06, T-PLAT-024, CAP-BAK-01.

## How to verify

- `test -f services/platform/tests/integration/sprint27-backup-alerting-red.test.ts && grep -Ec 'describe|itLive' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts | grep -Eq '[1-9]'` → Exit 0 (test file exists with vitest structure)
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit ≠ 0 currently (RED — test describes the contract but no implementation exists); after D04-05 → Exit 0 (GREEN)
- `grep -Ec 'http.Server|createServer' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts | grep -Eq '[1-9]' && ! grep -Eq 'mock.*webhook|stub.*receiver' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0 (real webhook receiver, no mocks)
- `grep -Eq 'WAL|kill' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts && grep -Eq 'credential|expir' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts && grep -Eq 'config|overdue' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0 (covers all three PRD failure modes)
- `grep -Eq 'zero|silence|must_not_observe' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0 (asserts silence during healthy run)

## Scope

Writes: `services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` (NEW)

Prohibited: `services/platform/src/backup/**` (MODIFY — D04-03/D04-04 own backup implementation), `services/platform/src/cli/holo.ts` `backup:*` commands (MODIFY — D04-03/D04-05 own these), any alerting implementation (MODIFY — D04-05 owns alerting; this task only writes the failing test)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D04-01 — RED: induced backup failure must alert, healthy run must stay silent
================================================================================

TASK_TYPE:  TEST
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (75 min)
AGENT:      implementer=red-test-generator | reviewer=code-reviewer
PROPOSED-BY: red-test-generator
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
RED integration test at services/platform/tests/integration/sprint27-backup-alerting-red.test.ts that proves CAP-BAK-01 alerting: induced failure MUST alert within 15 min at a real webhook sink, healthy run MUST stay silent. Covers three PRD failure modes (kill/WAL-behind, credential expiry, config-removed/overdue). Test currently FAILS (no implementation); uses a real http.Server receiver (no mocks); after D04-05 it PASSES — verified against the real sink, never a stub.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST write the RED integration test at services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- MUST induce a REAL backup-job failure (kill real job / expire real test-scoped R2 credential / remove real config)
- MUST assert against a REAL alert sink (a local webhook receiver the test stands up), never a mocked sink
- MUST observe an alert artifact received at the real sink within 15 minutes of induced failure
- MUST verify ZERO alert posts during a healthy backup run (silence proof / anti-fake-healthy)
- MUST cover three PRD failure modes: (a) WAL behind/job killed, (b) credential expires, (c) config removed → overdue alert
- MUST fail in current state and only pass after D04-05 lands real alerting
- MUST use PLATFORM_IT=1 guard and run via pnpm vitest run <path>
- NEVER mock the webhook/push receiver — must hit a real sink the test stands up
- NEVER stub the alert path to always exit 0 / always-healthy
- NEVER use static 'alert fired' assertions without observing a real alert artifact
- NEVER implement alerting in this task — this is the RED test that FAILS until D04-05
- NEVER allow fake-healthy stubs to pass (always-healthy path, mocked receiver, suppressed/swallowed alert)
- NEVER write alerts that fire only on explicit job-exit but not on credential-expiry or config-removed
- STRICTLY two-sided test: induced failure MUST alert, healthy run MUST stay silent
- STRICTLY verification runs against a real webhook/push sink — no fake receiver
- STRICTLY test lives under services/platform/tests/integration/, PLATFORM_IT=1 guarded

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): RED integration test written with the two-sided oracle (failure alerts, healthy silence)
- [x] Test currently FAILS (no implementation exists)
- [x] Test uses a real webhook receiver, no mocks
- [x] Test covers all three PRD failure modes
- [x] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by a real alert sink)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] RED integration test written with the two-sided oracle (flow_ref T-PLAT-024)
  GIVEN no backup module exists (current greenfield state)
  WHEN  the RED test is written
  THEN  the test FAILS because the alerting contract is not yet implemented; the test describes the full two-sided oracle — induced failure MUST alert within 15 min at a real sink, healthy run MUST stay silent — covers three PRD failure modes, uses a real webhook receiver (never mocks); after D04-05 the test PASSES when real alerting fires on failure and stays silent on health
  TEST_TIER: integration · VERIFICATION_SERVICE: backup-alerting · TDD_STATE: red
  SCENARIO — start_ref: backup_jobs_configured · evidence: alert_artifact
    NEGATIVE_CONTROL: would fail if the alert path is stubbed to always exit 0 / always-healthy (no real alert sent); the test mocks the webhook receiver instead of hitting a real sink; alerting fires only on explicit job-exit but not on credential-expiry or config-removed; the test uses static 'alert fired' assertions without observing a real alert artifact; the alert is suppressed/caught-and-swallowed; a healthy run emits alerts (false positives — silence proof fails)
    MUST_OBSERVE: a real webhook receiver stands up on a test port (http://localhost:9999/alert responds); a healthy backup run completes with ZERO alert POSTs received in the 15 min window; failure (a): within 15 min the webhook receives a POST whose payload names the failed job + 'killed'/'WAL behind'; failure (b): within 15 min the webhook receives a POST naming 'credential'/'expired'; failure (c): within the overdue window the webhook receives a POST naming 'overdue'/'config missing'; alert payloads include structured fields job_id, failure_reason, timestamp
    MUST_NOT_OBSERVE: any alert POST during a healthy backup run (silence proof); a mocked webhook receiver (must be a real http.Server); an alert path stubbed to always exit 0 without a POST; credential expiry producing no alert (silent failure); config-removed producing no alert (silent failure); job-killed producing no alert; a stale 'healthy' heartbeat masquerading as an alert

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (NEW)
writeProhibited: services/platform/src/backup/** (MODIFY - D04-03/D04-04 own backup implementation), services/platform/src/cli/holo.ts backup:* commands (MODIFY - D04-03/D04-05 own these), any alerting implementation (MODIFY - D04-05 owns alerting)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 [T-PLAT-024: backup failure/overdue alert within the window, no human polling]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 failure modes + boundary contracts: WAL behind, credential expiry, config removed must alert]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:79-88 [UC-PLAT-06 AC-4: alerted within a window without dashboard polling]
4. /Users/inference1/Projects/holocron/services/platform/tests/integration/sprint20-coldboot-journey.test.ts:1-100 [Integration harness pattern: PLATFORM_IT guard, itLive, real-service verification]
5. /Users/inference1/Projects/holocron/tests/integration/service/evidence-net-support.test.ts:1-50 [Evidence harness: itLive helper, artifact writing, must_observe/must_not_observe]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED test file exists + valid: `test -f services/platform/tests/integration/sprint27-backup-alerting-red.test.ts && grep -Ec 'describe|itLive' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts | grep -Eq '[1-9]'` → Exit 0
- RED test currently FAILS: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit ≠ 0 (RED state)
- Real webhook receiver, no mocks: `grep -Ec 'http.Server|createServer' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts | grep -Eq '[1-9]' && ! grep -Eq 'mock.*webhook|stub.*receiver' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- Three failure modes covered: `grep -Eq 'WAL|kill' … && grep -Eq 'credential|expir' … && grep -Eq 'config|overdue' …` → Exit 0
- Silence during healthy run: `grep -Eq 'zero|silence|must_not_observe' services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: test uses a real http.Server webhook receiver (no mocked sinks); covers all three PRD failure modes; asserts zero alerts during a healthy run (anti-fake-healthy); currently FAILS (RED) and passes only after D04-05; uses PLATFORM_IT=1 and follows the integration-test harness pattern.
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: D04-05

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D04-01",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "backup_jobs_configured": {
      "description": "Backup jobs (WAL archive + base backup, blob mirror) exist from D04-03/D04-04 and an alert sink endpoint is configured (webhook URL the test stands up)",
      "seed_method": "cli",
      "records": [
        "backup jobs configured via holo/pgbackrest CLI (WAL archive + base backup + restic blob mirror)",
        "alert sink webhook URL set to http://localhost:9999/alert (test receiver)",
        "pgBackRest repo points at real R2 bucket (repo1-type=s3)",
        "alert posts received: (0) before any induced failure"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN no backup module exists WHEN the RED test is written THEN the test FAILS (no implementation); it describes the two-sided oracle — induced failure MUST alert within 15 min at a real sink, healthy run MUST stay silent; covers three PRD failure modes; uses a real webhook receiver, never mocks; after D04-05 the test PASSES when real alerting fires on failure and stays silent on health",
      "verify": "test -f services/platform/tests/integration/sprint27-backup-alerting-red.test.ts; PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts currently FAILS (RED), after D04-05 PASSES",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "alert path stubbed to always exit 0 / always-healthy (no real alert sent)",
            "test mocks the webhook receiver instead of hitting a real sink",
            "alerting fires only on explicit job-exit but not on credential-expiry or config-removed",
            "test uses static alert-fired assertions without observing a real alert artifact",
            "alert suppressed/caught-and-swallowed by the implementation",
            "healthy run emits alerts (false positives — silence proof fails)"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "backup_jobs_configured",
            "action": {
              "actor": "test",
              "steps": [
                "stand up a real local webhook receiver on a test port (http://localhost:9999/alert)",
                "configure the backup system to POST alerts to this receiver",
                "run a healthy backup job (WAL archive + base backup)",
                "verify ZERO alert posts received (silence proof)",
                "induce failure (a): kill the backup job mid-archive / let WAL fall behind",
                "wait up to 15 minutes",
                "verify an alert POST received naming the failed job + reason",
                "induce failure (b): expire the test-scoped R2 credential",
                "wait up to 15 minutes",
                "verify an alert POST received naming credential expiry",
                "induce failure (c): remove the backup config entirely",
                "wait for the overdue window",
                "verify an alert POST received naming overdue/missing config"
              ]
            },
            "end_state": {
              "must_observe": [
                "webhook receiver responds HTTP 200 at \"http://localhost:9999/alert\"",
                "healthy backup run: alert posts received: (0) in the 15 min window",
                "failure (a): webhook POST count (1)+ within 15 min with reason containing \"killed\" or \"WAL behind\"",
                "failure (b): webhook POST count (1)+ within 15 min with reason containing \"credential\" or \"expired\"",
                "failure (c): webhook POST count (1)+ within overdue window with reason containing \"overdue\" or \"config missing\"",
                "alert payload fields present: \"job_id\", \"failure_reason\", \"timestamp\"",
                "test file path: \"services/platform/tests/integration/sprint27-backup-alerting-red.test.ts\""
              ],
              "must_not_observe": [
                "healthy run alert posts received: (0) violated (any POST during health)",
                "alert posts received: (0) after induced failure modes a/b/c (silent failure)",
                "mocked webhook receiver (must be real http.Server, not a stub)",
                "alert path hardcoded to exit 0 with no real POST",
                "empty alert payload / Status=None"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "RED test file exists and is PLATFORM_IT=1 guarded",
      "maps_to_ac": "AC-1",
      "verify": "test -f services/platform/tests/integration/sprint27-backup-alerting-red.test.ts; grep -Ec 'PLATFORM_IT' the file returns 1 or more"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "RED test currently FAILS (no implementation)",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts exits non-zero (RED)"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Test uses a real webhook receiver, never mocks",
      "maps_to_ac": "AC-1",
      "verify": "grep -Ec 'http.Server|createServer' the file returns 1 or more; grep -Ec 'mock.*webhook|stub.*receiver' returns 0"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Test covers the three PRD failure modes",
      "maps_to_ac": "AC-1",
      "verify": "grep for WAL|kill, credential|expir, config|overdue each present"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Test asserts silence during a healthy run (anti-fake-healthy)",
      "maps_to_ac": "AC-1",
      "verify": "grep -Ec 'zero|silence|must_not_observe' the file returns 1 or more"
    }
  ]
}
-->
</details>
