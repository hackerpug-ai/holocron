# S31-07: Restore observability — self-hosted Langfuse in-repo, mission traces, telemetry on every fleet call

> **Task ID:** S31-07
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 600 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-INF-01
**PRD refs:** UC-PLAT-04, UC-INFER-01, R29

## What this does

Brings self-hosted Langfuse into the repository as a compose file plus a LaunchAgent, repoints configuration at it, re-attaches the trace exporter to the live mission path, routes five uninstrumented fleet call sites through one instrumented client, and adds a structural guard that fails when any call site bypasses it.

## Why

Observability regressed to zero after its gate passed: commit `c480051d` deleted the exporter call site from the CLI the day after Sprint 12's gate, leaving `observability/mission-research.ts:156` reachable only from tests — which keep passing while production emits nothing (risk R29). `mission/runtime.ts` has zero Langfuse references. Self-hosted Langfuse exists only as an untracked `/private/tmp/langfuse-s29` checkout, and `.env.example:29` still points at `https://us.cloud.langfuse.com`, contradicting the local-first mandate. Telemetry is hand-instrumented with holes: `evals/scorers.ts`, `inference/embed.ts`, `inference/extract-structured.ts`, `inference/probe-capability.ts` and `compat/cells/agent.ts` all build their own fleet model and write no telemetry row.

## How to verify

- `cd services/platform && bun src/cli/holo.ts stack:up --json` brings Langfuse healthy from in-repo artifacts on a machine with no `/private/tmp/langfuse-s29`.
- `cd services/platform && bun src/cli/holo.ts mission run research --json` produces a trace retrievable from the local Langfuse instance by its `traceId`.
- `PLATFORM_IT=1 pnpm test:integration` and `PLATFORM_IT=1 pnpm test:live` pass, including the bypass guard and the telemetry sweep.

## Scope

Touches the observability package, mission runtime, the five bypassing inference/evals call sites, the deploy artifacts and `.env.example`. Chat-path telemetry routes through `compat/cells/agent.ts`, which this task owns; `http/chat-runs.ts` belongs to S31-04.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-07 - Restore observability: self-hosted Langfuse, mission traces, telemetry
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-evals-implementer | reviewer=mastra-reviewer
AGENT_RATIONALE: The deliverable is observability infrastructure plus the anti-regression harness that keeps it wired; mastra-evals-implementer owns telemetry, tracing, OLAP and CI-gating discipline, and R29 demands a test that catches a future deletion — an evals-discipline artifact rather than a feature.
PROPOSED-BY: mastra-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-5 TDD_STATE none · 0/5 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

Every model call writes telemetry through one instrumented client, and a live mission emits a trace to a Langfuse this repository can stand up.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER satisfy a trace AC by importing observability/mission-research.ts from the test — that is exactly the shape that kept Sprint 12's suite green for a year while production emitted nothing (R29). Drive the CLI or an HTTP route.
- NEVER leave Langfuse configuration pointing at a cloud host; the standing constraint is local-first and the sprint gate revokes external credentials.
- NEVER count a telemetry row written by the test harness as proof; the row must come from the production call path the entrypoint exercises.
- NEVER introduce a second telemetry writer alongside recordInferenceTelemetry — "one instrumented client" means one.
- NEVER mock the Langfuse HTTP endpoint, the fleet, or Postgres.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] A mission driven through its production entrypoint emits a trace retrievable from local Langfuse by traceId — maps to AC-1 (PRIMARY)
- [ ] Langfuse compose file, LaunchAgent and secrets entry are in-repo and config points at a local address — maps to AC-2
- [ ] All 5 previously-uninstrumented call sites write fully-populated inference_telemetry rows — maps to AC-3
- [ ] A probe module bypassing the instrumented client makes the committed guard fail — maps to AC-4
- [ ] The observability package has 0 test-only modules — maps to AC-5
- [ ] PLATFORM_IT=1 pnpm test:integration and PLATFORM_IT=1 pnpm test:live pass + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: A live mission run emits a trace to self-hosted Langfuse [PRIMARY]
  GIVEN: self-hosted Langfuse up with 0 traces for the scoped run and a reachable fleet
  WHEN:  holo mission run research --json is spawned as a real child process
  THEN:  a trace with the emitted traceId is retrievable from the local Langfuse instance

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  langfuse
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-mission-trace-live.test.ts
  TEST_FUNCTION: liveMissionEmitsTraceToLocalLangfuse

  SCENARIO:
    START_REF:        live_mission_run
    NEGATIVE_CONTROL: would fail if stub exporter | empty trace store | mock langfuse endpoint | static trace id | disconnect from langfuse
    EVIDENCE:         api_response
    CASES:
      - ACTION:           confirm langfuse health 200 and 0 traces, confirm fleet /v1/models 200, spawn mission run research, query langfuse by traceId, scan mission/runtime.ts
        MUST_OBSERVE:     child exit 0 with a non-null traceId · exactly 1 trace for that traceId · at least 2 spans including at least 1 model-call span with a non-null endpoint · at least 1 observability reference in mission/runtime.ts · mission_runs reached terminal
        MUST_NOT_OBSERVE: 0 traces for the emitted traceId · 0 observability references in mission/runtime.ts · a trace produced only when mission-research.ts is imported directly · a query answered by a cloud.langfuse.com host

