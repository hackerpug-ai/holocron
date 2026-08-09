# D08-01: RED: grep-clean + build-without-Convex-deps is the acceptance oracle

> **Task ID:** D08-01
> **Sprint:** [Sprint 32 — Convex Decommission — Code, Deps and Cloud Deletion](./SPRINT.md)
> **Agent:** `red-test-generator`
> **Reviewer:** `test-quality-reviewer`
> **Estimate:** 60 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** S
> **Proposed By:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Verification policy:** tests=true · red=true · seeded=true
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-05; T-SYNC-015; T-SYNC-016; T-SYNC-017; T-SYNC-018; CAP-CUT-01; CAP-BAK-01; removed-at-decommission; 01-scope.md

## What this does

Creates the real `holo verify:no-convex` acceptance oracle. It inventories repository residue, requires a genuine React Native iOS build artifact, and initializes the built MCP stdio distribution before reporting a single fail-closed verdict.

## Why

The repository still contains 64 case-insensitive Convex source hits, 8 forbidden dependency keys, and 4 legacy paths. The existing `verify:no-convex-client` check is intentionally narrower, while a static grep alone cannot prove that either the app or the MCP server still operates after dependency removal. D08-02 therefore needs an executable RED oracle that fails for the current residue and cannot turn GREEN through an empty scan, mocked process, TypeScript-only check, or source-only MCP launch.

## How to verify

Run `./bin/holo verify:no-convex --json`. For D08-01 it must exit 1 with the named current residue rather than an unknown-command or harness error. The integration contract separately drives `pnpm build:ios` to a real `holocron.app/Info.plist` and drives `pnpm --dir holocron-mcp build` plus `start` through MCP `initialize` and `tools/list`, observing server name `holocron` and exactly 44 tools.

## Scope

Adds only the composite verifier command and its integration/e2e oracle. D08-02 owns all code, dependency, lockfile, and legacy-directory removal; D08-03 owns the fresh restore; D08-05 alone may delete the cloud deployment.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: D08-01 - RED: grep-clean + build-without-Convex-deps is the acceptance oracle
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=red-test-generator | reviewer=test-quality-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

VERIFICATION_POLICY:
  requires_tests: true
  requires_red_evidence: true
  requires_seeded_evidence: true

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/cli/commands/verify-no-convex.ts tests/integration/s32-convex-decommission-oracle.test.ts

PROGRESS: AC-1..AC-4 TDD_STATE red · 0/4 GREEN; D08-02 owns GREEN

--------------------------------------------------------------------------------
OUTCOME (1 sentence, ≤30 words — observable success)
--------------------------------------------------------------------------------

A real composite CLI oracle fails on current Convex residue and can turn GREEN only after repository cleanup, a real iOS build, and built MCP operation.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER make production cleanup changes: D08-01 authors the oracle; D08-02 removes code, dependencies, scripts, locks, environment references, and legacy paths.
- NEVER accept a failure caused by an unknown command, import error, missing tool, skipped test, timeout, or unavailable fixture as valid RED evidence.
- NEVER mock the filesystem, Expo/Xcode process, MCP child process, MCP JSON-RPC exchange, or package build.
- NEVER stop after static residue detection: aggregate every subgate so static RED cannot mask a broken app-build or MCP-runtime probe.
- NEVER claim T-SYNC-018 or CAP-BAK-01, and never delete or mutate cloud resources, backups, or operator credentials.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] `./bin/holo verify:no-convex --json` exists and records `ok:false`, 64 source hits, 8 forbidden dependency keys, and 4 legacy paths on the current checkout — AC-1 (PRIMARY).
- [ ] The repository subgate covers exactly 6 source roots, all 3 current package manifests, and all 4 legacy-path targets without broad source allowlists — AC-2.
- [ ] The React Native subgate runs `pnpm build:ios` and requires at least one real `holocron.app/Info.plist` artifact — AC-3.
- [ ] The MCP subgate builds and starts `dist/mastra/stdio.js`, initializes `holocron`, and receives exactly 44 tools — AC-4.
- [ ] The RED failure is captured at `.tmp/D08-01/red-output.txt`; root unit, typecheck, and lint lanes remain GREEN.
- [ ] Only SCOPE.writeAllowed files and declared generated outputs changed.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered primary proof first)
--------------------------------------------------------------------------------

