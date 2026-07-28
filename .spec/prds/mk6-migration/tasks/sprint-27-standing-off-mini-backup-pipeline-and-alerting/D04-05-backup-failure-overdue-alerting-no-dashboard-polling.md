# D04-05 — Backup failure/overdue alerting (webhook/push, no dashboard-polling)

## What this does

Implement the backup failure/overdue alerting that satisfies the sprint gate. It queries `backup_heartbeat` for jobs that are overdue (`now() - last_success_at > 15 min`) or explicitly `status='failed'`, and POSTs an alert to `ALERT_WEBHOOK_URL` (and/or a push channel) — **no dashboard polling**. The overdue path is what catches the three PRD silent-failure modes: a killed job, an expired/rotated bucket credential, or a removed backup config all stop updating the heartbeat → it goes overdue → an alert fires. It also adds `holo backup:status` (human-readable) and `holo verify:backup` (CI gate, exit 1 if any heartbeat is overdue/failed).

Provides: an alerting query + dispatcher (`services/platform/src/backup/alerting.ts`); webhook/push delivery; the `holo backup:status` + `holo verify:backup` CLI; a scheduled alert sweep (launchd) so the window is bounded without a human watching.

> **Platform seam (folded from mastra-implementer).** Detection query: `SELECT * FROM backup_heartbeat WHERE (now() - last_success_at) > INTERVAL '15 minutes' OR status = 'failed'`. Alert payload: `{job_name, reason: 'overdue'|'failed', last_success_at, overdue_by_minutes, last_wal_segment|last_snapshot_id, trace_id}` POSTed to `ALERT_WEBHOOK_URL`. Window: ≤15 min (WAL expected ~5 min cadence; base daily; restic ~6 h — overdue computed from each job's `last_success_at`). Rhyme with the `probeEmbed`/`probePostgresProcess` honest-health pattern in `stack/probes.ts` — real DB query, never fake-healthy from a stale cache.

## Why

- The gate is one un-fakeable outcome: induced failure → alert within 15 min, zero dashboard polling.
- Alerting that fires only on explicit job-exit (not on overdue absence) would miss credential-expiry and config-removed — exactly the silent-healthy hole D04-01's RED test guards.
- A healthy run MUST stay silent (the anti-fake-healthy negative control): an always-alerting path is as broken as a never-alerting one.
- Grounded in: UC-PLAT-06, T-PLAT-024, CAP-BAK-01.

## How to verify

- induce each silent-failure mode and within 15 min observe a webhook POST whose payload names the job + reason + last_success_at + overdue_by_minutes
- a healthy run (heartbeats fresh, status=success) produces ZERO webhook POSTs in the window
- `holo verify:backup` exits 1 when any heartbeat is overdue/failed; exits 0 when all are fresh/healthy
- `holo backup:status` prints each job's last_success_at + status + overdue/OK

## Scope

Writes: `services/platform/src/backup/alerting.ts` (NEW — overdue/failed query + webhook/push dispatch), `services/platform/src/cli/holo.ts` (MODIFY — `holo backup:status`, `holo verify:backup`), a launchd schedule for the alert sweep, `ALERT_WEBHOOK_URL` in the secrets store

Prohibited: dashboard-polling design; suppressing/swallowing alerts; `holo verify:backup` exiting 0 on an overdue/failed heartbeat; alerting only on explicit job-exit (must also alert on overdue absence)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D04-05 — Backup failure/overdue alerting (webhook/push, no dashboard-polling)
================================================================================

TASK_TYPE:  INFRA
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Alerting that detects overdue (`now() - last_success_at > 15 min`) or failed (`status='failed'`) backup jobs and POSTs a webhook/push within 15 minutes — catching the three PRD silent-failure modes (killed job, expired/rotated credential, removed config) because each stops updating the heartbeat. A healthy run stays silent. `holo verify:backup` exits 1 on any overdue/failed heartbeat (CI gate). Proven against a real webhook sink + real Postgres.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST detect overdue jobs via `now() - last_success_at > INTERVAL '15 minutes'` AND failed jobs via `status='failed'`
- MUST POST to ALERT_WEBHOOK_URL within 15 minutes of an overdue/failed event with payload {job_name, reason, last_success_at, overdue_by_minutes, last_wal_segment|last_snapshot_id, trace_id}
- MUST alert on the three silent-failure modes: expired/rotated credential, removed backup config, no-op archive_command (each stops the heartbeat → overdue → alert)
- MUST add `holo backup:status` (human-readable) and `holo verify:backup` (exit 1 if any heartbeat overdue/failed, exit 0 if all fresh)
- MUST run a scheduled (launchd) alert sweep so the window is bounded without a human
- MUST keep a healthy run silent (ZERO alert posts when all heartbeats are fresh + status=success)
- NEVER require dashboard polling
- NEVER alert only on explicit job-exit (must also alert on overdue absence)
- NEVER suppress/swallow an alert
- NEVER let `holo verify:backup` exit 0 on an overdue/failed heartbeat
- STRICTLY the alert sweep runs a real DB query against `backup_heartbeat` (not a stale cache)
- STRICTLY the webhook POST is verified received at a real sink, not just logged
- STRICTLY alert payload fields are redacted (no secrets — D04-06 audits)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): overdue/failed job → webhook POST within 15 min, payload correct
- [x] AC-2: the three silent-failure modes each alert (never silent-healthy)
- [x] AC-3: `holo verify:backup` exits 1 on overdue/failed, 0 on healthy; `holo backup:status` prints per-job state
- [x] AC-4: a healthy run stays silent (ZERO posts) — anti-fake-healthy
- [x] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by a real webhook sink + real Postgres)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] overdue/failed job → webhook within 15 min (flow_ref T-PLAT-024)
  GIVEN backup_heartbeat has a job row whose last_success_at is >15 min old OR status='failed'
  WHEN  the alert sweep runs
  THEN  a POST is delivered to the real webhook sink within 15 min of the overdue/failed event; the payload contains job_name, reason ('overdue'|'failed'), last_success_at, overdue_by_minutes (>= the elapsed gap), last_wal_segment|last_snapshot_id, trace_id
  TEST_TIER: integration · VERIFICATION_SERVICE: backup-alerting · TDD_STATE: red
  SCENARIO — start_ref: heartbeat_table_populated · evidence: alert_artifact
    NEGATIVE_CONTROL: would fail if the query omits status='failed'; the alert never POSTs (swallowed/logged-only); the sweep reads a stale cache; the webhook is mocked instead of a real sink
    MUST_OBSERVE: a real webhook POST received within 15 min; payload reason matches (overdue or failed); overdue_by_minutes >= the induced gap; payload includes job_name + last_success_at + trace_id
    MUST_NOT_OBSERVE: no POST after the window; POST missing required fields; reason mislabeled; a mocked/logged-only "alert" with no real delivery

