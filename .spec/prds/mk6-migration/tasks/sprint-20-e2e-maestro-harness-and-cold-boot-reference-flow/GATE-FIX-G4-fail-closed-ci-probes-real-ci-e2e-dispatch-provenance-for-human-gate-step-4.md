# GATE-FIX-G4 — Fail-closed CI probes + real ci-e2e dispatch provenance for human gate step 4
> Status: ⬜ Pending
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: ghactions-reviewer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: ghactions-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Human gates: 4
> Source: failing human gates in gate-results.json + sprint-goal-state.json (2026-07-20)

## Outcome

probe-ci-e2e-prereqs.sh fail-closed; capture-ci-provenance.sh writes committed ci-run-provenance.json after real success; capstone --from-ci-artifact green; step4 PASS only from CI provenance.

**Success state:** Committed ci-run-provenance.json with run_id/run_url/head_sha/artifact_sha256/conclusion:success; capstone green from CI download; regenerate step4 PASS.

## Background

- **Specialist rationale (ghactions-planner):** Step 4 FAIL: no ci-run-provenance.json. REDHAT-FIX-H2 blocked: no gh, no token, no self-hosted runner. Workflow already exists.
- **Agent rationale:** Owns operator probes, gh dispatch/download, provenance capture; supersedes REDHAT-FIX-H2 capture path.
- **PRD refs:** UC-SYNC-02, D03-05, D03-07, REDHAT-FIX-H2, human-gate-step-4

## Critical Constraints

### MUST
- MUST fail-closed probe for gh/auth/runner/secrets
- MUST dispatch real ci-e2e.yml and record real run_id + artifact_sha256
- MUST capstone green from CI bundle not conclusion alone

### NEVER
- NEVER substitute local Maestro for CI provenance
- NEVER rewrite ci-e2e.yml to force pass
- NEVER commit binary artifacts

### STRICTLY
- STRICTLY head_sha matches dispatched run
- STRICTLY artifact name maestro-reference-flow-<run_id>
- STRICTLY honest partial completion: AC-1 can land without secrets; AC-2/3 open until real run

## Specification

**Objective:** Unblock step 4 with fail-closed probes and real CI provenance + capstone from CI bundle.

**Success state:** Committed ci-run-provenance.json with run_id/run_url/head_sha/artifact_sha256/conclusion:success; capstone green from CI download; regenerate step4 PASS.

## Acceptance Criteria

