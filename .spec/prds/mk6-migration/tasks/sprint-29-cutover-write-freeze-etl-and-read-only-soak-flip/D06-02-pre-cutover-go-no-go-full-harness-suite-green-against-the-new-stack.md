# D06-02: Pre-cutover go/no-go: full harness suite green against the new stack
> Status: ✅ Completed
> Commit: 5e0882fea5f84eb72cee097f014098bc4f6e5064
> Reviewer: product-manager+mastra-reviewer
> Completed: 2026-08-01T22:59:57Z

> **Task ID:** D06-02
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 90 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** S
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-03, T-SYNC-008

## Specification

**Objective.** Give the operator one command that proves — with real, captured evidence — that the new stack passes the full harness suite while Convex still serves production untouched, per UC-SYNC-03 AC-1 / T-SYNC-008.

**Success state.** `holo cutover:go-no-go --json` spawns all 8 named gates as real subprocesses, emits go-no-go-report.json with per-gate exit codes/duration/collectedTests, and exits 0 only when every gate passed AND every vitest gate collected at least one real test.

## Critical Constraints

- **MUST** — MUST spawn every named gate (lint, typecheck, unit, integration, live, lanes, no-convex-client, no-convex-env) as a real child process and capture its real exit code
- **MUST** — MUST capture a concrete collectedTests count for the three vitest gates (unit/integration/live), parsed from real vitest output, so an empty/degenerate suite (0 collected tests) is distinguishable from a genuinely green suite
- **MUST** — MUST persist a durable go-no-go-report.json artifact including git_sha, generated_at, and the exact command string per gate
- **MUST** — MUST set overall.ok to the logical AND of every individual gate.pass value
- **NEVER** — NEVER hardcode a gate's pass/fail result or collectedTests count without parsing real subprocess output
- **NEVER** — NEVER report overall.ok=true when any gate.pass=false or any vitest gate's collectedTests=0
- **STRICTLY** — STRICTLY the report is machine-greppable (--json) and human-readable (default text), matching the existing holo verify:* command convention
- **STRICTLY** — STRICTLY exit code mirrors report.ok (0 iff true)

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** repo_at_planning_sha
- **WHEN** operator runs `bun services/platform/src/cli/holo.ts cutover:go-no-go --json`
- **THEN** all 8 gates run as real subprocesses, each vitest gate reports a real nonzero collectedTests count, and overall.ok = AND(gate.pass)

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-008`
#### AC-2

- **GIVEN** gate_fixture_broken_typecheck
- **WHEN** operator runs cutover:go-no-go while the broken fixture is present
- **THEN** the typecheck gate reports pass=false with a captured tsgo excerpt, and overall.ok flips to false

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-008`
#### AC-3

- **GIVEN** repo_at_planning_sha
- **WHEN** operator runs `holo cutover:go-no-go` without --json
- **THEN** exit code mirrors report.ok and a literal status line is printed

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-008`
#### AC-4

- **GIVEN** repo_at_planning_sha
- **WHEN** cutover:go-no-go completes
- **THEN** go-no-go-report.json persists with git_sha, generated_at, and a non-empty command string per gate

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-008`

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | gates array has exactly 8 entries when cutover:go-no-go runs against repo_at_planning_sha | AC-1 | `bun services/platform/src/cli/holo.ts cutover:go-no-go --json; jq '.gates | length' go-no-go-report.json` |
| TC-2 | each vitest gate reports a collectedTests count greater than zero | AC-1 | `jq '[.gates[] | select(.name=="unit" or .name=="integration" or .name=="live") | .collectedTests] | min' go-no-go-report.json` |
| TC-3 | overall.ok equals false when at least one gate.pass is false | AC-1 | `jq '.overall.ok' go-no-go-report.json` |
| TC-4 | the typecheck gate entry has pass equal to false when the broken fixture is present | AC-2 | `jq '.gates[] | select(.name=="typecheck").pass' go-no-go-report.json` |
| TC-5 | process exit code equals 0 only when report.ok is true | AC-3 | `bun services/platform/src/cli/holo.ts cutover:go-no-go; echo $?` |
| TC-6 | go-no-go-report.json git_sha field equals the real current HEAD SHA | AC-4 | `jq -r '.git_sha' go-no-go-report.json; git rev-parse HEAD` |

## Reading List

