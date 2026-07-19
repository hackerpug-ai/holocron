# D03-06 — Review e2e workflow + macOS runner trust boundary
> Status: ✅ Completed
> Completed: 2026-07-19T09:03:02Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: ghactions-reviewer
> Estimate: 60 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Prove — or return concrete FAIL findings for — the e2e workflow's real-service authenticity, JUnit/log/video artifact completeness, and the self-hosted macOS runner's fork-PR trust boundary.

**Success state:** `docs/ci/D03-06-adversarial-review.md` records PASS with captured command evidence for every R-item (actionlint, SHA pins, permissions, fork-safety, artifact completeness, no silent retries), backed by a standing `tests/ci/fork-safety.test.ts` regression test — or FAIL items block merge.

## Background

- **Specialist rationale:** ghactions-reviewer performs adversarial security/correctness review of the e2e workflow and macOS runner trust boundary against the GitHub Actions certification security domain and the project's fail-closed rules, mirroring D02-06's review discipline.
- **Planning rationale:** `.github/workflows/ci-e2e.yml` already has a `fork-safety` job that rejects fork PRs before the `e2e` job's secrets/self-hosted compute are granted. This review adversarially proves that boundary holds (via a standing regression test, not just a read-through) and audits actionlint/pins/permissions/artifact completeness from a real completed run.
- **How to verify (human):** Read `docs/ci/D03-06-adversarial-review.md` and confirm every R-item is PASS with captured command output; run `pnpm test -- tests/ci/fork-safety.test.ts` and confirm it passes.
- **Scope:** Review artifact + standing regression test. Does not re-implement `ci-e2e.yml` — FAIL findings route back to D03-05.
- **PRD refs:** T-PLAT-019, UC-SYNC-02

## Critical Constraints

### MUST
- MUST run actionlint and a SHA-pin/permission audit against the real committed ci-e2e.yml and capture the command output in the review artifact
- MUST author `tests/ci/fork-safety.test.ts` as a standing regression test that parses the real committed ci-e2e.yml and evaluates its fork-safety/e2e job if: expressions against both a synthetic fork-PR event and a synthetic same-repo event
- MUST FAIL the review if a completed run's artifact bundle lacks a non-empty junit.xml (>=1 testcase), zero-cache.log, or reference-flow.mov

### NEVER
- NEVER rubber-stamp PASS without captured command output
- NEVER accept floating action tags, unpinned third-party actions, pull_request_target with write, or production-named secrets in ci-e2e.yml
- NEVER rewrite large workflow sections in this review task — file FAIL findings for D03-05 remediation instead

