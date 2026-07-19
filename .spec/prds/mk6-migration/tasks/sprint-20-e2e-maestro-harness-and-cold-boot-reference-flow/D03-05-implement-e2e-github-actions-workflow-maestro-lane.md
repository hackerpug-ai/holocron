# D03-05 — Implement e2e GitHub Actions workflow for the Maestro lane
> Status: ✅ Completed
> Completed: 2026-07-19T09:03:02Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: ghactions-implementer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Land (harden) an actionlint-clean, SHA-pinned `.github/workflows/ci-e2e.yml` that runs the Maestro cold-boot reference flow on the self-hosted macOS [self-hosted, holocron, e2e] runner, fails closed on missing device/build/backend prerequisites and on fork PRs, and always uploads a JUnit+log+video artifact bundle.

**Success state:** A workflow_dispatch (or same-repo PR touching app/**) run of ci-e2e.yml completes on the registered macOS runner and its maestro-reference-flow-<run_id> artifact contains a non-empty junit.xml, zero-cache.log, and reference-flow.mov — on both passing and deliberately-broken runs.

## Background

- **Specialist rationale:** ghactions-implementer writes/hardens validated e2e workflow YAML with actionlint, SHA pinning, fail-closed fork-safety, and real Maestro/Zero/Postgres/fleet wiring — the same specialization D02-05 used for the fast/integration lanes.
- **Planning rationale:** `.github/workflows/ci-e2e.yml` already exists and is substantially complete: a `fork-safety` job that rejects fork PRs, an `e2e` job on `[self-hosted, holocron, e2e]` with real secrets/vars, prerequisite checks (`scripts/e2e/run-maestro-reference-flow.sh --check`), the real run, and `if: always()` artifact upload. This task proves it actually runs green on the self-hosted runner (not just syntactically valid) and closes any remaining gaps.
- **How to verify (human):** Dispatch `ci-e2e.yml` via `gh workflow run` and confirm the run completes with a downloadable artifact containing a non-empty junit.xml, zero-cache.log, and reference-flow.mov.
- **Scope:** `.github/workflows/ci-e2e.yml`, `scripts/e2e/run-maestro-reference-flow.sh` (hardening only where CI wiring requires it), `.e2e/maestro/*.yaml` (existing flows only). Does not touch `ci-fast.yml`/`ci-integration.yml` or app code.
- **PRD refs:** T-PLAT-019, UC-SYNC-02

## Critical Constraints

### MUST
- MUST prove the PRIMARY AC via an actual completed run of ci-e2e.yml on the registered self-hosted macOS [self-hosted, holocron, e2e] runner (workflow_dispatch or same-repo PR) — a syntactically-valid YAML file with no executed run does not satisfy AC-1
- MUST upload the JUnit XML, zero-cache.log, and reference-flow.mov artifact bundle on both success and failure runs (if: always()) so the sprint gate's "Check CI artifacts" step always has evidence to inspect
- MUST keep the workflow SHA-pinned and actionlint-clean; no floating action tags

### NEVER
- NEVER let the e2e job execute for a pull_request whose head repo differs from the base repo — the fork-safety job must reject it before secrets or self-hosted compute are granted
- NEVER substitute a mocked Zero cache, mocked Postgres, mocked fleet, or a pre-baked junit.xml for the real cold-boot flow
- NEVER set continue-on-error: true on the Maestro run step or silently retry a flaky run

### STRICTLY
- STRICTLY keep permissions: contents: read and a concurrency group scoped per ref/PR so a superseding push cancels but never leaves an orphan simulator/Zero-cache process running
- STRICTLY reuse the D02-03 runner labels [self-hosted, holocron, e2e] and the D02-05 fail-closed fork-safety pattern rather than inventing a new convention

## Specification

**Objective:** Land (harden) an actionlint-clean, SHA-pinned .github/workflows/ci-e2e.yml that runs the Maestro cold-boot reference flow on the self-hosted macOS [self-hosted, holocron, e2e] runner, fails closed on missing device/build/backend prerequisites and on fork PRs, and always uploads a JUnit+log+video artifact bundle.

**Success state:** A workflow_dispatch (or same-repo PR touching app/**) run of ci-e2e.yml completes on the registered macOS runner and its maestro-reference-flow-<run_id> artifact contains a non-empty junit.xml, zero-cache.log, and reference-flow.mov — on both passing and deliberately-broken runs.

## Acceptance Criteria

### AC-1: Real e2e run produces the JUnit+log+video artifact bundle [PRIMARY]
**GIVEN:** ci-e2e.yml committed on the self-hosted macOS [self-hosted, holocron, e2e] runner with real nonprod secrets/vars configured and no prior successful run
**WHEN:** an operator triggers workflow_dispatch (or opens a same-repo PR touching app/**) and the Maestro cold-boot reference flow executes on the named iOS Simulator
**THEN:** the run completes and its uploaded maestro-reference-flow-<run_id> artifact contains a non-empty junit.xml (>=1 testcase), zero-cache.log, and reference-flow.mov
**VERIFY:** `gh workflow run ci-e2e.yml --ref "$(git rev-parse --abbrev-ref HEAD)" && run_id=$(gh run list --workflow=ci-e2e.yml --limit 1 --json databaseId --jq '.[0].databaseId') && gh run watch "$run_id" --exit-status && d=$(mktemp -d) && gh run download "$run_id" --name "maestro-reference-flow-$run_id" --dir "$d" && test -s "$d/junit.xml" && test -s "$d/zero-cache.log" && test -s "$d/reference-flow.mov"`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** github-actions-self-hosted-macos-runner (real Maestro + real iOS Simulator + real Zero cache + real nonprod Postgres + real fleet)
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "github-actions-self-hosted-macos-runner",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "pre-baked junit.xml checked into repo instead of produced by the run"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_lane_registered",
      "action": { "actor": "cli_user", "steps": ["gh workflow run ci-e2e.yml on the mk6 branch", "gh run watch to completion", "gh run download the maestro-reference-flow-<run_id> artifact"] },
      "end_state": {
        "must_observe": ["run conclusion: success", "junit.xml testcase count >= 1", "`test -s zero-cache.log` exit code: 0", "reference-flow.mov file size > 0 bytes"],
        "must_not_observe": ["artifact bundle empty", "junit.xml with 0 <testcase> entries", "run conclusion: skipped"]
      }
    }
  ]
}
```

### AC-2: Fail-closed preflight without real device/build/backend prerequisites
**GIVEN:** one real prerequisite deliberately broken (EXPO_DEV_BUILD_PATH pointed at a nonexistent path)
**WHEN:** the same preflight the workflow's "Check real device, build, and backend prerequisites" step invokes runs standalone
**THEN:** the script exits 1 naming the missing prerequisite and never prints the ok:true readiness line, so the workflow job fails before any Maestro/simulator step runs
**VERIFY:** `EXPO_DEV_BUILD_PATH=/nonexistent/build.app scripts/e2e/run-maestro-reference-flow.sh --check; test $? -eq 1`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real preflight script against real nonprod prerequisites with one deliberately broken
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real preflight script (scripts/e2e/run-maestro-reference-flow.sh --check)",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "preflight always returns ok:true"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_lane_registered",
      "action": { "actor": "cli_user", "steps": ["export real secrets/vars except point EXPO_DEV_BUILD_PATH at a nonexistent path", "run scripts/e2e/run-maestro-reference-flow.sh --check"] },
      "end_state": { "must_observe": ["exit code: 1", "stderr contains the literal string \"Expo development build does not exist\""], "must_not_observe": ["exit code: 0", "ok true readiness line printed"] }
    }
  ]
}
```

### AC-3: Artifacts upload on failure too
**GIVEN:** the reference flow's chat-assistant-message testID renamed so the cold-boot reply never appears
**WHEN:** `scripts/e2e/run-maestro-reference-flow.sh --run` executes the broken flow on the real simulator/app
**THEN:** the Maestro step fails but junit.xml still records >=1 failing testcase, and zero-cache.log + reference-flow.mov are still captured because artifact upload runs on if: always() and the EXIT trap always stops recording and screenshots
**VERIFY:** `cp .e2e/maestro/reference-flow.yaml /tmp/reference-flow.yaml.bak; sed -i '' 's/chat-assistant-message/chat-assistant-message-absent/' .e2e/maestro/reference-flow.yaml; E2E_ARTIFACT_DIR=/tmp/e2e-ac3 scripts/e2e/run-maestro-reference-flow.sh --run; cp /tmp/reference-flow.yaml.bak .e2e/maestro/reference-flow.yaml; test -s /tmp/e2e-ac3/junit.xml && grep -q 'failures="[1-9]' /tmp/e2e-ac3/junit.xml`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** real Maestro run on the self-hosted macOS runner + real iOS Simulator, deliberately broken flow
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "github-actions-self-hosted-macos-runner (deliberately-broken run)",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "artifact upload step conditioned on success() only"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_lane_broken_flow",
      "action": { "actor": "cli_user", "steps": ["mutate the testID reference-flow.yaml waits on", "run scripts/e2e/run-maestro-reference-flow.sh --run against the real simulator/app"] },
      "end_state": { "must_observe": ["junit.xml failures count >= 1", "`test -s zero-cache.log` exit code: 0", "reference-flow.mov file size > 0 bytes"], "must_not_observe": ["junit.xml missing on failure", "zero-cache.log empty", "reference-flow.mov absent"] }
    }
  ]
}
```

### AC-4: actionlint-clean + SHA-pinned + least-privilege scaffolding
**GIVEN:** ci-e2e.yml is committed
**WHEN:** operator runs actionlint and a pin/permission/concurrency audit
**THEN:** actionlint exits 0, every uses: line pins a 40-char SHA, permissions is contents: read only, and a per-ref concurrency group is present
**VERIFY:** `actionlint .github/workflows/ci-e2e.yml && ! rg -n 'uses: [^\n]+@(v[0-9]|main|master|latest)' .github/workflows/ci-e2e.yml`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** actionlint CLI + filesystem
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "actionlint CLI + filesystem",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "floating tag or write-all permissions"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_lane_registered",
      "action": { "actor": "cli_user", "steps": ["run actionlint against ci-e2e.yml", "grep for floating tags and confirm SHA pins/permissions/concurrency"] },
      "end_state": { "must_observe": ["actionlint exitCode: 0", "uses lines with 40-char SHA", "permissions contents: read", "`concurrency:` block matches regex `group:\\s*\\S+` (count >= 1)"], "must_not_observe": ["uses: actions/checkout@v4", "permissions: write-all", "no concurrency block"] }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | ci-e2e.yml workflow run completes successfully and uploads maestro-reference-flow-<run_id> artifact | AC-1 | `run_id=$(gh run list --workflow=ci-e2e.yml --limit 1 --json databaseId,conclusion --jq '.[0] \| select(.conclusion=="success") \| .databaseId') && test -n "$run_id"` | happy_path |
| TC-2 | Preflight --check exits 1 when EXPO_DEV_BUILD_PATH is missing/invalid | AC-2 | `EXPO_DEV_BUILD_PATH=/nonexistent scripts/e2e/run-maestro-reference-flow.sh --check; test $? -eq 1` | error_path |
| TC-3 | Artifact bundle contains a failing testcase and full log/video set when the flow is deliberately broken | AC-3 | `grep -q 'failures="[1-9]' /tmp/e2e-ac3/junit.xml` | edge |
| TC-4 | actionlint exits 0 on ci-e2e.yml | AC-4 | `actionlint .github/workflows/ci-e2e.yml` | error_path |
| TC-5 | No floating action tags remain in ci-e2e.yml | AC-4 | `! rg -n 'uses: [^\n]+@(v[0-9]\|main\|master\|latest)' .github/workflows/ci-e2e.yml` | edge |

## Reading List

- `.github/workflows/ci-e2e.yml` (all) — existing e2e workflow scaffold/implementation to harden
- `.github/workflows/ci-integration.yml` (1-99) — Sprint 13 fail-closed self-hosted + fork-safety + SHA-pin convention this task extends to e2e
- `scripts/e2e/run-maestro-reference-flow.sh` (all) — real preflight/run/always-capture contract the workflow invokes
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (all) — e2e lane constitution + proven-reference-flow gate requirements
- `.spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/D02-05-implement-fast-integration-github-actions-workflows.md` (40-120) — established fail-closed self-hosted integration AC pattern this task mirrors for e2e

## Guardrails

### WRITE-ALLOWED
- .github/workflows/ci-e2e.yml (MODIFY)
- scripts/e2e/run-maestro-reference-flow.sh (MODIFY)
- .e2e/maestro/*.yaml (MODIFY existing flows only)
- docs/ci/lane-architecture.md (MODIFY e2e section only)

### WRITE-PROHIBITED
- .github/workflows/ci-fast.yml — Sprint 13 scope, not this task
- .github/workflows/ci-integration.yml — Sprint 13 scope, not this task
- app/** — RN testID wiring is rn-s20 scope
- services/platform/src/** beyond the existing holo CLI subcommands already invoked by the script
- .spec/prds/mk6-migration/tasks/sprint-13-*/** — immutable prior evidence

### Boundaries
- **always:** Reuse the exact fork-safety if: pattern already proven in ci-integration.yml, Keep the artifact upload step's if: always()
- **ask_first:** Any change to secret names or scopes
- **never:** Uploading artifacts only if: success(), Letting the e2e job's if: fall back to true for any pull_request regardless of fork origin

## Design

- **references:** .github/workflows/ci-e2e.yml, .github/workflows/ci-integration.yml, scripts/e2e/run-maestro-reference-flow.sh, 10-e2e-testing.md
- **pattern:** `uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1` ; `if: github.event.pull_request.head.repo.full_name != github.repository`
- **pattern_source:** .github/workflows/ci-integration.yml:24-33
- **anti_pattern:** Uploading artifacts only if: success(), or letting the e2e job's if: fall back to true for any pull_request regardless of fork origin.

## Agent Assignment

- **implementer:** ghactions-implementer — writes/hardens the e2e workflow YAML
- **reviewer:** ghactions-reviewer — adversarial security/correctness review (D03-06)

## Verification Gates

- **AC-1 real e2e run + artifact bundle:** `gh workflow run ci-e2e.yml --ref <branch> && gh run watch <run_id> --exit-status && gh run download <run_id>` → Exit 0; junit.xml/zero-cache.log/reference-flow.mov all non-empty
- **AC-2 fail-closed preflight:** `EXPO_DEV_BUILD_PATH=/nonexistent scripts/e2e/run-maestro-reference-flow.sh --check` → Exit 1 before any Maestro/simulator step runs
- **AC-3 artifacts uploaded on failure too:** `scripts/e2e/run-maestro-reference-flow.sh --run` against a deliberately-broken flow → junit.xml records >=1 failure; log+video still captured
- **AC-4 actionlint + SHA-pin + least-privilege:** `actionlint .github/workflows/ci-e2e.yml` → Exit 0; no floating tags; contents:read; concurrency group present
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only .github/workflows/ci-e2e.yml, scripts/e2e/**, .e2e/maestro/**, docs/ci/lane-architecture.md

## Coding Standards

- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md

## Dependencies

- **depends_on:** —
- **blocks:** D03-06

## Notes

`.github/workflows/ci-e2e.yml` is already committed and substantially implements this task's scope (fork-safety job, self-hosted runner, fail-closed preflight, always()-conditioned artifact upload). This task's job is to PROVE it via an actual green (and actual deliberately-broken) run, not to author from scratch.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-05",
  "proposed_by": "ghactions-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "e2e_lane_registered": {
      "description": "ci-e2e.yml + scripts/e2e/run-maestro-reference-flow.sh + .e2e/maestro/reference-flow.yaml committed; self-hosted [self-hosted, holocron, e2e] macOS runner registered; MAESTRO_DEVICE/EXPO_DEV_BUILD_PATH/MAESTRO_APP_ID vars and NONPROD_DATABASE_URL/FLEET_URL/PLATFORM_URL/RN_API_KEY/ZERO_ADMIN_PASSWORD secrets configured",
      "seed_method": "cli",
      "records": [
        "gh run list --workflow=ci-e2e.yml returns runs",
        "runner labels [self-hosted, holocron, e2e] registered and idle"
      ]
    },
    "e2e_lane_broken_flow": {
      "description": "reference-flow.yaml with chat-assistant-message testID renamed to a nonexistent id, so the cold-boot chat reply never appears and the Maestro step must fail while still emitting evidence",
      "seed_method": "cli",
      "records": [
        "reference-flow.yaml mutated copy referencing chat-assistant-message-absent"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN ci-e2e.yml committed on the self-hosted macOS runner with real secrets/vars WHEN an operator triggers workflow_dispatch THEN the run completes and its artifact contains non-empty junit.xml/zero-cache.log/reference-flow.mov.",
      "verify": "gh workflow run ci-e2e.yml --ref \"$(git rev-parse --abbrev-ref HEAD)\" && gh run watch <run_id> --exit-status && gh run download <run_id>",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "github-actions-self-hosted-macos-runner",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "pre-baked junit.xml checked into repo instead of produced by the run"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_lane_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "gh workflow run ci-e2e.yml on the mk6 branch",
                "gh run watch to completion",
                "gh run download the maestro-reference-flow-<run_id> artifact"
              ]
            },
            "end_state": {
              "must_observe": [
                "run conclusion: success",
                "junit.xml testcase count >= 1",
                "`test -s zero-cache.log` exit code: 0",
                "reference-flow.mov file size > 0 bytes"
              ],
              "must_not_observe": [
                "artifact bundle empty",
                "junit.xml with 0 <testcase> entries",
                "run conclusion: skipped"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN one prerequisite deliberately broken WHEN the preflight runs standalone THEN it exits 1 naming the missing prerequisite.",
      "verify": "EXPO_DEV_BUILD_PATH=/nonexistent/build.app scripts/e2e/run-maestro-reference-flow.sh --check; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real preflight script (scripts/e2e/run-maestro-reference-flow.sh --check)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "preflight always returns ok:true"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_lane_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "export real secrets/vars except point EXPO_DEV_BUILD_PATH at a nonexistent path",
                "run scripts/e2e/run-maestro-reference-flow.sh --check"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code: 1",
                "stderr contains the literal string \"Expo development build does not exist\""
              ],
              "must_not_observe": [
                "exit code: 0",
                "ok true readiness line printed"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the flow deliberately broken WHEN the harness runs THEN junit.xml still records a failure and log/video are still captured.",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run against broken flow; test -s junit.xml && grep -q 'failures=\"[1-9]' junit.xml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "github-actions-self-hosted-macos-runner (deliberately-broken run)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "artifact upload step conditioned on success() only"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_lane_broken_flow",
            "action": {
              "actor": "cli_user",
              "steps": [
                "mutate the testID reference-flow.yaml waits on",
                "run scripts/e2e/run-maestro-reference-flow.sh --run against the real simulator/app"
              ]
            },
            "end_state": {
              "must_observe": [
                "junit.xml failures count >= 1",
                "`test -s zero-cache.log` exit code: 0",
                "reference-flow.mov file size > 0 bytes"
              ],
              "must_not_observe": [
                "junit.xml missing on failure",
                "zero-cache.log empty",
                "reference-flow.mov absent"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN ci-e2e.yml committed WHEN actionlint/pin audit runs THEN it exits 0 with no floating tags and least-privilege permissions.",
      "verify": "actionlint .github/workflows/ci-e2e.yml && ! rg -n 'uses: [^\\n]+@(v[0-9]|main|master|latest)' .github/workflows/ci-e2e.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "actionlint CLI + filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "floating tag or write-all permissions"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_lane_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run actionlint against ci-e2e.yml",
                "grep for floating tags and confirm SHA pins/permissions/concurrency"
              ]
            },
            "end_state": {
              "must_observe": [
                "actionlint exitCode: 0",
                "uses lines with 40-char SHA",
                "permissions contents: read",
                "`concurrency:` block matches regex `group:\\s*\\S+` (count >= 1)"
              ],
              "must_not_observe": [
                "uses: actions/checkout@v4",
                "permissions: write-all",
                "no concurrency block"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "ci-e2e.yml run completes successfully with uploaded artifact",
      "verify": "gh run list --workflow=ci-e2e.yml --limit 1 --json databaseId,conclusion",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Preflight exits 1 with missing dev build",
      "verify": "EXPO_DEV_BUILD_PATH=/nonexistent scripts/e2e/run-maestro-reference-flow.sh --check; test $? -eq 1",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Broken-flow run still finalizes junit/log/video with failures recorded",
      "verify": "grep -q 'failures=\"[1-9]' /tmp/e2e-ac3/junit.xml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "actionlint exits 0 on ci-e2e.yml",
      "verify": "actionlint .github/workflows/ci-e2e.yml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "No floating action tags in ci-e2e.yml",
      "verify": "! rg -n 'uses: [^\\n]+@(v[0-9]|main|master|latest)' .github/workflows/ci-e2e.yml",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
