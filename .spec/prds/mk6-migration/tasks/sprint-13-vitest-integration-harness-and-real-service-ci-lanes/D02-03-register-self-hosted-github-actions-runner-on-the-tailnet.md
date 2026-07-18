# D02-03 — Register self-hosted GitHub Actions runner on the tailnet
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Register a labeled self-hosted GitHub Actions runner on the tailnet with fail-closed health.

**Success state:** Runner shows online with labels [self-hosted, holocron, integration]; health command fails closed when the runner process is stopped; no secrets committed.

## Background

- **Specialist rationale:** Owns runner host registration, labels, and fail-closed health for the tailnet self-hosted substrate used by integration (and later e2e) lanes.
- **Planning rationale:** Integration lane must run against real Postgres + Mastra + fleet on the tailnet; GitHub-hosted ubuntu-latest cannot reach those services. T-PLAT-019 runner substrate starts here; Sprint 20 adds Maestro on macOS later.
- **How to verify (human):** Run the documented runner health command and observe online+labels; stop the runner service and re-run to observe non-zero fail-closed; confirm workflow design labels match registered labels.
- **Scope:** Runner install/register docs+scripts, labels contract, health CLI/check. Does not author the full fast/integration YAML (D02-05).
- **PRD refs:** T-PLAT-019, 10-e2e-testing

## Critical Constraints

### MUST
- MUST register a self-hosted runner reachable on the tailnet with stable labels including self-hosted, holocron, and integration
- MUST document registration and token rotation without committing runner tokens to git
- MUST provide `holo ci runner:status` (or equivalent) that exits 0 only when the runner is online with required labels

### NEVER
- NEVER commit .runner credentials, registration tokens, or _work caches into the repo
- NEVER rely solely on ubuntu-latest for the integration lane
- NEVER silently treat a missing/offline runner as skipped success

### STRICTLY
- STRICTLY labels used here are the exact labels D02-05 workflows will set in runs-on
- STRICTLY offline runner health check exits non-zero
- STRICTLY single-user tailnet trust — no multi-tenant runner pool theatre

## Specification

**Objective:** Register a labeled self-hosted GitHub Actions runner on the tailnet with fail-closed health.

**Success state:** Runner shows online with labels [self-hosted, holocron, integration]; health command fails closed when the runner process is stopped; no secrets committed.

## Acceptance Criteria