AC-1: Composite oracle bites on current residue [PRIMARY]
  GIVEN: the tracked pre-D08-02 checkout contains 64 source hits, 8 forbidden dependency keys, and 4 legacy paths
  WHEN:  `./bin/holo verify:no-convex --json` runs through the real CLI
  THEN:  it exits 1 with `ok:false` because of named residue while reporting every subgate

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  holo CLI + repository filesystem + Expo/Xcode + built MCP stdio
  FLOW_REF:              T-SYNC-015
  TDD_STATE:             red
  TEST_FILE:             tests/integration/s32-convex-decommission-oracle.test.ts
  TEST_FUNCTION:         AC-1 composite oracle bites on current residue
  VERIFY:                PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-1'

  SCENARIO:
    TOPOLOGY:         single-node
    START_REF:        current_convex_residue_checkout
    NEGATIVE_CONTROL: would fail if static success stub | empty scan roots | mocked subprocess | missing command
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: run `./bin/holo verify:no-convex --json` through `bin/holo` and capture exit code plus JSON stdout
      MUST_OBSERVE: `"ok":false`; `"source_hit_count":64`; `"forbidden_dependency_count":8`; `"legacy_path_present_count":4`
      MUST_NOT_OBSERVE: `unknown command`; `"ok":true with 0 findings`

AC-2: Cleanup boundary is complete and non-degenerate
  GIVEN: the verifier targets 6 source roots, 3 package manifests, and 4 legacy paths
  WHEN:  its repository-state subgate evaluates the current checkout
  THEN:  the zero-residue assertion fails now and becomes GREEN only when every target is clean

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  real repository filesystem
  FLOW_REF:              T-SYNC-015, T-SYNC-017
  TDD_STATE:             red
  TEST_FILE:             tests/integration/s32-convex-decommission-oracle.test.ts
  TEST_FUNCTION:         AC-2 cleanup boundary is complete and non-degenerate
  VERIFY:                PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-2'

  SCENARIO:
    TOPOLOGY:         single-node
    START_REF:        current_convex_residue_checkout
    NEGATIVE_CONTROL: would fail if mocked filesystem | omitted root | empty scan | broad static allowlist
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: run the repository-state subgate through `./bin/holo verify:no-convex --json`
      MUST_OBSERVE: `"scanned_root_count":6`; `"package_manifest_count":3`; `"source_hit_count":64`; `"forbidden_dependency_count":8`
      MUST_NOT_OBSERVE: `"scanned_root_count":0`; `empty findings with "ok":true`

AC-3: React Native proof requires a real app artifact
  GIVEN: the tracked `ios/` project is running on a real Expo/Xcode build host
  WHEN:  the oracle executes `pnpm build:ios`
  THEN:  the app subgate accepts only exit 0 plus at least one `holocron.app/Info.plist` artifact

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  Expo + Xcode
  FLOW_REF:              T-SYNC-016
  TDD_STATE:             red
  TEST_FILE:             tests/integration/s32-convex-decommission-oracle.test.ts
  TEST_FUNCTION:         AC-3 app proof requires a real build artifact
  VERIFY:                PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-3'

  SCENARIO:
    TOPOLOGY:         single-node
    START_REF:        ios_build_host
    NEGATIVE_CONTROL: would fail if stubbed build | empty artifact directory | disconnected Xcode process | TypeScript-only substitute
    EVIDENCE:         file_artifact (capture required)
    CASE 0:
      ACTION: run `pnpm build:ios`; inspect `ios/build/**/holocron.app/Info.plist`; record exit code and artifact count
      MUST_OBSERVE: `"build_exit_code":0`; `"holocron_app_artifact_count":1`; `"holocron.app/Info.plist"`
      MUST_NOT_OBSERVE: `"holocron_app_artifact_count":0`; `empty build output`

