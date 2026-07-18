# D02-06 — Adversarial review of CI workflows
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: ghactions-reviewer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Prove the implemented CI workflows meet the adversarial security and real-service bar or return concrete FAIL findings.

**Success state:** Review artifact records PASS on actionlint, SHA pins, permissions, concurrency, self-hosted integration fail-closed, no silent retries, e2e scaffold — or enumerates FAIL items blocking merge.

## Background

- **Specialist rationale:** Adversarial security/correctness/performance review of GitHub Actions workflows against certification security domain and project fail-closed rules.
- **Planning rationale:** Human gate step 6 requires actionlint zero errors and SHA-pinned actions. A design+implement pair without adversarial review is how floating tags, secret exfil, and mock integration slip through.
- **How to verify (human):** Read docs/ci/D02-06-adversarial-review.md (or .spec path) and confirm every checklist item is PASS or FAIL with evidence commands; any FAIL blocks sprint close for CI lanes.
- **Scope:** Review artifact + optional tiny doc fixes called out as findings; does not re-implement workflows (send FAIL back to D02-05).
- **PRD refs:** T-PLAT-019, 10-e2e-testing

## Critical Constraints

### MUST
- MUST run actionlint and a SHA-pin audit as part of the review evidence.
- MUST fail the review if integration can pass without real Postgres/fleet or runs only on github-hosted ubuntu without tailnet substrate.
- MUST check least-privilege permissions, concurrency, absence of pull_request_target write, and no silent retries.

### NEVER
- NEVER rubber-stamp PASS without captured command output.
- NEVER accept floating action tags or unpinned third-party actions.
- NEVER rewrite large workflow sections in the review task — file findings for D02-05 remediation.

### STRICTLY
- STRICTLY produce a machine-readable checklist with item ids R-1..R-n and status PASS/FAIL.
- STRICTLY treat continue-on-error on integration suite as automatic FAIL.
- STRICTLY verify e2e remains scaffold/disabled for Sprint 20.

## Specification

**Objective:** Prove the implemented CI workflows meet the adversarial security and real-service bar or return concrete FAIL findings.

**Success state:** Review artifact records PASS on actionlint, SHA pins, permissions, concurrency, self-hosted integration fail-closed, no silent retries, e2e scaffold — or enumerates FAIL items blocking merge.

## Acceptance Criteria