### STRICTLY
- STRICTLY treat continue-on-error on the Maestro run step as an automatic FAIL
- STRICTLY treat this review as FEATURE/red_first because the fork-PR trust boundary is a falsifiable behavioral claim, provable by tests/ci/fork-safety.test.ts — first proven capable of catching a deliberately-weakened guard (RED, against a locally relaxed copy of the e2e job's if: condition) before proven to pass against the real committed workflow (GREEN)

## Specification

**Objective:** Prove — or return concrete FAIL findings for — the e2e workflow's real-service authenticity, JUnit/log/video artifact completeness, and the self-hosted macOS runner's fork-PR trust boundary.

**Success state:** docs/ci/D03-06-adversarial-review.md records PASS with captured command evidence for every R-item (actionlint, SHA pins, permissions, fork-safety, artifact completeness, no silent retries), backed by a standing tests/ci/fork-safety.test.ts regression test — or FAIL items block merge.

## Acceptance Criteria

### AC-1: Fork-PR trust boundary regression test proves no runner/secret access [PRIMARY]
**GIVEN:** synthetic fork-PR and same-repo-PR GitHub event contexts, evaluated against the real committed ci-e2e.yml fork-safety/e2e job if: conditions
**WHEN:** ghactions-reviewer authors tests/ci/fork-safety.test.ts that parses the real YAML and evaluates both jobs' if: expressions against each synthetic event
**THEN:** for the fork event, fork-safety.if evaluates true (guard fires, job runs, exits 1) and e2e.if evaluates false (no secrets/runner access); for the same-repo event, e2e.if evaluates true and fork-safety.if evaluates false
**VERIFY:** `pnpm test -- tests/ci/fork-safety.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest against the real committed .github/workflows/ci-e2e.yml + synthetic GitHub event contexts
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest parsing the real committed workflow YAML",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect the test from the real committed YAML (test a copied/stubbed condition string instead)", "mock the fork event as always-safe", "static/hardcoded assertion that never actually parses the file"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "fork_vs_same_repo_events",
      "action": { "actor": "cli_user", "steps": ["evaluate fork-safety.if and e2e.if against the fork-PR event"] },
      "end_state": { "must_observe": ["fork-safety.if evaluated: true", "e2e.if evaluated: false"], "must_not_observe": ["e2e job runs for fork event", "no if guard present"] }
    },
    {
      "start_ref": "fork_vs_same_repo_events",
      "action": { "actor": "cli_user", "steps": ["evaluate fork-safety.if and e2e.if against the same-repo PR event"] },
      "end_state": { "must_observe": ["e2e.if evaluated: true", "fork-safety.if evaluated: false"], "must_not_observe": ["fork-safety blocks the legitimate same-repo run", "empty/start signature: e2e job skipped (0 steps executed)"] }
    }
  ]
}
```

### AC-2: actionlint-clean + SHA-pin adversarial audit with captured evidence
**GIVEN:** ci-e2e.yml (and scripts/e2e/run-maestro-reference-flow.sh) are committed
**WHEN:** reviewer runs actionlint + a pin audit and records results in docs/ci/D03-06-adversarial-review.md
**THEN:** the review records actionlint exit 0 and zero floating tags with captured command output, or FAIL with file:line if either check fails
**VERIFY:** `test -f docs/ci/D03-06-adversarial-review.md && actionlint .github/workflows/ci-e2e.yml && rg -n 'R-[0-9]+|PASS|FAIL' docs/ci/D03-06-adversarial-review.md`
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
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "ignore actionlint errors"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_run_evidence",
      "action": { "actor": "cli_user", "steps": ["run actionlint against ci-e2e.yml", "run pin audit rg", "write PASS/FAIL with captured output to the review file"] },
      "end_state": { "must_observe": ["`test -f docs/ci/D03-06-adversarial-review.md` exit code: 0", "review file contains the literal string \"actionlint\"", "review file contains the literal string \"SHA pin\""], "must_not_observe": ["overall PASS with actionlint errors", "overall PASS with uses: ...@v4", "empty/start signature: review file byte count 0"] }
    }
  ]
}
```

### AC-3: JUnit/log/video artifact review from a real completed run
**GIVEN:** a completed ci-e2e.yml run whose artifact bundle is downloadable
**WHEN:** reviewer downloads the run's maestro-reference-flow-<run_id> artifact via gh run download and inspects it
**THEN:** the review confirms junit.xml has >=1 testcase, zero-cache.log is non-empty, and reference-flow.mov exists and is non-zero bytes
**VERIFY:** `run_id=$(gh run list --workflow=ci-e2e.yml --limit 1 --json databaseId --jq '.[0].databaseId') && d=$(mktemp -d) && gh run download "$run_id" --name "maestro-reference-flow-$run_id" --dir "$d" && test -s "$d/junit.xml" && test -s "$d/zero-cache.log" && test -s "$d/reference-flow.mov"`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** github-actions-self-hosted-macos-runner (real completed run artifact bundle)
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "real downloaded GH Actions artifact bundle",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "review cites artifacts without downloading/inspecting them"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_run_evidence",
      "action": { "actor": "cli_user", "steps": ["download the most recent ci-e2e.yml run's artifact bundle", "inspect junit.xml/zero-cache.log/reference-flow.mov byte counts"] },
      "end_state": { "must_observe": ["junit.xml testcase count >= 1", "`test -s zero-cache.log` exit code: 0", "reference-flow.mov file size > 0 bytes"], "must_not_observe": ["artifact bundle empty", "junit.xml with 0 testcases"] }
    }
  ]
}
```

### AC-4: Secrets scoping + least-privilege permissions + no silent retries
**GIVEN:** ci-e2e.yml is committed
**WHEN:** reviewer audits permissions, secret references, concurrency, and retry policy
**THEN:** the review requires contents: read only, no pull_request_target, secrets limited to non-production names, a concurrency group present, and no continue-on-error on the Maestro run step
**VERIFY:** `rg -n 'permissions:|concurrency:|pull_request_target|continue-on-error|secrets\.' .github/workflows/ci-e2e.yml docs/ci/D03-06-adversarial-review.md && ! rg -n 'continue-on-error:\s*true' .github/workflows/ci-e2e.yml`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + review artifact
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + review artifact",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "write-all permissions or production secrets accepted"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "e2e_run_evidence",
      "action": { "actor": "cli_user", "steps": ["audit permissions/concurrency/secrets/retry policy across ci-e2e.yml", "write PASS/FAIL with citations to the review file"] },
      "end_state": { "must_observe": ["review file quotes `permissions:\\n  contents: read` verbatim", "review file quotes the `concurrency:` block's `group:` value verbatim", "`rg -c 'PROD_|PRODUCTION_' .github/workflows/ci-e2e.yml` count: 0", "`rg -c 'continue-on-error:\\s*true' .github/workflows/ci-e2e.yml` count: 0"], "must_not_observe": ["PASS with permissions write-all", "PASS with PROD_ secret reference", "PASS with continue-on-error true", "empty/start signature: 0 R-items recorded"] }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | fork-safety.test.ts passes, proving fork PR blocked and same-repo PR allowed | AC-1 | `pnpm test -- tests/ci/fork-safety.test.ts` | happy_path |