AC-4: Built MCP distribution initializes with 44 tools
  GIVEN: the real `holocron-mcp` package exposes `build` and `start` scripts for the dist entrypoint
  WHEN:  the oracle builds, starts, initializes, and lists tools through real stdio
  THEN:  the server identifies as `holocron` and returns exactly 44 tools

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  built Holocron MCP stdio server
  FLOW_REF:              T-SYNC-016
  TDD_STATE:             red
  TEST_FILE:             tests/integration/s32-convex-decommission-oracle.test.ts
  TEST_FUNCTION:         AC-4 built MCP distribution initializes with 44 tools
  VERIFY:                PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-4'

  SCENARIO:
    TOPOLOGY:         single-node
    START_REF:        mcp_built_distribution
    NEGATIVE_CONTROL: would fail if mocked child | stubbed start | omitted dist | disconnected tools/list | source-only dev entrypoint
    EVIDENCE:         api_response (capture required)
    CASE 0:
      ACTION: run `pnpm --dir holocron-mcp build`; spawn `pnpm --dir holocron-mcp start`; send MCP `initialize`, `notifications/initialized`, and `tools/list`; terminate the child in `finally`
      MUST_OBSERVE: `"build_exit_code":0`; `"serverInfo.name":"holocron"`; `"tool_count":44`
      MUST_NOT_OBSERVE: `"tool_count":0`; `empty server name`; `JSON-RPC error`

--------------------------------------------------------------------------------
TEST CRITERIA (stable TC-N IDs; one-to-one with ACs)
--------------------------------------------------------------------------------

TC-1 → AC-1: The composite CLI report sets `ok:false` against the current 64-hit repository.
  VERIFY: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-1'

TC-2 → AC-2: The cleanup assertion rejects the current 8 forbidden dependency keys.
  VERIFY: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-2'

TC-3 → AC-3: The app-build assertion accepts a real `holocron.app` artifact from `pnpm build:ios`.
  VERIFY: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-3'

TC-4 → AC-4: The MCP-runtime assertion accepts exactly 44 tools from the built stdio server.
  VERIFY: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-4'

--------------------------------------------------------------------------------
FIXTURES (shared seed data — referenced by START_REF)
--------------------------------------------------------------------------------

current_convex_residue_checkout (seed_method: migration_fixture)
  The tracked pre-D08-02 checkout exercised through the real repository and CLI surfaces.
  - 6 source roots contain 64 case-insensitive Convex hits: app, components, hooks, screens, lib, holocron-mcp/src
  - 3 package manifests contain 8 forbidden dependency keys
  - convex/, python/, cli/, and ratatui-playground/ are present

ios_build_host (seed_method: cli)
  A real Expo/Xcode host using the tracked native project.
  - root `package.json` exposes `build:ios` as `expo run:ios`
  - tracked `ios/` project is present
  - success must materialize `ios/build/**/holocron.app/Info.plist`

