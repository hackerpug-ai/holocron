# REDHAT-FIX-S29-R2-C02 — Drain every scheduled surface to zero with pagination and fail closed on residual/error counts (C-02; migrationFence/drain.ts:23-205)

## What this does

Close cycle-2 CRITICAL C-02: convex/migrationFence/drain.ts uses DRAIN_BATCH=100 with a single .take(DRAIN_BATCH) per status and subscription queue, records after* residual counts, but returns ok:true without requiring residual zero; runScheduleDrain then waits 750ms and computes success from flag/consumer/probe fields, not residual work. Workloads >100 or swallowed query/patch errors leave scheduled work that can write after declared drain, violating freeze→drain→quiet for D06-03/C03 and risking omitted final writes from D06-04 export. Implement paginated drain-to-zero, fail-closed residual/error handling, and residual-aware drain.ok.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01, CAP-MIG-01 (`REDHAT-FIX-S29-R2-C02`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts → exit 0`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts → exit 0`
- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-red.log`
- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-green.log`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: convex/migrationFence/drain.ts (MODIFY) — paginated drain-to-zero, fail-closed residual/error, ok:true only residual zero, convex/lib/migrationFence.ts (MODIFY) — only if residual surface helpers shared, services/platform/src/cutover/convex-fence-client.ts (MODIFY) — runScheduleDrain residual-aware ok; surface residual in DrainReport, services/platform/src/cutover/export-watermark.ts (MODIFY) — only if assertQuietCheckConfirmed must require residual zero fields, services/platform/src/cli/holo.ts (MODIFY) — only if quiet-check JSON residual fields need exposure, services/platform/tests/integration/sprint29-quiet-drain.test.ts (MODIFY) — residual-zero multi-batch + fail-closed RED/GREEN, services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY) — only if shared drain assertions, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/ (evidence logs and residual samples)

