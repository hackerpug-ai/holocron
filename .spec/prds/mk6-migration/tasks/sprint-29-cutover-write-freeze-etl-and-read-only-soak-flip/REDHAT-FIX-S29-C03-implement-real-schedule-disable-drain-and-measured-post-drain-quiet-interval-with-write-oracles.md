# REDHAT-FIX-S29-C03 — Implement real schedule disable/drain and measured post-drain quiet interval with write oracles (C-03; convex-fence-client.ts:307-401)

## What this does

Close red-hat C-03 CRITICAL: replace the fake quiet interval (retrospective closed window + two live probes, no drain, no wait) with real schedule disable/drain of Convex crons, queues, outbox, and scheduled jobs, then measure a full post-drain quiet window where acceptedWriteCount==0 AND rejectedWriteCount>0 from the post-drain interval. D06-03 AC-3 and D06-04 freeze→quiet precondition depend on this.

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-C03). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-009, UC-SYNC-04, CAP-CUT-01. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts → exit 0`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-convex-fence.test.ts → exit 0`
- `bun services/platform/src/cli/holo.ts cutover:quiet-check --window-seconds 30 --json | jq -e '.ok==true and .drain.ok==true and .acceptedWriteCount==0 and .rejectedWriteCount>0 and`
- `pnpm tsgo --noEmit → exit 0`
- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/convex-fence-client.ts services/platform/src/cutover/export-watermark.ts → exit 0`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/convex-fence-client.ts (MODIFY) — runQuietCheck drain + measured post-drain window + report fields, services/platform/src/cutover/export-watermark.ts (MODIFY) — strengthen assertQuietCheckConfirmed for drain+elapsed, services/platform/src/cutover/etl-orchestrate.ts (MODIFY) — only if quiet precondition types change, services/platform/src/cli/holo.ts (MODIFY) — quiet-check flags/output if needed, convex/lib/migrationFence.ts (MODIFY) — only if drain helpers require fence-adjacent hooks, convex/migrationFence/** or convex/lib/cutoverDrain.ts (NEW) — schedule disable/drain mutations/actions if required, convex/crons.ts / convex/taskCrons.ts (MODIFY) — only if drain requires coordinated disable hooks; prefer non-destructive disable flag, services/platform/tests/integration/sprint29-quiet-drain.test.ts (NEW), services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY), .tmp/D06-03/** and .tmp/REDHAT-FIX-S29-C03/** (evidence)

Prohibited: Deleting convex/ modules or decommissioning Convex cloud (Sprint 31), Inventing a second write-enforcement mechanism replacing HOLO_MIGRATION_READ_ONLY, Self-seeding migrationFenceAudit solely to manufacture rejectedWriteCount, Weakening D06-04 to accept theatre quiet reports, Mocks of Convex env, cron execution, or quiet wall-clock without real report field assertions, Any file not listed in write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-C03 — Implement real schedule disable/drain and measured post-drain quiet interval with write oracles (C-03; convex-fence-client.ts:307-401)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: convex-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01, CAP-MIG-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-convex-fence.test.ts services/platform/tests/integration/sprint29-quiet-drain.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/convex-fence-client.ts services/platform/tests/integration/sprint29-quiet-drain.test.ts

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
holo cutover:quiet-check (after freeze) disables/drains scheduled work, records drainCompletedAtMs, sleeps/observes the full windowSeconds AFTER drain, then reports acceptedWriteCount==0, rejectedWriteCount>0, oracle rooted in the post-drain interval (not pre-window live_probes alone), and emits machine-readable drain+quiet evidence that D06-04 assertQuietCheckConfirmed can require.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST implement actual schedule disable/drain for Convex crons, queues, outbox work, and scheduled jobs before the quiet observation window starts
- MUST observe the full windowSeconds AFTER drain completes (real elapsed wall-clock ≥ windowSeconds between drainCompletedAtMs and quietUntilMs)
- MUST verify acceptedWriteCount==0 AND rejectedWriteCount>0 from the post-drain interval (not a pre-window retrospective audit alone)
- MUST fail quiet-check if drain is skipped, incomplete, or if wall-clock wait is skipped
- MUST preserve HOLO_MIGRATION_READ_ONLY env-var as the sole write-enforcement mechanism; drain is complementary sequencing, not a second fence
- MUST emit drain evidence (surfaces drained, drainCompletedAtMs, quietSinceMs, quietUntilMs, elapsedMs) in quiet-check --json and the quiet-check-report.json artifact
- MUST keep positive rejected-write oracle honesty: never invent rejectedWriteCount via self-seeded audit rows solely to pass
- NEVER treat 'crons stopped running' silence alone as proof of drain without a positive rejected-write audit/probe trail
- NEVER define sinceMs/untilMs as a closed retrospective window then query immediately without waiting (pre-fix C-03 theatre)
- NEVER pass quiet-check with only two direct live probes and oracle:"live_probes" while auditRejectedWriteCount==0 when scheduled surfaces remain undrained
- NEVER delete Convex modules, dependencies, or the Convex cloud deployment (Sprint 31)
- NEVER weaken D06-04 freeze→quiet precondition to accept pre-fix quiet reports
- STRICTLY order: freeze armed → disable schedules → drain in-flight → start quiet window clock → wait windowSeconds → query post-drain audit + write oracles
- STRICTLY D06-03 AC-3 and D06-04 freeze→quiet precondition remain load-bearing consumers of this oracle
- STRICTLY flow_ref T-SYNC-009 / UC-SYNC-03 AC-2; finding id C-03 preserved with evidence lineage to step3.log:8-25 and convex-fence-client.ts:307-401

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN convex deployment frozen with schedules still enabled WHEN operator runs cutover:...
- [ ] AC-2: GIVEN drain has completed WHEN quiet-check observes the declared window THEN wall-clock...
- [ ] AC-3: GIVEN post-drain quiet window completed WHEN quiet-check finalizes THEN acceptedWriteCo...
- [ ] AC-4: GIVEN a quiet-check report that skipped drain or skipped wait WHEN D06-04 freeze→quiet ...
- [ ] AC-5: GIVEN integration RED tests for C-03 WHEN drain-skip and wait-skip mutants are applied ...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 — AC-1 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN convex deployment frozen with schedules still enabled WHEN operator runs cutover:quiet-check THEN schedules (crons/queues/outbox/scheduled jobs) are disabled and drained before the quiet window, drainCompletedAtMs is recorded, and quiet-check fails closed if drain is skipped.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'drain-before-quiet'; bun services/platform/src/cli/holo.ts cutover:quiet-check --window-seconds 30 --json | jq -e '.drain.ok==true and .drainCompletedAtMs>0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if drain is skipped and quiet-check still returns ok:true (pre-fix C-03 path); drainCompletedAtMs is absent or 0 while ok:true; only documents.create and subscriptions.add probes run with no schedule disable/drain step; cron/queue/outbox surfaces remain armed and a scheduled write can still land post-check
  START_REF: frozen_schedules_still_enabled
  MUST_OBSERVE: drain.ok equals true; drainCompletedAtMs is a real epoch-ms integer greater than 0; drain.surfaces lists crons and at least one of queues|outbox|scheduled_jobs; quietSinceMs is greater than or equal to drainCompletedAtMs
  MUST_NOT_OBSERVE: ok:true with drain.ok false or drain skipped; drainCompletedAtMs equal to 0 or missing while ok:true; oracle:"live_probes" with no drain evidence (pre-fix step3.log shape alone)
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — AC-2 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN drain has completed WHEN quiet-check observes the declared window THEN wall-clock elapsed between drainCompletedAtMs and quietUntilMs is >= windowSeconds (default 30); quiet-check fails if wait is skipped.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `jq -e '(.quietUntilMs - .drainCompletedAtMs) >= (.windowSeconds * 1000)' .tmp/D06-03/quiet-check-report.json; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'measured-post-drain-window'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if wait/sleep is skipped and sinceMs/untilMs are set retrospectively around Date.now() with near-zero elapsed (pre-fix :307-310); windowSeconds is reported as 30 but (untilMs-drainCompletedAtMs) < 30000; quiet-check queries the audit window immediately without observing the interval after drain
  START_REF: frozen_after_drain
  MUST_OBSERVE: windowSeconds equals 30 (or the operator-supplied value); (quietUntilMs - drainCompletedAtMs) >= windowSeconds * 1000; elapsedMs field equals quietUntilMs - quietSinceMs and is >= windowSeconds*1000
  MUST_NOT_OBSERVE: elapsed wall-clock under windowSeconds while ok:true; sinceMs/untilMs defined as a closed past window queried with no post-drain wait
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — AC-3 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN post-drain quiet window completed WHEN quiet-check finalizes THEN acceptedWriteCount==0 AND rejectedWriteCount>0 from the post-drain interval (audit and/or scheduled-surface rejections), not solely two ad-hoc live probes against an empty pre-window audit.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `jq -e '.acceptedWriteCount==0 and .rejectedWriteCount>0 and .quietSinceMs>=.drainCompletedAtMs' .tmp/D06-03/quiet-check-report.json; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'post-drain-write-oracles'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if acceptedWriteCount==0 and rejectedWriteCount==0 (empty/degenerate idle window); acceptedWriteCount>0 (a write landed during/after the quiet window); oracle is live_probes with auditRejectedWriteCount==0 because the audit window was never observed post-drain (committed step3.log:8-25 shape); rejectedWriteCount is self-seeded by writing synthetic audit rows without real fenced rejections
  START_REF: frozen_after_drain_with_write_attempts
  MUST_OBSERVE: acceptedWriteCount equals the literal 0; rejectedWriteCount is greater than 0; audit window bounds (sinceMs/untilMs) are within the post-drain interval; ok equals true only when both accepted==0 and rejected>0
  MUST_NOT_OBSERVE: acceptedWriteCount greater than 0; rejectedWriteCount equals 0; auditRejectedWriteCount==0 with oracle:"live_probes" as the sole passing shape when schedules were never drained
  EVIDENCE: db_query (required_capture=True)

### AC-4 — AC-4 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN a quiet-check report that skipped drain or skipped wait WHEN D06-04 freeze→quiet precondition / assertQuietCheckConfirmed evaluates it THEN ETL orchestration refuses (quiet not confirmed) rather than accepting pre-fix theatre reports.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'd06-04-quiet-precondition'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if assertQuietCheckConfirmed accepts a report with only oracle:live_probes, auditRejectedWriteCount:0, and no drain fields; D06-04 run-etl proceeds when quiet report lacks drainCompletedAtMs or measured elapsed; precondition only checks acceptedWriteCount==0 without drain/wait proof
  START_REF: pre_fix_quiet_report_theatre
  MUST_OBSERVE: assertQuietCheckConfirmed returns a quiet-required error (or run-etl exits non-zero); error identifies missing drain and/or unmeasured quiet window; no convex export subprocess is started
  MUST_NOT_OBSERVE: unexplainedVariance computed against an export from a non-quiet fence; ok:true from run-etl with theatre quiet report
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — AC-5 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN integration RED tests for C-03 WHEN drain-skip and wait-skip mutants are applied THEN tests fail (kill mutants); WHEN real drain+wait path runs THEN suite is GREEN.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if tests green against pre-fix runQuietCheck implementation at convex-fence-client.ts:307-401; tests do not exercise drain-skip or wait-skip failure modes; tests mock elapsed time without asserting real report fields
  START_REF: convex_dev_deployment_frozen
  MUST_OBSERVE: RED evidence log shows failure on drain-skip and/or wait-skip assertions; GREEN suite exit 0 with drain.ok and measured elapsed assertions
  MUST_NOT_OBSERVE: suite exit 0 against unfixed :307-401 implementation; empty test file with no behavioral assertions
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | quiet-check report includes drain.ok==true and drainCompletedAtMs>0 | AC-1 | `jq -e '.drain.ok==true and .drainCompletedAtMs>0' .tmp/D06-03/quiet-check-report.json` |
| TC-2 | post-drain elapsed wall-clock >= windowSeconds | AC-2 | `jq -e '(.quietUntilMs - .drainCompletedAtMs) >= (.windowSeconds * 1000)' .tmp/D06-03/qu...` |
| TC-3 | acceptedWriteCount==0 after post-drain window | AC-3 | `jq -e '.acceptedWriteCount==0' .tmp/D06-03/quiet-check-report.json` |
| TC-4 | rejectedWriteCount>0 after post-drain window | AC-3 | `jq -e '.rejectedWriteCount>0' .tmp/D06-03/quiet-check-report.json` |
| TC-5 | pre-fix theatre quiet report fails D06-04 quiet precondition | AC-4 | `vitest -t 'd06-04-quiet-precondition' exits 0 asserting refusal` |
| TC-6 | RED phase fails against convex-fence-client.ts:307-401 pre-fix path | AC-5 | `PLATFORM_IT=1 pnpm vitest run ...sprint29-quiet-drain.test.ts on unfixed SHA → exit != 0` |
| TC-7 | quietSinceMs is not a retrospective pre-drain window | AC-1 | `jq -e '.quietSinceMs >= .drainCompletedAtMs' .tmp/D06-03/quiet-check-report.json` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/convex-fence-client.ts (MODIFY) — runQuietCheck drain + measured post-drain window + report fields
- services/platform/src/cutover/export-watermark.ts (MODIFY) — strengthen assertQuietCheckConfirmed for drain+elapsed
- services/platform/src/cutover/etl-orchestrate.ts (MODIFY) — only if quiet precondition types change
- services/platform/src/cli/holo.ts (MODIFY) — quiet-check flags/output if needed
- convex/lib/migrationFence.ts (MODIFY) — only if drain helpers require fence-adjacent hooks
- convex/migrationFence/** or convex/lib/cutoverDrain.ts (NEW) — schedule disable/drain mutations/actions if required
- convex/crons.ts / convex/taskCrons.ts (MODIFY) — only if drain requires coordinated disable hooks; prefer non-destructive disable flag
- services/platform/tests/integration/sprint29-quiet-drain.test.ts (NEW)
- services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY)
- .tmp/D06-03/** and .tmp/REDHAT-FIX-S29-C03/** (evidence)
writeProhibited:
- Deleting convex/ modules or decommissioning Convex cloud (Sprint 31)
- Inventing a second write-enforcement mechanism replacing HOLO_MIGRATION_READ_ONLY
- Self-seeding migrationFenceAudit solely to manufacture rejectedWriteCount
- Weakening D06-04 to accept theatre quiet reports
- Mocks of Convex env, cron execution, or quiet wall-clock without real report field assertions
- Any file not listed in write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md — §C-03 CRITICAL (lines 68-74) — quiet interval neither drains nor observes required interval; remediation: real drain + full post-drain window + accepted=0 rejected>0
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md — Acceptance matrix D06-03 AC-3 FAIL (line 37) — quiet interval neither drains nor waits
3. services/platform/src/cutover/convex-fence-client.ts:307-401 — runQuietCheck: windowSeconds default 30, sinceMs/untilMs closed retrospectively, immediate audit query, only documents.create + subscriptions.add probes, ok iff accepted==0 && rejected>0
4. services/platform/src/cutover/convex-fence-client.ts:309-310 — untilMs=Date.now(); sinceMs=untilMs-windowSeconds*1000 with no sleep
5. services/platform/src/cutover/convex-fence-client.ts:331-374 — live probes only (documents.mutations.create, subscriptions.mutations.add)
6. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step3.log:8-25 — committed proof oracle:"live_probes" auditRejectedWriteCount:0 rejectedWriteCount:2
7. convex/crons.ts — registered cron jobs that must be disabled/drained before export
8. convex/taskCrons.ts — task cron schedules in drain scope
9. services/platform/src/cutover/export-watermark.ts — assertQuietCheckConfirmed (D06-04 freeze→quiet precondition consumer)
10. services/platform/src/cutover/etl-orchestrate.ts:217-221 — quiet-check fail-closed before ETL
11. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md — AC-3 + NEVER treat cron silence as drain proof
12. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-04-capture-export-watermark-orchestrate-the-one-time-etl-run.md — freeze→quiet precondition
13. .spec/prds/mk6-migration/08-uc-sync.md:45-51 — UC-SYNC-03: disable and drain all scheduled work, observe declared quiet interval
14. services/platform/tests/integration/sprint29-convex-fence.test.ts — existing D06-03 fence tests to extend/complement

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts → exit 0
- PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-convex-fence.test.ts → exit 0
- bun services/platform/src/cli/holo.ts cutover:quiet-check --window-seconds 30 --json | jq -e '.ok==true and .drain.ok==true and .acceptedWriteCount==0 and .rejectedWriteCount>0 and (.quietUntilMs-.drainCompletedAtMs)>=(.windowSeconds*1000)' → exit 0
- pnpm tsgo --noEmit → exit 0
- pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/convex-fence-client.ts services/platform/src/cutover/export-watermark.ts → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: services/platform/src/cutover/convex-fence-client.ts:307-401, convex/crons.ts, services/platform/src/cutover/export-watermark.ts assertQuietCheckConfirmed, .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md §C-03
Interaction notes:
- —
pattern: Ordered cutover quiet protocol: (1) require fence armed, (2) disable schedules/crons/queues/outbox, (3) drain in-flight work to terminal rejected/idle, (4) stamp drainCompletedAtMs, (5) start quietSinceMs, (6) wait full windowSeconds, (7) stamp quietUntilMs, (8) query post-drain audit window + write oracles, (9) ok iff accepted==0 && rejected>0 && drain.ok && elapsed>=window.
pattern_source: ['services/platform/src/cutover/convex-fence-client.ts:307-401', 'convex/crons.ts', 'services/platform/src/cutover/export-watermark.ts assertQuietCheckConfirmed', '.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md §C-03']
anti_pattern: Retrospective closed audit window + two live probes with no drain and no wait (pre-fix C-03 at :307-401); treating cron silence as drain; live_probes oracle masking empty auditRejectedWriteCount.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — C-03 is CAP-CUT-01 cutover runtime infrastructure: durable schedule disable/drain against the live Convex deployment, measured quiet-window observation, and operator CLI oracles. D06-03 already assigned this surface to devops-engineer; the defect is operational sequencing in convex-fence-client runQuietCheck, not schema design.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: convex-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-01, D06-03, REDHAT-FIX-S29-C02
Blocks: D06-04 re-proof, REDHAT-FIX-S29-H03 gate rebuild consumption of quiet oracle

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Expanded by convex-planner for Sprint 29 red-hat remediation. Finding id C-03 CRITICAL preserved. Committed false proof: oracle:live_probes auditRejectedWriteCount:0 at .gate-evidence/20260802T004525Z/step3.log:8-25. Implementer must produce RED evidence against reviewed SHA 2b966c7b60559ec9986cf737ed5322a6146c7960 path before GREEN.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-C03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "frozen_schedules_still_enabled": {
      "description": "Real Convex dev deployment with HOLO_MIGRATION_READ_ONLY='1' (freeze armed) but crons/queues/outbox/scheduled jobs still enabled \u2014 pre-drain state that C-03 must remediate.",
      "seed_method": "cli",
      "records": [
        "holo cutover:freeze --reason 's29-c03 drill' exits 0",
        "npx convex env get HOLO_MIGRATION_READ_ONLY returns '1'",
        "convex/crons.ts and convex/taskCrons.ts schedules still registered/active until quiet-check drain runs",
        "pre-fix runQuietCheck at convex-fence-client.ts:307-401 does not disable them"
      ]
    },
    "frozen_after_drain": {
      "description": "Fence armed and schedule disable/drain has completed; quiet window measurement is about to start or is in progress.",
      "seed_method": "cli",
      "records": [
        "quiet-check drain step completed with drainCompletedAtMs>0",
        "HOLO_MIGRATION_READ_ONLY remains '1'",
        "windowSeconds configured (default 30)"
      ]
    },
    "frozen_after_drain_with_write_attempts": {
      "description": "Post-drain quiet interval during which at least one real fenced write attempt (scheduled and/or direct probe) is expected to produce migration_read_only rejections with zero accepts.",
      "seed_method": "cli",
      "records": [
        "drainCompletedAtMs recorded",
        "at least one write attempt after drain with migration_read_only: rejection",
        "migrationFenceAudit queryable for post-drain window counts"
      ]
    },
    "pre_fix_quiet_report_theatre": {
      "description": "Committed pre-fix quiet-check-report shape from gate evidence: oracle:live_probes, auditRejectedWriteCount:0, acceptedWriteCount:0, rejectedWriteCount:2 from two live probes only, no drain fields, no measured post-drain wait.",
      "seed_method": "file_artifact",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step3.log:8-25 oracle:\"live_probes\" auditRejectedWriteCount:0",
        "services/platform/src/cutover/convex-fence-client.ts:307-401 defines closed window then immediate audit query + two mutations",
        "No drainCompletedAtMs / no schedule disable step in report"
      ]
    },
    "convex_dev_deployment_frozen": {
      "description": "Fence engaged via holo cutover:freeze against real deployment; HOLO_MIGRATION_READ_ONLY='1'; fence_armed_at recorded.",
      "seed_method": "cli",
      "records": [
        "holo cutover:freeze exits 0",
        "npx convex env get HOLO_MIGRATION_READ_ONLY returns '1'"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-009",
      "description": "Real schedule disable/drain before quiet window; fail if drain skipped (C-03 / D06-03 AC-3)",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "jq -e '.drain.ok==true and .drainCompletedAtMs>0 and .quietSinceMs>=.drainCompletedAtMs' .tmp/D06-03/quiet-check-report.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "drain is skipped and quiet-check still ok:true",
            "only two live probes with no schedule disable (convex-fence-client.ts:331-374)",
            "drainCompletedAtMs absent while ok:true"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_schedules_still_enabled",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo cutover:quiet-check --window-seconds 30 --json",
                "inspect drain fields"
              ]
            },
            "end_state": {
              "must_observe": [
                "drain.ok equals true",
                "drainCompletedAtMs > 0",
                "quietSinceMs >= drainCompletedAtMs"
              ],
              "must_not_observe": [
                "ok:true without drain",
                "pre-fix live_probes-only report accepted"
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
      "flow_ref": "T-SYNC-009",
      "description": "Measured full windowSeconds AFTER drain; fail if wait skipped (C-03)",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "jq -e '(.quietUntilMs - .drainCompletedAtMs) >= (.windowSeconds * 1000)' .tmp/D06-03/quiet-check-report.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "wait is skipped (pre-fix :309-310 sets sinceMs/untilMs then queries immediately)",
            "elapsed < windowSeconds while ok:true"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_after_drain",
            "action": {
              "actor": "operator",
              "steps": [
                "run quiet-check",
                "measure quietUntilMs - drainCompletedAtMs"
              ]
            },
            "end_state": {
              "must_observe": [
                "elapsed >= windowSeconds*1000"
              ],
              "must_not_observe": [
                "immediate retrospective window with no wait"
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
      "flow_ref": "T-SYNC-009",
      "description": "Post-drain acceptedWriteCount==0 AND rejectedWriteCount>0 (C-03 / D06-03 AC-3)",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "jq -e '.acceptedWriteCount==0 and .rejectedWriteCount>0' .tmp/D06-03/quiet-check-report.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "rejectedWriteCount==0 (degenerate idle window)",
            "acceptedWriteCount>0",
            "oracle:live_probes with auditRejectedWriteCount:0 as sole pass (step3.log:8-25)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_after_drain_with_write_attempts",
            "action": {
              "actor": "operator",
              "steps": [
                "complete post-drain quiet window",
                "read write oracles"
              ]
            },
            "end_state": {
              "must_observe": [
                "acceptedWriteCount==0",
                "rejectedWriteCount>0"
              ],
              "must_not_observe": [
                "acceptedWriteCount>0",
                "rejectedWriteCount==0"
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
      "flow_ref": "T-SYNC-009",
      "description": "D06-04 freeze\u2192quiet precondition rejects pre-fix theatre quiet reports (C-03 consumer)",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "assertQuietCheckConfirmed rejects report without drain+measured window",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "theatre report with oracle:live_probes auditRejectedWriteCount:0 accepted",
            "ETL export starts despite undrained schedules"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_quiet_report_theatre",
            "action": {
              "actor": "operator",
              "steps": [
                "feed theatre quiet report to assertQuietCheckConfirmed / run-etl"
              ]
            },
            "end_state": {
              "must_observe": [
                "quiet not confirmed error",
                "export not started"
              ],
              "must_not_observe": [
                "run-etl ok:true"
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
      "flow_ref": "T-SYNC-009",
      "description": "RED fails on pre-fix :307-401; GREEN after drain+wait implementation",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-quiet-drain.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "tests green against unfixed runQuietCheck",
            "no drain-skip/wait-skip coverage"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "convex_dev_deployment_frozen",
            "action": {
              "actor": "test-runner",
              "steps": [
                "RED then GREEN suite"
              ]
            },
            "end_state": {
              "must_observe": [
                "RED non-zero on unfixed SHA",
                "GREEN exit 0 after fix"
              ],
              "must_not_observe": [
                "instant green without code change"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "drain.ok and drainCompletedAtMs present",
      "maps_to_ac": "AC-1",
      "verify": "jq .drain.ok .drainCompletedAtMs quiet-check-report.json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "elapsed >= windowSeconds after drain",
      "maps_to_ac": "AC-2",
      "verify": "jq elapsed vs windowSeconds"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "acceptedWriteCount==0",
      "maps_to_ac": "AC-3",
      "verify": "jq .acceptedWriteCount"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "rejectedWriteCount>0",
      "maps_to_ac": "AC-3",
      "verify": "jq .rejectedWriteCount"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "theatre quiet rejected by D06-04 precondition",
      "maps_to_ac": "AC-4",
      "verify": "assertQuietCheckConfirmed error"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence against :307-401",
      "maps_to_ac": "AC-5",
      "verify": "vitest non-zero on unfixed"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "quietSinceMs >= drainCompletedAtMs",
      "maps_to_ac": "AC-1",
      "verify": "jq comparison"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "holo cutover:quiet-check with real drain + measured post-drain quiet window",
    "quiet-check-report.json drainCompletedAtMs/elapsed/write oracles for D06-04"
  ],
  "consumes": [
    "HOLO_MIGRATION_READ_ONLY durable env fence from D06-03",
    "migrationFenceAudit countAttemptsInWindow",
    "convex/crons.ts + convex/taskCrons.ts schedule inventory"
  ],
  "boundary_contracts": [
    "CAP-CUT-01 hop: durable freeze + drain precedes ETL (CAP-MIG-01)",
    "C-03 evidence lineage: step3.log:8-25 + convex-fence-client.ts:307-401 must be obsolete after fix"
  ],
  "proposed_by": "convex-planner"
}
-->

</details>