mcp_built_distribution (seed_method: cli)
  The real `holocron-mcp` package exercised through package scripts, never the source-only dev entrypoint.
  - `build` runs `tsup`
  - `start` runs `dist/mastra/stdio.js`
  - the MCP server contract advertises exactly 44 tools

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/cli/commands/verify-no-convex.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY)
- tests/integration/s32-convex-decommission-oracle.test.ts (NEW)
- .tmp/D08-01/** (GENERATED, gitignored)
- ios/build/** and holocron-mcp/dist/** (GENERATED only)

writeProhibited:
- app/**, components/**, hooks/**, screens/**, lib/** — D08-02 cleanup scope
- convex/**, python/**, cli/**, ratatui-playground/** — D08-02 cleanup/archive scope
- package.json, services/platform/package.json, holocron-mcp/package.json and lockfiles — D08-02 dependency scope
- lefthook.yml — do not make the intentionally RED integration oracle uncommittable
- cloud resources, backups, secret stores, and operator credentials
- Any source file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Drive the public `./bin/holo` surface and return deterministic JSON with independent subgate results.
- Scan all 6 source roots without source allowlists and inspect all 3 current manifests semantically.
- Continue through app and MCP probes after a static failure, then calculate `ok` from every subgate.
- Bound child-process waits and terminate the MCP process in `finally` on pass, failure, or timeout.
- Capture exact counts, exit codes, app artifact paths, MCP server name, and tool count.

⚠️ Ask First:
- Adding a dependency or changing an existing package script.
- Expanding scan targets beyond the PRD boundary.
- Adding any manifest exception beyond verifier script keys whose own names contain `no-convex`.
- Modifying pre-commit hooks or changing the CLI exit-code contract.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/cli/commands/verify-no-convex.ts (NEW): fail-closed composed report over source, manifests, paths, app build, and MCP runtime.
- services/platform/src/cli/holo.ts (MODIFY): exact `verify:no-convex` route and help text.
- tests/integration/s32-convex-decommission-oracle.test.ts (NEW): AC-1 through AC-4 against real files and child processes.
- .tmp/D08-01/red-output.txt (GENERATED): current non-degenerate RED evidence for D08-02 handoff.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (RED-only handoff)
--------------------------------------------------------------------------------

1. Author the verifier harness and the four final-state acceptance tests without changing product cleanup targets.
2. Run each AC through the exact filtered command and distinguish an assertion failure caused by current residue from harness/setup errors.
3. Run `./bin/holo verify:no-convex --json`; capture the nonzero JSON output at `.tmp/D08-01/red-output.txt`.
4. Keep root unit, typecheck, and lint lanes GREEN. The integration acceptance oracle is intentionally RED until D08-02.
5. Return `{ phase: "RED", test_file, test_functions, failure_output, subgate_results }`; do not implement D08-02's GREEN phase.
6. After D08-02 makes the same oracle GREEN, dispatch `test-quality-reviewer` to audit oracle strength, process cleanup, and empty/static negative controls.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/cli/commands/verify-no-convex-client.ts:1-185 [PRIMARY PATTERN]
   - Focus: fail-closed real-`rg` execution, normalized findings, JSON report, and exit semantics.
2. services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts:188-408
   - Focus: bounded real MCP stdio child, initialize handshake, `tools/list`, and cleanup.
3. tests/integration/sprint20-expo-dev-client-rebuild.test.ts:206-280
   - Focus: React Native build provenance and real app-artifact assertions.
4. package.json:10-55
   - Focus: exact `build:ios` command and current forbidden root dependency keys.
5. lefthook.yml:1-14
   - Focus: pre-commit unit/type/lint split; do not attach the intentional RED integration lane.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first; RED is an expected target-state failure)
--------------------------------------------------------------------------------

Gate 1: CLI surface and current RED evidence
  Command: ./bin/holo verify:no-convex --json
  Expected now: exit 1; `ok:false`; source_hit_count 64; forbidden_dependency_count 8; legacy_path_present_count 4.
  Expected after D08-02: exit 0 only when every subgate is true.

Gate 2: Scenario-backed integration oracle
  Command: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts
  Expected now: cleanup target assertions RED because of named repository residue, not missing commands or skipped tests.

Gate 3: React Native enrichment
  Command: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-3'
  Expected: the test drives `pnpm build:ios` and records at least 1 `holocron.app/Info.plist`; no TypeScript-only substitute counts.

Gate 4: MCP enrichment
  Command: PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-4'
  Expected: build exit 0; dist entrypoint initializes as `holocron`; `tools/list` count 44; child exits cleanly.

Gate 5: Typecheck, lint, and unaffected unit lane
  Commands:
    pnpm tsgo --noEmit
    pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/cli/commands/verify-no-convex.ts tests/integration/s32-convex-decommission-oracle.test.ts
    pnpm test:unit
  Expected: all exit 0 while the separate decommission target remains RED.

Gate 6: Fakeability floor
  Command: python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py on the embedded REQUIREMENT-CONTRACT JSON
  Expected: scenario_count 4; zero CRITICAL or HIGH violations.

--------------------------------------------------------------------------------
DEPENDENCIES AND CAPABILITY CONTRACTS
--------------------------------------------------------------------------------

Depends on:
- S31-FE-05 — current no-Convex client boundary.
- S31-05 — built 44-tool MCP runtime contract.

Blocks:
- D08-02 — owns GREEN cleanup after this task captures honest RED.

Provides:
- `holo-verify-no-convex-red-oracle`
- `D08-02-green-gate`
- structured decommission verdict

Boundary contracts:
- Repository files/manifests/paths → structured CLI subgate findings and counts.
- `pnpm build:ios` → actual `holocron.app/Info.plist`, not merely exit 0.
- MCP package build output → actual dist stdio initialize and 44-tool response.
- D08-01 never substitutes for CAP-BAK-01/T-SYNC-018 recovery proof and cannot authorize D08-05.

--------------------------------------------------------------------------------
MCP + REACT NATIVE ENRICHMENTS
--------------------------------------------------------------------------------

MCP:
- Use `pnpm --dir holocron-mcp build` followed by `pnpm --dir holocron-mcp start`; `dev` or direct `src/mastra/stdio.ts` execution does not prove the distributable artifact.
- Send MCP protocol `initialize`, then `notifications/initialized`, then `tools/list`; assert `serverInfo.name === "holocron"` and `tools.length === 44`.
- Apply bounded timeouts, retain stderr for diagnostics, and kill the child in `finally` without leaking a stdio server.

React Native:
- Use the repo-native `pnpm build:ios`; do not replace it with `tsgo`, Metro bundle generation, or a source-only import check.
- Require a concrete `ios/build/**/holocron.app/Info.plist` path and nonzero artifact count in addition to process exit 0.
- Preserve generated outputs only as evidence; do not edit tracked app, screen, hook, component, or native source in this RED task.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- D08-02 production cleanup: source, dependencies, scripts, locks, environment variables, legacy directories, and Ratatui archival.
- D08-03/T-SYNC-018 fresh-hardware restore execution and CAP-BAK-01 proof.
- D08-04 decommission runbook authoring.
- D08-05 operator-executed Convex cloud deletion.
- App or MCP feature changes, tool-count changes, visual design, or new runtime dependencies.

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

- Exactly 4 stable ACs and 4 one-to-one mapped TCs are present.
- Initial RED names current residue; it is not an unknown command, import error, timeout, or skipped test.
- The composite verifier aggregates all subgates and cannot pass with empty roots or a zero-file scan.
- Manifest inspection retains a narrow self-reference exception only for verifier script keys; runtime values such as `npx convex dev` remain forbidden.
- The app proof requires a real artifact; the MCP proof starts dist and observes exactly 44 tools.
- No framework, filesystem, build, process, or MCP mocks; no D08-02 cleanup or irreversible operations.
- Child processes are bounded and cleaned up; evidence contains no secret values.
- `validate_scenario.py` reports 4 scenarios and zero CRITICAL/HIGH findings.

--------------------------------------------------------------------------------
CONTEXT
--------------------------------------------------------------------------------

- The current full-root scan counts are app 33, components 0, hooks 13, screens 3, lib 15, and holocron-mcp/src 0: total 64.
- Forbidden dependency keys currently total 8: 7 in root `package.json`, 1 in `services/platform/package.json`, and 0 in `holocron-mcp/package.json`.
- The existing `verify:no-convex-client` passes because it checks only `convex/react` imports in four client roots; it is a pattern source, not the D08 acceptance oracle.
- The existing decommission-inventory command is not the final GREEN oracle because it intentionally fails when `convex/` is absent.
- `lefthook.yml` runs unit tests rather than `tests/integration/**`, allowing honest RED evidence to be committed without weakening pre-commit.
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D08-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "current_convex_residue_checkout": {
      "description": "Tracked pre-D08-02 checkout with real Convex residue",
      "seed_method": "migration_fixture",
      "records": [
        "6 source roots contain 64 Convex hits",
        "3 manifests contain 8 forbidden dependency keys",
        "4 legacy paths are present"
      ]
    },
    "ios_build_host": {
      "description": "Tracked ios project on a real Expo/Xcode build host",
      "seed_method": "cli",
      "records": [
        "package.json build:ios runs expo run:ios",
        "ios project is present"
      ]
    },
    "mcp_built_distribution": {
      "description": "Real holocron-mcp package using its build and start scripts",
      "seed_method": "cli",
      "records": [
        "build runs tsup",
        "start runs dist/mastra/stdio.js",
        "server contract contains 44 tools"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN current residue WHEN the real composite CLI runs THEN it exits 1 with a complete named-residue report.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "SC-UC-SYNC-05-1",
        "use_case_ref": "UC-SYNC-05",
        "ac_ref": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "holo CLI + repository filesystem + Expo/Xcode + built MCP stdio",
        "topology": "single-node",
        "cases": [
          {
            "start_ref": "current_convex_residue_checkout",
            "action": {
              "actor": "cli_user",
              "steps": ["Run ./bin/holo verify:no-convex --json"]
            },
            "end_state": {
              "must_observe": [
                "\"ok\":false",
                "\"source_hit_count\":64",
                "\"forbidden_dependency_count\":8",
                "\"legacy_path_present_count\":4"
              ],
              "must_not_observe": [
                "unknown command",
                "\"ok\":true with 0 findings"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "CLI is a static success stub",
            "scan roots are empty",
            "subprocesses are mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        }
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN all cleanup targets WHEN the repository subgate runs THEN it fails until every target is clean.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "SC-UC-SYNC-05-2",
        "use_case_ref": "UC-SYNC-05",
        "ac_ref": "AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real repository filesystem",
        "topology": "single-node",
        "cases": [
          {
            "start_ref": "current_convex_residue_checkout",
            "action": {
              "actor": "cli_user",
              "steps": ["Run the repository-state subgate through ./bin/holo verify:no-convex --json"]
            },
            "end_state": {
              "must_observe": [
                "\"scanned_root_count\":6",
                "\"package_manifest_count\":3",
                "\"source_hit_count\":64",
                "\"forbidden_dependency_count\":8"
              ],
              "must_not_observe": [
                "\"scanned_root_count\":0",
                "empty findings with \"ok\":true"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "filesystem is mocked",
            "configured root is omitted",
            "static allowlist hides residue"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        }
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a real iOS build host WHEN pnpm build:ios runs THEN exit 0 and a holocron.app artifact are required.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "SC-UC-SYNC-05-3",
        "use_case_ref": "UC-SYNC-05",
        "ac_ref": "AC-3",
        "primary": false,
        "tier": "holdout",
        "test_tier": "e2e",
        "verification_service": "Expo + Xcode",
        "topology": "single-node",
        "cases": [
          {
            "start_ref": "ios_build_host",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run pnpm build:ios",
                "Inspect ios/build for holocron.app/Info.plist"
              ]
            },
            "end_state": {
              "must_observe": [
                "\"build_exit_code\":0",
                "\"holocron_app_artifact_count\":1",
                "\"holocron.app/Info.plist\""
              ],
              "must_not_observe": [
                "\"holocron_app_artifact_count\":0",
                "empty build output"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "build command is stubbed",
            "artifact directory is empty",
            "Xcode process is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        }
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the MCP package WHEN its built distribution starts THEN initialize and tools/list return holocron with 44 tools.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "SC-UC-SYNC-05-4",
        "use_case_ref": "UC-SYNC-05",
        "ac_ref": "AC-4",
        "primary": false,
        "tier": "holdout",
        "test_tier": "integration",
        "verification_service": "built Holocron MCP stdio server",
        "topology": "single-node",
        "cases": [
          {
            "start_ref": "mcp_built_distribution",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run pnpm --dir holocron-mcp build",
                "Spawn pnpm --dir holocron-mcp start",
                "Send initialize, notifications/initialized, and tools/list over stdio"
              ]
            },
            "end_state": {
              "must_observe": [
                "\"build_exit_code\":0",
                "\"serverInfo.name\":\"holocron\"",
                "\"tool_count\":44"
              ],
              "must_not_observe": [
                "\"tool_count\":0",
                "empty server name"
              ]
            }
          }
        ],
        "negative_control": {
          "would_fail_if": [
            "child process is mocked",
            "start command is stubbed",
            "dist output is omitted",
            "tools/list is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        }
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The composite CLI report sets ok:false against the current 64-hit repository.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The cleanup assertion rejects the current 8 forbidden dependency keys.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The app-build assertion accepts a real holocron.app artifact from pnpm build:ios.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The MCP-runtime assertion accepts exactly 44 tools from the built stdio server.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/s32-convex-decommission-oracle.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
