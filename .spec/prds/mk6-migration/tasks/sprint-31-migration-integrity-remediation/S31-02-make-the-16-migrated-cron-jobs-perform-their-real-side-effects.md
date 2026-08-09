# S31-02: Make the 16 migrated cron jobs perform their real side-effects on their real schedules

> **Task ID:** S31-02
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 900 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-CUT-01, CAP-MIG-01
**PRD refs:** UC-PLAT-03, UC-SVC-02, R4, R9, R20

## What this does

Gives each of the 16 migrated cron jobs an executable handler ported from its Convex source, adds a parser that turns `MigratedJob.schedule` from an inert string into a live cadence, enables the scheduler LaunchAgent and wires it as the leased-queue consumer, moves background mission execution off the inline HTTP request path, and reaps chat runs stranded by process death.

## Why

`queue/jobs-runner.ts` writes outbox → effect → `job_runs` rows and reports `jobs_fired 16/16` while no business logic runs — the gate counted `job_runs` rows, so the absence was invisible. The real implementations still live only in `convex/`, which Sprint 32 deletes (risk R20). Meanwhile the scheduler plist ships `Disabled=true`, `supervisor.ts:458` boots it out on every `stack:up`, and `dequeue()` has zero production callers with a live `queue_jobs` count of 0.

## How to verify

- Seed 3 `tasks` rows running for 90 minutes, run `cd services/platform && bun src/cli/holo.ts jobs:run-all --json`, and confirm exactly those 3 flip to `error` with a timeout reason.
- `cd services/platform && bun src/cli/holo.ts jobs:list --json` reports a concrete `next_fire_at` for all 16 jobs.
- `PLATFORM_IT=1 pnpm test:integration` passes, including the scheduler-consumer, mission-off-HTTP and stuck-run-sweep suites.

## Scope

Touches `queue/` (registry, runner, handlers, schedule parser, scheduler worker, priority), `stack/supervisor.ts`, the scheduler plist, and the two HTTP entrypoints that leak background work onto the request thread. Schema changes belong to S31-01; the fencing rewrite belongs to S31-03.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-02 - Make the 16 migrated cron jobs perform their real side-effects
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
AGENT_RATIONALE: The deliverable spans Mastra scheduled workflows, the queue module, the Hono mission route and Drizzle DML against real domain tables; mastra-implementer is the only agent holding all four contexts. A devops agent could enable the plist but could not port taskCrons' timeout semantics.
PROPOSED-BY: mastra-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-6 TDD_STATE none · 0/6 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

All 16 scheduled jobs mutate their real domain tables on their real cadences, driven by an enabled scheduler consuming the leased queue.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER count a job_runs row as proof a job fired; the proof is the domain-table mutation the Convex cron used to make (tasks flipped to error, feed_items created, agent_telemetry deleted, notifications inserted).
- NEVER reimplement a handler from the one-line description in jobs-registry.ts — READ convex/taskCrons.ts:30-144 and the 15 handlers referenced from convex/crons.ts:61-285 and PORT them before Sprint 32 deletes them (R20).
- NEVER let a handler return a fabricated success shape; an unavailable dependency surfaces a named error through the runner's existing per-job error reporting.
- NEVER drive an AC by importing the handler module directly — use the holo CLI as a spawned child or an HTTP request to a listening server (R29: a test that imports the implementing module keeps passing after the production call site is deleted).
- NEVER mock the clock by mocking Date, and never mock Postgres, the queue, or the HTTP server.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] task-timeout-worker flips exactly the 3 seeded stuck tasks to error with timeout details, controls untouched — maps to AC-1 (PRIMARY)
- [ ] All 16 schedule expressions parse to a concrete next_fire_at; an unparseable one is a startup error — maps to AC-2
- [ ] The scheduler plist is enabled, survives stack:up, and drains queue_jobs interactive-before-background — maps to AC-3
- [ ] POST /api/missions returns non-terminal and a background queue_jobs row drives the run — maps to AC-4
- [ ] A chat run stranded by SIGKILL is reaped with agent_busy cleared; healthy runs survive — maps to AC-5
- [ ] A job with no handler makes jobs:run-all exit non-zero and writes no job_runs row for it — maps to AC-6
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: task-timeout-worker performs its real Convex-era side effect [PRIMARY]
  GIVEN: 3 tasks rows running for 90 minutes plus a 5-minute control and a completed control
  WHEN:  holo jobs:run-all --json fires the job through the real entrypoint
  THEN:  exactly those 3 rows flip to error with timeout details; both controls survive

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-cron-side-effects.test.ts
  TEST_FUNCTION: taskTimeoutWorkerSweepsStuckTasks

  SCENARIO:
    START_REF:        three_stuck_tasks
    NEGATIVE_CONTROL: would fail if stub handler | empty tasks table | mock postgres | static job result | disconnect from postgres
    EVIDENCE:         db_query
    CASES:
      - ACTION:           assert 0 error rows, spawn jobs:run-all --json, re-query the 3 stuck rows and both controls, query job_runs
        MUST_OBSERVE:     count(tasks WHERE status='error') == 3 · error_message matches "timed out after running for 9[0-9] minutes" · error_details->>'reason' == 'timeout' · jobs_fired 16 of 16 · exactly 1 job_runs row for task-timeout-worker with a non-null effect_id
        MUST_NOT_OBSERVE: (0 rows) from tasks WHERE status='error' · the 5-minute control flipped to error · an advanced updated_at on the completed control

