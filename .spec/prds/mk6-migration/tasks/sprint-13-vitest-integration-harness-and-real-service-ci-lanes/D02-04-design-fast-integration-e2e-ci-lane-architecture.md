# D02-04 — Design fast/integration/e2e CI lane architecture
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: ghactions-planner
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Commit a machine-checkable CI lane architecture that freezes fast/integration/e2e policy for Sprint 13 implementers.

**Success state:** docs/ci/lane-architecture.md exists with all three lanes, triggers, runner labels, SHA-pin/actionlint rules, flake policy, and fail-closed integration requirements; D02-05 can implement without new product decisions.

## Background

- **Specialist rationale:** Owns GitHub Actions workflow architecture, runner strategy, lane triggers, and security posture before YAML is written.
- **Planning rationale:** Sprint 13 human gate step 4 requires a PR touching tests/ to run the fast lane on every commit and the integration lane pre-merge; step 6 requires actionlint-clean SHA-pinned workflows. The constitution in 10-e2e-testing.md freezes the three-lane model.
- **How to verify (human):** Open docs/ci/lane-architecture.md and confirm every lane has trigger, runner, commands, fail-closed rules, and that actionlint + pin rules are explicit; a missing integration fail-closed clause fails the design check.
- **Scope:** docs/ci architecture artifact and any referenced runner-label/path-filter tables; does not write workflow YAML (D02-05) or register runners (D02-03).
- **PRD refs:** T-PLAT-019, 10-e2e-testing, T-PLAT-020

## Critical Constraints

### MUST
- MUST document three named lanes: fast (every push/PR commit), integration (pre-merge, real Postgres+Mastra+fleet on self-hosted labels), e2e (scaffold reserved for Sprint 20 Maestro on macOS self-hosted).
- MUST require all third-party actions SHA-pinned and actionlint-clean before merge.
- MUST require integration lane fail-closed when self-hosted runner, nonprod Postgres namespace, or fleet endpoint is missing — zero mock/skip-to-green paths.

### NEVER
- NEVER design floating action tags (@v4, @main) or unpinned docker:// images.
- NEVER design silent retry/flake-mask policies; quarantine + fix within the sprint only.
- NEVER place real-service integration on ubuntu-latest github-hosted runners that lack tailnet Postgres/fleet.

### STRICTLY
- STRICTLY use least-privilege permissions (default contents: read; no pull_request_target write).
- STRICTLY name concurrency groups per lane/ref so cancelled superseding runs do not leave orphan integration jobs.
- STRICTLY name runner labels that D02-03 will register (e.g. self-hosted, holocron, tailnet, linux) and that D02-05 will target.

## Specification

**Objective:** Commit a machine-checkable CI lane architecture that freezes fast/integration/e2e policy for Sprint 13 implementers.

**Success state:** docs/ci/lane-architecture.md exists with all three lanes, triggers, runner labels, SHA-pin/actionlint rules, flake policy, and fail-closed integration requirements; D02-05 can implement without new product decisions.

## Acceptance Criteria

