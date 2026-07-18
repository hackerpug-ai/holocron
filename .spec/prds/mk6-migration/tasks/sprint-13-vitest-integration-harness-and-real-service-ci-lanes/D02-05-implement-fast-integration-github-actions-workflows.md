# D02-05 — Implement fast + integration GitHub Actions workflows
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: ghactions-implementer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Land actionlint-clean, SHA-pinned fast and integration workflows that enforce the Sprint 13 CI lanes on real substrate.

**Success state:** .github/workflows/ci-fast.yml and ci-integration.yml exist; actionlint exits 0; all uses: lines are 40-char SHAs; integration job runs-on self-hosted holocron labels and invokes pnpm test:integration fail-closed.

## Background

- **Specialist rationale:** Writes validated workflow YAML with actionlint, SHA pinning, OIDC/permissions hygiene, and real-service integration job wiring.
- **Planning rationale:** Human gate step 4: a PR touching tests/ must run fast every commit and integration pre-merge. Step 6: actionlint zero errors and all actions SHA-pinned. Without these workflows the real-service harness never becomes a CI gate.
- **How to verify (human):** Open a PR that touches tests/, confirm fast workflow runs; confirm integration workflow targets self-hosted labels and runs pnpm test:integration; run actionlint on .github/workflows and observe zero findings with SHA-pinned uses.
- **Scope:** .github/workflows for fast/integration (+ optional e2e scaffold) and any tiny helper scripts under scripts/ci/; does not provision runners or nonprod DB.
- **PRD refs:** T-PLAT-019, 10-e2e-testing

## Critical Constraints

### MUST
- MUST implement fast workflow on push + pull_request with pure/unit commands (pnpm typecheck, pnpm lint, and pure unit tests as designed).
- MUST implement integration workflow pre-merge on self-hosted labels running PLATFORM_IT=1 pnpm test:integration against nonprod env, failing closed if substrate missing.
- MUST SHA-pin every third-party action and pass actionlint with zero errors.

### NEVER
- NEVER use floating tags (@v4, @main) for actions.
- NEVER set continue-on-error: true on integration suite steps or mock Postgres/fleet.
- NEVER use pull_request_target with write permissions or secrets from forks without an explicit approved exception.

### STRICTLY
- STRICTLY set permissions: contents: read (and only add narrower permissions if a step proves need).
- STRICTLY set concurrency groups cancel-in-progress per workflow/ref.
- STRICTLY leave e2e workflow disabled/scaffold with Sprint 20 ownership comment — no silent half-enabled Maestro job.

## Specification

**Objective:** Land actionlint-clean, SHA-pinned fast and integration workflows that enforce the Sprint 13 CI lanes on real substrate.

**Success state:** .github/workflows/ci-fast.yml and ci-integration.yml exist; actionlint exits 0; all uses: lines are 40-char SHAs; integration job runs-on self-hosted holocron labels and invokes pnpm test:integration fail-closed.

## Acceptance Criteria