Prohibited: Deleting convex modules or decommissioning Convex cloud (Sprint 31), Inventing a second write-enforcement mechanism replacing HOLO_MIGRATION_READ_ONLY, Weakening D06-04 quiet precondition to accept residual>0, Mocks of residual counts without real multi-batch drain under PLATFORM_IT, Any file not listed in write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-C02 — Drain every scheduled surface to zero with pagination and fail closed on residual/error counts (C-02; migrationFence/drain.ts:23-205)
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
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
disableAndDrain paginates until residual zero for all active task statuses + subscription queue (+ named outbox/scheduled surfaces); any query/patch exception fails closed (ok:false, residual not faked to 0); ok:true only when all after* residual counts are 0; runScheduleDrain fails if residual >0; integration RED seeds >100 in-flight and fails on HEAD cab5c071 path; GREEN drains multi-batch to residual 0; evidence logs under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-*.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST paginate/loop drain until residual counts are zero for ALL active task statuses (pending, queued, loading, running) + subscriptionContent queued + any named outbox/scheduled surfaces in migrationFence drain inventory (CUTOVER_DRAIN_SURFACES)
- MUST fail closed on any query/patch exception during sample or drain — no empty catch that zeros residual counts (pre-fix drain.ts:47-48,133-135,150-152)
- MUST return ok:true from disableAndDrain ONLY when afterRunningTasks==0 AND afterActiveTasks==0 AND afterQueuedSubscriptionContent==0 (and any additional residual fields for outbox/scheduled surfaces)
- MUST make runScheduleDrain success depend on residual-after samples being zero — not only flag/consumer/probe fields (pre-fix convex-fence-client.ts:689-724)
- MUST keep multi-batch drain for workloads > DRAIN_BATCH (100); single .take(DRAIN_BATCH) per status is insufficient
- MUST emit residual fields (before/after per surface + batchesProcessed) in drain samples and quiet-check-report.json / drain evidence
- MUST produce RED evidence: seed >100 in-flight items; prove current HEAD (cab5c071 path) returns ok:true with residual >0; GREEN requires residual==0 after multi-batch drain
- MUST write evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-red.log and ...-green.log (plus residual samples json)
- NEVER return ok:true from disableAndDrain while any after* residual count > 0 (pre-fix :191-205)
- NEVER leave empty catch blocks that treat query/index/patch failures as zero residual (pre-fix :47-48,:133-135,:150-152)
- NEVER compute runScheduleDrain success solely from envOk/surfacesOk/convexDrainOk/consumersHonored/probe without residual zero (pre-fix :696-703)
- NEVER treat single-batch .take(100) as complete drain for >100 in-flight workloads
- NEVER delete Convex modules/cloud or invent a second write fence replacing HOLO_MIGRATION_READ_ONLY
- NEVER weaken D06-04 assertQuietCheckConfirmed to accept residual>0 drain reports
- NEVER mock Convex db residual counts without real multi-batch drain behavior under PLATFORM_IT
- STRICTLY finding id C-02 CRITICAL preserved with lineage to report + drain.ts:23-205 + convex-fence-client.ts:689-724 + SHA cab5c0717974a96e33c338105b5d198d82cb607d
- STRICTLY flow_ref T-SYNC-009 / UC-SYNC-03 drain-before-quiet; D06-03 AC-3 consumer of residual-zero drain
- STRICTLY tdd_mode red_first: RED proves HEAD single-batch ok-with-residual; GREEN proves residual==0 and multi-batch loop
- STRICTLY residual surfaces include tasks active statuses + subscriptionContent queue + named CUTOVER_DRAIN_SURFACES
- STRICTLY related REDHAT-FIX-S29-C03 drain+wait remains; this task closes residual-count completeness only

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN HOLO_CUTOVER_SCHEDULES_DISABLED honored and >100 active tasks across pend…
- [ ] AC-2: GIVEN >100 queued subscriptionContent rows (or other named queue/outbox/schedul…
- [ ] AC-3: GIVEN a query or patch exception during sampleInFlight or drain loops WHEN disa…
- [ ] AC-4: GIVEN disableAndDrain returns samples with after* residual >0 WHEN runScheduleD…
- [ ] AC-5: GIVEN integration RED tests for C-02 WHEN suite runs against unfixed HEAD drain…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN HOLO_CUTOVER_SCHEDULES_DISABLED honored and >100 active tasks a… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN HOLO_CUTOVER_SCHEDULES_DISABLED honored and >100 active tasks across pending|queued|loading|running (seeded residual > DRAIN_BATCH) WHEN disableAndDrain / quiet-check drain runs THEN drain paginates multi-batch until afterActiveTasks==0 and afterRunningTasks==0 (not a single .take(100) pass), and ok:true is returned only with residual zero (C-02 / D06-03 AC-3).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'residual-zero-paginated-drain'; jq -e '.ok==true and .samples.afterActiveTasks==0 and .samples.afterRunningTasks==0 and (.samples.batchesProcessed//.samples.drainBatches//1)>1' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-drain-samples.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: seeded_inflight_tasks_gt_100
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; ok equals true only with afterActiveTasks==0 and afterRunningTasks==0; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; batchesProcessed or equivalent multi-pass count >= 2 when seed > 100; drainCompletedAtMs > 0 only on residual-zero success
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — GIVEN >100 queued subscriptionContent rows (or other named queue/outb… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN >100 queued subscriptionContent rows (or other named queue/outbox/scheduled residual surface in migrationFence inventory) WHEN drain completes THEN afterQueuedSubscriptionContent==0 (and any outbox/scheduled residual fields ==0); ok:true only when all residual surfaces are zero.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'subscription-queue-residual-zero'; jq -e '.samples.afterQueuedSubscriptionContent==0' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-drain-samples.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: seeded_queued_subscription_content_gt_100
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; afterQueuedSubscriptionContent equals 0; AC-2 observed_status equals literal 'PASS' and observed_count >= 1; AC-2 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN a query or patch exception during sampleInFlight or drain loops… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN a query or patch exception during sampleInFlight or drain loops WHEN disableAndDrain runs THEN it fails closed (ok:false, explicit error, residual counts not coerced to zero via empty catch); runScheduleDrain must not report ok:true on swallowed exceptions.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'drain-fail-closed-on-query-patch-error'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: drain_query_or_patch_error_injected
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; AC-3 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN disableAndDrain returns samples with after* residual >0 WHEN ru… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN disableAndDrain returns samples with after* residual >0 WHEN runScheduleDrain / cutover:quiet-check evaluates drain THEN drain.ok==false and quiet-check fails closed before starting measured quiet window (success must not ignore residual as pre-fix convex-fence-client.ts:689-724).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'runScheduleDrain-requires-residual-zero'; jq -e '.drain.ok==false or (.drain.samples.afterActiveTasks//0)==0' .tmp/D06-03/quiet-check-report.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: incomplete_drain_residual_remaining
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; drain.ok equals false when residual >0; AC-4 observed_status equals literal 'PASS' and observed_count >= 1; AC-4 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — GIVEN integration RED tests for C-02 WHEN suite runs against unfixed … (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN integration RED tests for C-02 WHEN suite runs against unfixed HEAD drain (single-batch + ok without residual zero at drain.ts:23-205 / client :689-724) THEN tests fail with residual>0 evidence; WHEN multi-batch residual-zero + fail-closed path lands THEN suite GREEN and evidence logs exist.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-red.log; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'r2-c02|residual-zero|paginated-drain|fail-closed'; test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-green.log`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: convex_dev_deployment_frozen_schedules_disabled
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; RED log shows residual>0 and/or ok:true defect against HEAD path; GREEN suite exit 0 with residual==0 multi-batch proof; evidence files non-empty under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | afterActiveTasks==0 and afterRunningTasks==0 on successful drain | AC-1 | `jq -e '.samples.afterActiveTasks==0 and .samples.…` |
| TC-2 | multi-batch drain when seed >100 (batchesProcessed>=2 or equivalent) | AC-1 | `seed 101+ active tasks; assert multi-pass and res…` |
| TC-3 | afterQueuedSubscriptionContent==0 on successful drain | AC-2 | `jq -e '.samples.afterQueuedSubscriptionContent==0'` |
| TC-4 | query/patch exception → ok:false fail closed | AC-3 | `vitest -t drain-fail-closed-on-query-patch-error` |
| TC-5 | runScheduleDrain residual-aware: residual>0 ⇒ drain.ok false | AC-4 | `vitest -t runScheduleDrain-requires-residual-zero` |
| TC-6 | ok:true only when ALL after* residual counts are 0 | AC-1 | `assert disableAndDrain return shape residual gate` |
| TC-7 | RED evidence fails on unfixed drain.ts:23-205 / client:689-724; GREEN… | AC-5 | `test -s .../redhat-fix-s29-r2-c02-red.log && ...-…` |
| TC-8 | empty catch residual-zero theatre killed | AC-3 | `no silent catch that returns ok:true on sample/dr…` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- convex/migrationFence/drain.ts (MODIFY) — paginated drain-to-zero, fail-closed residual/error, ok:true only residual zero
- convex/lib/migrationFence.ts (MODIFY) — only if residual surface helpers shared
- services/platform/src/cutover/convex-fence-client.ts (MODIFY) — runScheduleDrain residual-aware ok; surface residual in DrainReport
- services/platform/src/cutover/export-watermark.ts (MODIFY) — only if assertQuietCheckConfirmed must require residual zero fields
- services/platform/src/cli/holo.ts (MODIFY) — only if quiet-check JSON residual fields need exposure
- services/platform/tests/integration/sprint29-quiet-drain.test.ts (MODIFY) — residual-zero multi-batch + fail-closed RED/GREEN
- services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY) — only if shared drain assertions
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/ (evidence logs and residual samples)
writeProhibited:
- Deleting convex modules or decommissioning Convex cloud (Sprint 31)
- Inventing a second write-enforcement mechanism replacing HOLO_MIGRATION_READ_ONLY
- Weakening D06-04 quiet precondition to accept residual>0
- Mocks of residual counts without real multi-batch drain under PLATFORM_IT
- Any file not listed in write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md — §C-02 CRITICAL (lines 51-57) — incomplete schedule drain can declare success with residual work; remediation: paginate to zero, fail closed on errors, require residual zero
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md — Acceptance matrix D06-03 FAIL / C03 FAIL (lines 30,35) — bounded drain is not complete; success ignores after* residual
3. convex/migrationFence/drain.ts:23-24 — DRAIN_BATCH = 100 fixed batch size
4. convex/migrationFence/drain.ts:32-61 — sampleInFlight single .take(DRAIN_BATCH) per status + empty catch zeroing risk
5. convex/migrationFence/drain.ts:113-150 — single-pass drain take(DRAIN_BATCH) tasks + subscription queue
6. convex/migrationFence/drain.ts:154-165 — records after* residual counts
7. convex/migrationFence/drain.ts:191-205 — returns ok:true without requiring after* residual zero
8. services/platform/src/cutover/convex-fence-client.ts:689-724 — runScheduleDrain settle 750ms; ok from flag/consumer/probe not residual
9. services/platform/src/cutover/convex-fence-client.ts:68-89 — DrainReport.samples after* residual fields already typed
10. convex/migrationFence/drain.ts:20-21 — CUTOVER_DRAIN_SURFACES = crons,queues,outbox,scheduled_jobs
11. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-C03-implement-real-schedule-disable-drain-and-measured-post-drain-quiet-interval-with-write-oracles.md — prior C03 drain+wait contract this residual tightens
12. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md — AC-3 drain+quiet
13. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-04-capture-export-watermark-orchestrate-the-one-time-etl-run.md — freeze→quiet precondition / export completeness
14. .spec/prds/mk6-migration/08-uc-sync.md — UC-SYNC-03 disable and drain all scheduled work
15. services/platform/tests/integration/sprint29-quiet-drain.test.ts — extend with residual-zero multi-batch RED/GREEN

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- G1: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts → exit 0` → Exit 0
- G2: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts → exit 0` → Exit 0
- G3: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-red.log` → Exit 0
- G4: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-green.log` → Exit 0
- G5: `jq -e '.ok==true and .samples.afterActiveTasks==0 and .samples.afterRunningTasks==0 and .samples.afterQueuedSubscriptionContent==0' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-drain-samples.json → exit 0 (GREEN path)` → Exit 0
- G6: `pnpm tsgo --noEmit → exit 0` → Exit 0
- G7: `pnpm biome check . → exit 0` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md, SPRINT.md
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: Complete cutover drain protocol: (1) require HOLO_CUTOVER_SCHEDULES_DISABLED honored, (2) sample residual across all active task statuses + subscription queue + named surfaces, (3) paginate cancel/skip in batches until residual==0 OR fail closed on exception, (4) re-sample after* and require all residual fields ==0 for ok:true, (5) runScheduleDrain ok only if mutation ok AND residual zero AND consumers/probe, (6) then start quiet window clock.
pattern_source: convex/migrationFence/drain.ts:23-205, services/platform/src/cutover/convex-fence-client.ts:689-724, .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md §C-02
anti_pattern: Single .take(100) per status; empty catch residual theatre; ok:true without residual zero; runScheduleDrain success from flag/consumer/probe only (pre-fix C-02 at cab5c071).

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — Cycle-2 residual of REDHAT-FIX-S29-C03: incomplete schedule drain in convex/migrationFence/drain.ts and success predicate in runScheduleDrain (convex-fence-client.ts). devops-engineer owns D06-03/C03 cutover drain/quiet runtime against the live Convex deployment; this fix is operational sequencing + fail-closed residual counts, not schema design. Reviewer: code-reviewer (+ convex-reviewer for drain mutation). Standing test-quality-reviewer may re-probe >100 residual mutant.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: convex-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-03, REDHAT-FIX-S29-C03
Blocks: D06-04 re-proof, quiet-check residual honesty for ETL

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Expanded by convex-planner for Sprint 29 cycle-2 red-hat remediation. Finding id C-02 CRITICAL preserved. Lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md §C-02 + convex/migrationFence/drain.ts:23-205 + services/platform/src/cutover/convex-fence-client.ts:689-724 + reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d. Residual of REDHAT-FIX-S29-C03 which added drain+wait but left single-batch ok-without-residual-zero. Implementer must produce RED evidence seeding >100 in-flight against HEAD incomplete drain before GREEN multi-batch residual-zero.']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-C02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_inflight_tasks_gt_100": {
      "description": "Real Convex dev deployment with HOLO_CUTOVER_SCHEDULES_DISABLED honored and >100 tasks in active statuses (pending/queued/loading/running) so single DRAIN_BATCH=100 take cannot clear residual.",
      "seed_method": "cli",
      "records": [
        "npx convex env get HOLO_CUTOVER_SCHEDULES_DISABLED returns '1'|true",
        ">=101 tasks with status in pending|queued|loading|running",
        "pre-fix disableAndDrain at drain.ts:113-150 takes at most 100 per status once"
      ]
    },
    "seeded_queued_subscription_content_gt_100": {
      "description": ">=101 subscriptionContent rows with researchStatus=queued to force multi-batch drain of the queue surface.",
      "seed_method": "cli",
      "records": [
        ">=101 subscriptionContent researchStatus=queued",
        "pre-fix :138-152 single take(100)"
      ]
    },
    "drain_query_or_patch_error_injected": {
      "description": "Harness/mutant that causes sample or patch path to throw so empty-catch zero residual cannot pass.",
      "seed_method": "cli",
      "records": [
        "query/index or patch throws during disableAndDrain",
        "expect ok:false not residual-zero theatre"
      ]
    },
    "incomplete_drain_residual_remaining": {
      "description": "State where after* residual counts remain >0 (HEAD single-batch path or deliberate incomplete drain) while flag/consumer/probe fields would still pass pre-fix runScheduleDrain predicate.",
      "seed_method": "cli",
      "records": [
        "afterActiveTasks>0 or afterQueuedSubscriptionContent>0",
        "consumersHonored true and probe skipped true still true",
        "pre-fix convex-fence-client.ts:696-703 would ok without residual gate"
      ]
    },
    "convex_dev_deployment_frozen_schedules_disabled": {
      "description": "Fence + schedule disable ready for residual-zero drain RED/GREEN.",
      "seed_method": "cli",
      "records": [
        "HOLO_MIGRATION_READ_ONLY='1'",
        "HOLO_CUTOVER_SCHEDULES_DISABLED visible to Convex consumers",
        "PLATFORM_IT=1 integration harness available"
      ]
    },
    "pre_fix_single_batch_ok_with_residual": {
      "description": "Documented pre-fix defect at reviewed SHA cab5c071: DRAIN_BATCH=100 once per status; ok:true without residual zero; runScheduleDrain ignores after*.",
      "seed_method": "recorded_external",
      "records": [
        "convex/migrationFence/drain.ts:23-24 DRAIN_BATCH=100",
        "convex/migrationFence/drain.ts:113-150 single take per status + queue",
        "convex/migrationFence/drain.ts:191-205 return ok:true without residual gate",
        "services/platform/src/cutover/convex-fence-client.ts:689-724 success without residual",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md \u00a7C-02"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN HOLO_CUTOVER_SCHEDULES_DISABLED honored and >100 active tasks across pending|queued|loading|running (seeded residual > DRAIN_BATCH) WHEN disableAndDrain / quiet-check drain runs THEN drain paginates multi-batch until afterActiveTasks==0 and afterRunningTasks==0 (not a single .take(100) pass), and ok:true is returned only with residual zero (C-02 / D06-03 AC-3).",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'residual-zero-paginated-drain'; jq -e '.ok==true and .samples.afterActiveTasks==0 and .samples.afterRunningTasks==0 and (.samples.batchesProcessed//.samples.drainBatches//1)>1' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-drain-samples.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_inflight_tasks_gt_100",
            "action": {
              "actor": "operator",
              "steps": [
                "ensure HOLO_CUTOVER_SCHEDULES_DISABLED visible in Convex runtime",
                "seed >100 tasks in active statuses (pending/queued/loading/running)",
                "invoke migrationFence.drain.disableAndDrain (or cutover:quiet-check drain path)",
                "inspect samples.afterActiveTasks/afterRunningTasks and ok"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "ok equals true only with afterActiveTasks==0 and afterRunningTasks==0",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "batchesProcessed or equivalent multi-pass count >= 2 when seed > 100",
                "drainCompletedAtMs > 0 only on residual-zero success"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
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
      "description": "GIVEN >100 queued subscriptionContent rows (or other named queue/outbox/scheduled residual surface in migrationFence inventory) WHEN drain completes THEN afterQueuedSubscriptionContent==0 (and any outbox/scheduled residual fields ==0); ok:true only when all residual surfaces are zero.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'subscription-queue-residual-zero'; jq -e '.samples.afterQueuedSubscriptionContent==0' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-drain-samples.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_queued_subscription_content_gt_100",
            "action": {
              "actor": "operator",
              "steps": [
                "seed >100 subscriptionContent with researchStatus=queued",
                "run disableAndDrain",
                "assert afterQueuedSubscriptionContent==0 and ok:true"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "afterQueuedSubscriptionContent equals 0",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
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
      "description": "GIVEN a query or patch exception during sampleInFlight or drain loops WHEN disableAndDrain runs THEN it fails closed (ok:false, explicit error, residual counts not coerced to zero via empty catch); runScheduleDrain must not report ok:true on swallowed exceptions.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'drain-fail-closed-on-query-patch-error'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "drain_query_or_patch_error_injected",
            "action": {
              "actor": "test-runner",
              "steps": [
                "inject/query-fail or patch-fail mutant on drain path (or harness equivalent)",
                "invoke disableAndDrain / runScheduleDrain",
                "assert ok:false and error present"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
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
      "description": "GIVEN disableAndDrain returns samples with after* residual >0 WHEN runScheduleDrain / cutover:quiet-check evaluates drain THEN drain.ok==false and quiet-check fails closed before starting measured quiet window (success must not ignore residual as pre-fix convex-fence-client.ts:689-724).",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'runScheduleDrain-requires-residual-zero'; jq -e '.drain.ok==false or (.drain.samples.afterActiveTasks//0)==0' .tmp/D06-03/quiet-check-report.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "incomplete_drain_residual_remaining",
            "action": {
              "actor": "operator",
              "steps": [
                "force residual after* >0 (HEAD single-batch path or mutant)",
                "run runScheduleDrain / quiet-check",
                "assert drain.ok false and quiet not confirmed"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "drain.ok equals false when residual >0",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
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
      "description": "GIVEN integration RED tests for C-02 WHEN suite runs against unfixed HEAD drain (single-batch + ok without residual zero at drain.ts:23-205 / client :689-724) THEN tests fail with residual>0 evidence; WHEN multi-batch residual-zero + fail-closed path lands THEN suite GREEN and evidence logs exist.",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-red.log; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-quiet-drain.test.ts -t 'r2-c02|residual-zero|paginated-drain|fail-closed'; test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c02-green.log",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "convex_dev_deployment_frozen_schedules_disabled",
            "action": {
              "actor": "test-runner",
              "steps": [
                "RED: seed >100; run residual-zero assertions against unfixed path \u2192 expect fail",
                "capture redhat-fix-s29-r2-c02-red.log",
                "GREEN: fixed multi-batch path \u2192 residual 0 exit 0",
                "capture redhat-fix-s29-r2-c02-green.log"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-5 report field ok equals true OR exit_code equals 1",
                "AC-5 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "RED log shows residual>0 and/or ok:true defect against HEAD path",
                "GREEN suite exit 0 with residual==0 multi-batch proof",
                "evidence files non-empty under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "afterActiveTasks==0 and afterRunningTasks==0 on successful drain",
      "maps_to_ac": "AC-1",
      "verify": "jq -e '.samples.afterActiveTasks==0 and .samples.afterRunningTasks==0' drain samples / quiet-check drain"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "multi-batch drain when seed >100 (batchesProcessed>=2 or equivalent)",
      "maps_to_ac": "AC-1",
      "verify": "seed 101+ active tasks; assert multi-pass and residual 0"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "afterQueuedSubscriptionContent==0 on successful drain",
      "maps_to_ac": "AC-2",
      "verify": "jq -e '.samples.afterQueuedSubscriptionContent==0'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "query/patch exception \u2192 ok:false fail closed",
      "maps_to_ac": "AC-3",
      "verify": "vitest -t drain-fail-closed-on-query-patch-error"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "runScheduleDrain residual-aware: residual>0 \u21d2 drain.ok false",
      "maps_to_ac": "AC-4",
      "verify": "vitest -t runScheduleDrain-requires-residual-zero"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "ok:true only when ALL after* residual counts are 0",
      "maps_to_ac": "AC-1",
      "verify": "assert disableAndDrain return shape residual gate"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "RED evidence fails on unfixed drain.ts:23-205 / client:689-724; GREEN after fix",
      "maps_to_ac": "AC-5",
      "verify": "test -s .../redhat-fix-s29-r2-c02-red.log && ...-green.log; PLATFORM_IT suite exit 0"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "empty catch residual-zero theatre killed",
      "maps_to_ac": "AC-3",
      "verify": "no silent catch that returns ok:true on sample/drain failure"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "paginated complete schedule drain to residual zero",
    "fail-closed disableAndDrain / runScheduleDrain residual==0 oracle",
    "quiet-check precondition that cannot declare drain success with after* residual >0"
  ],
  "consumes": [
    "HOLO_MIGRATION_READ_ONLY durable fence (D06-03 / C02 / H05)",
    "HOLO_CUTOVER_SCHEDULES_DISABLED consumer honor from REDHAT-FIX-S29-C03",
    "CUTOVER_DRAIN_SURFACES inventory (crons, queues, outbox, scheduled_jobs)",
    "migrationFenceAudit drain_completed rows"
  ],
  "boundary_contracts": [
    "CAP-CUT-01 hop: freeze \u2192 disable schedules \u2192 drain to residual zero \u2192 measured quiet \u2192 ETL (CAP-MIG-01)",
    "C-02 cycle-2 residual of C03: bounded DRAIN_BATCH=100 take-once is not a complete drain",
    "D06-03 AC-3 / D06-04 freeze\u2192quiet precondition remain load-bearing consumers of drain.ok with residual zero",
    "HOLO_MIGRATION_READ_ONLY remains sole write-enforcement; drain is sequencing + residual evidence only",
    "NEVER declare drain.ok/ok:true while afterActiveTasks|afterRunningTasks|afterQueuedSubscriptionContent >0",
    "NEVER swallow query/patch exceptions into empty residual samples that fake zero"
  ],
  "proposed_by": "convex-planner",
  "source_finding": {
    "id": "C-02",
    "severity": "CRITICAL",
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d",
    "related": [
      "REDHAT-FIX-S29-C03",
      "D06-03",
      "D06-04"
    ],
    "locations": [
      "convex/migrationFence/drain.ts:23-24",
      "convex/migrationFence/drain.ts:113-150",
      "convex/migrationFence/drain.ts:154-165",
      "convex/migrationFence/drain.ts:191-205",
      "services/platform/src/cutover/convex-fence-client.ts:689-724"
    ]
  }
}
-->

</details>