### AC-1: Runner registered online with required labels [PRIMARY]
**GIVEN:** The tailnet host is prepared and a short-lived registration token is available out-of-band.
**WHEN:** The operator runs the documented registration script/procedure.
**THEN:** `holo ci runner:status --json` reports status=online and labels including self-hosted, holocron, and integration.
**VERIFY:** `bun services/platform/src/cli/holo.ts ci runner:status --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** self-hosted GitHub Actions runner + gh API/local service
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "self-hosted GitHub Actions runner + gh API/local service",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "runner_host_ready",
      "action": {
        "actor": "operator",
        "steps": [
          "Register the runner with labels self-hosted,holocron,integration.",
          "Start the runner service.",
          "Run holo ci runner:status --json."
        ]
      },
      "end_state": {
        "must_observe": [
          "status: 'online'",
          "labels includes 'self-hosted'",
          "labels includes 'holocron'",
          "labels includes 'integration'"
        ],
        "must_not_observe": [
          "empty/start signature: `status: 'offline'` OR count: 0",
          "empty/start signature: `labels: []` OR count: 0",
          "empty/start signature: `exitCode: 1` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-2: Offline runner fails closed
**GIVEN:** The runner was previously online.
**WHEN:** The operator stops the runner service and re-runs health status.
**THEN:** The health command exits non-zero and reports status=offline (or unreachable), never skipped/green.
**VERIFY:** `bun services/platform/src/cli/holo.ts ci runner:status --json; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** self-hosted runner service control + holo CLI
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "self-hosted runner service control + holo CLI",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "runner_stopped",
      "action": {
        "actor": "operator",
        "steps": [
          "Stop the runner service.",
          "Run holo ci runner:status --json and capture exit code."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "status: 'offline'"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `status: 'online'` OR count: 0",
          "empty/start signature: `skipped: true` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-3: Label contract committed for workflow consumers
**GIVEN:** Runner registration is complete.
**WHEN:** An operator reads docs/ci/runner-labels.md (or equivalent committed contract).
**THEN:** The file lists exact runs-on labels for integration and notes e2e/macOS as future Sprint 20 substrate.
**VERIFY:** `test -f docs/ci/runner-labels.md && rg -n "self-hosted|holocron|integration|e2e" docs/ci/runner-labels.md`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** filesystem contract artifact
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "filesystem contract artifact",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "runner_registered_online",
      "action": {
        "actor": "operator",
        "steps": [
          "Open docs/ci/runner-labels.md.",
          "Confirm integration labels match registered runner labels."
        ]
      },
      "end_state": {
        "must_observe": [
          "file exists: docs/ci/runner-labels.md",
          "integration labels: self-hosted,holocron,integration",
          "e2e substrate noted as Sprint 20"
        ],
        "must_not_observe": [
          "empty label list",
          "empty/start signature: `ubuntu-latest as only integration runner` OR count: 0",
          "missing file"
        ]
      }
    }
  ]
}
```

### AC-4: No runner secrets committed
**GIVEN:** Registration completed on the host.
**WHEN:** The operator scans the git worktree for runner credentials.
**THEN:** No .runner, registration token, or actions-runner/_work artifacts are tracked; .gitignore covers them.
**VERIFY:** `git ls-files | rg -n "\.runner$|actions-runner/_work|\.credentials$" ; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** git index + .gitignore
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "git index + .gitignore",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "repo_secret_scan",
      "action": {
        "actor": "operator",
        "steps": [
          "git ls-files for runner credential paths.",
          "Confirm .gitignore entries for actions-runner and .runner."
        ]
      },
      "end_state": {
        "must_observe": [
          "tracked_runner_secrets: 0",
          "must_observe_literal: `.gitignore contains actions-runner` count: 1",
          "must_observe_literal: `.gitignore contains .runner` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `tracked .runner file` OR count: 0",
          "empty/start signature: `committed RUNNER_TOKEN` OR count: 0",
          "empty/start signature: `actions-runner/_work tracked` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-5: Integration lane fail-closed without runner labels
**GIVEN:** A sample workflow job declares runs-on labels from the contract.
**WHEN:** Those labels are removed or the runner is offline.
**THEN:** The job does not report success; operator health and workflow path fail closed (queued/failed, never green skip).
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'AC-5'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** runner health CLI + workflow label contract
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "runner health CLI + workflow label contract",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "runner_stopped",
      "action": {
        "actor": "operator",
        "steps": [
          "Assert health exits non-zero while offline.",
          "Assert label contract still requires self-hosted holocron integration."
        ]
      },
      "end_state": {
        "must_observe": [
          "health exitCode: 1",
          "required_labels: ['self-hosted','holocron','integration']",
          "fail_closed: true"
        ],
        "must_not_observe": [
          "health exitCode: 0",
          "empty/start signature: `continue-on-error: true as default success path` OR count: 0"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Runner status reports online when the self-hosted service is running | AC-1 | `bun services/platform/src/cli/holo.ts ci runner:status --json` | happy_path |
| TC-2 | Runner status labels include self-hosted holocron and integration when online | AC-1 | `bun services/platform/src/cli/holo.ts ci runner:status --json` | happy_path |
| TC-3 | Runner status exits non-zero when the runner service is stopped | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'TC-3'` | error |
| TC-4 | docs/ci/runner-labels.md lists the integration label set | AC-3 | `rg -n "self-hosted|holocron|integration" docs/ci/runner-labels.md` | happy_path |
| TC-5 | git ls-files reports zero tracked runner credential paths | AC-4 | `git ls-files | rg -n "\.runner$|actions-runner/_work|\.credentials$" ; test $? -ne 0` | edge |
| TC-6 | Offline runner health is fail-closed and not skippable as success | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'TC-6'` | error |

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/SPRINT.md` (all) — Runner substrate for gate step 4
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (all) — CI lanes + e2e runner host notes
- `.github/workflows/verify-no-convex-env.yml` (all) — Existing SHA-pinned workflow style
- `services/platform/src/stack/launchd.ts` (all) — launchd patterns for long-running host services

## Guardrails

### WRITE-ALLOWED
- docs/ci/runner-labels.md (NEW)
- docs/ci/self-hosted-runner.md (NEW)
- scripts/ci/register-runner.sh (NEW)
- services/platform/src/cli/holo.ts (MODIFY — ci runner:status)
- services/platform/src/ci/runner-status.ts (NEW)
- services/platform/tests/integration/runner-status.test.ts (NEW)
- .gitignore (MODIFY — ignore actions-runner/.runner credentials)

### WRITE-PROHIBITED
- .github/workflows/ci-*.yml — D02-05 implements workflows
- actions-runner/** — must never be committed
- app/** — out of scope
- .spec/prds/mk6-migration/tasks/sprint-12-*/** — do not touch Sprint 12 evidence

### Boundaries
- **always:** Labels: self-hosted, holocron, integration, Fail closed when offline
- **ask_first:** Registering additional macOS e2e runner hosts before Sprint 20
- **never:** Commit registration tokens, Use ubuntu-latest as the integration runner

## Design

- **references:** .github/workflows/verify-no-convex-env.yml, docs/ci/self-hosted-runner.md
- **pattern:** Host-local actions-runner install + launchd KeepAlive; holo ci runner:status probes local service state and/or gh api repos/.../actions/runners and asserts required labels.
- **pattern_source:** services/platform/src/stack/launchd.ts
- **anti_pattern:** Document-only registration with no machine-checkable health command, or continue-on-error online checks.
- note: D02-05 must set runs-on: [self-hosted, holocron, integration] for the integration job
- note: D02-04 architecture doc should cite the same label contract

## Agent Assignment

- **implementer:** devops-engineer — Owns runner host registration, labels, and fail-closed health for the tailnet self-hosted substrate used by integration (and later e2e) lanes.
- **reviewer:** ghactions-reviewer — Adversarial check of runner labels, token handling, and offline fail-closed behavior before D02-05 binds workflows to those labels.

## Verification Gates

- **AC-1 online labels:** `bun services/platform/src/cli/holo.ts ci runner:status --json` → status online; labels include integration
- **AC-2 offline fail-closed:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'AC-2'` → Exit proves non-zero offline path
- **AC-3 label contract file:** `test -f docs/ci/runner-labels.md && rg -n "integration" docs/ci/runner-labels.md` → File present with labels
- **AC-4 no secrets tracked:** `git ls-files | rg -n "\.runner$|actions-runner/_work|\.credentials$" ; test $? -ne 0` → No matches
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** —
- **blocks:** D02-05

## Notes

T-PLAT-019 in e2e-criteria names Maestro iOS; this sprint owns the runner substrate labels + registration. macOS/Maestro host details remain Sprint 20 (D03-*). Integration runner may be the mini (linux/mac arm64) as long as it can reach Postgres+fleet on the tailnet.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-03",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "runner_host_ready": {
      "description": "Tailnet host with GitHub runner package installable and repo admin registration token available out-of-band.",
      "seed_method": "cli",
      "entrypoint": "uname -a && gh api user",
      "records": [
        "tailnet host reachable",
        "gh authenticated for registration",
        "no .runner file committed in repo"
      ]
    },
    "runner_registered_online": {
      "description": "Runner service registered and running with required labels.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts ci runner:status --json",
      "records": [
        "status: online",
        "labels include self-hosted,holocron,integration"
      ]
    },
    "runner_stopped": {
      "description": "Runner service deliberately stopped to prove fail-closed health.",
      "seed_method": "cli",
      "entrypoint": "launchctl unload ~/Library/LaunchAgents/actions.runner.*.plist 2>/dev/null || true",
      "records": [
        "runner process not listening",
        "expected health exit != 0"
      ]
    },
    "repo_secret_scan": {
      "description": "Working tree scanned for accidental runner credential commits.",
      "seed_method": "cli",
      "entrypoint": "rg -n \"\\.runner|RUNNER_TOKEN|actions-runner\" --glob '!.git/**' .",
      "records": [
        "no committed registration token",
        ".gitignore covers actions-runner/_work and .runner"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN tailnet host ready WHEN runner is registered THEN status=online with labels self-hosted,holocron,integration.",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "self-hosted GitHub Actions runner + gh API/local service",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "runner_host_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Register the runner with labels self-hosted,holocron,integration.",
                "Start the runner service.",
                "Run holo ci runner:status --json."
              ]
            },
            "end_state": {
              "must_observe": [
                "status: 'online'",
                "labels includes 'self-hosted'",
                "labels includes 'holocron'",
                "labels includes 'integration'"
              ],
              "must_not_observe": [
                "empty/start signature: `status: 'offline'` OR count: 0",
                "empty/start signature: `labels: []` OR count: 0",
                "empty/start signature: `exitCode: 1` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN runner stopped WHEN health runs THEN exit non-zero status=offline.",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "self-hosted runner service control + holo CLI",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "runner_stopped",
            "action": {
              "actor": "operator",
              "steps": [
                "Stop the runner service.",
                "Run holo ci runner:status --json and capture exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "status: 'offline'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `status: 'online'` OR count: 0",
                "empty/start signature: `skipped: true` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN registration complete WHEN label contract is read THEN integration labels and Sprint 20 e2e note are present.",
      "verify": "test -f docs/ci/runner-labels.md && rg -n \"self-hosted|holocron|integration|e2e\" docs/ci/runner-labels.md",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem contract artifact",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "runner_registered_online",
            "action": {
              "actor": "operator",
              "steps": [
                "Open docs/ci/runner-labels.md.",
                "Confirm integration labels match registered runner labels."
              ]
            },
            "end_state": {
              "must_observe": [
                "file exists: docs/ci/runner-labels.md",
                "integration labels: self-hosted,holocron,integration",
                "e2e substrate noted as Sprint 20"
              ],
              "must_not_observe": [
                "empty label list",
                "empty/start signature: `ubuntu-latest as only integration runner` OR count: 0",
                "missing file"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN registration complete WHEN git tree is scanned THEN zero runner secrets are tracked.",
      "verify": "git ls-files | rg -n \"\\.runner$|actions-runner/_work|\\.credentials$\" ; test $? -ne 0",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git index + .gitignore",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo_secret_scan",
            "action": {
              "actor": "operator",
              "steps": [
                "git ls-files for runner credential paths.",
                "Confirm .gitignore entries for actions-runner and .runner."
              ]
            },
            "end_state": {
              "must_observe": [
                "tracked_runner_secrets: 0",
                "must_observe_literal: `.gitignore contains actions-runner` count: 1",
                "must_observe_literal: `.gitignore contains .runner` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `tracked .runner file` OR count: 0",
                "empty/start signature: `committed RUNNER_TOKEN` OR count: 0",
                "empty/start signature: `actions-runner/_work tracked` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN offline runner WHEN integration label path is evaluated THEN fail_closed is true.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "runner health CLI + workflow label contract",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "runner_stopped",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert health exits non-zero while offline.",
                "Assert label contract still requires self-hosted holocron integration."
              ]
            },
            "end_state": {
              "must_observe": [
                "health exitCode: 1",
                "required_labels: ['self-hosted','holocron','integration']",
                "fail_closed: true"
              ],
              "must_not_observe": [
                "health exitCode: 0",
                "empty/start signature: `continue-on-error: true as default success path` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Runner status reports online when the self-hosted service is running",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Runner status labels include self-hosted holocron and integration when online",
      "verify": "bun services/platform/src/cli/holo.ts ci runner:status --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Runner status exits non-zero when the runner service is stopped",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'TC-3'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "docs/ci/runner-labels.md lists the integration label set",
      "verify": "rg -n \"self-hosted|holocron|integration\" docs/ci/runner-labels.md",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "git ls-files reports zero tracked runner credential paths",
      "verify": "git ls-files | rg -n \"\\.runner$|actions-runner/_work|\\.credentials$\" ; test $? -ne 0",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Offline runner health is fail-closed and not skippable as success",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/runner-status.test.ts -t 'TC-6'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