### AC-1: Fast lane workflow every push/PR [PRIMARY]
**GIVEN:** D02-04 architecture and package scripts typecheck/lint/test exist
**WHEN:** ghactions-implementer adds .github/workflows/ci-fast.yml
**THEN:** Workflow triggers on push and pull_request, runs typecheck+lint+unit/pure, uses SHA-pinned actions, permissions contents:read, concurrency set
**VERIFY:** `test -f .github/workflows/ci-fast.yml && rg -n 'on:|push:|pull_request:|typecheck|lint|permissions:|concurrency:|uses: .*@[0-9a-f]{40}' .github/workflows/ci-fast.yml`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem + actionlint + GitHub Actions runner metadata
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem + actionlint + GitHub Actions runner metadata",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "workflow missing",
      "floating tags"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "pre_impl_workflows",
      "action": {
        "actor": "operator",
        "steps": [
          "Add ci-fast.yml per D02-04.",
          "Run AC-1 verify and capture file contents."
        ]
      },
      "end_state": {
        "must_observe": [
          "path_exists: `.github/workflows/ci-fast.yml` == true",
          "present: present count: 1",
          "present: present count: 1",
          "step/command: typecheck",
          "step/command: lint",
          "must_observe_literal: `permissions contents read` count: 1",
          "must_observe_literal: `concurrency group set` count: 1",
          "uses lines end with 40-char SHA"
        ],
        "must_not_observe": [
          "empty/start signature: `uses: actions/checkout@v4` OR count: 0",
          "empty/start signature: `permissions: write-all` OR count: 0",
          "empty jobs"
        ]
      }
    }
  ]
}
```

### AC-2: Integration lane pre-merge real services
**GIVEN:** D02-02 nonprod namespace env contract and D02-03 self-hosted runner labels exist
**WHEN:** ghactions-implementer adds .github/workflows/ci-integration.yml
**THEN:** Workflow runs on pull_request (pre-merge), runs-on self-hosted holocron/tailnet labels, executes PLATFORM_IT=1 pnpm test:integration with nonprod DATABASE_URL/FLEET_URL, and fails closed without continue-on-error
**VERIFY:** `test -f .github/workflows/ci-integration.yml && rg -n 'pull_request|self-hosted|holocron|test:integration|PLATFORM_IT|DATABASE_URL|FLEET_URL|permissions:|concurrency:' .github/workflows/ci-integration.yml && ! rg -n 'continue-on-error:\s*true' .github/workflows/ci-integration.yml`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** self-hosted runner + nonprod Postgres + fleet + GHA
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "self-hosted runner + nonprod Postgres + fleet + GHA",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "ubuntu-latest only",
      "continue-on-error"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "pre_impl_workflows",
      "action": {
        "actor": "operator",
        "steps": [
          "Add ci-integration.yml targeting D02-03 labels and D02-02 env.",
          "Verify no continue-on-error and real test:integration invocation."
        ]
      },
      "end_state": {
        "must_observe": [
          "must_observe_literal: `pull_request trigger` count: 1",
          "self-hosted: present count: 1",
          "label: present count: 1",
          "PLATFORM_IT=1",
          "pnpm test:integration",
          "must_observe_literal: `DATABASE_URL or nonprod env reference` count: 1",
          "must_observe_literal: `FLEET_URL or fleet env reference` count: 1",
          "must_observe_literal: `no continue-on-error true` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `runs-on: ubuntu-latest as sole runner for integration suite` OR count: 0",
          "empty/start signature: `mock database service container substituting for tailnet nonprod` OR count: 0",
          "empty/start signature: `continue-on-error: true` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-3: actionlint clean + all actions SHA-pinned
**GIVEN:** ci-fast.yml and ci-integration.yml exist (and optional e2e scaffold)
**WHEN:** operator runs actionlint on .github/workflows
**THEN:** actionlint exits 0 and every uses: line pins a 40-char commit SHA (no floating tags)
**VERIFY:** `actionlint .github/workflows/*.yml && ! rg -n 'uses: [^\n]+@(v[0-9]|main|master|latest)' .github/workflows/*.yml && rg -n 'uses: .+@[0-9a-f]{40}' .github/workflows/ci-fast.yml .github/workflows/ci-integration.yml`
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
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "floating tag",
      "actionlint error"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "workflows_seeded",
      "action": {
        "actor": "operator",
        "steps": [
          "Run actionlint on all workflow files.",
          "Scan for floating tags and confirm SHA pins."
        ]
      },
      "end_state": {
        "must_observe": [
          "actionlint exitCode: 0",
          "uses lines with 40-char SHA present in ci-fast.yml",
          "uses lines with 40-char SHA present in ci-integration.yml"
        ],
        "must_not_observe": [
          "empty/start signature: `actionlint error` OR count: 0",
          "empty/start signature: `uses: actions/checkout@v4` OR count: 0",
          "empty/start signature: `uses: ...@main` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-4: E2e scaffold disabled + path-aware PR proof
**GIVEN:** D02-04 e2e scaffold policy and fast path filters
**WHEN:** implementer adds optional .github/workflows/ci-e2e.yml scaffold and path filters on fast/integration
**THEN:** E2e workflow is present as disabled/workflow_dispatch-only or if: false with Sprint 20 comment; fast path filters include tests/ so a PR touching tests/ still runs fast
**VERIFY:** `(test -f .github/workflows/ci-e2e.yml && rg -n 'workflow_dispatch|if:\s*false|Sprint 20|Maestro' .github/workflows/ci-e2e.yml) && rg -n 'tests/' .github/workflows/ci-fast.yml`
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
      "e2e fully enabled without substrate"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "workflows_seeded",
      "action": {
        "actor": "operator",
        "steps": [
          "Inspect ci-e2e scaffold and ci-fast path filters.",
          "Confirm tests/ is in fast paths and e2e is not auto-running on every PR."
        ]
      },
      "end_state": {
        "must_observe": [
          "ci-e2e.yml exists",
          "workflow_dispatch or if: false",
          "Sprint 20 or Maestro comment",
          "tests/: present count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `e2e job always on: pull_request without guard` OR count: 0",
          "empty/start signature: `fast ignores tests/ path entirely` OR count: 0"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | ci-fast.yml triggers on pull_request when the fast workflow is committed | AC-1 | `rg -n 'pull_request' .github/workflows/ci-fast.yml` | happy_path |
| TC-2 | ci-integration.yml runs on self-hosted labels when the integration workflow is committed | AC-2 | `rg -n 'self-hosted' .github/workflows/ci-integration.yml` | happy_path |
| TC-3 | actionlint exits 0 when run against .github/workflows after D02-05 | AC-3 | `actionlint .github/workflows/*.yml` | error_path |
| TC-4 | No floating action tags remain in ci-fast.yml or ci-integration.yml when pin audit runs | AC-3 | `! rg -n 'uses: [^\n]+@(v[0-9]|main|master|latest)' .github/workflows/ci-fast.yml .github/workflows/ci-integration.yml` | edge |
| TC-5 | ci-fast.yml path filters include tests/ when path-aware configuration is present | AC-4 | `rg -n 'tests/' .github/workflows/ci-fast.yml` | happy_path |

## Reading List

- `docs/ci/lane-architecture.md` (all) — REQUIRED — D02-04 design contract (create if sequencing requires reading SPRINT until D02-04 lands)
- `.github/workflows/verify-no-convex-env.yml` (all) — SHA-pin + permissions baseline already in repo
- `package.json` (scripts) — typecheck/lint/test and future test:integration script from D02-01
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (CI lanes) — Lane constitution

## Guardrails

### WRITE-ALLOWED
- .github/workflows/ci-fast.yml (NEW)
- .github/workflows/ci-integration.yml (NEW)
- .github/workflows/ci-e2e.yml (NEW scaffold)
- scripts/ci/** (NEW optional helpers)
- docs/ci/lane-architecture.md (MODIFY only if implementer must sync concrete workflow filenames)

### WRITE-PROHIBITED
- services/platform/src/** — not workflow implementation
- app/** — not workflow implementation
- .spec/prds/mk6-migration/tasks/sprint-12-*/** — immutable prior evidence
- registering runners on the host — D02-03 owns runner install