| TC-2 | Adversarial review file exists with actionlint evidence | AC-2 | `test -f docs/ci/D03-06-adversarial-review.md && rg -n 'actionlint' docs/ci/D03-06-adversarial-review.md` | happy_path |
| TC-3 | Review confirms non-empty JUnit/log/video artifact from a real run | AC-3 | `rg -n 'junit.xml' docs/ci/D03-06-adversarial-review.md` | error_path |
| TC-4 | Review forbids continue-on-error and production secret names | AC-4 | `! rg -n 'continue-on-error:\s*true' .github/workflows/ci-e2e.yml` | edge |

## Reading List

- `.github/workflows/ci-e2e.yml` (all) — fork-safety/e2e job if: conditions under adversarial review
- `.spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/D02-06-adversarial-review-of-ci-workflows.md` (all) — PRIMARY PATTERN: R-N PASS/FAIL checklist artifact convention this review reuses
- `scripts/e2e/run-maestro-reference-flow.sh` (all) — fail-closed preflight checks and always()-capture cleanup trap under review
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (all) — e2e lane constitution the review verdict is scored against
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` (160-179) — framework adapter table

## Guardrails

### WRITE-ALLOWED
- docs/ci/D03-06-adversarial-review.md (NEW)
- tests/ci/fork-safety.test.ts (NEW)

### WRITE-PROHIBITED
- .github/workflows/ci-e2e.yml large rewrites — file findings for D03-05 remediation instead
- scripts/e2e/run-maestro-reference-flow.sh — remediate via D03-05, not in review
- app/**, services/** — not review scope

### Boundaries
- **always:** Capture raw actionlint/pin-audit/fork-safety-test output in the review, Cite file:line for every FAIL
- **ask_first:** Hotfix of a CRITICAL security hole in-workflow during review (prefer FAIL + D03-05 fix)
- **never:** PASS without evidence, Delete failing checks to make review green

## Design

- **references:** .github/workflows/ci-e2e.yml, .spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/D02-06-adversarial-review-of-ci-workflows.md, brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- **pattern:** `## Verdict: PASS|FAIL` heading, then `### R-1 fork-safety guard — PASS` with captured command output block
- **pattern_source:** .spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/D02-06-adversarial-review-of-ci-workflows.md
- **anti_pattern:** LGTM without running actionlint/pin audit/fork-safety test and capturing command output.

## Agent Assignment

- **implementer:** ghactions-reviewer — adversarial security/correctness review
- **reviewer:** security-reviewer — second-pass on permissions/secret exfil

## Verification Gates

- **AC-1 fork-safety regression test:** `pnpm test -- tests/ci/fork-safety.test.ts` → Exit 0; fork event blocked, same-repo event allowed
- **AC-2 actionlint + pin audit evidence:** `actionlint .github/workflows/ci-e2e.yml` → Exit 0; captured in review file
- **AC-3 artifact completeness from a real run:** `gh run download <run_id> --name maestro-reference-flow-<run_id>` → junit.xml/zero-cache.log/reference-flow.mov all non-empty
- **AC-4 permissions/secrets/concurrency/retry audit:** `rg -n 'permissions:|concurrency:|pull_request_target|continue-on-error|secrets\.' .github/workflows/ci-e2e.yml` → contents:read only; no pull_request_target; no production secrets; no continue-on-error
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only docs/ci/D03-06-adversarial-review.md and tests/ci/fork-safety.test.ts

## Coding Standards

- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md

## Dependencies

- **depends_on:** D03-05
- **blocks:** —

## Notes