AC-2: Langfuse is self-hosted from artifacts tracked in this repository
  GIVEN: a clean checkout with no machine-local Langfuse directory
  WHEN:  holo stack:up then holo stack:status run against a disposable root
  THEN:  Langfuse starts from in-repo artifacts, reports healthy, and config resolves locally

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  launchd
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts
  TEST_FUNCTION: langfuseStartsFromRepoArtifacts

AC-3: Every fleet call site writes telemetry through the one instrumented client
  GIVEN: 0 inference_telemetry rows in the case window and a reachable fleet
  WHEN:  the 5 call sites are exercised through their real CLI entrypoints
  THEN:  each writes at least 1 row with non-null tokens, wall-ms, endpoint and role

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-telemetry-every-call.test.ts
  TEST_FUNCTION: everyFleetCallSiteWritesTelemetry

AC-4: A bypassing call site fails a committed regression guard
  GIVEN: the bypass guard committed and green
  WHEN:  a probe module constructing a fleet model directly is added, then removed
  THEN:  the guard fails naming that file, and passes again once it is deleted

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  typescript
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts
  TEST_FUNCTION: guardCatchesAFutureBypass

AC-5: The exporter is production-reachable, not test-only
  GIVEN: the post-change tree with the exporter re-attached
  WHEN:  the module graph is walked from production entrypoints and from the test tree
  THEN:  the observability package has 0 modules reachable only from tests

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  typescript
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts
  TEST_FUNCTION: noObservabilityModuleIsTestOnly

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/observability/** (MODIFY)
- services/platform/src/mission/runtime.ts (MODIFY)
- services/platform/src/inference/telemetry.ts (MODIFY)
- services/platform/src/inference/embed.ts (MODIFY)
- services/platform/src/inference/extract-structured.ts (MODIFY)
- services/platform/src/inference/probe-capability.ts (MODIFY)
- services/platform/src/evals/scorers.ts (MODIFY)
- services/platform/src/compat/cells/agent.ts (MODIFY)
- services/platform/src/compat/cells/otel.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/src/stack/supervisor.ts (MODIFY)
- services/platform/deploy/compose/langfuse.compose.yaml (NEW)
- services/platform/deploy/compose/image-lock.json (MODIFY)
- services/platform/deploy/launchd/holocron-langfuse.plist (NEW)
- .env.example (MODIFY)
- services/platform/tests/integration/sprint31-mission-trace-live.test.ts (NEW)
- services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts (NEW)
- services/platform/tests/integration/sprint31-telemetry-every-call.test.ts (NEW)
- services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts (NEW)
- .tmp/S31-07/** (NEW)

writeProhibited:
- /private/tmp/langfuse-s29/** — an untracked machine-local checkout is the defect being fixed; editing it deepens the single-machine dependency
- services/platform/src/http/chat-runs.ts — S31-04's surface; route chat telemetry through compat/cells/agent.ts instead
- services/platform/src/db/migrations/** — any inference_telemetry column addition goes through S31-01 (R26)
- convex/** — decommission target
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Extend runFleetModelCall with a typed call-kind discriminant ('chat' | 'object' | 'embedding') rather than forking a second instrumented client.
- Pin Langfuse image digests in image-lock.json following the existing compose convention; a floating :latest tag is a review failure.
- Use the same @BUN_BIN@ / @HOLO_ROOT@ / @DATABASE_URL@ templating as the nine existing plists so install-launchd.sh needs no special case.
- Resolve Langfuse keys from the consolidated secrets source; no key literal in a compose file, plist or .env.example.

⚠️ Ask First:
- Keying the bypass guard on anything other than model CONSTRUCTION sites (a filename allowlist cannot catch a file that does not exist yet).
- Any change to the inference_telemetry row shape that would need a migration.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/deploy/compose/langfuse.compose.yaml + deploy/launchd/holocron-langfuse.plist (NEW): blockers — AC-1 cannot be proven without a running instance
- services/platform/src/inference/telemetry.ts (MODIFY): call-kind discriminant on runFleetModelCall so all five sites fold into one client
- services/platform/src/mission/runtime.ts (MODIFY): exporter attached to the live mission path
- services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts (NEW): the structural guard plus the module-graph test-only check
- .env.example (MODIFY): LANGFUSE_BASE_URL repointed at the local instance

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

TDD_MODE `red_first`. Sequence:
  1. Bring Langfuse in-repo and get stack:up green — AC-1 cannot be proven without a running instance
  2. Re-attach the exporter to mission/runtime.ts
  3. Consolidate the five call sites onto runFleetModelCall
  4. Write the bypass guard LAST, when the tree is already clean, then prove it with the probe module

AC-5's module-graph walk is the durable form of R29's mitigation: it generalizes "is the exporter wired" into "is any observability module test-only", which is the class of regression that produced this task.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/inference/telemetry.ts [PRIMARY PATTERN]
   - Lines: 384-500
   - Focus: runFleetModelCall — the already-instrumented path the five bypassing call sites must fold into, and recordInferenceTelemetry at 111-135 as the single writer. Study its options shape before refactoring any caller.

2. services/platform/src/observability/mission-research.ts
   - Lines: 140-175
   - Focus: createObservability returns { observability, langfuseExporter }; runResearchMission is the orphaned entrypoint reachable from tests but not from the CLI since c480051d.

3. services/platform/deploy/launchd/holocron-scheduler.plist
   - Lines: 1-40
   - Focus: LaunchAgent house style — @BUN_BIN@/@HOLO_ROOT@ templating, EnvironmentVariables block, ThrottleInterval. The Langfuse plist should match.

4. services/platform/src/compat/cells/agent.ts
   - Lines: 93-140
   - Focus: createFleetAgentWithResolved builds the model at 100-106 and calls agent.generate at 138 with no telemetry — the bypass site the chat path uses.

5. .spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md
   - Sections: R29 (line 50)
   - Focus: test-reachable-only production code, with c480051d named as the precedent and the mitigation stated as "the test must invoke the production entry point, never the implementing module".

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: the guard observed FAILING with the bypass probe module present, captured under .tmp/S31-07/.

Gate 2: Each AC has a test
  Verify: the 4 test files contain one test per AC.

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
  Verify: AC-1 (PRIMARY) is TEST_TIER e2e against a real running Langfuse and the real fleet.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py passes on the embedded contract (exit 0).
  Verify: the captured api_response shows the retrieved trace and its spans — not merely "Exit 0".
  Reject: any AC satisfied by importing the implementing module rather than driving the production entrypoint (R29).

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- One instrumented client, one telemetry writer: every model call goes through runFleetModelCall and every row is written by recordInferenceTelemetry; a second writer is a review failure.
- The call-kind discriminant is a typed union ('chat' | 'object' | 'embedding') so telemetry field nullability is expressed in types rather than by convention.
- The Langfuse compose file pins image digests in image-lock.json; a floating :latest tag is a review failure.
- Langfuse keys resolve from the consolidated secrets source (UC-PLAT-05 AC-3); no key literal in a compose file, plist or .env.example.
- Reference: brain/docs/mastra/evals-observability.md, brain/docs/TESTING-HIERARCHY.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Chat-path edits in http/chat-runs.ts (S31-04) — route its telemetry through compat/cells/agent.ts.
- OLAP tuning, eval-drift dashboards and SLO alerting beyond a working trace + telemetry stream.
- Migrating inference_telemetry columns (S31-01 owns the migration set).
- Backup span export, which already exists in backup/span.ts.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** The exporter is orphaned behind tests, mission/runtime.ts has zero observability references, Langfuse exists only as an untracked /private/tmp checkout, config points at a cloud host, and five fleet call sites write no telemetry.

**Gap:** UC-PLAT-04 AC-1/AC-2 promise a trace for every mission run and a telemetry row for every model call; neither holds in production today, and nothing would catch a second deletion.

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; every AC drives a production entrypoint, never the implementing module (R29)
- Exactly one instrumented client and one telemetry writer
- Langfuse compose file and plist are tracked by git with pinned image digests
- Pattern consistent with READING LIST [PRIMARY PATTERN] (runFleetModelCall)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- The bypass guard keys on model construction sites, not a filename allowlist
- No Langfuse key literal appears in a compose file, plist or .env.example
- The call-kind discriminant expresses telemetry nullability in types
- .env.example carries zero cloud.langfuse.com references

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-06 (both edit probe-capability.ts; S31-06 makes that path production-critical)
Blocks:     (none)
Parallel:   S31-02, S31-03, S31-04

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-07",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "langfuse_local_up": {
      "description": "A self-hosted Langfuse instance started from the in-repo compose file via the platform stack command, answering its health endpoint.",
      "seed_method": "cli",
      "records": [
        "services/platform/deploy/compose/langfuse.compose.yaml present in the repository working tree",
        "services/platform/deploy/launchd/holocron-langfuse.plist present in the repository working tree",
        "`holo stack:up --json` executed against a disposable root",
        "the Langfuse health endpoint returning 200 on its local address before any trace is emitted",
        "0 traces present for the scoped run id before the mission runs"
      ]
    },
    "live_mission_run": {
      "description": "One research mission executed through the production CLI entrypoint against the real fleet with Langfuse up.",
      "seed_method": "cli",
      "records": [
        "langfuse_local_up satisfied",
        "GET http://127.0.0.1:4545/v1/models returning 200",
        "`holo mission run research --goal <scoped goal> --json` spawned as a real child process",
        "the returned runId and traceId captured from the child stdout"
      ]
    },
    "five_callsite_sweep": {
      "description": "All 5 previously-uninstrumented fleet call sites exercised through their real CLI entrypoints in one pass against an empty inference_telemetry window.",
      "seed_method": "cli",
      "records": [
        "a disposable migrated namespace with 0 inference_telemetry rows inside the case window",
        "the live fleet reachable at http://127.0.0.1:4545",
        "`holo evals:run`, `holo embed:run`, `holo extract`, `holo probe:capabilities` and `holo compat:spike` each executed as real child processes"
      ]
    },
    "bypass_probe_module": {
      "description": "A temporary module constructing a fleet model directly, bypassing the instrumented client.",
      "seed_method": "migration_fixture",
      "records": [
        "a probe module under services/platform/src calling resolveModel followed by createFleetChatModel directly",
        "the module is added, the guard is run, then the module is deleted inside the same case"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN self-hosted Langfuse up with 0 traces and a reachable fleet WHEN holo mission run research is spawned as a real child THEN a trace with the emitted traceId is retrievable from the local Langfuse instance",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-mission-trace-live.test.ts",
      "scenario": {
        "id": "S31-07-AC-1",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "langfuse",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub exporter",
            "empty trace store",
            "mock langfuse endpoint",
            "static trace id",
            "disconnect from langfuse"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_mission_run",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm the Langfuse health endpoint returns `200` and a query for the scoped run id returns `0` traces BEFORE the mission runs",
                "Confirm `GET http://127.0.0.1:4545/v1/models` returns `200`",
                "Spawn `cd services/platform && bun src/cli/holo.ts mission run research --goal <scoped goal> --json` and capture exit code, stdout and the emitted `traceId`",
                "Query the local Langfuse API for that `traceId` and capture the span list",
                "Scan services/platform/src/mission/runtime.ts for observability wiring references"
              ]
            },
            "end_state": {
              "must_observe": [
                "child exit code `0` with a non-null `traceId` on stdout",
                "the Langfuse trace query returns exactly `1` trace for that `traceId`",
                "that trace carries at least `2` spans, including at least `1` model-call span with a non-null `endpoint` attribute",
                "at least `1` observability reference inside services/platform/src/mission/runtime.ts",
                "the mission `mission_runs` row reached a terminal status"
              ],
              "must_not_observe": [
                "`0` traces from the Langfuse query for the emitted `traceId`",
                "`0` observability references in services/platform/src/mission/runtime.ts",
                "a trace produced only when services/platform/src/observability/mission-research.ts is imported directly",
                "a Langfuse query answered by a `cloud.langfuse.com` host"
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
      "description": "GIVEN a clean checkout with no machine-local Langfuse directory WHEN holo stack:up runs THEN Langfuse starts from in-repo artifacts, reports healthy, and config points at a local address",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts",
      "scenario": {
        "id": "S31-07-AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "launchd",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub health probe",
            "static status string",
            "empty compose file",
            "mock launchd",
            "disconnect from langfuse"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "langfuse_local_up",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `0` tracked files reference `/private/tmp/langfuse-s29`",
                "Assert `git ls-files` returns services/platform/deploy/compose/langfuse.compose.yaml and services/platform/deploy/launchd/holocron-langfuse.plist",
                "Run `cd services/platform && bun src/cli/holo.ts stack:up --json` against the disposable root",
                "Poll `cd services/platform && bun src/cli/holo.ts stack:status --json` until Langfuse reports healthy or a bounded deadline elapses",
                "Read the resolved `LANGFUSE_BASE_URL` from the running configuration and from `.env.example`",
                "Run `cd services/platform && bun src/cli/holo.ts secrets:doctor --json` for the Langfuse key entries"
              ]
            },
            "end_state": {
              "must_observe": [
                "`git ls-files` returns both deploy artifacts",
                "`stack:status` reports the Langfuse unit state `healthy`",
                "the resolved `LANGFUSE_BASE_URL` host is a loopback `127.0.0.1` or tailnet address",
                "`.env.example` declares that same local address",
                "`secrets:doctor` reports the Langfuse key entries as present with `0` missing"
              ],
              "must_not_observe": [
                "`1` or more tracked files referencing `/private/tmp/langfuse-s29`",
                "`cloud.langfuse.com` inside `.env.example` or the resolved config",
                "a `stack:status` entry claiming Langfuse healthy with `0` listening processes"
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
      "description": "GIVEN 0 inference_telemetry rows and a reachable fleet WHEN the 5 call sites are exercised through their real CLI entrypoints THEN each writes at least 1 fully-populated telemetry row",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-telemetry-every-call.test.ts",
      "scenario": {
        "id": "S31-07-AC-3",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub telemetry writer",
            "empty telemetry table",
            "mock fleet",
            "static row count",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "five_callsite_sweep",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `SELECT count(*) FROM inference_telemetry` inside the case window returns `0` BEFORE the sweep",
                "Confirm the fleet `GET /v1/models` probe returns `200`",
                "Spawn `holo evals:run`, `holo embed:run`, `holo extract`, `holo probe:capabilities` and `holo compat:spike` in turn as real child processes, capturing each exit code",
                "`SELECT call_site, role, endpoint, tokens, wall_ms FROM inference_telemetry` for the case window grouped by `call_site`"
              ]
            },
            "end_state": {
              "must_observe": [
                "all `5` child processes exit `0`",
                "`inference_telemetry` holds at least `5` rows inside the case window",
                "`COUNT(DISTINCT call_site)` is at least `5`",
                "the distinct `call_site` set includes entries for `evals/scorers`, `embed`, `extract-structured`, `probe-capability` and `compat/cells/agent`",
                "`0` rows inside the window have a null `endpoint`, null `role` or null `wall_ms`"
              ],
              "must_not_observe": [
                "`(0 rows)` from `inference_telemetry` after the sweep",
                "`COUNT(DISTINCT call_site)` of `0` or `1`",
                "a telemetry row whose writer is the test harness rather than the production path"
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
      "description": "GIVEN the bypass guard committed and green WHEN a probe module constructing a fleet model directly is added THEN the guard fails naming that file, and passes again once removed",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts",
      "scenario": {
        "id": "S31-07-AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "typescript",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static allowlist",
            "stub guard",
            "empty scan result",
            "mock module graph",
            "removed guard"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "bypass_probe_module",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Run the guard against the clean tree and record the exit code",
                "Add the probe module calling `resolveModel` then `createFleetChatModel` directly",
                "Re-run the guard and capture its failure output",
                "Delete the probe module and re-run the guard"
              ]
            },
            "end_state": {
              "must_observe": [
                "the guard exits `0` on the clean tree",
                "the guard exits with a code other than `0` while the probe module is present",
                "the failure output names the probe module path and the `createFleetChatModel` construction site",
                "the guard exits `0` again after the probe module is deleted",
                "the guard rule set contains `0` hardcoded filename allowlist entries"
              ],
              "must_not_observe": [
                "the guard exiting `0` with the probe module present",
                "a guard that greps only for the instrumented client name with `0` construction-site checks"
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
      "description": "GIVEN the exporter re-attached WHEN the module graph is walked from production entrypoints and from tests THEN the observability package has 0 test-only modules",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts",
      "scenario": {
        "id": "S31-07-AC-5",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "typescript",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static module list",
            "stub graph walker",
            "empty reachable set",
            "removed call site"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "langfuse_local_up",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Walk the module graph from services/platform/src/cli/holo.ts and the `/api/missions` route handler",
                "Collect the set of modules under services/platform/src/observability/ reachable from that walk",
                "Walk the module graph from the test tree and collect the same set",
                "Compute the modules present only inside the test-reachable set"
              ]
            },
            "end_state": {
              "must_observe": [
                "the `langfuse-exporter.ts` module is present inside the production-reachable set",
                "`services/platform/src/observability/mission-research.ts` is present inside the production-reachable set",
                "the test-only set for services/platform/src/observability/ has `0` entries",
                "the production-reachable set has at least `1` entry"
              ],
              "must_not_observe": [
                "services/platform/src/observability/mission-research.ts appearing only inside the test-reachable set",
                "`0` entries in the production-reachable set for the observability package"
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
      "description": "holo mission run research spawned as a real child process exits 0.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-mission-trace-live.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "The spawned mission child emits a non-null traceId on stdout.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-mission-trace-live.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Querying the local Langfuse API for the emitted traceId returns exactly 1 trace carrying at least 2 spans.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-mission-trace-live.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "services/platform/src/mission/runtime.ts contains at least 1 observability wiring reference.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-mission-trace-live.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "git ls-files returns services/platform/deploy/compose/langfuse.compose.yaml.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "git ls-files returns services/platform/deploy/launchd/holocron-langfuse.plist.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "holo stack:status --json reports the Langfuse unit healthy after holo stack:up.",
      "verify": "cd services/platform && bun src/cli/holo.ts stack:status --json"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": ".env.example contains 0 occurrences of cloud.langfuse.com.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": ".env.example declares a loopback or tailnet LANGFUSE_BASE_URL.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "No tracked file references the machine-local langfuse-s29 path.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-langfuse-in-repo.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "After the five-entrypoint sweep, inference_telemetry holds at least 5 rows inside the case window.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-telemetry-every-call.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "COUNT(DISTINCT call_site) inside the case window is at least 5.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-telemetry-every-call.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "The distinct call_site set includes evals/scorers, embed, extract-structured, probe-capability and compat/cells/agent.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-telemetry-every-call.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "0 inference_telemetry rows inside the case window have a null endpoint, null role or null wall_ms.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-telemetry-every-call.test.ts"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The bypass guard exits non-zero with a probe module constructing a fleet model directly, naming that module path.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The bypass guard exits 0 after the probe module is deleted.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The bypass guard rule set contains no hardcoded allowlist of known filenames.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "services/platform/src/observability/mission-research.ts is present in the module set reachable from the production entrypoints.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts"
    },
    {
      "id": "TC-19",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "The set of services/platform/src/observability/ modules reachable only from the test tree has 0 entries.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fleet-client-bypass-guard.test.ts"
    }
  ]
}
-->

</details>