### Boundaries
- **always:** Match runner labels from D02-03 / architecture doc, Pin actions like verify-no-convex-env.yml
- **ask_first:** Adding secrets beyond nonprod DATABASE_URL/FLEET_URL/HOLO keys already in stack
- **never:** Mock integration dependencies, Enable e2e Maestro job without Sprint 20 substrate

## Design

- **references:** docs/ci/lane-architecture.md, .github/workflows/verify-no-convex-env.yml, 10-e2e-testing.md
- **pattern:** uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
- **pattern_source:** .github/workflows/verify-no-convex-env.yml:19-20
- **anti_pattern:** uses: actions/checkout@v4 without SHA; integration on ubuntu-latest with a disposable Postgres service container claiming to be the tailnet nonprod namespace.
- note: Reuse checkout/setup-bun pin SHAs already proven in verify-no-convex-env.yml unless newer SHAs are deliberately upgraded and commented.
- note: Integration job should export the same env contract D02-02 documents for nonprod seed/reset.

## Agent Assignment

- **implementer:** ghactions-implementer — Writes validated workflow YAML with actionlint, SHA pinning, OIDC/permissions hygiene, and real-service integration job wiring.
- **reviewer:** ghactions-reviewer — Adversarial security and correctness review of implemented workflows (D02-06 closes the formal review, but D02-05 still pairs a reviewer on the PR).