- `services/platform/src/backup/alerting.ts` — lines 1-60 — verifyBackupHealth aggregate multi-check report shape to mirror
- `services/platform/src/cli/holo.ts` — lines 3010-3095 — existing verify:backup / verify-no-convex-* case bodies to replicate for cutover:go-no-go
- `package.json` — lines 23-33 — exact lint/typecheck/test:unit/test:integration/test:live/test:lanes script definitions
- `.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md` — lines 28-40 — advisory: this gate is expected to fail-closed until Sprint 20/24/26 land

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/go-no-go.ts` — NEW
- `services/platform/src/cli/holo.ts` — MODIFY
- `services/platform/tests/integration/sprint29-go-no-go.test.ts` — NEW

**WRITE-PROHIBITED**

- `convex/**` — Convex fencing is D06-03's scope
- `services/platform/src/etl/**` — ETL orchestration is D06-04's scope
- `services/platform/src/http/hono-app.ts` — new-backend write-fence wiring is D06-05's scope

## Design / Code Pattern

**Pattern.** Sequential real-subprocess gate runner producing one unified JSON report with parsed collectedTests counts, mirroring verifyBackupHealth

**Pattern source.** `services/platform/src/backup/alerting.ts`

**Anti-pattern.** Hardcoding gate results or collectedTests counts; treating a spawned process's mere invocation as a pass without parsing its real output

**References**

- services/platform/src/backup/alerting.ts
- services/platform/src/cli/holo.ts:3010-3095

## Verification Gates

- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/go-no-go.ts services/platform/src/cli/holo.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts` → exit 0
- `pnpm test:lanes` → exit 0
- `bun services/platform/src/cli/holo.ts cutover:go-no-go --json` → gates.length==8

## Capability Chain

- **Provides:** holo cutover:go-no-go operator command; go-no-go-report.json durable artifact (per-gate real exit codes + collected-test counts)
- **Consumes:** pnpm biome check; pnpm tsgo --noEmit; pnpm vitest run --project unit|integration|live; pnpm test:lanes; holo verify:no-convex-client / verify-no-convex-env
- **Boundary contracts:** CAP-CUT-01 trigger: 'Operator executes the cutover after the new stack passes integration' — this task IS that integration pass gate

## Agent Assignment

`devops-engineer` — Orchestrating real subprocess invocations of existing lint/typecheck/vitest-lane/no-convex gates into one operator command and durable report is CI/CD pipeline composition, not new business logic.

## Dependencies

- **Depends on:** —
- **Blocks:** D06-03

## Coding Standards

- RULES.md
- biome.json

## Notes

Expanded by `devops-engineer` from handoff `s29-devops.json`. Fakeability audit: `validate_scenario.py` reports **0 CRITICAL** across every behavioral AC (task-level `fixtures` resolve each `start_ref`).

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
 "version": "1",
 "task_id": "D06-02",
 "tdd_mode": "skipped",
 "verification_policy": {
  "requires_tests": false,
  "requires_red_evidence": false,
  "requires_seeded_evidence": true
 },
 "fixtures": {
  "repo_at_planning_sha": {
   "description": "Repo checked out at planning SHA c7873378 with pnpm installed, Postgres reachable, Convex dev deployment reachable.",
   "seed_method": "cli",
   "records": [
    "git rev-parse HEAD prints the current SHA",
    "pnpm install completed",
    "psql $DATABASE_URL -c 'SELECT 1' returns 1 row",
    "npx convex dev --once succeeds"
   ]
  },
  "gate_fixture_broken_typecheck": {
   "description": "A scratch TypeScript file with a deliberate type error, written via a real fs.writeFile call inside the tsgo project scope, used only for the AC-2 negative-control case then deleted.",
   "seed_method": "migration_fixture",
   "records": [
    "services/platform/src/cutover/.tmp-gate-fixture.ts written containing `const x: string = 123;`",
    "file removed immediately after the AC-2 assertion completes"
   ]
  }
 },
 "requirements": [
  {
   "id": "AC-1",
   "type": "acceptance_criterion",
   "primary": true,
   "flow_ref": "T-SYNC-008",
   "description": "GIVEN repo_at_planning_sha WHEN operator runs holo cutover:go-no-go --json THEN all 8 gates run as real subprocesses with real collectedTests counts",
   "verify": "bun services/platform/src/cli/holo.ts cutover:go-no-go --json; jq '.gates | length' == 8",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "gate list is hardcoded pass without spawning a process",
      "a vitest gate reports collectedTests as a stub value instead of a parsed real count",
      "overall.ok is true while a gate.pass is false"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "repo_at_planning_sha",
      "action": {
       "actor": "operator",
       "steps": [
        "run bun services/platform/src/cli/holo.ts cutover:go-no-go --json",
        "inspect go-no-go-report.json"
       ]
      },
      "end_state": {
       "must_observe": [
        "gates.length == 8",
        "gates[name=unit].collectedTests > 0 (e.g. 42)",
        "gates[name=integration].collectedTests > 0 (e.g. 17)",
        "gates[name=live].collectedTests > 0 (e.g. 6)",
        "every gate.duration_ms > 0"
       ],
       "must_not_observe": [
        "gates.length == 0",
        "any vitest gate.collectedTests == 0 (degenerate empty suite)",
        "overall.ok == true while some gate.pass == false"
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
   "flow_ref": "T-SYNC-008",
   "description": "GIVEN a deliberately broken typecheck fixture WHEN go-no-go runs THEN typecheck and overall.ok both report false",
   "verify": "write .tmp-gate-fixture.ts with a type error; run cutover:go-no-go --json; jq '.gates[] | select(.name==\"typecheck\").pass'",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "typecheck gate reports pass=true despite the broken fixture (a stub/static gate that never actually spawns tsgo)",
      "overall.ok stays true (empty failure surface)"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "gate_fixture_broken_typecheck",
      "action": {
       "actor": "operator",
       "steps": [
        "run cutover:go-no-go --json with the broken fixture present",
        "inspect the typecheck gate entry"
       ]
      },
      "end_state": {
       "must_observe": [
        "typecheck.pass == false",
        "typecheck.stderr_tail contains `.tmp-gate-fixture.ts`",
        "overall.ok == false"
       ],
       "must_not_observe": [
        "typecheck.pass == true",
        "overall.ok == true (0 failures reported)"
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
   "flow_ref": "T-SYNC-008",
   "description": "GIVEN repo_at_planning_sha WHEN operator runs holo cutover:go-no-go without --json THEN exit code and status line follow the holo convention",
   "verify": "holo cutover:go-no-go; echo $?",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "exit code is 0 despite overall.ok being false (a stubbed exit path)",
      "no status line is printed (empty stdout)"
     ]
    },
    "evidence": {
     "artifact_type": "stdout",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "repo_at_planning_sha",
      "action": {
       "actor": "operator",
       "steps": [
        "run holo cutover:go-no-go (no --json)",
        "capture exit code and stdout"
       ]
      },
      "end_state": {
       "must_observe": [
        "exit code 0 when report.ok is true",
        "exit code 1 when report.ok is false",
        "stdout contains the literal string status: OK or status: FAIL"
       ],
       "must_not_observe": [
        "exit code 0 while report.ok is false",
        "stdout contains none of the two literal status strings (empty output)"
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
   "flow_ref": "T-SYNC-008",
   "description": "GIVEN a completed run WHEN cutover:go-no-go finishes THEN a durable report artifact with git_sha, generated_at, and per-gate commands persists",
   "verify": "test -f go-no-go-report.json; jq '.git_sha'",
   "maps_to_ac": null,
   "test_tier": "integration",
   "scenario": {
    "tier": "visible",
    "test_tier": "integration",
    "verification_service": "postgres",
    "topology": "single-node",
    "negative_control": {
     "would_fail_if": [
      "git_sha is missing or empty",
      "a gate's command field is missing"
     ]
    },
    "evidence": {
     "artifact_type": "file_artifact",
     "required_capture": true
    },
    "cases": [
     {
      "start_ref": "repo_at_planning_sha",
      "action": {
       "actor": "operator",
       "steps": [
        "run cutover:go-no-go --json",
        "inspect go-no-go-report.json fields"
       ]
      },
      "end_state": {
       "must_observe": [
        "go-no-go-report.json exists with byteLength > 0",
        "git_sha equals the real 40-char git rev-parse HEAD output",
        "all 8 gate.command values have length > 0 and gates[0].command == `pnpm biome check ...`"
       ],
       "must_not_observe": [
        "git_sha is an empty string",
        "any gate.command is empty or none"
       ]
      }
     }
    ]
   }
  },
  {
   "id": "TC-1",
   "type": "test_criterion",
   "description": "gates array has exactly 8 entries",
   "maps_to_ac": "AC-1",
   "verify": "jq '.gates | length' go-no-go-report.json == 8"
  },
  {
   "id": "TC-2",
   "type": "test_criterion",
   "description": "each vitest gate collected more than zero tests",
   "maps_to_ac": "AC-1",
   "verify": "jq '[.gates[] | select(.name==\"unit\" or .name==\"integration\" or .name==\"live\") | .collectedTests] | min' go-no-go-report.json > 0"
  },
  {
   "id": "TC-3",
   "type": "test_criterion",
   "description": "overall.ok is false when any gate fails",
   "maps_to_ac": "AC-1",
   "verify": "jq '.overall.ok' go-no-go-report.json"
  },
  {
   "id": "TC-4",
   "type": "test_criterion",
   "description": "typecheck gate fails on the broken fixture",
   "maps_to_ac": "AC-2",
   "verify": "jq '.gates[] | select(.name==\"typecheck\").pass' go-no-go-report.json == false"
  },
  {
   "id": "TC-5",
   "type": "test_criterion",
   "description": "exit code mirrors report.ok",
   "maps_to_ac": "AC-3",
   "verify": "holo cutover:go-no-go; echo $?"
  },
  {
   "id": "TC-6",
   "type": "test_criterion",
   "description": "report git_sha equals real HEAD",
   "maps_to_ac": "AC-4",
   "verify": "jq -r '.git_sha' go-no-go-report.json; git rev-parse HEAD"
  }
 ]
}
-->
