# REDHAT-FIX-H2 — Produce provenance-valid CI-dispatched Maestro evidence and preserve downloadable artifact metadata for the self-hosted lane
> Status: ⛔ Blocked (external: gh/runner/secrets)
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H2 (Critical)

## Outcome

Dispatch a real `ci-e2e.yml` workflow run on the self-hosted macOS runner lane, capture the run metadata + downloadable artifact bundle, and preserve the artifact's name + size + sha256 + run URL in a committed provenance file so D03-05/D03-07 AC-3 (CI capstone reproduction) moves from FAIL to PASS.

**Success state:** A committed `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json` records a real `run_id`, `run_url`, `workflow` (`ci-e2e.yml`), `artifact_name`, `artifact_size_bytes`, `artifact_sha256`, and `conclusion: success`; the downloaded artifact bundle contains real `junit.xml`/screenshot/video files; the capstone verifier (REDHAT-FIX-H1) reproduces `coldboot_gate: green` from the downloaded bundle.

## Background

- **Specialist rationale:** Red-hat H2 (Critical) shows D03-05:28-30,50-54 and D03-07:28-31,106-110 require a CI-dispatched GitHub Actions self-hosted run + downloadable artifact. `gh` is not installed locally; no CI run metadata/artifact is in the repo; `sprint-goal-state.json:119-123` explicitly substitutes local files for the missing CI evidence. Local evidence is not CI evidence.
- **Planning rationale:** This task unblocks D03-05 AC-1/AC-3, D03-06 AC-3, and D03-07 AC-3. Without it, the capstone (H1) cannot satisfy AC-3 ("CI capstone reproduction"). It depends on REDHAT-FIX-H3 (video must finalize) and REDHAT-FIX-H1 (verifier must exist) being complete enough to derive green from the bundle.
- **How to verify (human):** `gh workflow run ci-e2e.yml -f lane=maestro-reference-flow && gh run watch --exit-status`, then `gh run download <run_id> -D .tmp/ci-e2e-download/` and inspect the bundle + run `capstone-verdict.sh --from-ci-artifact`.
- **Scope:** Dispatch + capture + preserve; NOT modifying the workflow YAML (D03-05's job; REDHAT-FIX-H4 may touch it for fork-safety review).
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-05 AC-1/AC-3, D03-06 AC-3, D03-07 AC-3

## Critical Constraints

### MUST
- MUST dispatch `ci-e2e.yml` via `gh workflow run` against the registered self-hosted macOS runner lane and wait for `conclusion: success` via `gh run watch --exit-status`
- MUST download the uploaded artifact bundle via `gh run download <run_id>` and record `run_id`, `run_url`, `artifact_name`, `artifact_size_bytes`, `artifact_sha256` (sha256 of the .zip), and `committed_sha` in `ci-run-provenance.json`
- MUST run the capstone verifier (REDHAT-FIX-H1) against the downloaded bundle and reproduce `coldboot_gate: green` from the bundle's contents, not from the workflow `conclusion`

### NEVER
- NEVER substitute a local `.tmp/maestro-reference-flow*` run for the CI run; the provenance file MUST record a real `run_id` from `gh run list --workflow=ci-e2e.yml --json databaseId,status,conclusion`
- NEVER edit the workflow YAML to force a pass; if the run fails, the fix lives in the substrate tasks (REDHAT-FIX-H3, REDHAT-FIX-H8, etc.), not in CI cosmetics
- NEVER commit artifact binaries into the repository — only the provenance JSON + a small text manifest of bundle contents

### STRICTLY
- STRICTLY the provenance JSON's `committed_sha` MUST match the `git rev-parse HEAD` that the workflow run was dispatched against (recorded via `gh run view --json headSha`)

## Specification

**Objective:** Dispatch `ci-e2e.yml` on the self-hosted macOS runner, capture the artifact bundle, and preserve provenance metadata so D03-05/D03-06/D03-07 CI ACs move from FAIL to PASS.

**Success state:** Committed `ci-run-provenance.json` with real run_id + sha256; capstone verifier reproduces green from the downloaded bundle.

## Acceptance Criteria

### AC-1: ci-e2e.yml dispatched and concluded success on the self-hosted lane [PRIMARY]
**GIVEN:** the self-hosted macOS runner is online (`holo ci runner:status --json --lane e2e` reports `online: true`) and the workflow file `.github/workflows/ci-e2e.yml` exists on `main`
**WHEN:** the operator runs `gh workflow run ci-e2e.yml` and `gh run watch --exit-status`
**THEN:** the run concludes `success`, the artifact bundle `maestro-reference-flow` is uploaded, and a captured `gh run view --json databaseId,status,conclusion,headSha,url` shows `status: completed`, `conclusion: success`, and `headSha` matching `git rev-parse HEAD`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** GitHub Actions self-hosted macOS runner (ci-e2e.yml) + gh CLI
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "GitHub Actions self-hosted macOS runner (ci-e2e.yml) + gh CLI",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-runner", "missing-build"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "ci_runner_online_and_workflow_on_main",
      "action": { "actor": "operator", "steps": ["Run holo ci runner:status --json --lane e2e.", "Run gh workflow run ci-e2e.yml.", "Run gh run watch --exit-status.", "Capture gh run view --json output."] },
      "end_state": {
        "must_observe": ["runner online: true", "workflow conclusion: success", "headSha matches git rev-parse HEAD (40 hex chars)", "artifact maestro-reference-flow uploaded"],
        "must_not_observe": ["workflow conclusion: failure", "empty/start signature: no run_id captured OR conclusion null"]
      }
    }
  ]
}
```

### AC-2: Artifact bundle downloaded with provenance JSON committed
**GIVEN:** AC-1 produced a successful run with uploaded artifact `maestro-reference-flow`
**WHEN:** the operator runs `gh run download <run_id> -n maestro-reference-flow -D .tmp/ci-e2e-download/` and the provenance-capture script
**THEN:** `.tmp/ci-e2e-download/` contains real `junit.xml`, `final.png`, `reference-flow.mov` (each non-zero bytes), AND `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json` is committed with `run_id`, `run_url`, `artifact_name: maestro-reference-flow`, `artifact_size_bytes > 0`, `artifact_sha256` (64 hex chars), `conclusion: success`, `committed_sha` matching HEAD
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** gh CLI + jq + sha256sum
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "gh CLI + jq + sha256sum",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "local-files-substituted"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "ci_run_concluded_success",
      "action": { "actor": "operator", "steps": ["gh run download <run_id> -n maestro-reference-flow -D .tmp/ci-e2e-download/", "Run scripts/e2e/capture-ci-provenance.sh <run_id>."] },
      "end_state": {
        "must_observe": ["ci-run-provenance.json exists and is valid JSON", "run_id is a positive integer", "artifact_name: maestro-reference-flow", "artifact_sha256 matches sha256sum of the downloaded .zip (64 hex chars)", "committed_sha matches git rev-parse HEAD", ".tmp/ci-e2e-download/ contains junit.xml, final.png, reference-flow.mov each > 0 bytes"],
        "must_not_observe": ["empty/start signature: artifact_size_bytes: 0", "ci-run-provenance.json absent OR run_id null", "artifact_sha256 not matching actual .zip"]
      }
    }
  ]
}
```