## Verification Gates

- **AC-1 fast workflow present:** `test -f .github/workflows/ci-fast.yml && rg -n 'pull_request|typecheck|lint' .github/workflows/ci-fast.yml` → Exit 0
- **AC-2 integration workflow real-service:** `rg -n 'self-hosted|test:integration|PLATFORM_IT' .github/workflows/ci-integration.yml` → Exit 0
- **AC-3 actionlint + pins:** `actionlint .github/workflows/*.yml && ! rg -n 'uses: [^\n]+@(v[0-9]|main|master|latest)' .github/workflows/ci-fast.yml .github/workflows/ci-integration.yml` → Exit 0; no floating tags
- **AC-4 e2e scaffold + tests/ path:** `test -f .github/workflows/ci-e2e.yml && rg -n 'tests/' .github/workflows/ci-fast.yml` → Exit 0
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only .github/workflows/** and optional scripts/ci/** or docs/ci/**

## Coding Standards

- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md

## Dependencies

- **depends_on:** D02-02, D02-03, D02-04
- **blocks:** D02-06

## Notes

- RED evidence: before workflows exist, actionlint/path checks fail; after, they pass.
- Live GHA run on a real PR is the strongest seeded evidence for AC-1/AC-2; offline file+actionlint proofs are the minimum local gate.
- Preserve verify-no-convex-env.yml unchanged unless a shared composite action is introduced (out of scope unless needed).

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-05",
  "proposed_by": "ghactions-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "pre_impl_workflows": {
      "description": "Repo with only verify-no-convex-env.yml; no ci-fast/ci-integration yet",
      "seed_method": "cli",
      "entrypoint": "ls .github/workflows",
      "records": [
        "verify-no-convex-env.yml present",
        "ci-fast.yml absent",
        "ci-integration.yml absent"
      ]
    },
    "workflows_seeded": {
      "description": "After D02-05 GREEN: fast + integration workflows (+ e2e scaffold) committed",
      "seed_method": "cli",
      "entrypoint": "ls .github/workflows && actionlint .github/workflows/*.yml",
      "records": [
        "ci-fast.yml",
        "ci-integration.yml",
        "ci-e2e.yml scaffold",
        "actionlint exit 0",
        "SHA-pinned uses"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN D02-04 architecture WHEN ci-fast.yml is added THEN it triggers on push and pull_request, runs typecheck+lint+unit/pure, is SHA-pinned, permissions contents:read, concurrency set.",
      "verify": "test -f .github/workflows/ci-fast.yml && rg -n 'on:|push:|pull_request:|typecheck|lint|permissions:|concurrency:|uses: .*@[0-9a-f]{40}' .github/workflows/ci-fast.yml",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem + actionlint + GitHub Actions runner metadata",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "workflow missing",
            "floating tags"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_impl_workflows",
            "action": {
              "actor": "operator",
              "steps": [
                "Add ci-fast.yml per D02-04.",
                "Run AC-1 verify and capture file contents."
              ]
            },
            "end_state": {
              "must_observe": [
                "path_exists: `.github/workflows/ci-fast.yml` == true",
                "present: present count: 1",
                "present: present count: 1",
                "step/command: typecheck",
                "step/command: lint",
                "must_observe_literal: `permissions contents read` count: 1",
                "must_observe_literal: `concurrency group set` count: 1",
                "uses lines end with 40-char SHA"
              ],
              "must_not_observe": [
                "empty/start signature: `uses: actions/checkout@v4` OR count: 0",
                "empty/start signature: `permissions: write-all` OR count: 0",
                "empty jobs"
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
      "description": "GIVEN D02-02/D02-03 substrate WHEN ci-integration.yml is added THEN it is pre-merge, self-hosted holocron/tailnet, runs PLATFORM_IT=1 pnpm test:integration with nonprod env, no continue-on-error.",
      "verify": "test -f .github/workflows/ci-integration.yml && rg -n 'pull_request|self-hosted|holocron|test:integration|PLATFORM_IT|DATABASE_URL|FLEET_URL|permissions:|concurrency:' .github/workflows/ci-integration.yml && ! rg -n 'continue-on-error:\\s*true' .github/workflows/ci-integration.yml",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "self-hosted runner + nonprod Postgres + fleet + GHA",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "ubuntu-latest only",
            "continue-on-error"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_impl_workflows",
            "action": {
              "actor": "operator",
              "steps": [
                "Add ci-integration.yml targeting D02-03 labels and D02-02 env.",
                "Verify no continue-on-error and real test:integration invocation."
              ]
            },
            "end_state": {
              "must_observe": [
                "must_observe_literal: `pull_request trigger` count: 1",
                "self-hosted: present count: 1",
                "label: present count: 1",
                "PLATFORM_IT=1",
                "pnpm test:integration",
                "must_observe_literal: `DATABASE_URL or nonprod env reference` count: 1",
                "must_observe_literal: `FLEET_URL or fleet env reference` count: 1",
                "must_observe_literal: `no continue-on-error true` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `runs-on: ubuntu-latest as sole runner for integration suite` OR count: 0",
                "empty/start signature: `mock database service container substituting for tailnet nonprod` OR count: 0",
                "empty/start signature: `continue-on-error: true` OR count: 0"
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
      "description": "GIVEN new workflows WHEN actionlint runs THEN exit 0 and every uses: line is a 40-char SHA with no floating tags.",
      "verify": "actionlint .github/workflows/*.yml && ! rg -n 'uses: [^\\n]+@(v[0-9]|main|master|latest)' .github/workflows/*.yml && rg -n 'uses: .+@[0-9a-f]{40}' .github/workflows/ci-fast.yml .github/workflows/ci-integration.yml",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "actionlint CLI + filesystem",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "floating tag",
            "actionlint error"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "workflows_seeded",
            "action": {
              "actor": "operator",
              "steps": [
                "Run actionlint on all workflow files.",
                "Scan for floating tags and confirm SHA pins."
              ]
            },
            "end_state": {
              "must_observe": [
                "actionlint exitCode: 0",
                "uses lines with 40-char SHA present in ci-fast.yml",
                "uses lines with 40-char SHA present in ci-integration.yml"
              ],
              "must_not_observe": [
                "empty/start signature: `actionlint error` OR count: 0",
                "empty/start signature: `uses: actions/checkout@v4` OR count: 0",
                "empty/start signature: `uses: ...@main` OR count: 0"
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
      "description": "GIVEN e2e scaffold policy WHEN ci-e2e.yml and path filters land THEN e2e is disabled/dispatch-only with Sprint 20 note and fast includes tests/ paths.",
      "verify": "(test -f .github/workflows/ci-e2e.yml && rg -n 'workflow_dispatch|if:\\s*false|Sprint 20|Maestro' .github/workflows/ci-e2e.yml) && rg -n 'tests/' .github/workflows/ci-fast.yml",
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
            "e2e fully enabled without substrate"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "workflows_seeded",
            "action": {
              "actor": "operator",
              "steps": [
                "Inspect ci-e2e scaffold and ci-fast path filters.",
                "Confirm tests/ is in fast paths and e2e is not auto-running on every PR."
              ]
            },
            "end_state": {
              "must_observe": [
                "ci-e2e.yml exists",
                "workflow_dispatch or if: false",
                "Sprint 20 or Maestro comment",
                "tests/: present count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `e2e job always on: pull_request without guard` OR count: 0",
                "empty/start signature: `fast ignores tests/ path entirely` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "ci-fast.yml triggers on pull_request when the fast workflow is committed",
      "verify": "rg -n 'pull_request' .github/workflows/ci-fast.yml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "ci-integration.yml runs on self-hosted labels when the integration workflow is committed",
      "verify": "rg -n 'self-hosted' .github/workflows/ci-integration.yml",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "actionlint exits 0 when run against .github/workflows after D02-05",
      "verify": "actionlint .github/workflows/*.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "No floating action tags remain in ci-fast.yml or ci-integration.yml when pin audit runs",
      "verify": "! rg -n 'uses: [^\\n]+@(v[0-9]|main|master|latest)' .github/workflows/ci-fast.yml .github/workflows/ci-integration.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "ci-fast.yml path filters include tests/ when path-aware configuration is present",
      "verify": "rg -n 'tests/' .github/workflows/ci-fast.yml",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