AC-2 the three silent-failure modes each alert (flow_ref T-PLAT-024)
  GIVEN a healthy backup pipeline
  WHEN  one of (a) the R2 credential is expired/rotated to invalid, (b) the backup config is removed entirely, (c) archive_command is set to a no-op
  THEN  the affected job stops updating its heartbeat; within 15 min an overdue/failed alert fires for that job — never a silent-healthy state
  TEST_TIER: integration · VERIFICATION_SERVICE: backup-alerting · TDD_STATE: red
  SCENARIO — start_ref: healthy_pipeline · evidence: alert_artifact
    NEGATIVE_CONTROL: would fail if alerting only fires on explicit job-exit (misses credential-expiry / config-removed); the job reports healthy from a stale heartbeat; the alert is suppressed; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: each induced mode produces >=1 webhook POST within 15 min; the POST reason is overdue (heartbeat stale) or failed (status='failed'); the POST names the affected job
    MUST_NOT_OBSERVE: any induced mode going silent-healthy (no alert); a stale heartbeat reported as healthy; an alert suppressed for any mode

AC-3 `holo verify:backup` exits 1 on overdue/failed, 0 on healthy (flow_ref T-PLAT-024)
  GIVEN heartbeats exist
  WHEN  the operator runs `holo verify:backup`
  THEN  it exits 1 if any heartbeat is overdue/failed (CI gate); exits 0 if all are fresh + status=success; `holo backup:status` prints each job's last_success_at + status + OVERDUE/OK
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-CLI · TDD_STATE: red
  SCENARIO — start_ref: mixed_heartbeats · evidence: stdout
    NEGATIVE_CONTROL: would fail if verify:backup exits 0 on an overdue/failed heartbeat (fake-healthy CI gate); status reads a stale cache file; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: verify:backup exit 1 when any heartbeat overdue/failed; exit 0 when all fresh; backup:status prints last_success_at + status + OVERDUE|OK per job
    MUST_NOT_OBSERVE: verify:backup exit 0 on an overdue/failed heartbeat; status from a stale cache; a missing job silently omitted