### AC-3: Capstone verifier reproduces green from the downloaded CI bundle
**GIVEN:** AC-2 downloaded the bundle and REDHAT-FIX-H1's `capstone-verdict.sh` is on `main`
**WHEN:** the operator runs `scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/`
**THEN:** the verifier exits 0 and writes `.tmp/ci-e2e-download/capstone-verdict.json` with `coldboot_gate: green` derived from the bundle's real `junit.xml`/screenshot/video — independently of the GitHub Actions `conclusion` field
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh + downloaded CI artifact bundle
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/capstone-verdict.sh + downloaded CI artifact bundle",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "conclusion-only-pass", "missing-video"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "ci_bundle_downloaded_with_green_artifacts",
      "action": { "actor": "operator", "steps": ["Run capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/.", "Inspect .tmp/ci-e2e-download/capstone-verdict.json."] },
      "end_state": {
        "must_observe": ["exitCode: 0", "coldboot_gate: green", "evidence[].path under .tmp/ci-e2e-download/", "junit_failures: 0"],
        "must_not_observe": ["exitCode != 0", "coldboot_gate: red", "empty/start signature: evidence[] empty OR verdict derived from conclusion field"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | `gh run list --workflow=ci-e2e.yml --json databaseId,status,conclusion` shows at least one `conclusion: success` run for the current HEAD | AC-1 | `gh run list --workflow=ci-e2e.yml --json databaseId,status,conclusion,headSha \| jq -e --arg sha "$(git rev-parse HEAD)" '.[] \| select(.headSha==$sha and .conclusion=="success")'` | happy_path |
| TC-2 | `ci-run-provenance.json` is valid, has all required fields, and `artifact_sha256` matches the downloaded .zip | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2'` | happy_path |
| TC-3 | `capstone-verdict.sh --from-ci-artifact` exits 0 with `coldboot_gate: green` against the downloaded bundle | AC-3 | `scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ && jq -e '.coldboot_gate=="green"' .tmp/ci-e2e-download/capstone-verdict.json` | happy_path |

## Reading List

1. `.github/workflows/ci-e2e.yml` (1-93) [PRIMARY PATTERN] — the workflow being dispatched; defines the artifact upload contract
2. `scripts/e2e/run-maestro-reference-flow.sh` (1-161) — the in-CI entrypoint the workflow invokes
3. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-05-implement-e2e-github-actions-workflow-maestro-lane.md` (28-54) — original CI artifact contract this task satisfies
4. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (36-39) — H2 finding: CI run/artifact not evidenced
5. `docs/ci/macos-e2e-runner.md` — self-hosted runner operations reference

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/capture-ci-provenance.sh (NEW — emits ci-run-provenance.json from a run_id)
- tests/integration/sprint20-ci-e2e-provenance.test.ts (NEW)
- .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json (NEW — committed provenance artifact)

### WRITE-PROHIBITED
- .github/workflows/ci-e2e.yml — owned by D03-05 / REDHAT-FIX-H4; this task only dispatches and observes
- scripts/e2e/run-maestro-reference-flow.sh — owned by D03-03 / REDHAT-FIX-H3
- .tmp/ci-e2e-download/** — binary artifacts, NOT committed (only the provenance JSON is committed)

### Boundaries
- **always:** Record the exact `run_id`, `run_url`, `headSha`, `artifact_sha256` in the provenance file; verify the downloaded bundle's contents before recording green
- **ask_first:** Re-dispatching the workflow if the previous run failed for a known substrate reason
- **never:** Committing the artifact .zip or any binary evidence; recording `conclusion: success` as a substitute for the capstone verifier's `coldboot_gate: green`

## Design

- **references:** .github/workflows/ci-e2e.yml, scripts/e2e/run-maestro-reference-flow.sh, REDHAT-FIX-H1 capstone-verdict.sh
- **pattern:** `capture-ci-provenance.sh <run_id>` runs `gh run view <run_id> --json databaseId,status,conclusion,headSha,url` and `gh run download <run_id> -n maestro-reference-flow -D .tmp/ci-e2e-download/`, computes the sha256 of the bundle, and writes `ci-run-provenance.json` via `jq -n`. The provenance file is the only artifact committed; the binary bundle stays in `.tmp/`.
- **pattern_source:** docs/ci/macos-e2e-runner.md
- **anti_pattern:** Recording `conclusion: success` as the gate verdict without running `capstone-verdict.sh --from-ci-artifact` against the downloaded bundle.

## Agent Assignment

- **implementer:** devops-engineer — owns CI dispatch + provenance capture
- **reviewer:** ghactions-reviewer — verifies provenance fields and that no CI cosmetic edits were made to force a pass

## Verification Gates

- **AC-1 CI dispatch:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-1'` → Exit 0
- **AC-2 provenance captured:** `jq -e '.run_id and .artifact_sha256 and .committed_sha' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json` → Exit 0
- **AC-3 capstone reproduces:** `scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/` → Exit 0; JSON `coldboot_gate: green`
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** REDHAT-FIX-H1 (capstone verifier must exist), REDHAT-FIX-H3 (video must finalize so the bundle isn't partial)
- **blocks:** D03-05 AC-1/AC-3, D03-06 AC-3, D03-07 AC-3, the Sprint-20 close handshake

## Notes

H2 calls out that `gh` is not installed locally — the implementer MUST install it (`brew install gh && gh auth login`) before dispatching. The provenance JSON is the durable evidence; the binary artifact bundle is intentionally NOT committed (size + churn) but MUST be downloadable on demand via the recorded `run_id`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H2",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "ci_runner_online_and_workflow_on_main": {
      "description": "Self-hosted macOS runner is online and ci-e2e.yml is present on main; holo ci runner:status reports online:true.",
      "seed_method": "cli",
      "records": [
        "holo ci runner:status --json --lane e2e reports online:true",
        "test -f .github/workflows/ci-e2e.yml"
      ]
    },
    "ci_run_concluded_success": {
      "description": "A ci-e2e.yml run dispatched against the current HEAD has concluded success and uploaded the maestro-reference-flow artifact.",
      "seed_method": "ci",
      "records": [
        "gh run list --workflow=ci-e2e.yml --json databaseId,conclusion,headSha returns a row with conclusion:success and headSha matching HEAD"
      ]
    },
    "ci_bundle_downloaded_with_green_artifacts": {
      "description": "The maestro-reference-flow artifact bundle has been downloaded to .tmp/ci-e2e-download/ and contains real junit.xml/final.png/reference-flow.mov.",
      "seed_method": "ci",
      "records": [
        ".tmp/ci-e2e-download/junit.xml size > 0",
        ".tmp/ci-e2e-download/final.png size > 0",
        ".tmp/ci-e2e-download/reference-flow.mov size > 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN runner online and workflow on main WHEN operator runs gh workflow run ci-e2e.yml && gh run watch --exit-status THEN run concludes success with headSha matching HEAD and uploads the maestro-reference-flow artifact.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "GitHub Actions self-hosted macOS runner (ci-e2e.yml) + gh CLI",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-runner", "missing-build"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "ci_runner_online_and_workflow_on_main",
            "action": { "actor": "operator", "steps": ["Run holo ci runner:status --json --lane e2e.", "Run gh workflow run ci-e2e.yml.", "Run gh run watch --exit-status.", "Capture gh run view --json output."] },
            "end_state": {
              "must_observe": ["runner online: true", "workflow conclusion: success", "headSha matches git rev-parse HEAD (40 hex chars)", "artifact maestro-reference-flow uploaded"],
              "must_not_observe": ["workflow conclusion: failure", "empty/start signature: no run_id captured OR conclusion null"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN AC-1 succeeded WHEN operator downloads the artifact and runs capture-ci-provenance.sh THEN ci-run-provenance.json is committed with run_id, run_url, artifact_sha256 (64 hex), and committed_sha matching HEAD.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gh CLI + jq + sha256sum",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "local-files-substituted"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "ci_run_concluded_success",
            "action": { "actor": "operator", "steps": ["gh run download <run_id> -n maestro-reference-flow -D .tmp/ci-e2e-download/", "Run scripts/e2e/capture-ci-provenance.sh <run_id>."] },
            "end_state": {
              "must_observe": ["ci-run-provenance.json exists and is valid JSON", "run_id is a positive integer", "artifact_name: maestro-reference-flow", "artifact_sha256 matches sha256sum of the downloaded .zip (64 hex chars)", "committed_sha matches git rev-parse HEAD", ".tmp/ci-e2e-download/ contains junit.xml, final.png, reference-flow.mov each > 0 bytes"],
              "must_not_observe": ["empty/start signature: artifact_size_bytes: 0", "ci-run-provenance.json absent OR run_id null", "artifact_sha256 not matching actual .zip"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN AC-2 downloaded the bundle WHEN operator runs capstone-verdict.sh --from-ci-artifact THEN verifier exits 0 with coldboot_gate: green derived from real bundle artifacts (not the conclusion field).",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/capstone-verdict.sh + downloaded CI artifact bundle",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "conclusion-only-pass", "missing-video"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "ci_bundle_downloaded_with_green_artifacts",
            "action": { "actor": "operator", "steps": ["Run capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/.", "Inspect .tmp/ci-e2e-download/capstone-verdict.json."] },
            "end_state": {
              "must_observe": ["exitCode: 0", "coldboot_gate: green", "evidence[].path under .tmp/ci-e2e-download/", "junit_failures: 0"],
              "must_not_observe": ["exitCode != 0", "coldboot_gate: red", "empty/start signature: evidence[] empty OR verdict derived from conclusion field"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "At least one ci-e2e.yml run for the current HEAD has conclusion: success",
      "verify": "gh run list --workflow=ci-e2e.yml --json databaseId,status,conclusion,headSha | jq -e --arg sha \"$(git rev-parse HEAD)\" '.[] | select(.headSha==$sha and .conclusion==\"success\")'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "ci-run-provenance.json has run_id, artifact_sha256 (64 hex), committed_sha matching HEAD",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "capstone-verdict.sh --from-ci-artifact reproduces coldboot_gate: green from the downloaded bundle",
      "verify": "scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ && jq -e '.coldboot_gate==\"green\"' .tmp/ci-e2e-download/capstone-verdict.json",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
