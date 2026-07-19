# REDHAT-FIX-H4 — Add the required D03-06 adversarial review artifact and executable fork-safety test, with actionlint evidence or an equivalent fail-closed check
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: ghactions-implementer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H4 (High)

## Outcome

`docs/ci/D03-06-adversarial-review.md` and `tests/ci/fork-safety.test.ts` both exist on `main`; the test runs as part of the CI fast lane and asserts the fork-vs-same-repository expression behavior of `ci-e2e.yml` (and the broader sprint-20 workflow set); an actionlint result (or an equivalent structural fail-closed schema check) is captured in the review artifact so the trust-boundary review is a standing, replayable check.

**Success state:** `test -f docs/ci/D03-06-adversarial-review.md && test -f tests/ci/fork-safety.test.ts && PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` all pass; the review doc records the actionlint (or equivalent) run with timestamp + workflow SHA + verdict; the test asserts that secrets/permissions differ between the fork and same-repo branches per the documented trust boundary.

## Background

- **Specialist rationale:** Red-hat H4 (High) shows D03-06:16,28-31,50-54,83-87 requires `docs/ci/D03-06-adversarial-review.md` and `tests/ci/fork-safety.test.ts`. Both paths are absent. `actionlint` is unavailable locally, so the required captured result cannot be reconstructed without an equivalent fail-closed check.
- **Planning rationale:** This task is the trust-boundary review for the entire sprint-20 CI lane (D03-05) — without it, a fork PR could trigger the self-hosted runner with the same secrets as a same-repo run, an H4-class supply-chain risk. It gates D03-06 moving from FAIL to PASS.
- **How to verify (human):** `cat docs/ci/D03-06-adversarial-review.md` shows the review with actionlint verdict; `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` runs the test and it passes against the current workflow YAML.
- **Scope:** New review doc + new test + (optionally) a structural schema check. Does NOT modify the workflow YAML itself (D03-05's job; remediation of YAML issues is a follow-up task).
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-06 AC-1/AC-2/AC-4

## Critical Constraints

### MUST
- MUST add `docs/ci/D03-06-adversarial-review.md` covering: workflow trust boundary, secrets/permissions/concurrency/retry audit, actionlint (or equivalent) verdict, and the named risks of the self-hosted macOS runner lane
- MUST add `tests/ci/fork-safety.test.ts` that asserts fork-vs-same-repo expression behavior on the sprint-20 workflow set (`ci-e2e.yml` + any reusable workflows it calls) — including the `pull_request_target`/`workflow_dispatch` trust boundary, `permissions:` blocks, and `secrets:` inheritance
- MUST run actionlint (preferred) OR an equivalent fail-closed structural schema check (e.g. `jsonschema` validation against the GitHub Actions workflow schema) and capture its output (timestamp + workflow SHA + verdict) inside the review doc

### NEVER
- NEVER relax workflow permissions or remove a concurrency group to make the test pass; if the workflow is genuinely unsafe, fix the workflow (D03-05 follow-up), not the test
- NEVER mark the review complete without a recorded actionlint (or equivalent) verdict — a prose-only review is the bug this task exists to fix

### STRICTLY
- STRICTLY the fork-safety test must FAIL (RED) against a deliberately weakened workflow fixture (e.g. one missing the `if: github.event.pull_request.head.repo.full_name == github.repository` guard) before it PASSES (GREEN) against the real `ci-e2e.yml`

## Specification

**Objective:** Add the D03-06 adversarial review artifact and the executable fork-safety test, with actionlint or equivalent evidence, so D03-06 moves from FAIL to PASS.

**Success state:** Both files exist, test passes against real workflow YAML, review doc carries the actionlint verdict.

## Acceptance Criteria

### AC-1: Fork-safety test exists and passes against real ci-e2e.yml [PRIMARY]
**GIVEN:** `.github/workflows/ci-e2e.yml` exists on `main` and declares its trigger, permissions, and concurrency
**WHEN:** the operator runs `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts`
**THEN:** the test parses the workflow YAML, asserts the trust-boundary expression is present (e.g. the `pull_request_target`/`workflow_dispatch` guards, `permissions: contents: read`, the concurrency group, and the secrets inheritance rule), and exits 0
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + js-yaml + GitHub Actions workflow schema
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + js-yaml + GitHub Actions workflow schema",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "missing-guard", "missing-permissions"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "ci_e2e_workflow_on_main",
      "action": { "actor": "operator", "steps": ["Run pnpm vitest run tests/ci/fork-safety.test.ts.", "Inspect the test report."] },
      "end_state": {
        "must_observe": ["tests/ci/fork-safety.test.ts exists", "test passes (exitCode: 0)", "test report asserts >= 4 distinct properties: trigger guard, permissions block, concurrency group, secrets inheritance"],
        "must_not_observe": ["empty/start signature: test file absent OR test skipped", "test passes with a weakened fixture"]
      }
    }
  ]
}
```

### AC-2: Fork-safety test RED-then-GREEN against a weakened fixture
**GIVEN:** the test is wired to a `weakened.yaml` fixture in `tests/ci/fixtures/` that has the `permissions:` block removed (or the trust-boundary `if:` removed)
**WHEN:** the operator runs the test against the weakened fixture
**THEN:** the test FAILS (exit non-zero) with a message naming the missing guard; then the operator runs the test against the real `ci-e2e.yml` and it PASSES — proving the test is not a stub
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts -t 'weakened_fixture'` (expect non-zero) `&& PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` (expect zero)
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + fixture comparison
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + fixture comparison",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "weakened_workflow_fixture_present",
      "action": { "actor": "operator", "steps": ["Run the test against tests/ci/fixtures/ci-e2e.weakened.yaml.", "Run the test against the real .github/workflows/ci-e2e.yml."] },
      "end_state": {
        "must_observe": ["test against weakened fixture: exitCode != 0 with message naming missing guard", "test against real workflow: exitCode: 0"],
        "must_not_observe": ["empty/start signature: both runs pass", "test passes against the weakened fixture"]
      }
    }
  ]
}
```

### AC-3: D03-06 adversarial review doc exists with actionlint verdict
**GIVEN:** actionlint is installed (`brew install actionlint`) OR an equivalent structural schema check is available; the current workflow SHA is `git rev-parse HEAD`
**WHEN:** the operator runs `actionlint .github/workflows/ci-e2e.yml` (or the equivalent schema check)
**THEN:** `docs/ci/D03-06-adversarial-review.md` exists and records: the workflow path, the workflow SHA, the actionlint verdict (PASS/FAIL with output excerpt), the secrets/permissions/concurrency/retry audit table, and the trust-boundary conclusion
**VERIFY:** `test -f docs/ci/D03-06-adversarial-review.md && rg -q 'actionlint' docs/ci/D03-06-adversarial-review.md && rg -q 'workflow_sha|workflow SHA|`sha`:' docs/ci/D03-06-adversarial-review.md`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** actionlint + manual review record
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "actionlint + manual review record",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "prose-only"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "actionlint_installed_and_workflow_on_main",
      "action": { "actor": "operator", "steps": ["Run actionlint .github/workflows/ci-e2e.yml.", "Write the review doc with the verdict."] },
      "end_state": {
        "must_observe": ["docs/ci/D03-06-adversarial-review.md exists", "doc contains the substring 'actionlint'", "doc records a workflow SHA matching git rev-parse HEAD", "doc has a secrets/permissions/concurrency/retry audit table"],
        "must_not_observe": ["empty/start signature: doc absent OR no actionlint mention OR no workflow SHA"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | `tests/ci/fork-safety.test.ts` exists and passes against real `ci-e2e.yml` | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` | happy_path |