### AC-1: Review artifact with actionable checklist [PRIMARY]
**GIVEN:** D02-05 workflows are committed
**WHEN:** ghactions-reviewer completes adversarial review
**THEN:** A review file exists with checklist items covering pins, actionlint, permissions, runners, fail-closed, concurrency, flake policy, e2e scaffold, each PASS or FAIL with evidence
**VERIFY:** `test -f docs/ci/D02-06-adversarial-review.md && rg -n 'R-[0-9]+|PASS|FAIL|actionlint|SHA|permissions|self-hosted|fail-closed|concurrency|retry|e2e' docs/ci/D02-06-adversarial-review.md`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + actionlint + rg
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + actionlint + rg",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "empty review"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "workflows_for_review",
      "action": {
        "actor": "operator",
        "steps": [
          "Run adversarial checklist against workflows.",
          "Write docs/ci/D02-06-adversarial-review.md with R-n items and evidence."
        ]
      },
      "end_state": {
        "must_observe": [
          "observed: `review file exists` count: 1",
          "R-1 or R-n checklist ids",
          "verdict_status in {'PASS','FAIL'} count: >=1",
          "mentioned: present count: 1",
          "mentioned: present count: 1",
          "mentioned: present count: 1",
          "mentioned: present count: 1",
          "mentioned: present count: 1",
          "mentioned: present count: 1",
          "mentioned: present count: 1",
          "e2e mentioned"
        ],
        "must_not_observe": [
          "empty review",
          "empty/start signature: `LGTM with no checklist` OR count: 0",
          "missing actionlint evidence"
        ]
      }
    }
  ]
}
```

### AC-2: FAIL on floating tags or actionlint errors
**GIVEN:** A workflow with a floating tag or actionlint error is introduced (or residual from D02-05)
**WHEN:** reviewer runs pin audit + actionlint
**THEN:** Review records FAIL with the offending file:line and does not overall-PASS
**VERIFY:** `rg -n 'FAIL|actionlint|floating|@[0-9a-f]{40}' docs/ci/D02-06-adversarial-review.md && actionlint .github/workflows/*.yml; echo actionlint_exit:$?`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** actionlint CLI + review artifact
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "actionlint CLI + review artifact",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "ignore actionlint"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "workflows_for_review",
      "action": {
        "actor": "operator",
        "steps": [
          "Run actionlint and floating-tag rg audit.",
          "Ensure review verdict reflects any failures."
        ]
      },
      "end_state": {
        "must_observe": [
          "must_observe_literal: `actionlint evidence captured` count: 1",
          "must_observe_literal: `SHA pin audit captured` count: 1",
          "if actionlint nonzero OR floating tag: review overall FAIL",
          "if clean: review items PASS with command output"
        ],
        "must_not_observe": [
          "empty/start signature: `overall PASS with actionlint errors` OR count: 0",
          "empty/start signature: `overall PASS with uses: ...@v4` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-3: FAIL on mockable or non-self-hosted integration
**GIVEN:** ci-integration.yml content is available
**WHEN:** reviewer inspects runs-on, services:, continue-on-error, and test command
**THEN:** Review FAILs if integration is not self-hosted holocron/tailnet, lacks test:integration, uses continue-on-error, or substitutes mocks for Postgres/fleet
**VERIFY:** `rg -n 'self-hosted|test:integration|continue-on-error|services:|mock|ubuntu-latest' .github/workflows/ci-integration.yml docs/ci/D02-06-adversarial-review.md`
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
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "pass despite ubuntu-only integration"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "workflows_for_review",
      "action": {
        "actor": "operator",
        "steps": [
          "Inspect ci-integration.yml for real-service posture.",
          "Record PASS/FAIL in review for integration authenticity."
        ]
      },
      "end_state": {
        "must_observe": [
          "must_observe_literal: `review item on self-hosted labels` count: 1",
          "review item on test:integration",
          "must_observe_literal: `review item on continue-on-error absent` count: 1",
          "must_observe_literal: `FAIL if mock/services postgres replaces nonprod tailnet` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `PASS for ubuntu-latest-only integration suite` OR count: 0",
          "empty/start signature: `PASS with continue-on-error true on suite` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-4: Permissions, concurrency, e2e scaffold, no silent retries
**GIVEN:** All new workflows are present
**WHEN:** reviewer audits permissions, concurrency, e2e enablement, retry policy
**THEN:** Review requires contents:read default, concurrency groups present, e2e disabled/scaffold, and no silent retry matrices masking flakes
**VERIFY:** `rg -n 'permissions:|concurrency:|workflow_dispatch|if:\s*false|retry|max-parallel|fail-fast' .github/workflows/ci-*.yml docs/ci/D02-06-adversarial-review.md`
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
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "write-all permissions accepted"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "workflows_for_review",
      "action": {
        "actor": "operator",
        "steps": [
          "Audit permissions/concurrency/e2e/retry across ci-*.yml.",
          "Write PASS/FAIL with citations in the review file."
        ]
      },
      "end_state": {
        "must_observe": [
          "must_observe_literal: `permissions reviewed` count: 1",
          "must_observe_literal: `concurrency reviewed` count: 1",
          "e2e scaffold/disabled reviewed",
          "must_observe_literal: `silent retry policy reviewed as forbidden` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `PASS with permissions write-all` OR count: 0",
          "empty/start signature: `PASS with unrestricted e2e on every PR` OR count: 0",
          "empty/start signature: `PASS with undocumented retry loops` OR count: 0"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Adversarial review file exists when D02-06 completes | AC-1 | `test -f docs/ci/D02-06-adversarial-review.md` | happy_path |
| TC-2 | Review references actionlint evidence when the pin/actionlint checklist item is recorded | AC-2 | `rg -n 'actionlint' docs/ci/D02-06-adversarial-review.md` | error_path |
| TC-3 | Review references self-hosted integration posture when authenticity checklist item is recorded | AC-3 | `rg -n 'self-hosted' docs/ci/D02-06-adversarial-review.md` | happy_path |
| TC-4 | Review forbids silent retries when flake policy item is recorded | AC-4 | `rg -n 'retry|silent|quarantine' docs/ci/D02-06-adversarial-review.md` | edge |

## Reading List

- `.github/workflows/ci-fast.yml` (all) — Fast lane implementation under review
- `.github/workflows/ci-integration.yml` (all) — Integration authenticity and fail-closed posture
- `.github/workflows/ci-e2e.yml` (all) — Confirm scaffold/disabled
- `docs/ci/lane-architecture.md` (all) — Design contract D02-04
- `.github/workflows/verify-no-convex-env.yml` (all) — Baseline pin/permissions pattern

## Guardrails

### WRITE-ALLOWED
- docs/ci/D02-06-adversarial-review.md (NEW)
- docs/ci/lane-architecture.md (MODIFY only for errata cross-links called out in findings)

### WRITE-PROHIBITED
- .github/workflows/** large rewrites — remediate via D02-05
- services/**
- app/**
- .spec/prds/mk6-migration/tasks/sprint-12-*/**