### AC-1: Three-lane architecture document committed [PRIMARY]
**GIVEN:** Sprint 13 SPRINT.md and 10-e2e-testing.md CI lanes section are available
**WHEN:** ghactions-planner authors docs/ci/lane-architecture.md
**THEN:** Document names fast, integration, and e2e lanes with trigger, runner labels, primary commands, and ownership
**VERIFY:** `test -f docs/ci/lane-architecture.md && rg -n '^(##|###).*\b(fast|integration|e2e)\b' docs/ci/lane-architecture.md && rg -n 'self-hosted|actionlint|SHA-pin|concurrency|permissions' docs/ci/lane-architecture.md`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + rg against committed architecture doc
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + rg against committed architecture doc",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "missing lane sections"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "empty_ci_docs",
      "action": {
        "actor": "operator",
        "steps": [
          "Author docs/ci/lane-architecture.md from SPRINT gate + 10-e2e-testing CI lanes.",
          "Run the AC-1 verify command and capture stdout."
        ]
      },
      "end_state": {
        "must_observe": [
          "path_exists: `docs/ci/lane-architecture.md` == true",
          "section: fast",
          "section: integration",
          "section: e2e",
          "mentions: self-hosted",
          "mentions: actionlint",
          "mentions: SHA-pin",
          "mentions: concurrency",
          "mentions: permissions"
        ],
        "must_not_observe": [
          "file missing",
          "empty document",
          "empty/start signature: `only one lane documented` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-2: Fast lane every-commit policy explicit
**GIVEN:** lane architecture doc exists
**WHEN:** operator inspects the fast lane section
**THEN:** Fast lane triggers on every push and pull_request, runs unit/pure checks (typecheck/lint/unit), and may use path filters that still fire when tests/ or pure libs change
**VERIFY:** `rg -n 'fast' -A40 docs/ci/lane-architecture.md | rg -n 'push|pull_request|every commit|typecheck|lint|unit|path filter|tests/'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + rg
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + rg",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "fast lane omitted"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "lane_arch_seed",
      "action": {
        "actor": "operator",
        "steps": [
          "Extract the fast lane section.",
          "Confirm push + pull_request triggers and pure/unit commands are named."
        ]
      },
      "end_state": {
        "must_observe": [
          "trigger: push",
          "trigger: pull_request",
          "unit: present count: 1",
          "must_observe_literal: `path filter mentions tests/ or pure paths` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `fast lane only on schedule` OR count: 0",
          "empty/start signature: `fast lane requires self-hosted Postgres` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-3: Integration lane pre-merge real-service fail-closed
**GIVEN:** lane architecture doc exists and D02-02/D02-03 labels/namespace are known
**WHEN:** operator inspects the integration lane section
**THEN:** Integration lane is pre-merge only, targets self-hosted holocron/tailnet labels, runs pnpm test:integration against nonprod Postgres+fleet, and fails closed if runner/namespace/fleet missing
**VERIFY:** `rg -n 'integration' -A60 docs/ci/lane-architecture.md | rg -n 'pre-merge|self-hosted|test:integration|fail-closed|nonprod|fleet|Postgres|holocron'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + rg
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + rg",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "mock postgres allowed"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "lane_arch_seed",
      "action": {
        "actor": "operator",
        "steps": [
          "Extract the integration lane section.",
          "Confirm real-service mandate and fail-closed rules."
        ]
      },
      "end_state": {
        "must_observe": [
          "must_observe_literal: `pre-merge` count: 1",
          "must_observe_literal: `self-hosted` count: 1",
          "pnpm test:integration OR test:integration",
          "must_observe_literal: `fail-closed` count: 1",
          "must_observe_literal: `nonprod` count: 1",
          "must_observe_literal: `fleet` count: 1",
          "must_observe_literal: `Postgres` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `mock Postgres` OR count: 0",
          "empty/start signature: `skip if offline` OR count: 0",
          "empty/start signature: `continue-on-error: true for the suite` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-4: E2e scaffold + security/flake policy frozen
**GIVEN:** lane architecture doc exists
**WHEN:** operator inspects e2e, security, and flake sections
**THEN:** E2e lane is named and reserved for Sprint 20 Maestro on macOS self-hosted; SHA-pin + actionlint + least-privilege permissions + concurrency + no silent retries are mandatory
**VERIFY:** `rg -n 'e2e|Maestro|Sprint 20|actionlint|SHA|permissions|concurrency|flake|quarantine|retry' docs/ci/lane-architecture.md`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + rg
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + rg",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "silent retries allowed"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "lane_arch_seed",
      "action": {
        "actor": "operator",
        "steps": [
          "Search the architecture doc for e2e scaffold and security/flake rules.",
          "Capture matching lines."
        ]
      },
      "end_state": {
        "must_observe": [
          "e2e",
          "Maestro or Sprint 20",
          "must_observe_literal: `actionlint` count: 1",
          "must_observe_literal: `SHA` count: 1",
          "must_observe_literal: `permissions` count: 1",
          "must_observe_literal: `concurrency` count: 1",
          "must_observe_literal: `quarantine or flake` count: 1",
          "must_observe_literal: `no silent retry policy` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `retry: 3 silent` OR count: 0",
          "empty/start signature: `permissions: write-all` OR count: 0",
          "empty/start signature: `e2e fully implemented this sprint without Sprint 20 note` OR count: 0"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | docs/ci/lane-architecture.md exists when D02-04 completes | AC-1 | `test -f docs/ci/lane-architecture.md` | happy_path |
| TC-2 | Fast lane documents push and pull_request triggers when the architecture is committed | AC-2 | `rg -n 'push' docs/ci/lane-architecture.md && rg -n 'pull_request' docs/ci/lane-architecture.md` | happy_path |
| TC-3 | Integration lane documents fail-closed real-service execution when the architecture is committed | AC-3 | `rg -n 'fail-closed' docs/ci/lane-architecture.md && rg -n 'test:integration' docs/ci/lane-architecture.md` | error_path |
| TC-4 | Architecture forbids silent retries when flake policy is documented | AC-4 | `rg -n 'silent' docs/ci/lane-architecture.md && rg -n 'quarantine' docs/ci/lane-architecture.md` | edge |

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/SPRINT.md` (all) — Human gate steps 4 and 6; task graph for D02-04→D02-05
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (CI lanes) — fast/integration/e2e constitution + flake policy
- `.github/workflows/verify-no-convex-env.yml` (all) — Existing SHA-pin pattern and least-privilege permissions baseline

## Guardrails

### WRITE-ALLOWED
- docs/ci/lane-architecture.md (NEW)
- docs/ci/README.md (NEW optional index)

### WRITE-PROHIBITED
- .github/workflows/** — D02-05 implements YAML
- services/** — not CI architecture
- app/** — not CI architecture
- .spec/prds/mk6-migration/tasks/sprint-12-*/** — prior sprint evidence immutable

### Boundaries
- **always:** Name concrete runner labels matching D02-03 registration, Cite 10-e2e-testing.md CI lanes literally
- **ask_first:** Changing runner OS from linux self-hosted to macOS for integration
- **never:** Author workflow YAML in this task, Allow mock Postgres in integration design

## Design

- **references:** .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md, .github/workflows/verify-no-convex-env.yml, SPRINT.md
- **pattern:** permissions:\n  contents: read\n# actions pinned as uses: owner/action@<40-char-sha> # vX.Y.Z
- **pattern_source:** .github/workflows/verify-no-convex-env.yml:11-24
- **anti_pattern:** Documenting lanes as 'run tests somehow on GitHub' without runner labels, fail-closed rules, or SHA-pin mandate.
- note: D02-03 supplies runner labels; D02-02 supplies nonprod DATABASE_URL/namespace env contract; D02-05 materializes YAML.
- note: E2e remains disabled/scaffold until Sprint 20 Maestro substrate lands.

## Agent Assignment

- **implementer:** ghactions-planner — Owns GitHub Actions workflow architecture, runner strategy, lane triggers, and security posture before YAML is written.
- **reviewer:** ghactions-reviewer — Adversarial review of lane design against SHA-pinning, permissions, runner labels, and fail-closed integration requirements.

## Verification Gates

- **AC-1 architecture doc present:** `test -f docs/ci/lane-architecture.md && rg -n 'fast|integration|e2e' docs/ci/lane-architecture.md` → Exit 0; three lanes named
- **AC-2 fast every-commit:** `rg -n 'push|pull_request' docs/ci/lane-architecture.md` → Exit 0; both triggers present
- **AC-3 integration fail-closed:** `rg -n 'fail-closed' docs/ci/lane-architecture.md && rg -n 'self-hosted' docs/ci/lane-architecture.md` → Exit 0
- **AC-4 security/flake/e2e scaffold:** `rg -n 'actionlint|SHA|concurrency|quarantine|Sprint 20|e2e' docs/ci/lane-architecture.md` → Exit 0; all keywords present
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only docs/ci/** paths

## Coding Standards

- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md

## Dependencies

- **depends_on:** —
- **blocks:** D02-05, D02-06

## Notes

- Design-only task; tdd_mode skipped but requires_seeded_evidence true because behavioral ACs assert committed doc content.
- Recommended labels: [self-hosted, holocron, tailnet, linux] for integration; e2e later adds macOS + ios-simulator labels in Sprint 20.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-04",
  "proposed_by": "ghactions-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_ci_docs": {
      "description": "Repo before D02-04: no docs/ci/lane-architecture.md",
      "seed_method": "cli",
      "entrypoint": "test ! -f docs/ci/lane-architecture.md || true",
      "records": [
        "docs/ci/ missing or empty of lane-architecture.md",
        "only existing workflow: .github/workflows/verify-no-convex-env.yml"
      ]
    },
    "lane_arch_seed": {
      "description": "Committed lane architecture after D02-04 GREEN",
      "seed_method": "cli",
      "entrypoint": "cat docs/ci/lane-architecture.md",
      "records": [
        "fast lane section",
        "integration lane section",
        "e2e scaffold section",
        "SHA-pin + actionlint rules",
        "flake quarantine policy"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Sprint 13 SPRINT.md and 10-e2e-testing.md WHEN ghactions-planner authors docs/ci/lane-architecture.md THEN document names fast, integration, and e2e lanes with trigger, runner labels, primary commands, and ownership.",
      "verify": "test -f docs/ci/lane-architecture.md && rg -n '^(##|###).*\\b(fast|integration|e2e)\\b' docs/ci/lane-architecture.md && rg -n 'self-hosted|actionlint|SHA-pin|concurrency|permissions' docs/ci/lane-architecture.md",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + rg against committed architecture doc",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "missing lane sections"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_ci_docs",
            "action": {
              "actor": "operator",
              "steps": [
                "Author docs/ci/lane-architecture.md from SPRINT gate + 10-e2e-testing CI lanes.",
                "Run the AC-1 verify command and capture stdout."
              ]
            },
            "end_state": {
              "must_observe": [
                "path_exists: `docs/ci/lane-architecture.md` == true",
                "section: fast",
                "section: integration",
                "section: e2e",
                "mentions: self-hosted",
                "mentions: actionlint",
                "mentions: SHA-pin",
                "mentions: concurrency",
                "mentions: permissions"
              ],
              "must_not_observe": [
                "file missing",
                "empty document",
                "empty/start signature: `only one lane documented` OR count: 0"
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
      "description": "GIVEN lane architecture doc exists WHEN operator inspects the fast lane section THEN fast lane triggers on every push and pull_request and runs unit/pure checks with path filters that still fire when tests/ changes.",
      "verify": "rg -n 'fast' -A40 docs/ci/lane-architecture.md | rg -n 'push|pull_request|every commit|typecheck|lint|unit|path filter|tests/'",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + rg",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "fast lane omitted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "lane_arch_seed",
            "action": {
              "actor": "operator",
              "steps": [
                "Extract the fast lane section.",
                "Confirm push + pull_request triggers and pure/unit commands are named."
              ]
            },
            "end_state": {
              "must_observe": [
                "trigger: push",
                "trigger: pull_request",
                "unit: present count: 1",
                "must_observe_literal: `path filter mentions tests/ or pure paths` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `fast lane only on schedule` OR count: 0",
                "empty/start signature: `fast lane requires self-hosted Postgres` OR count: 0"
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
      "description": "GIVEN lane architecture doc exists WHEN operator inspects the integration lane section THEN integration is pre-merge, self-hosted, runs test:integration against nonprod Postgres+fleet, and fails closed if substrate missing.",
      "verify": "rg -n 'integration' -A60 docs/ci/lane-architecture.md | rg -n 'pre-merge|self-hosted|test:integration|fail-closed|nonprod|fleet|Postgres|holocron'",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + rg",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "mock postgres allowed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "lane_arch_seed",
            "action": {
              "actor": "operator",
              "steps": [
                "Extract the integration lane section.",
                "Confirm real-service mandate and fail-closed rules."
              ]
            },
            "end_state": {
              "must_observe": [
                "must_observe_literal: `pre-merge` count: 1",
                "must_observe_literal: `self-hosted` count: 1",
                "pnpm test:integration OR test:integration",
                "must_observe_literal: `fail-closed` count: 1",
                "must_observe_literal: `nonprod` count: 1",
                "must_observe_literal: `fleet` count: 1",
                "must_observe_literal: `Postgres` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `mock Postgres` OR count: 0",
                "empty/start signature: `skip if offline` OR count: 0",
                "empty/start signature: `continue-on-error: true for the suite` OR count: 0"
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
      "description": "GIVEN lane architecture doc exists WHEN operator inspects e2e/security/flake sections THEN e2e is Sprint-20 scaffold and SHA-pin/actionlint/permissions/concurrency/no-silent-retry rules are mandatory.",
      "verify": "rg -n 'e2e|Maestro|Sprint 20|actionlint|SHA|permissions|concurrency|flake|quarantine|retry' docs/ci/lane-architecture.md",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + rg",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "silent retries allowed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "lane_arch_seed",
            "action": {
              "actor": "operator",
              "steps": [
                "Search the architecture doc for e2e scaffold and security/flake rules.",
                "Capture matching lines."
              ]
            },
            "end_state": {
              "must_observe": [
                "e2e",
                "Maestro or Sprint 20",
                "must_observe_literal: `actionlint` count: 1",
                "must_observe_literal: `SHA` count: 1",
                "must_observe_literal: `permissions` count: 1",
                "must_observe_literal: `concurrency` count: 1",
                "must_observe_literal: `quarantine or flake` count: 1",
                "must_observe_literal: `no silent retry policy` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `retry: 3 silent` OR count: 0",
                "empty/start signature: `permissions: write-all` OR count: 0",
                "empty/start signature: `e2e fully implemented this sprint without Sprint 20 note` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "docs/ci/lane-architecture.md exists when D02-04 completes",
      "verify": "test -f docs/ci/lane-architecture.md",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Fast lane documents push and pull_request triggers when the architecture is committed",
      "verify": "rg -n 'push' docs/ci/lane-architecture.md && rg -n 'pull_request' docs/ci/lane-architecture.md",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Integration lane documents fail-closed real-service execution when the architecture is committed",
      "verify": "rg -n 'fail-closed' docs/ci/lane-architecture.md && rg -n 'test:integration' docs/ci/lane-architecture.md",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Architecture forbids silent retries when flake policy is documented",
      "verify": "rg -n 'silent' docs/ci/lane-architecture.md && rg -n 'quarantine' docs/ci/lane-architecture.md",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