| TC-2 | The test fails RED against `tests/ci/fixtures/ci-e2e.weakened.yaml` and passes GREEN against the real workflow | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts -t 'weakened_fixture'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` | error |
| TC-3 | `docs/ci/D03-06-adversarial-review.md` exists with an actionlint verdict and workflow SHA | AC-3 | `test -f docs/ci/D03-06-adversarial-review.md && rg -q 'actionlint' docs/ci/D03-06-adversarial-review.md && rg -q '$(git rev-parse HEAD \| cut -c1-12)' docs/ci/D03-06-adversarial-review.md` | happy_path |

## Reading List

1. `.github/workflows/ci-e2e.yml` (1-93) [PRIMARY PATTERN] — the workflow under review
2. `docs/ci/D02-06-adversarial-review.md` (full) — the existing pattern for an adversarial review artifact (D02-06 set the precedent)
3. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-06-review-e2e-workflow-macos-runner-trust-boundary.md` (16,28-31,50-54,83-87) — original D03-06 AC contract
4. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (48-51) — H4 finding: review doc + test absent
5. `docs/ci/runner-labels.md` + `docs/ci/self-hosted-runner.md` — trust-boundary context

## Guardrails

### WRITE-ALLOWED
- tests/ci/fork-safety.test.ts (NEW)
- tests/ci/fixtures/ci-e2e.weakened.yaml (NEW — deliberately weakened fixture for the RED case)
- docs/ci/D03-06-adversarial-review.md (NEW)
- package.json (MODIFY — only if adding the test script; do NOT add new runtime deps)