AC-2: The schedule string is a live cadence, not an inert label
  GIVEN: the 16 registry schedule expressions and a running scheduler process
  WHEN:  jobs:list runs and the scheduler is stepped at 16:00:30 UTC and 03:00:00 UTC
  THEN:  every job has a concrete next_fire_at; morning-digest fires once in-window, zero out

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  scheduler
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-cron-schedule.test.ts
  TEST_FUNCTION: scheduleExpressionsDriveRealCadence

AC-3: The scheduler is enabled and is the queue consumer
  GIVEN: the scheduler LaunchAgent with Disabled=false and 2 pending queue_jobs rows
  WHEN:  holo stack:up then holo stack:status run against a disposable root
  THEN:  the scheduler is not booted out, reports a PID, and drains both rows under real leases

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  launchd
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-scheduler-consumer.test.ts
  TEST_FUNCTION: schedulerConsumesLeasedQueue

AC-4: Background mission execution runs on the queue
  GIVEN: a listening serving process and an empty queue_jobs table
  WHEN:  a client POSTs to /api/missions with a background template key
  THEN:  the response returns non-terminal and a background queue_jobs row drives the run

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  hono
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-mission-off-http.test.ts
  TEST_FUNCTION: missionExecutionLeavesTheRequestThread

AC-5: A chat run stranded by process death is reaped
  GIVEN: a chat_runs row left running after its serving process was SIGKILLed
  WHEN:  task-timeout-worker fires after the stall window
  THEN:  the row terminalizes with an explicit error_code and agent_busy clears

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts
  TEST_FUNCTION: strandedChatRunIsReaped