### AC-1: Fail-closed operator prerequisite probes [PRIMARY] [PRIMARY]
**GIVEN:** host may lack gh/auth/runner/secrets
**WHEN:** scripts/e2e/probe-ci-e2e-prereqs.sh --check
**THEN:** exit non-zero with next_input_needed when missing; exit 0 only when all ready; never print secrets
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/probe-ci-e2e-prereqs.sh + holo ci runner:status + gh
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/probe-ci-e2e-prereqs.sh + holo ci runner:status + gh",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "skip-to-green",
      "probe always exits 0"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "prereqs_missing_fixture",
      "action": {
        "actor": "operator",
        "steps": [
          "Run probe --check without gh/auth",
          "Parse JSON and next_input_needed"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "ok: false",
          "next_input_needed length > 0"
        ],
        "must_not_observe": [
          "exitCode 0",
          "secret values in stdout",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-2: Real ci-e2e dispatch + committed ci-run-provenance.json
**GIVEN:** AC-1 probes green; ci-e2e.yml on dispatched ref
**WHEN:** gh workflow run ci-e2e.yml + capture-ci-provenance.sh
**THEN:** committed provenance has run_id, run_url, head_sha 40hex, artifact_sha256 64hex, conclusion success; download has junit
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** gh CLI + scripts/e2e/capture-ci-provenance.sh + sha256
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "gh CLI + scripts/e2e/capture-ci-provenance.sh + sha256",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "local-files-substituted",
      "fabricated run_id"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "ci_run_success_with_artifact",
      "action": {
        "actor": "operator",
        "steps": [
          "gh workflow run ci-e2e.yml",
          "gh run watch --exit-status",
          "capture-ci-provenance.sh"
        ]
      },
      "end_state": {
        "must_observe": [
          "conclusion: \"success\"",
          "run_id > 0",
          "head_sha length=40",
          "artifact_sha256 length=64"
        ],
        "must_not_observe": [
          "local Maestro substitution",
          "head_sha mismatch",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-3: Capstone green from CI bundle + step4 path wired
**GIVEN:** AC-2 CI download dir + capstone-verdict.sh
**WHEN:** capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ and regenerate-sprint-gate
**THEN:** coldboot_gate green from bundle; step4 PASS from CI provenance only
**VERIFY:** `scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ && jq -e '.coldboot_gate=="green"' .tmp/ci-e2e-download/capstone-verdict.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** capstone-verdict.sh + regenerate-sprint-gate + CI bundle
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "capstone-verdict.sh + regenerate-sprint-gate + CI bundle",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static",
      "conclusion-only-pass",
      "local-maestro-substitution"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "ci_bundle_green_fixture",
      "action": {
        "actor": "operator",
        "steps": [
          "capstone --from-ci-artifact",
          "regenerate-sprint-gate.sh sprint-20"
        ]
      },
      "end_state": {
        "must_observe": [
          "coldboot_gate: \"green\"",
          "junit_failures: 0",
          "step4.verdict: \"PASS\" after CI provenance"
        ],
        "must_not_observe": [
          "green from conclusion only",
          "local Maestro as CI substitute",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

### AC-4: Step4 stays FAIL without real provenance even if probes later green
**GIVEN:** provenance files absent
**WHEN:** regenerate-sprint-gate.sh sprint-20
**THEN:** step4 verdict FAIL; probe green alone must not flip step4 PASS
**VERIFY:** `scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '.steps[]|select(.n==4)|.verdict=="FAIL"' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** regenerate-sprint-gate.sh + absent provenance
**TDD_STATE:** red
**FLOW_REF:** UC-SYNC-02
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "regenerate-sprint-gate.sh + absent provenance",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "mock",
      "static",
      "probe-green-implies-step4-pass",
      "local-maestro-substitution"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "provenance_absent_fixture",
      "action": {
        "actor": "operator",
        "steps": [
          "Ensure provenance absent",
          "regenerate-sprint-gate.sh"
        ]
      },
      "end_state": {
        "must_observe": [
          "step4.verdict: \"FAIL\"",
          "evidence_path contains \"absent\""
        ],
        "must_not_observe": [
          "step4 PASS",
          "empty/start signature: (0) or exitCode: 0 false pass"
        ]
      }
    }
  ],
  "id": "inline"
}
```

## Test Criteria

| ID | Statement | Maps to | Type | Verify |
|----|-----------|---------|------|--------|
| TC-1 | probe exits non-zero when gh missing | AC-1 | error_path | `env -u GH_TOKEN PATH=/usr/bin:/bin bash scripts/e2e/probe-ci-e2e-prereqs.sh --check; test $? -ne 0` |
| TC-2 | provenance suite fails closed when file absent | AC-2 | error_path | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'fail-closed'` |
| TC-3 | committed provenance has required CI fields | AC-2 | happy_path | `jq -e '.run_id and .run_url and (.head_sha|test("^[0-9a-f]{40}$")) and (.artifact_sha256|test("^[0-9a-f]{64}$")) and .conclusion=="success"' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json` |
| TC-4 | capstone green from CI bundle | AC-3 | happy_path | `scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ && jq -e '.coldboot_gate=="green"' .tmp/ci-e2e-download/capstone-verdict.json` |
| TC-5 | step4 FAIL when provenance absent | AC-4 | error_path | `scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '.steps[]|select(.n==4)|.verdict=="FAIL"' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json` |

## Reading List

- `.github/workflows/ci-e2e.yml` (1-93) — self-hosted labels, secrets, artifact name
- `REDHAT-FIX-H2-produce-ci-dispatched-maestro-evidence-and-preserve-artifact-metadata.md` (1-100) — H2 charter this task completes
- `scripts/e2e/regenerate-sprint-gate.sh` (63-70) — step4 provenance path
- `docs/ci/macos-e2e-runner.md` (1-120) — runner registration

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/probe-ci-e2e-prereqs.sh (NEW)
- scripts/e2e/capture-ci-provenance.sh (NEW)
- scripts/e2e/regenerate-sprint-gate.sh (MODIFY step4 dual-path)
- tests/integration/sprint20-ci-e2e-provenance.test.ts (NEW)
- .spec/.../ci-run-provenance.json (after real run only)
- docs/ci/macos-e2e-runner.md
- docs/ci/maestro-harness.md

### WRITE-PROHIBITED
- .github/workflows/ci-e2e.yml cosmetic force-pass
- fabricated run_id provenance
- commit binary artifacts
- print secret values

## Design

- **References:** .github/workflows/ci-e2e.yml, REDHAT-FIX-H2, capstone-verdict.sh
- **Note:** Supersedes REDHAT-FIX-H2 capture path
- **Note:** Requires G1/G2 for CI green --run
- **Pattern:** probe → dispatch → download → provenance JSON → capstone --from-ci-artifact
- **Pattern source:** ci-e2e.yml + REDHAT-FIX-H2
- **Anti-pattern:** local Maestro as CI provenance

## Verification Gates

- **Probe fail-closed:** `env -u GH_TOKEN PATH=/usr/bin:/bin bash scripts/e2e/probe-ci-e2e-prereqs.sh --check; test $? -ne 0` → Non-zero
- **Provenance suite:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts` → Exit 0 for implemented cases

## Agent Assignment

- **Implementer:** devops-engineer — Owns operator probes, gh dispatch/download, provenance capture; supersedes REDHAT-FIX-H2 capture path.
- **Reviewer:** ghactions-reviewer
- **Proposed by:** ghactions-planner

## Dependencies

- **Depends on:** REDHAT-FIX-H1, REDHAT-FIX-H3, D03-05, GATE-FIX-G1, GATE-FIX-G2
- **Blocks:** human-gate-step-4, sprint-20 close
- **External blockers:**
  - gh CLI + gh auth login
  - self-hosted runner labels [self-hosted, holocron, e2e]
  - secrets NONPROD_DATABASE_URL FLEET_URL PLATFORM_URL RN_API_KEY ZERO_ADMIN_PASSWORD
  - vars MAESTRO_DEVICE EXPO_DEV_BUILD_PATH MAESTRO_APP_ID
  - green Maestro on runner (G1/G2)

## Coding Standards

- RULES.md
- brain/docs/RED-FIRST-TEST-GATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-G4",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "prereqs_missing_fixture": {
      "description": "gh/auth/runner/secrets missing.",
      "seed_method": "cli",
      "records": [
        "which gh fails OR runner offline",
        "ci-run-provenance absent"
      ]
    },
    "prereqs_ready_fixture": {
      "description": "gh auth + online e2e runner + secrets present.",
      "seed_method": "cli",
      "records": [
        "runner_online_e2e true",
        "gh_auth true"
      ]
    },
    "provenance_absent_fixture": {
      "description": "No provenance files.",
      "seed_method": "cli",
      "records": [
        "ci-run-provenance.json absent"
      ]
    },
    "ci_run_success_with_artifact": {
      "description": "Real successful ci-e2e run with uploaded artifact.",
      "seed_method": "public_api",
      "records": [
        "conclusion success",
        "artifact maestro-reference-flow-<run_id>"
      ]
    },
    "ci_bundle_green_fixture": {
      "description": "Downloaded CI bundle with green junit/screenshot/video.",
      "seed_method": "public_api",
      "records": [
        "junit failures=0",
        "mov non-empty"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN host may lack gh/auth/runner/secrets WHEN scripts/e2e/probe-ci-e2e-prereqs.sh --check THEN exit non-zero with next_input_needed when missing; exit 0 only when all ready; never print secrets",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "scripts/e2e/probe-ci-e2e-prereqs.sh + holo ci runner:status + gh",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/probe-ci-e2e-prereqs.sh + holo ci runner:status + gh",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "skip-to-green",
            "probe always exits 0"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "prereqs_missing_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "Run probe --check without gh/auth",
                "Parse JSON and next_input_needed"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "ok: false",
                "next_input_needed length > 0"
              ],
              "must_not_observe": [
                "exitCode 0",
                "secret values in stdout",
                "empty/start signature: (0) or exitCode: 0 false pass"
              ]
            }
          }
        ],
        "id": "AC-1"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN AC-1 probes green; ci-e2e.yml on dispatched ref WHEN gh workflow run ci-e2e.yml + capture-ci-provenance.sh THEN committed provenance has run_id, run_url, head_sha 40hex, artifact_sha256 64hex, conclusion success; download has junit",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "gh CLI + scripts/e2e/capture-ci-provenance.sh + sha256",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gh CLI + scripts/e2e/capture-ci-provenance.sh + sha256",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "local-files-substituted",
            "fabricated run_id"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ci_run_success_with_artifact",
            "action": {
              "actor": "operator",
              "steps": [
                "gh workflow run ci-e2e.yml",
                "gh run watch --exit-status",
                "capture-ci-provenance.sh"
              ]
            },
            "end_state": {
              "must_observe": [
                "conclusion: \"success\"",
                "run_id > 0",
                "head_sha length=40",
                "artifact_sha256 length=64"
              ],
              "must_not_observe": [
                "local Maestro substitution",
                "head_sha mismatch",
                "empty/start signature: (0) or exitCode: 0 false pass"
              ]
            }
          }
        ],
        "id": "AC-2"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN AC-2 CI download dir + capstone-verdict.sh WHEN capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ and regenerate-sprint-gate THEN coldboot_gate green from bundle; step4 PASS from CI provenance only",
      "verify": "scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ && jq -e '.coldboot_gate==\"green\"' .tmp/ci-e2e-download/capstone-verdict.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "capstone-verdict.sh + regenerate-sprint-gate + CI bundle",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "capstone-verdict.sh + regenerate-sprint-gate + CI bundle",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "conclusion-only-pass",
            "local-maestro-substitution"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ci_bundle_green_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "capstone --from-ci-artifact",
                "regenerate-sprint-gate.sh sprint-20"
              ]
            },
            "end_state": {
              "must_observe": [
                "coldboot_gate: \"green\"",
                "junit_failures: 0",
                "step4.verdict: \"PASS\" after CI provenance"
              ],
              "must_not_observe": [
                "green from conclusion only",
                "local Maestro as CI substitute",
                "empty/start signature: (0) or exitCode: 0 false pass"
              ]
            }
          }
        ],
        "id": "AC-3"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN provenance files absent WHEN regenerate-sprint-gate.sh sprint-20 THEN step4 verdict FAIL; probe green alone must not flip step4 PASS",
      "verify": "scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '.steps[]|select(.n==4)|.verdict==\"FAIL\"' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "regenerate-sprint-gate.sh + absent provenance",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "regenerate-sprint-gate.sh + absent provenance",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "probe-green-implies-step4-pass",
            "local-maestro-substitution"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "provenance_absent_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "Ensure provenance absent",
                "regenerate-sprint-gate.sh"
              ]
            },
            "end_state": {
              "must_observe": [
                "step4.verdict: \"FAIL\"",
                "evidence_path contains \"absent\""
              ],
              "must_not_observe": [
                "step4 PASS",
                "empty/start signature: (0) or exitCode: 0 false pass"
              ]
            }
          }
        ],
        "id": "AC-4"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "probe exits non-zero when gh missing",
      "verify": "env -u GH_TOKEN PATH=/usr/bin:/bin bash scripts/e2e/probe-ci-e2e-prereqs.sh --check; test $? -ne 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "provenance suite fails closed when file absent",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'fail-closed'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "committed provenance has required CI fields",
      "verify": "jq -e '.run_id and .run_url and (.head_sha|test(\"^[0-9a-f]{40}$\")) and (.artifact_sha256|test(\"^[0-9a-f]{64}$\")) and .conclusion==\"success\"' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "capstone green from CI bundle",
      "verify": "scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download/ && jq -e '.coldboot_gate==\"green\"' .tmp/ci-e2e-download/capstone-verdict.json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "step4 FAIL when provenance absent",
      "verify": "scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -e '.steps[]|select(.n==4)|.verdict==\"FAIL\"' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json",
      "maps_to_ac": "AC-4"
    }
  ],
  "touches_capabilities": [
    "CAP-SYNC-01",
    "CAP-CUT-01"
  ],
  "provides": [
    "ci-run-provenance.json",
    "ci-e2e-operator-prereq-probe"
  ],
  "consumes": [
    ".github/workflows/ci-e2e.yml",
    "self-hosted e2e runner"
  ],
  "boundary_contracts": [
    "gh dispatch to artifact provenance",
    "CI bundle to capstone green"
  ],
  "proposed_by": "ghactions-planner"
}
-->