### WRITE-PROHIBITED
- .github/workflows/ci-e2e.yml — owned by D03-05; if the review surfaces issues, file a follow-up task
- .github/workflows/ci-fast.yml, ci-integration.yml — out of scope (this task is sprint-20 D03-06 only)
- services/platform/** — no source changes; this is a CI trust-boundary review

### Boundaries
- **always:** Run the test against BOTH the real workflow and the weakened fixture; record the actionlint (or equivalent) verdict with a workflow SHA
- **ask_first:** Installing actionlint via brew if unavailable (yes — required for AC-3); switching to a structural schema check if actionlint cannot be installed in CI
- **never:** Relaxing workflow permissions to make the test pass; recording a prose-only review without an actionlint (or equivalent) verdict

## Design

- **references:** docs/ci/D02-06-adversarial-review.md, .github/workflows/ci-e2e.yml
- **pattern:** Vitest + js-yaml parses the workflow YAML; assertions cover (a) `on.pull_request_target` is absent OR has an `if:` guard restricting to same-repo, (b) `permissions:` is `contents: read` (least-privilege), (c) `concurrency:` group is present and scoped, (d) `secrets:` inheritance does not propagate privileged secrets to fork contexts. The weakened fixture strips the `permissions:` block to prove the test catches it.
- **pattern_source:** docs/ci/D02-06-adversarial-review.md
- **anti_pattern:** A test that only checks `on:` exists without asserting the trust-boundary guards — that passes for any workflow, including an unsafe one.

## Agent Assignment

- **implementer:** ghactions-implementer — owns the fork-safety test + review doc
- **reviewer:** ghactions-reviewer — adversarially validates the test catches the documented risks; verifies the actionlint verdict is real

## Verification Gates

- **AC-1 fork-safety test:** `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` → Exit 0
- **AC-2 RED vs GREEN:** `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts -t 'weakened_fixture'` (non-zero) THEN `PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts` (zero)
- **AC-3 review doc:** `test -f docs/ci/D03-06-adversarial-review.md && rg -q 'actionlint' docs/ci/D03-06-adversarial-review.md`
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-05 (owns the workflow under review), D03-06 (defines the contract this task fulfills)
- **blocks:** D03-06 AC-1/AC-2, the Sprint-20 close handshake

## Notes

If `actionlint` cannot be installed in the operator's environment, the implementer MUST substitute an equivalent structural fail-closed check (e.g. `jsonschema` validation against the official GitHub Actions workflow JSON schema) and document the substitution in the review doc. A prose-only review is the bug this task exists to fix.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H4",
  "proposed_by": "ghactions-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "ci_e2e_workflow_on_main": {
      "description": "The current .github/workflows/ci-e2e.yml on main with its trust-boundary guards, permissions: contents: read, concurrency group, and secrets inheritance all in place.",
      "seed_method": "git_head",
      "records": [
        ".github/workflows/ci-e2e.yml exists",
        "permissions: contents: read present",
        "concurrency: group present"
      ]
    },
    "weakened_workflow_fixture_present": {
      "description": "tests/ci/fixtures/ci-e2e.weakened.yaml is a copy of ci-e2e.yml with the permissions: block (or the trust-boundary if: guard) removed, to prove the fork-safety test catches the regression.",
      "seed_method": "fixture",
      "records": [
        "tests/ci/fixtures/ci-e2e.weakened.yaml exists",
        "permissions: block deliberately stripped"
      ]
    },
    "actionlint_installed_and_workflow_on_main": {
      "description": "actionlint is installed (brew install actionlint) OR an equivalent structural schema check is available; the workflow SHA is git rev-parse HEAD.",
      "seed_method": "cli",
      "records": [
        "command -v actionlint OR documented schema-check substitute",
        "git rev-parse HEAD captured for the review doc"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN ci-e2e.yml on main WHEN operator runs the fork-safety test THEN it parses the YAML and asserts >= 4 trust-boundary properties and exits 0.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + js-yaml + GitHub Actions workflow schema",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "missing-guard", "missing-permissions"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "ci_e2e_workflow_on_main",
            "action": { "actor": "operator", "steps": ["Run pnpm vitest run tests/ci/fork-safety.test.ts.", "Inspect the test report."] },
            "end_state": {
              "must_observe": ["tests/ci/fork-safety.test.ts exists", "test passes (exitCode: 0)", "test report asserts >= 4 distinct properties: trigger guard, permissions block, concurrency group, secrets inheritance"],
              "must_not_observe": ["empty/start signature: test file absent OR test skipped", "test passes with a weakened fixture"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a weakened fixture WHEN test runs against it THEN it fails non-zero, then against the real workflow it passes zero.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts -t 'weakened_fixture'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + fixture comparison",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "weakened_workflow_fixture_present",
            "action": { "actor": "operator", "steps": ["Run the test against tests/ci/fixtures/ci-e2e.weakened.yaml.", "Run the test against the real .github/workflows/ci-e2e.yml."] },
            "end_state": {
              "must_observe": ["test against weakened fixture: exitCode != 0 with message naming missing guard", "test against real workflow: exitCode: 0"],
              "must_not_observe": ["empty/start signature: both runs pass", "test passes against the weakened fixture"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN actionlint (or equivalent) is available WHEN operator runs it THEN docs/ci/D03-06-adversarial-review.md exists with the actionlint verdict and workflow SHA.",
      "verify": "test -f docs/ci/D03-06-adversarial-review.md && rg -q 'actionlint' docs/ci/D03-06-adversarial-review.md && rg -q '$(git rev-parse HEAD | cut -c1-12)' docs/ci/D03-06-adversarial-review.md",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "actionlint + manual review record",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "prose-only"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "actionlint_installed_and_workflow_on_main",
            "action": { "actor": "operator", "steps": ["Run actionlint .github/workflows/ci-e2e.yml.", "Write the review doc with the verdict."] },
            "end_state": {
              "must_observe": ["docs/ci/D03-06-adversarial-review.md exists", "doc contains the substring 'actionlint'", "doc records a workflow SHA matching git rev-parse HEAD", "doc has a secrets/permissions/concurrency/retry audit table"],
              "must_not_observe": ["empty/start signature: doc absent OR no actionlint mention OR no workflow SHA"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fork-safety test exists and passes against real ci-e2e.yml",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Test RED against weakened fixture, GREEN against real workflow",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts -t 'weakened_fixture'; test $? -ne 0 && PLATFORM_IT=1 pnpm vitest run tests/ci/fork-safety.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "D03-06 adversarial review doc has actionlint verdict + workflow SHA",
      "verify": "test -f docs/ci/D03-06-adversarial-review.md && rg -q 'actionlint' docs/ci/D03-06-adversarial-review.md && rg -q '$(git rev-parse HEAD | cut -c1-12)' docs/ci/D03-06-adversarial-review.md",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