AC-6: A job with no handler cannot report green
  GIVEN: a registry with exactly 1 of 16 handlers unbound
  WHEN:  holo jobs:run-all --json runs
  THEN:  exit non-zero, jobs_fired 15 of 16, HANDLER_UNBOUND named, 15 job_runs rows

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-cron-side-effects.test.ts
  TEST_FUNCTION: unboundHandlerFailsTheRun

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/queue/jobs-registry.ts (MODIFY)
- services/platform/src/queue/jobs-runner.ts (MODIFY)
- services/platform/src/queue/jobs-handlers/** (NEW)
- services/platform/src/queue/schedule-parser.ts (NEW)
- services/platform/src/queue/scheduler-worker.ts (MODIFY)
- services/platform/src/queue/priority.ts (MODIFY)
- services/platform/src/stack/supervisor.ts (MODIFY)
- services/platform/deploy/launchd/holocron-scheduler.plist (MODIFY)
- services/platform/src/http/missions.ts (MODIFY)
- services/platform/src/http/chat-runs.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/tests/integration/sprint31-cron-side-effects.test.ts (NEW)
- services/platform/tests/integration/sprint31-cron-schedule.test.ts (NEW)
- services/platform/tests/integration/sprint31-scheduler-consumer.test.ts (NEW)
- services/platform/tests/integration/sprint31-mission-off-http.test.ts (NEW)
- services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts (NEW)
- .tmp/S31-02/** (NEW)

writeProhibited:
- convex/** — read-only source material for the port; writing there re-creates the sole-implementation risk (R20)
- services/platform/src/db/migrations/** — schema changes belong to S31-01 (reopening the ordinal-collision class is R26)
- services/platform/src/queue/durable-effect.ts — S31-03's surface; concurrent edits collide
- .spec/prds/mk6-migration/** — the PRD is the spec of record
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Keep Convex thresholds and user-visible message strings verbatim (the timeout error_message) and cite the Convex source path in a header comment.
- Keep every handler idempotent under replay: re-running against already-swept rows changes 0 rows.
- Keep handlers behind the existing isMigrationReadOnly re-checks (jobs-runner.ts:95,104,118), returning ok:false rather than throwing.
- Bind handlers by reference so an unbound handler is a compile-time-visible hole.

⚠️ Ask First:
- Adding a 17th registry entry — existing gates assert a count of 16, so the stuck-run sweep belongs inside task-timeout-worker.
- Changing the queue backend selection (pg-boss vs graphile-worker) while enabling the consumer.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/queue/jobs-registry.ts (MODIFY): handler field on MigratedJob (blocker — the runner and every handler module import it)
- services/platform/src/queue/schedule-parser.ts (NEW): discriminated union { kind:'interval', ms } | { kind:'daily', utcHour, utcMinute }; throws SCHEDULE_PARSE_ERROR
- services/platform/src/queue/jobs-handlers/** (NEW): 16 ported handlers, one module each, typed result shapes
- services/platform/src/queue/jobs-runner.ts (MODIFY): handler invoked between dispatchAndAck (line 122) and the job_runs INSERT (line 139)
- services/platform/src/queue/scheduler-worker.ts (MODIFY): real consume loop over dequeue()
- services/platform/deploy/launchd/holocron-scheduler.plist + stack/supervisor.ts (MODIFY): unit enabled and no longer booted out

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

TDD_MODE `red_first`: each AC is a RED → GREEN → REFACTOR micro-cycle. Show the actual failure output before writing implementation.

Sequence so each stage is independently verifiable:
  1. handler field + task-timeout-worker port (proves the AC-1 oracle)
  2. schedule parser
  3. the remaining 15 handler ports
  4. scheduler consume loop + plist/supervisor enablement
  5. mission-off-HTTP and the stuck-run sweep

Cadence and durability stay separate mechanisms: Mastra scheduled workflows decide WHEN; the leased queue decides the work runs exactly once. Do not implement cadence by polling queue_jobs.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. convex/taskCrons.ts [PRIMARY PATTERN]
   - Lines: 30-144
   - Focus: the reference handler to port — 60-minute default, startedAt ?? createdAt fallback, per-task try/catch, and the exact error_message and errorDetails shape AC-1 asserts. Every other handler follows this shape.

2. services/platform/src/queue/jobs-runner.ts
   - Lines: 85-180
   - Focus: runJob does beginEffect → dispatchAndAck → enqueue → INSERT job_runs and never calls business logic. The handler invocation slots between line 122 and line 139.

3. convex/crons.ts
   - Lines: 58-285
   - Focus: the authoritative 16-job cadence table and the internal function each cron invokes — the port list for the remaining 15 handlers.

4. services/platform/src/queue/priority.ts
   - Lines: 84-148
   - Focus: dequeue() with FOR UPDATE SKIP LOCKED, expired-lease reclaim and fence minting — a complete consumer primitive with zero production callers.

5. services/platform/src/stack/supervisor.ts
   - Lines: 455-465
   - Focus: bootoutLabel(scheduler) unconditionally boots the unit on stack:up and the message claims Disabled-until-operator; both change together with the plist.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: TDD_STATE history shows each test went red before green.

Gate 2: Each AC has a test
  Verify: the 5 test files contain one test per AC.

Gate 3: All tests pass
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: Exit 0.

Gate 4: Type check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0.

Gate 5: Lint
  Command: pnpm biome check .
  Expected: Exit 0.

Gate 6: Scope compliance
  Command: git diff --name-only
  Expected: Only SCOPE.writeAllowed files modified.

Gate 7: Integration/E2E coverage
  Verify: AC-1 (PRIMARY) is TEST_TIER integration against real Postgres.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py passes on the embedded contract (exit 0).
  Verify: the captured artifact shows 3 tasks rows mutated to error — not merely "jobs_fired 16".
  Reject: a PRIMARY test satisfied by job_runs rows alone.

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Each handler is its own module under services/platform/src/queue/jobs-handlers/ with a typed result shape; the registry binds by reference so an unbound handler is a compile-time-visible hole.
- Ported logic keeps Convex thresholds and user-visible message strings verbatim and cites the Convex source path in a header comment.
- The schedule parser returns a discriminated union { kind:'interval', ms } | { kind:'daily', utcHour, utcMinute } and throws SCHEDULE_PARSE_ERROR — no silent default cadence.
- Every handler is idempotent under replay: re-running against already-swept rows changes 0 rows.
- Reference: brain/docs/TDD-METHODOLOGY.md, brain/docs/TESTING-HIERARCHY.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Any schema change; the migration set is S31-01's surface.
- The fencing-token rewrite in durable-effect.ts (S31-03) — this task consumes that boundary, it does not change it.
- Live market-data sourcing for the business pipelines — explicitly deferred in 01-scope.md (2026-08-07).
- Client-side surfacing of a reaped chat run (S31-FE-02).

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** MigratedJob has no handler field, jobs-runner writes bookkeeping rows only, the schedule string has no parser, the scheduler plist is Disabled and booted out on every stack:up, and dequeue() has zero production callers with live queue_jobs = 0.

**Gap:** All 16 crons report green while none performs its former side-effect, and the real implementations exist only in convex/, which Sprint 32 deletes.

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; every AC drives a real entrypoint, never the handler module directly (R29)
- Every handler's proof is a domain-table mutation, not a job_runs row
- Ported logic matches the Convex source semantics, with the source path cited
- Pattern consistent with READING LIST [PRIMARY PATTERN] (convex/taskCrons.ts)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- The "handlers deferred to queue-2/3" line and the Disabled-until-operator supervisor message are both gone
- Handlers are idempotent under replay (at-least-once queue contract)
- SCHEDULE_PARSE_ERROR is a named error with no silent default cadence
- The stuck-run sweep does not add a 17th registry entry

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-01 (migrated schema is the single source of truth)
Blocks:     (none)
Parallel:   S31-04, S31-06

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "three_stuck_tasks": {
      "description": "3 real tasks rows in status running whose started_at is 90 minutes in the past, plus 2 controls that must survive the sweep.",
      "seed_method": "public_api",
      "records": [
        "3 rows in tasks with status='running', started_at = now() - interval '90 minutes', error_message IS NULL, created through the platform task-creation HTTP surface on a listening server",
        "1 control row in tasks with status='running', started_at = now() - interval '5 minutes'",
        "1 control row in tasks with status='completed'"
      ]
    },
    "scheduler_unit_enabled": {
      "description": "The holocron-scheduler LaunchAgent installed with Disabled=false against a disposable HOLO_ROOT with 2 pending queue_jobs rows waiting to be consumed.",
      "seed_method": "cli",
      "records": [
        "services/platform/deploy/launchd/holocron-scheduler.plist rendered with Disabled=false into a harness-scoped LaunchAgents path",
        "`holo stack:up --json` executed against the disposable root",
        "2 pending queue_jobs rows enqueued via `holo queue:enqueue`: one lane=interactive priority=100 and one lane=background priority=10"
      ]
    },
    "stranded_chat_run": {
      "description": "A chat_runs row left in status running because the serving process that owned it was SIGKILLed mid-stream.",
      "seed_method": "public_api",
      "records": [
        "a serving process on a free 127.0.0.1 port answering GET /health with 200",
        "1 chat_runs row created by POST /api/chat-runs, observed in status running with last_event_seq > 0",
        "the serving process terminated with SIGKILL while that run is still running",
        "the row's conversations parent still holds agent_busy = true"
      ]
    },
    "handlerless_job_registry": {
      "description": "A harness-scoped registry override in which exactly 1 of the 16 jobs has no handler bound.",
      "seed_method": "migration_fixture",
      "records": [
        "the real MIGRATED_JOBS registry with the handler for feed-builder unbound",
        "a fresh migrated namespace with job_runs holding 0 rows"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN 3 tasks rows running for 90 minutes plus 2 controls WHEN holo jobs:run-all fires task-timeout-worker THEN exactly those 3 rows flip to error with timeout details and the controls are untouched",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts",
      "scenario": {
        "id": "S31-02-AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub handler",
            "empty tasks table",
            "mock postgres",
            "static job result",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "three_stuck_tasks",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `SELECT count(*) FROM tasks WHERE status='error'` returns `0` BEFORE the job fires",
                "Run `cd services/platform && bun src/cli/holo.ts jobs:run-all --json` as a real spawned child process and capture exit code and stdout",
                "Re-query `tasks` by id for the 3 stuck rows and both controls",
                "Query `job_runs` for `job_name='task-timeout-worker'` inside the run window"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT count(*) FROM tasks WHERE status='error'` returns exactly `3`",
                "each of the `3` swept rows has `error_message` matching `timed out after running for 9[0-9] minutes`",
                "each of the `3` swept rows has `error_details->>'reason'` = `timeout` and a non-null `completed_at`",
                "stdout reports `jobs_fired` `16` of `jobs_total` `16`",
                "`job_runs` holds exactly `1` row for `job_name='task-timeout-worker'` with a non-null `effect_id`"
              ],
              "must_not_observe": [
                "`(0 rows)` from `tasks WHERE status='error'`",
                "the `5`-minute-old running control flipped to `error`",
                "an advanced `updated_at` on the `completed` control"
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
      "maps_to_ac": null,
      "description": "GIVEN the 16 registry schedule expressions WHEN jobs:list runs and the scheduler is stepped through an in-window instant THEN every job carries a concrete next_fire_at, morning-digest fires once in-window and zero times out-of-window, and an unparseable expression is a startup error",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-schedule.test.ts",
      "scenario": {
        "id": "S31-02-AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scheduler",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub scheduler",
            "static next_fire_at",
            "mock clock",
            "empty notifications table"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "scheduler_unit_enabled",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `cd services/platform && bun src/cli/holo.ts jobs:list --json` as a real child process",
                "Step the scheduler with an explicit evaluation instant of `16:00:30 UTC` (inside the morning-digest window) and again at `03:00:00 UTC`",
                "Query `notifications` for digest rows created inside the case window"
              ]
            },
            "end_state": {
              "must_observe": [
                "all `16` entries carry a non-null ISO-8601 `next_fire_at`",
                "an `interval 1h` job resolves `next_fire_at` within `3600` seconds of the evaluation instant",
                "exactly `1` morning-digest firing at the `16:00:30 UTC` instant",
                "exactly `1` new digest row in `notifications`",
                "`0` morning-digest firings at the `03:00:00 UTC` instant"
              ],
              "must_not_observe": [
                "`next_fire_at` of `null` for any of the `16` jobs",
                "`(0 rows)` from `notifications` after the in-window step",
                "`2` or more digest rows for a single in-window evaluation"
              ]
            }
          },
          {
            "start_ref": "scheduler_unit_enabled",
            "action": {
              "actor": "operator",
              "steps": [
                "Inject a registry override carrying schedule `every fortnight-ish` for one job",
                "Start the scheduler as a real child process and capture exit code and stderr"
              ]
            },
            "end_state": {
              "must_observe": [
                "scheduler exit code is not `0`",
                "stderr contains `SCHEDULE_PARSE_ERROR` naming the offending job and the literal `every fortnight-ish`"
              ],
              "must_not_observe": [
                "exit code `0`",
                "the scheduler entering its consume loop with `0` parsed schedules"
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
      "maps_to_ac": null,
      "description": "GIVEN the scheduler LaunchAgent enabled and 2 pending queue_jobs rows WHEN holo stack:up runs THEN the scheduler is not booted out, reports a live PID, and drains both rows interactive-before-background under real leases",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-scheduler-consumer.test.ts",
      "scenario": {
        "id": "S31-02-AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "launchd",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub consumer",
            "empty queue",
            "mock launchd",
            "static status",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "scheduler_unit_enabled",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `SELECT count(*) FROM queue_jobs WHERE status='completed'` returns `0` BEFORE `stack:up`",
                "Run `cd services/platform && bun src/cli/holo.ts stack:up --json` against the disposable root",
                "Poll `cd services/platform && bun src/cli/holo.ts stack:status --json` until the scheduler reports a PID or a bounded deadline elapses",
                "Query `queue_jobs` for the 2 seeded rows including `lease_owner`, `fence_token` and `completed_at`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the rendered plist contains `<key>Disabled</key>` followed by `<false/>`",
                "`stack:status` reports scheduler state `running` with a numeric PID",
                "`SELECT count(*) FROM queue_jobs WHERE status='completed'` returns exactly `2`",
                "both completed rows carry a non-null `lease_owner` matching `^worker-[0-9]+-`",
                "the `interactive` row's `completed_at` is strictly less than the `background` row's `completed_at`"
              ],
              "must_not_observe": [
                "a `stack:up` message containing `launchd Disabled until operator enables`",
                "a bootout of the `holocron-scheduler` label in the `stack:up` transcript",
                "`(0 rows)` from `queue_jobs WHERE status='completed'`"
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
      "maps_to_ac": null,
      "description": "GIVEN a listening serving process and an empty queue_jobs table WHEN a client POSTs to /api/missions THEN the response returns non-terminal while a background queue_jobs row drives the run to completion",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mission-off-http.test.ts",
      "scenario": {
        "id": "S31-02-AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub mission runner",
            "empty queue",
            "mock http client",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "scheduler_unit_enabled",
            "action": {
              "actor": "agent-client",
              "steps": [
                "Start the serving process and confirm `GET /health` returns `200` BEFORE posting",
                "Assert `SELECT count(*) FROM queue_jobs WHERE lane='background'` returns `0`",
                "`POST /api/missions` with a background template key and record the wall-clock duration of the request",
                "Immediately query `mission_runs` and `queue_jobs` for the returned `runId`",
                "Poll `mission_runs` until terminal or a bounded deadline"
              ]
            },
            "end_state": {
              "must_observe": [
                "HTTP status `200` or `202` with a non-null `runId`",
                "the response `status` field is a non-terminal value at return time",
                "exactly `1` `queue_jobs` row with `lane='background'` referencing the returned `runId`",
                "`mission_runs` later reaches a terminal status with the consumer's `lease_owner` recorded on the driving job",
                "the recorded `request_ms` is strictly less than the mission's own `mission_ms` execution time"
              ],
              "must_not_observe": [
                "`(0 rows)` from `queue_jobs WHERE lane='background'`",
                "a response whose `status` is already terminal at return time",
                "`0` `mission_runs` rows for the returned `runId`"
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
      "maps_to_ac": null,
      "description": "GIVEN a chat_runs row stranded in running after its serving process was SIGKILLed WHEN task-timeout-worker fires THEN the row terminalizes with an explicit error_code and agent_busy clears while a healthy run survives",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts",
      "scenario": {
        "id": "S31-02-AC-5",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub sweep",
            "empty chat_runs table",
            "mock postgres",
            "static reap count",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stranded_chat_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm the serving process answered `GET /health` with `200` before the run was created",
                "SIGKILL the serving process while the run is status `running` and assert the row is still `running` afterwards",
                "Create a healthy running chat run on a restarted process as the untouched control",
                "Run `cd services/platform && bun src/cli/holo.ts jobs:run-all --json` and capture stdout",
                "Query `chat_runs` and `conversations` for both runs"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stranded `chat_runs` row status is `failed` with a non-null `error_code`",
                "the stranded run's conversation has `agent_busy` = `false` and `agent_busy_since` `IS NULL`",
                "exactly `1` `chat_runs` row reaped in this pass",
                "the healthy control run is still status `running` with `agent_busy` = `true`"
              ],
              "must_not_observe": [
                "the stranded row still in status `running` after the sweep",
                "the healthy control reaped",
                "`0` conversations with `agent_busy` = `false` after the sweep"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN a registry with 1 of 16 handlers unbound WHEN holo jobs:run-all runs THEN it exits non-zero reporting 15 of 16 fired with HANDLER_UNBOUND and writes no job_runs row for that job",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts",
      "scenario": {
        "id": "S31-02-AC-6",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub handler resolution",
            "static success verdict",
            "mock registry",
            "removed guard"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "handlerless_job_registry",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `job_runs` holds `0` rows before the run",
                "Run `cd services/platform && bun src/cli/holo.ts jobs:run-all --json` as a real child process with the handlerless registry override",
                "Query `job_runs` grouped by `job_name`"
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit code is not `0`",
                "stdout `jobs_fired` is `15` and `jobs_total` is `16`",
                "the runs entry for `feed-builder` has `ok` = `false` and `error` containing `HANDLER_UNBOUND`",
                "`job_runs` holds exactly `15` rows",
                "stderr contains the `[jobs:run-all]` failure line naming `feed-builder`"
              ],
              "must_not_observe": [
                "exit code `0`",
                "`jobs_fired` of `16`",
                "a `job_runs` row with `job_name='feed-builder'`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "After jobs:run-all against 3 tasks rows running for 90 minutes, SELECT count(*) FROM tasks WHERE status='error' returns exactly 3.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Each timed-out task row has error_details->>'reason' equal to timeout.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Each timed-out task row has a non-null completed_at.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "A tasks row running for 5 minutes remains status running after the sweep.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "holo jobs:list --json returns 16 entries each with a non-null ISO-8601 next_fire_at.",
      "verify": "cd services/platform && bun src/cli/holo.ts jobs:list --json"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Stepping the scheduler at 16:00:30 UTC fires morning-digest exactly once.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-schedule.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Stepping the scheduler at 16:00:30 UTC inserts exactly 1 notifications digest row.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-schedule.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Stepping the scheduler at 03:00:00 UTC fires morning-digest zero times.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-schedule.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "A registry entry with schedule every fortnight-ish makes the scheduler process exit non-zero with SCHEDULE_PARSE_ERROR on stderr.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-schedule.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "services/platform/deploy/launchd/holocron-scheduler.plist contains the Disabled key followed by false.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-scheduler-consumer.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "holo stack:up output contains no bootout of the holocron-scheduler label.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-scheduler-consumer.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "holo stack:status reports the scheduler with a numeric PID.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-scheduler-consumer.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Two seeded pending queue_jobs rows reach status completed with non-null lease_owner values matching the worker prefix.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-scheduler-consumer.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "The interactive queue_jobs row completed_at is strictly less than the background row completed_at.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-scheduler-consumer.test.ts"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "POST /api/missions returns a non-terminal status at return time.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mission-off-http.test.ts"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "POST /api/missions leaves exactly 1 queue_jobs row with lane background for the returned runId.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mission-off-http.test.ts"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The POST /api/missions request duration is strictly less than the elapsed time from request return to the mission reaching a terminal mission_runs status.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mission-off-http.test.ts"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "A chat_runs row stranded by SIGKILL of its serving process reaches status failed with a non-null error_code after task-timeout-worker fires.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts"
    },
    {
      "id": "TC-19",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "The reaped run conversation has agent_busy false after the sweep.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts"
    },
    {
      "id": "TC-20",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "The reaped run conversation has agent_busy_since null after the sweep.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts"
    },
    {
      "id": "TC-21",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "A healthy running chat run inside its stall window is still status running after the sweep.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-stuck-run-sweep.test.ts"
    },
    {
      "id": "TC-22",
      "type": "test_criterion",
      "maps_to_ac": "AC-6",
      "description": "With one handler unbound, holo jobs:run-all --json exits non-zero.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-23",
      "type": "test_criterion",
      "maps_to_ac": "AC-6",
      "description": "With one handler unbound, holo jobs:run-all --json reports jobs_fired 15 of 16.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-24",
      "type": "test_criterion",
      "maps_to_ac": "AC-6",
      "description": "With one handler unbound, job_runs holds exactly 15 rows.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    },
    {
      "id": "TC-25",
      "type": "test_criterion",
      "maps_to_ac": "AC-6",
      "description": "With one handler unbound, job_runs holds 0 rows with job_name feed-builder.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-cron-side-effects.test.ts"
    }
  ]
}
-->

</details>