### Boundaries
- **always:** Capture raw actionlint and rg pin-audit output in the review, Cite file:line for every FAIL
- **ask_first:** Hotfix of a CRITICAL security hole in-workflow during review (prefer FAIL + D02-05 fix)
- **never:** PASS without evidence, Delete failing checks to make review green

## Design

- **references:** docs/ci/lane-architecture.md, 10-e2e-testing.md, verify-no-convex-env.yml
- **pattern:** ## Verdict: PASS|FAIL\n### R-1 actionlint — PASS\n```\n$ actionlint ...\n```
- **pattern_source:** docs/ci/D02-06-adversarial-review.md (to be created)
- **anti_pattern:** LGTM — looks fine without commands or checklist.
- note: Pair with security-reviewer for permissions/secret exfil second pass.
- note: Overall PASS requires zero FAIL on R-items that the architecture marked mandatory.

## Agent Assignment

- **implementer:** ghactions-reviewer — Adversarial security/correctness/performance review of GitHub Actions workflows against certification security domain and project fail-closed rules.
- **reviewer:** security-reviewer — Second-pass security specialist on workflow permissions, secret handling, and pull_request_target abuse; pairs with ghactions-reviewer ownership of the primary review artifact.

## Verification Gates

- **AC-1 review artifact:** `test -f docs/ci/D02-06-adversarial-review.md && rg -n 'PASS|FAIL' docs/ci/D02-06-adversarial-review.md` → Exit 0; checklist present
- **AC-2 actionlint evidence:** `rg -n 'actionlint' docs/ci/D02-06-adversarial-review.md && actionlint .github/workflows/*.yml` → Evidence present; actionlint 0 for overall PASS
- **AC-3 integration authenticity:** `rg -n 'self-hosted|fail-closed|test:integration' docs/ci/D02-06-adversarial-review.md` → Exit 0
- **AC-4 permissions/concurrency/e2e/retry:** `rg -n 'permissions|concurrency|e2e|retry|quarantine' docs/ci/D02-06-adversarial-review.md` → Exit 0
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Primarily docs/ci/D02-06-adversarial-review.md

## Coding Standards

- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md

## Dependencies

- **depends_on:** D02-05
- **blocks:** —

## Notes