AC-4 healthy run stays silent (anti-fake-healthy) (flow_ref T-PLAT-024)
  GIVEN all heartbeats are fresh + status=success
  WHEN  the alert sweep runs over the window
  THEN  ZERO webhook posts are delivered (silence proof)
  TEST_TIER: integration · VERIFICATION_SERVICE: backup-alerting · TDD_STATE: red
  SCENARIO — start_ref: all_heartbeats_fresh · evidence: alert_artifact
    NEGATIVE_CONTROL: would fail if a healthy run emits alerts (false positives); the sweep always-POSTs regardless of state; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: zero webhook posts during the window for fresh/healthy heartbeats
    MUST_NOT_OBSERVE: any webhook post during a healthy run; an always-alert path

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — holon backup:status | verify:backup)
- a launchd alert-sweep schedule + ALERT_WEBHOOK_URL in the secrets store
writeProhibited: dashboard-polling design; suppressed/swallowed alerts; verify:backup exit 0 on overdue/failed; alerting only on explicit job-exit

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 [T-PLAT-024 backup failure/overdue alert within the window, no human polling]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 failure modes: WAL behind, credential expiry/rotation → alert, not silent]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:79-88 [UC-PLAT-06 AC-4: alerted within a window without dashboard polling]
4. /Users/inference1/Projects/holocron/services/platform/src/stack/probes.ts:88-162 [honest-health probe pattern — real DB query, never fake-healthy]
5. /Users/inference1/Projects/holocron/services/platform/tests/integration/sprint27-backup-alerting-red.test.ts [the D04-01 RED test this task must satisfy]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Overdue/failed → webhook: induce an overdue heartbeat (stop a job / set last_success_at old) → within 15 min a real webhook POST arrives with {job_name, reason, last_success_at, overdue_by_minutes, trace_id}
- Three silent-failure modes: (a) expire R2 cred, (b) remove config, (c) archive_command=/bin/true → each yields >=1 POST within 15 min, never silent-healthy
- `holo verify:backup` exits 1 with an overdue/failed heartbeat; exits 0 when all fresh; `holo backup:status` prints per-job state
- Silence proof: all heartbeats fresh → zero webhook posts over the window

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: overdue detection via `now() - last_success_at > 15 min` AND status='failed'; all three silent-failure modes alert (overdue path, not just exit); webhook POST verified at a real sink (not logged-only); healthy run silent; `holo verify:backup` honest exit codes; alert payload redacted (no secrets — D04-06).
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-01 (the RED test it satisfies), D04-03, D04-04 · Blocks: D04-06

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D04-05",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "heartbeat_table_populated": {
      "description": "backup_heartbeat has rows for wal_archive, base_backup, restic_blob_mirror (from D04-03/D04-04)",
      "seed_method": "public_api",
      "records": [
        "SELECT count(*) FROM backup_heartbeat >= 1",
        "rows exist for each backup job"
      ]
    },
    "healthy_pipeline": {
      "description": "All backup jobs are running and updating heartbeats (fresh + status=success)",
      "seed_method": "public_api",
      "records": [
        "every heartbeat last_success_at fresh",
        "every status=success"
      ]
    },
    "mixed_heartbeats": {
      "description": "At least one heartbeat is overdue or failed (for verify:backup exit-1 proof) and at least one is fresh",
      "seed_method": "cli",
      "records": [
        "one backup_heartbeat row with last_success_at age > 15 min OR status: 'failed' (induced via cli)",
        "one backup_heartbeat row fresh + status: 'success'"
      ]
    },
    "all_heartbeats_fresh": {
      "description": "Every heartbeat is fresh + status=success (for the silence proof)",
      "seed_method": "public_api",
      "records": [
        "no overdue rows",
        "no status=failed rows"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN a heartbeat row whose last_success_at > 15 min old OR status='failed' WHEN the alert sweep runs THEN a POST is delivered to the real webhook sink within 15 min with payload {job_name, reason, last_success_at, overdue_by_minutes, last_wal_segment|last_snapshot_id, trace_id}",
      "verify": "induce overdue/failed; within 15 min observe a real webhook POST with the required payload fields",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "query omits status='failed'",
            "alert never POSTs (swallowed/logged-only)",
            "sweep reads a stale cache",
            "webhook is mocked instead of a real sink"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "heartbeat_table_populated",
            "action": {
              "actor": "system",
              "steps": [
                "set a heartbeat last_success_at > 15 min old (or status=failed)",
                "run the alert sweep",
                "observe the webhook sink"
              ]
            },
            "end_state": {
              "must_observe": [
                "webhook POST count >= 1 within 15 min of induced overdue/failed heartbeat",
                "payload.reason: \"overdue\" or \"failed\"",
                "payload.overdue_by_minutes >= 15",
                "payload includes \"job_name\", \"last_success_at\", \"trace_id\""
              ],
              "must_not_observe": [
                "webhook POST count: (0) after the 15 min window",
                "payload missing required fields (job_name/last_success_at/trace_id empty)",
                "reason: empty / Status=None",
                "mocked/logged-only alert with no real HTTP delivery"
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
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN a healthy pipeline WHEN one of (expired credential / removed config / no-op archive_command) is induced THEN the affected job stops updating its heartbeat and within 15 min an overdue/failed alert fires — never silent-healthy",
      "verify": "induce each of the 3 modes; within 15 min each yields >=1 webhook POST naming the job + reason",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "alerting only fires on explicit job-exit (misses credential-expiry/config-removed)",
            "job reports healthy from a stale heartbeat",
            "alert suppressed",
            "a stub/static implementation that hardcodes a healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_pipeline",
            "action": {
              "actor": "operator",
              "steps": [
                "expire/rotate the R2 credential to invalid",
                "remove the backup config entirely",
                "set archive_command to a no-op",
                "wait up to 15 min for each",
                "observe the webhook sink"
              ]
            },
            "end_state": {
              "must_observe": [
                "each induced failure mode produces webhook POST count >= 1 within 15 min",
                "POST reason: \"overdue\" or \"failed\"",
                "POST names affected job_name (non-empty, len >= 1)"
              ],
              "must_not_observe": [
                "any induced mode webhook POST count: (0) (silent-healthy)",
                "stale heartbeat reported as healthy",
                "alert suppressed for any mode",
                "empty job_name / Status=None"
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
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN heartbeats exist WHEN the operator runs holon verify:backup THEN it exits 1 if any heartbeat is overdue/failed and 0 if all are fresh; holon backup:status prints each job's last_success_at + status + OVERDUE|OK",
      "verify": "verify:backup exit 1 with an overdue/failed heartbeat; exit 0 when all fresh; backup:status prints per-job state",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-CLI",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "verify:backup exits 0 on an overdue/failed heartbeat",
            "status reads a stale cache file",
            "a missing job silently omitted",
            "a stub/static implementation that hardcodes a healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mixed_heartbeats",
            "action": {
              "actor": "operator",
              "steps": [
                "run holon verify:backup (expect exit 1 with an overdue row)",
                "make all heartbeats fresh",
                "run holon verify:backup (expect exit 0)",
                "run holon backup:status"
              ]
            },
            "end_state": {
              "must_observe": [
                "holo verify:backup exit 1 when any heartbeat overdue/failed",
                "holo verify:backup exit 0 when all heartbeats fresh",
                "backup:status prints last_success_at + status + \"OVERDUE\" or \"OK\" per job"
              ],
              "must_not_observe": [
                "verify:backup exit 0 on an overdue/failed heartbeat",
                "status from empty cache / Status=None",
                "missing job silently omitted (job count: (0))"
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
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN all heartbeats fresh + status=success WHEN the alert sweep runs over the window THEN ZERO webhook posts are delivered (silence proof)",
      "verify": "all heartbeats fresh -> zero webhook posts over the window",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "a healthy run emits alerts (false positives)",
            "the sweep always-POSTs regardless of state",
            "a stub/static implementation that hardcodes a healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "all_heartbeats_fresh",
            "action": {
              "actor": "system",
              "steps": [
                "ensure all heartbeats fresh + success",
                "run the alert sweep over the window",
                "observe the webhook sink"
              ]
            },
            "end_state": {
              "must_observe": [
                "webhook POST count: (0) during the healthy window for fresh heartbeats",
                "every heartbeat status: \"success\" and age_seconds < 900"
              ],
              "must_not_observe": [
                "webhook POST count >= 1 during healthy run (false positive)",
                "always-alert path that fires with no failure",
                "empty heartbeat table"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Overdue/failed job triggers a webhook within 15 min",
      "maps_to_ac": "AC-1",
      "verify": "induce overdue/failed; observe a real webhook POST within 15 min with the required payload"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The three silent-failure modes each alert (never silent-healthy)",
      "maps_to_ac": "AC-2",
      "verify": "expired cred / removed config / no-op archive_command each yield >=1 POST within 15 min"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "holo verify:backup exits 1 on overdue/failed, 0 on healthy; backup:status prints state",
      "maps_to_ac": "AC-3",
      "verify": "verify:backup exit code reflects heartbeat health; backup:status prints per-job state"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A healthy run stays silent (zero posts)",
      "maps_to_ac": "AC-4",
      "verify": "all heartbeats fresh -> zero webhook posts over the window"
    }
  ]
}
-->
</details>