Mirrors D02-06's R-N PASS/FAIL checklist convention. The standing `tests/ci/fork-safety.test.ts` regression test is new discipline beyond D02-06 (which was read-through only) — it ensures future edits to ci-e2e.yml re-run this trust-boundary proof in CI, not just at review time.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-06",
  "proposed_by": "ghactions-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fork_vs_same_repo_events": {
      "description": "two synthetic GitHub Actions event payloads: a fork-PR event where pull_request.head.repo.full_name != github.repository, and a same-repo PR event where they match",
      "seed_method": "cli",
      "records": [
        "fork event: head.repo.full_name = attacker/holocron, github.repository = inference1/holocron",
        "same-repo event: head.repo.full_name = inference1/holocron, github.repository = inference1/holocron"
      ]
    },
    "e2e_run_evidence": {
      "description": "a completed ci-e2e.yml workflow run whose maestro-reference-flow-<run_id> artifact is available for download and inspection",
      "seed_method": "cli",
      "records": [
        "gh run list --workflow=ci-e2e.yml --limit 1 returns a completed run with an uploaded artifact"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN synthetic fork-PR and same-repo-PR event contexts WHEN evaluated against the real ci-e2e.yml if: conditions THEN fork events are blocked from e2e access and same-repo events are allowed.",
      "verify": "pnpm test -- tests/ci/fork-safety.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest parsing the real committed workflow YAML",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect the test from the real committed YAML (test a copied/stubbed condition string instead)",
            "mock the fork event as always-safe",
            "static/hardcoded assertion that never actually parses the file"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fork_vs_same_repo_events",
            "action": {
              "actor": "cli_user",
              "steps": [
                "evaluate fork-safety.if and e2e.if against the fork-PR event"
              ]
            },
            "end_state": {
              "must_observe": [
                "fork-safety.if evaluated: true",
                "e2e.if evaluated: false"
              ],
              "must_not_observe": [
                "e2e job runs for fork event",
                "no if guard present"
              ]
            }
          },
          {
            "start_ref": "fork_vs_same_repo_events",
            "action": {
              "actor": "cli_user",
              "steps": [
                "evaluate fork-safety.if and e2e.if against the same-repo PR event"
              ]
            },
            "end_state": {
              "must_observe": [
                "e2e.if evaluated: true",
                "fork-safety.if evaluated: false"
              ],
              "must_not_observe": [
                "fork-safety blocks the legitimate same-repo run",
                "empty/start signature: e2e job skipped (0 steps executed)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN ci-e2e.yml committed WHEN actionlint + pin audit run THEN review records evidence-backed PASS/FAIL.",
      "verify": "test -f docs/ci/D03-06-adversarial-review.md && actionlint .github/workflows/ci-e2e.yml",
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
            "ignore actionlint errors"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_run_evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run actionlint against ci-e2e.yml",
                "run pin audit rg",
                "write PASS/FAIL with captured output to the review file"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test -f docs/ci/D03-06-adversarial-review.md` exit code: 0",
                "review file contains the literal string \"actionlint\"",
                "review file contains the literal string \"SHA pin\""
              ],
              "must_not_observe": [
                "overall PASS with actionlint errors",
                "overall PASS with uses: ...@v4",
                "empty/start signature: review file byte count 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a completed run's artifact bundle WHEN downloaded and inspected THEN junit.xml/zero-cache.log/reference-flow.mov are all non-empty.",
      "verify": "gh run download <run_id> --name maestro-reference-flow-<run_id>",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "real downloaded GH Actions artifact bundle",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "review cites artifacts without downloading/inspecting them"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_run_evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "download the most recent ci-e2e.yml run's artifact bundle",
                "inspect junit.xml/zero-cache.log/reference-flow.mov byte counts"
              ]
            },
            "end_state": {
              "must_observe": [
                "junit.xml testcase count >= 1",
                "`test -s zero-cache.log` exit code: 0",
                "reference-flow.mov file size > 0 bytes"
              ],
              "must_not_observe": [
                "artifact bundle empty",
                "junit.xml with 0 testcases"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN ci-e2e.yml WHEN permissions/secrets/concurrency/retry are audited THEN least-privilege and no production secrets are confirmed.",
      "verify": "rg -n 'permissions:|concurrency:|pull_request_target|continue-on-error|secrets\\.' .github/workflows/ci-e2e.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + review artifact",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "write-all permissions or production secrets accepted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "e2e_run_evidence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "audit permissions/concurrency/secrets/retry policy across ci-e2e.yml",
                "write PASS/FAIL with citations to the review file"
              ]
            },
            "end_state": {
              "must_observe": [
                "review file quotes `permissions:\\n  contents: read` verbatim",
                "review file quotes the `concurrency:` block's `group:` value verbatim",
                "`rg -c 'PROD_|PRODUCTION_' .github/workflows/ci-e2e.yml` count: 0",
                "`rg -c 'continue-on-error:\\s*true' .github/workflows/ci-e2e.yml` count: 0"
              ],
              "must_not_observe": [
                "PASS with permissions write-all",
                "PASS with PROD_ secret reference",
                "PASS with continue-on-error true",
                "empty/start signature: 0 R-items recorded"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "fork-safety.test.ts passes",
      "verify": "pnpm test -- tests/ci/fork-safety.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Review file exists with actionlint evidence",
      "verify": "test -f docs/ci/D03-06-adversarial-review.md && rg -n 'actionlint' docs/ci/D03-06-adversarial-review.md",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Review confirms non-empty artifact from a real run",
      "verify": "rg -n 'junit.xml' docs/ci/D03-06-adversarial-review.md",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Review forbids continue-on-error",
      "verify": "! rg -n 'continue-on-error:\\s*true' .github/workflows/ci-e2e.yml",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
