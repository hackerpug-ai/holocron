# D02-02 — Provision dedicated nonprod Postgres/Zero namespace + deterministic seed/reset
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Provision an isolated nonprod Postgres/Zero namespace with deterministic idempotent seed/reset.

**Success state:** Operator runs `holo db seed --reset` against holocron_nonprod twice and gets identical fingerprints; prod holocron is untouched; zero_pub membership is present for the nonprod namespace.

## Background

- **Specialist rationale:** Owns Postgres namespace provisioning, operator CLI seed/reset, and isolation from the prod holocron DB on the tailnet mini.
- **Planning rationale:** Sprint 13 gate and every later integration-tier AC require a real nonproduction Postgres/Zero namespace with deterministic seed/reset so `pnpm test:integration` and CI lanes never clobber prod data and always start from a known state.
- **How to verify (human):** Point DATABASE_URL at the nonprod DB, run `bun services/platform/src/cli/holo.ts db seed --reset` twice, assert identical row fingerprints; confirm prod `holocron` DB row counts are unchanged; confirm `zero_pub` exists only in the nonprod namespace configuration used by the integration lane.
- **Scope:** Nonprod DB provisioning scripts/docs, holo db seed --reset CLI, seed fixtures, and integration tests proving isolation. Does not implement CI workflows (D02-05) or the RED fail-closed suite (D02-01).
- **PRD refs:** T-PLAT-019, 10-e2e-testing, UC-PLAT-05

## Critical Constraints

### MUST
- MUST provision a dedicated nonprod Postgres database (default name holocron_nonprod) distinct from the production holocron database
- MUST implement `holo db seed --reset` as a real CLI entrypoint that migrates + truncates + reseeds the nonprod namespace to a deterministic fingerprint
- MUST leave the production holocron database row counts and schema ownership unchanged after seed/reset
- MUST expose Zero publication membership (zero_pub) for the nonprod namespace so later Zero-backed lanes share the same isolation contract

### NEVER
- NEVER point default operator seed/reset at the production holocron DATABASE_URL without an explicit override that still refuses to run when HOLO_ALLOW_PROD_SEED is unset
- NEVER mock Postgres, Zero publication checks, or seed fingerprint computation
- NEVER leave residual rows from a prior seed that change the second-run fingerprint

### STRICTLY
- STRICTLY seed/reset is idempotent: two consecutive runs produce equal table_count, seed_fingerprint, and fixture_ids
- STRICTLY integration proofs use real Postgres on 127.0.0.1 (or the tailnet mini) with PLATFORM_IT=1
- STRICTLY write_allowed is limited to nonprod provision/seed surfaces and their tests

## Specification

**Objective:** Provision an isolated nonprod Postgres/Zero namespace with deterministic idempotent seed/reset.

**Success state:** Operator runs `holo db seed --reset` against holocron_nonprod twice and gets identical fingerprints; prod holocron is untouched; zero_pub membership is present for the nonprod namespace.

## Acceptance Criteria

### AC-1: Nonprod namespace provisioned and isolated from prod [PRIMARY]
**GIVEN:** Postgres is reachable and the production holocron database already exists with a captured row baseline.
**WHEN:** The operator provisions the nonprod namespace and points DATABASE_URL at postgres://127.0.0.1:5432/holocron_nonprod.
**THEN:** holocron_nonprod exists, accepts connections, and db:status reports database=holocron_nonprod while prod holocron baseline counts are unchanged.
**VERIFY:** `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts db:status --json && PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real Postgres holocron_nonprod + holocron
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real Postgres holocron_nonprod + holocron",
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
      "start_ref": "nonprod_db_available",
      "action": {
        "actor": "operator",
        "steps": [
          "Provision holocron_nonprod via the documented provision entrypoint.",
          "Run holo db:status --json with DATABASE_URL pointing at holocron_nonprod.",
          "Re-query prod holocron row baseline."
        ]
      },
      "end_state": {
        "must_observe": [
          "database: 'holocron_nonprod'",
          "connected: true",
          "prod_row_baseline_unchanged: true"
        ],
        "must_not_observe": [
          "empty/start signature: `database: 'holocron'` OR count: 0",
          "empty/start signature: `connected: false` OR count: 0",
          "prod_row_delta: !=0"
        ]
      }
    }
  ]
}
```