- Review task: tdd_mode skipped; seeded evidence is the review artifact + command captures.
- Recommended mandatory R-items: R-1 actionlint, R-2 SHA pins, R-3 permissions, R-4 concurrency, R-5 self-hosted labels, R-6 test:integration fail-closed, R-7 no continue-on-error, R-8 no silent retries, R-9 e2e scaffold, R-10 no pull_request_target write.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-06",
  "proposed_by": "ghactions-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "workflows_for_review": {
      "description": "D02-05 output workflows ready for adversarial review",
      "seed_method": "cli",
      "entrypoint": "ls .github/workflows/ci-fast.yml .github/workflows/ci-integration.yml .github/workflows/ci-e2e.yml",
      "records": [
        "ci-fast.yml",
        "ci-integration.yml",
        "ci-e2e.yml",
        "actionlint available on PATH"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN D02-05 workflows WHEN adversarial review completes THEN docs/ci/D02-06-adversarial-review.md exists with R-n PASS/FAIL checklist covering pins, actionlint, permissions, runners, fail-closed, concurrency, flake, e2e.",
      "verify": "test -f docs/ci/D02-06-adversarial-review.md && rg -n 'R-[0-9]+|PASS|FAIL|actionlint|SHA|permissions|self-hosted|fail-closed|concurrency|retry|e2e' docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + actionlint + rg",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "empty review"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "workflows_for_review",
            "action": {
              "actor": "operator",
              "steps": [
                "Run adversarial checklist against workflows.",
                "Write docs/ci/D02-06-adversarial-review.md with R-n items and evidence."
              ]
            },
            "end_state": {
              "must_observe": [
                "observed: `review file exists` count: 1",
                "R-1 or R-n checklist ids",
                "verdict_status in {'PASS','FAIL'} count: >=1",
                "mentioned: present count: 1",
                "mentioned: present count: 1",
                "mentioned: present count: 1",
                "mentioned: present count: 1",
                "mentioned: present count: 1",
                "mentioned: present count: 1",
                "mentioned: present count: 1",
                "e2e mentioned"
              ],
              "must_not_observe": [
                "empty review",
                "empty/start signature: `LGTM with no checklist` OR count: 0",
                "missing actionlint evidence"
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
      "description": "GIVEN floating tags or actionlint errors WHEN reviewer audits THEN review records FAIL and does not overall-PASS.",
      "verify": "rg -n 'FAIL|actionlint|floating|@[0-9a-f]{40}' docs/ci/D02-06-adversarial-review.md && actionlint .github/workflows/*.yml; echo actionlint_exit:$?",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "actionlint CLI + review artifact",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "ignore actionlint"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "workflows_for_review",
            "action": {
              "actor": "operator",
              "steps": [
                "Run actionlint and floating-tag rg audit.",
                "Ensure review verdict reflects any failures."
              ]
            },
            "end_state": {
              "must_observe": [
                "must_observe_literal: `actionlint evidence captured` count: 1",
                "must_observe_literal: `SHA pin audit captured` count: 1",
                "if actionlint nonzero OR floating tag: review overall FAIL",
                "if clean: review items PASS with command output"
              ],
              "must_not_observe": [
                "empty/start signature: `overall PASS with actionlint errors` OR count: 0",
                "empty/start signature: `overall PASS with uses: ...@v4` OR count: 0"
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
      "description": "GIVEN ci-integration.yml WHEN reviewer inspects authenticity THEN FAIL if not self-hosted real-service fail-closed integration.",
      "verify": "rg -n 'self-hosted|test:integration|continue-on-error|services:|mock|ubuntu-latest' .github/workflows/ci-integration.yml docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + review artifact",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "pass despite ubuntu-only integration"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "workflows_for_review",
            "action": {
              "actor": "operator",
              "steps": [
                "Inspect ci-integration.yml for real-service posture.",
                "Record PASS/FAIL in review for integration authenticity."
              ]
            },
            "end_state": {
              "must_observe": [
                "must_observe_literal: `review item on self-hosted labels` count: 1",
                "review item on test:integration",
                "must_observe_literal: `review item on continue-on-error absent` count: 1",
                "must_observe_literal: `FAIL if mock/services postgres replaces nonprod tailnet` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `PASS for ubuntu-latest-only integration suite` OR count: 0",
                "empty/start signature: `PASS with continue-on-error true on suite` OR count: 0"
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
      "description": "GIVEN all new workflows WHEN reviewer audits permissions/concurrency/e2e/retries THEN contents:read, concurrency, disabled e2e scaffold, and no silent retries are enforced in the verdict.",
      "verify": "rg -n 'permissions:|concurrency:|workflow_dispatch|if:\\s*false|retry|max-parallel|fail-fast' .github/workflows/ci-*.yml docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + review artifact",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "write-all permissions accepted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "workflows_for_review",
            "action": {
              "actor": "operator",
              "steps": [
                "Audit permissions/concurrency/e2e/retry across ci-*.yml.",
                "Write PASS/FAIL with citations in the review file."
              ]
            },
            "end_state": {
              "must_observe": [
                "must_observe_literal: `permissions reviewed` count: 1",
                "must_observe_literal: `concurrency reviewed` count: 1",
                "e2e scaffold/disabled reviewed",
                "must_observe_literal: `silent retry policy reviewed as forbidden` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `PASS with permissions write-all` OR count: 0",
                "empty/start signature: `PASS with unrestricted e2e on every PR` OR count: 0",
                "empty/start signature: `PASS with undocumented retry loops` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Adversarial review file exists when D02-06 completes",
      "verify": "test -f docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Review references actionlint evidence when the pin/actionlint checklist item is recorded",
      "verify": "rg -n 'actionlint' docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Review references self-hosted integration posture when authenticity checklist item is recorded",
      "verify": "rg -n 'self-hosted' docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Review forbids silent retries when flake policy item is recorded",
      "verify": "rg -n 'retry|silent|quarantine' docs/ci/D02-06-adversarial-review.md",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