### AC-2: holo db seed --reset is deterministic and idempotent
**GIVEN:** holocron_nonprod is dirty with non-seed rows.
**WHEN:** The operator runs `holo db seed --reset` twice against the nonprod DATABASE_URL.
**THEN:** Both runs exit 0 with identical seed_fingerprint, table_count, and fixture_ids; dirty marker rows are gone.
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts db seed --reset --json && DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts db seed --reset --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real Postgres holocron_nonprod
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real Postgres holocron_nonprod",
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
      "start_ref": "dirty_nonprod_namespace",
      "action": {
        "actor": "operator",
        "steps": [
          "Run holo db seed --reset --json once and capture seed_fingerprint.",
          "Run holo db seed --reset --json again and compare fingerprints.",
          "Query for dirty marker row absence."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 0",
          "seed_fingerprint_run1 == seed_fingerprint_run2",
          "table_count: >=55",
          "dirty_marker_present: false"
        ],
        "must_not_observe": [
          "empty/start signature: `exitCode: 1` OR count: 0",
          "empty/start signature: `seed_fingerprint drift` OR count: 0",
          "empty/start signature: `dirty-row still present` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-3: Prod seed guard fails closed
**GIVEN:** DATABASE_URL points at production holocron and HOLO_ALLOW_PROD_SEED is unset.
**WHEN:** The operator runs `holo db seed --reset`.
**THEN:** The command exits non-zero naming REFUSE_PROD_SEED (or equivalent) and writes zero seed mutations to prod.
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts db seed --reset --json; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real Postgres holocron
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real Postgres holocron",
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
      "start_ref": "prod_url_guard",
      "action": {
        "actor": "operator",
        "steps": [
          "Capture prod row baseline.",
          "Run holo db seed --reset against prod URL without allow flag.",
          "Re-check prod row baseline and exit code."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "errorCode: 'REFUSE_PROD_SEED'",
          "prod_row_baseline_unchanged: true"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `seed_fingerprint present for prod` OR count: 0",
          "empty/start signature: `prod tables truncated` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-4: Nonprod Zero publication membership is live
**GIVEN:** holocron_nonprod has been migrated and seeded.
**WHEN:** The operator runs `holo repl:status --json` against the nonprod DATABASE_URL.
**THEN:** Publication zero_pub is present with expected membership and no forbidden evidence/embedding leakage beyond Sprint 04 exclusions.
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real Postgres holocron_nonprod zero_pub
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real Postgres holocron_nonprod zero_pub",
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
      "start_ref": "zero_pub_nonprod",
      "action": {
        "actor": "operator",
        "steps": [
          "Run holo repl:status --json on nonprod DATABASE_URL.",
          "Capture publicationName and membership errors array."
        ]
      },
      "end_state": {
        "must_observe": [
          "publicationName: 'zero_pub'",
          "ok: true",
          "errors: []"
        ],
        "must_not_observe": [
          "publication zero_pub: MISSING",
          "empty/start signature: `ok: false` OR count: 0",
          "empty membership with ok:true"
        ]
      }
    }
  ]
}
```

### AC-5: Integration lane env contract documents nonprod URL
**GIVEN:** Nonprod namespace and seed/reset exist.
**WHEN:** An operator reads the committed nonprod env contract used by pnpm test:integration / CI.
**THEN:** The contract names DATABASE_URL=.../holocron_nonprod (or HOLO_NONPROD_DATABASE_URL) and FLEET_URL to the real fleet, never a mock.
**VERIFY:** `rg -n "holocron_nonprod|HOLO_NONPROD_DATABASE_URL" docs/ci services/platform package.json vitest.config.ts 2>/dev/null | head -20; PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'AC-5'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** repo contract files + real env loader
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "repo contract files + real env loader",
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
      "start_ref": "nonprod_db_available",
      "action": {
        "actor": "operator",
        "steps": [
          "Locate the committed nonprod env contract for the integration lane.",
          "Assert DATABASE_URL/HOLO_NONPROD_DATABASE_URL targets holocron_nonprod.",
          "Assert FLEET_URL is a real HTTP endpoint pattern, not mock://."
        ]
      },
      "end_state": {
        "must_observe": [
          "nonprod database name: holocron_nonprod",
          "FLEET_URL: starts_with 'http' == true",
          "present: present count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `DATABASE_URL defaulting only to /holocron for integration` OR count: 0",
          "empty/start signature: `FLEET_URL=mock://` OR count: 0",
          "missing nonprod contract"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | holocron_nonprod database exists and accepts connections when provisioned | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-1'` | happy_path |
| TC-2 | Production holocron row baseline is unchanged after nonprod provision and seed | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-2'` | edge |
| TC-3 | Two consecutive holo db seed --reset runs emit identical seed_fingerprint values | AC-2 | `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts db seed --reset --json` | happy_path |
| TC-4 | Dirty marker rows are absent after holo db seed --reset | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-4'` | edge |
| TC-5 | holo db seed --reset exits non-zero with REFUSE_PROD_SEED when DATABASE_URL targets holocron without allow flag | AC-3 | `DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts db seed --reset --json` | error |
| TC-6 | holo repl:status reports publicationName zero_pub with ok true on nonprod after seed | AC-4 | `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json` | happy_path |
| TC-7 | Integration lane env contract names holocron_nonprod and a real http FLEET_URL | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-7'` | happy_path |

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/SPRINT.md` (all) — Gate step 3 seed/reset + nonprod namespace
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (all) — Dedicated nonproduction Postgres/Zero namespace + deterministic seed/reset
- `services/platform/src/cli/holo.ts` (145-200,701-870) — Existing db:* commands to extend with db seed --reset
- `services/platform/src/db/migrate.ts` (all) — Migration entrypoint to reuse for nonprod
- `services/platform/src/db/repl-status.ts` (all) — zero_pub membership gate
- `services/platform/src/db/connection.ts` (all) — DATABASE_URL resolution defaults
- `services/platform/src/stack/config.ts` (all) — Stack config secrets / DATABASE_URL

## Guardrails

### WRITE-ALLOWED
- services/platform/src/cli/holo.ts (MODIFY — add db seed --reset)
- services/platform/src/db/seed.ts (NEW — deterministic seed/reset)
- services/platform/src/db/nonprod.ts (NEW — provision/isolation helpers)
- services/platform/tests/integration/nonprod-namespace.test.ts (NEW)
- services/platform/tests/integration/fixtures/nonprod-seed/ (NEW)
- docs/ci/nonprod-namespace.md (NEW)
- services/platform/deploy/nonprod/ (NEW — provision scripts if needed)
- package.json (MODIFY — optional script alias only)

### WRITE-PROHIBITED
- services/platform/src/db/schema/** — Sprint 04 owns domain schema shape
- app/** — client out of scope
- .github/workflows/** — D02-04/D02-05 own workflows
- .spec/prds/mk6-migration/tasks/sprint-12-*/** — do not touch Sprint 12 evidence

### Boundaries
- **always:** Run proofs against real Postgres, Default seed target is holocron_nonprod
- **ask_first:** Any exception that allows seed against prod holocron beyond HOLO_ALLOW_PROD_SEED
- **never:** Mock pg client, Truncate prod holocron in tests

## Design

- **references:** .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md, services/platform/src/db/migrate.ts, services/platform/src/db/repl-status.ts
- **pattern:** Extend holo CLI switch table with `db seed` / `db:seed` parsing --reset/--json; implement seed module that migrates, truncates app tables in dependency order, inserts fixture rows, computes sha256 fingerprint of ordered fixture ids + counts.
- **pattern_source:** services/platform/src/cli/holo.ts:740-870
- **anti_pattern:** Reusing the prod holocron DB as the integration namespace, or implementing seed as a no-op that always prints ok.
- note: D02-01 RED suite should target the same nonprod URL contract once provisioned
- note: D02-05 integration workflow must export DATABASE_URL to holocron_nonprod and call seed --reset before tests

## Agent Assignment

- **implementer:** devops-engineer — Owns Postgres namespace provisioning, operator CLI seed/reset, and isolation from the prod holocron DB on the tailnet mini.
- **reviewer:** mastra-reviewer — Must prove real Postgres + zero_pub isolation and fail-closed seed/reset against the platform stack, not mocked DB helpers.

## Verification Gates

- **AC-1 nonprod isolated:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'AC-1'` → Exit 0; database holocron_nonprod; prod baseline unchanged
- **AC-2 deterministic seed:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts db seed --reset --json` → Exit 0 twice with identical seed_fingerprint
- **AC-3 prod refuse:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts db seed --reset --json` → Exit non-zero; REFUSE_PROD_SEED
- **AC-4 zero_pub:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json` → ok:true publicationName zero_pub
- **AC-5 env contract:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'AC-5'` → Contract names holocron_nonprod + http FLEET_URL
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only paths in guardrails.write_allowed

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D02-01
- **blocks:** D02-05

## Notes

Default nonprod DB name holocron_nonprod is the holocron-consistent choice; Zero namespace means the same DB's zero_pub publication + any zero-cache config pointing at that DATABASE_URL. Seed fixture set should be minimal but non-empty (at least conversations/messages/catalog-required reference rows) so fingerprints are non-degenerate.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-02",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "nonprod_db_available": {
      "description": "Real Postgres server reachable; holocron_nonprod database may be missing or dirty; prod holocron exists with baseline row counts captured.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts db:status",
      "records": [
        "postgres reachable on 127.0.0.1:5432",
        "prod database name: holocron",
        "nonprod target database name: holocron_nonprod",
        "prod_row_baseline captured before seed"
      ]
    },
    "dirty_nonprod_namespace": {
      "description": "holocron_nonprod exists with extra operator-inserted rows that must be wiped by seed --reset.",
      "seed_method": "cli",
      "entrypoint": "psql postgres://127.0.0.1:5432/holocron_nonprod -c \"INSERT INTO conversations(id) VALUES ('dirty-row') ON CONFLICT DO NOTHING\"",
      "records": [
        "dirty marker row present before reset",
        "expected seed fixture ids absent or mixed"
      ]
    },
    "prod_url_guard": {
      "description": "DATABASE_URL points at production holocron without HOLO_ALLOW_PROD_SEED.",
      "seed_method": "cli",
      "entrypoint": "DATABASE_URL=postgres://127.0.0.1:5432/holocron bun services/platform/src/cli/holo.ts db seed --reset",
      "records": [
        "DATABASE_URL ends with /holocron",
        "HOLO_ALLOW_PROD_SEED unset"
      ]
    },
    "zero_pub_nonprod": {
      "description": "Nonprod DB after migrate+seed; repl:status/zero_pub membership must be queryable.",
      "seed_method": "cli",
      "entrypoint": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json",
      "records": [
        "publicationName: zero_pub",
        "wal_level: logical or documented nonprod equivalent",
        "membership tables non-empty"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN Postgres reachable and prod holocron baseline captured WHEN nonprod is provisioned THEN holocron_nonprod connects and prod baseline is unchanged.",
      "verify": "PLATFORM_IT=1 bun services/platform/src/cli/holo.ts db:status --json && PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real Postgres holocron_nonprod + holocron",
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
            "start_ref": "nonprod_db_available",
            "action": {
              "actor": "operator",
              "steps": [
                "Provision holocron_nonprod via the documented provision entrypoint.",
                "Run holo db:status --json with DATABASE_URL pointing at holocron_nonprod.",
                "Re-query prod holocron row baseline."
              ]
            },
            "end_state": {
              "must_observe": [
                "database: 'holocron_nonprod'",
                "connected: true",
                "prod_row_baseline_unchanged: true"
              ],
              "must_not_observe": [
                "empty/start signature: `database: 'holocron'` OR count: 0",
                "empty/start signature: `connected: false` OR count: 0",
                "prod_row_delta: !=0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN dirty holocron_nonprod WHEN holo db seed --reset runs twice THEN fingerprints match and dirty rows are gone.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts db seed --reset --json",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron_nonprod",
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
            "start_ref": "dirty_nonprod_namespace",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db seed --reset --json once and capture seed_fingerprint.",
                "Run holo db seed --reset --json again and compare fingerprints.",
                "Query for dirty marker row absence."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 0",
                "seed_fingerprint_run1 == seed_fingerprint_run2",
                "table_count: >=55",
                "dirty_marker_present: false"
              ],
              "must_not_observe": [
                "empty/start signature: `exitCode: 1` OR count: 0",
                "empty/start signature: `seed_fingerprint drift` OR count: 0",
                "empty/start signature: `dirty-row still present` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN DATABASE_URL targets prod holocron without allow flag WHEN seed --reset runs THEN exit non-zero REFUSE_PROD_SEED and prod unchanged.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts db seed --reset --json",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron",
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
            "start_ref": "prod_url_guard",
            "action": {
              "actor": "operator",
              "steps": [
                "Capture prod row baseline.",
                "Run holo db seed --reset against prod URL without allow flag.",
                "Re-check prod row baseline and exit code."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "errorCode: 'REFUSE_PROD_SEED'",
                "prod_row_baseline_unchanged: true"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `seed_fingerprint present for prod` OR count: 0",
                "empty/start signature: `prod tables truncated` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN seeded nonprod WHEN repl:status runs THEN zero_pub is present with ok true.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron_nonprod zero_pub",
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
            "start_ref": "zero_pub_nonprod",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo repl:status --json on nonprod DATABASE_URL.",
                "Capture publicationName and membership errors array."
              ]
            },
            "end_state": {
              "must_observe": [
                "publicationName: 'zero_pub'",
                "ok: true",
                "errors: []"
              ],
              "must_not_observe": [
                "publication zero_pub: MISSING",
                "empty/start signature: `ok: false` OR count: 0",
                "empty membership with ok:true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN nonprod provisioned WHEN integration env contract is inspected THEN it names holocron_nonprod and a real http FLEET_URL.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "repo contract files + real env loader",
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
            "start_ref": "nonprod_db_available",
            "action": {
              "actor": "operator",
              "steps": [
                "Locate the committed nonprod env contract for the integration lane.",
                "Assert DATABASE_URL/HOLO_NONPROD_DATABASE_URL targets holocron_nonprod.",
                "Assert FLEET_URL is a real HTTP endpoint pattern, not mock://."
              ]
            },
            "end_state": {
              "must_observe": [
                "nonprod database name: holocron_nonprod",
                "FLEET_URL: starts_with 'http' == true",
                "present: present count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `DATABASE_URL defaulting only to /holocron for integration` OR count: 0",
                "empty/start signature: `FLEET_URL=mock://` OR count: 0",
                "missing nonprod contract"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "holocron_nonprod database exists and accepts connections when provisioned",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Production holocron row baseline is unchanged after nonprod provision and seed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-2'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Two consecutive holo db seed --reset runs emit identical seed_fingerprint values",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts db seed --reset --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Dirty marker rows are absent after holo db seed --reset",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-4'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "holo db seed --reset exits non-zero with REFUSE_PROD_SEED when DATABASE_URL targets holocron without allow flag",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts db seed --reset --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "holo repl:status reports publicationName zero_pub with ok true on nonprod after seed",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Integration lane env contract names holocron_nonprod and a real http FLEET_URL",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace.test.ts -t 'TC-7'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
