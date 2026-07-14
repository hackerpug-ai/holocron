# schema-1 — Provision Postgres 18 + pgvector + FTS + wal_level=logical, reachable over Tailscale

## What this does

Provision a single Postgres 18 instance on the tailnet mini with pgvector + native FTS + wal_level=logical, reachable over Tailscale, establishing the sole datastore per AP-1

Provides: postgres-18-instance, pgvector-extension, tailscale-network.


## Why

- wal_level=logical for replication
- single-user tailnet trust (AP-7)
- Grounded in: UC-PLAT-01, T-PLAT-002.


## How to verify

- `psql -h <mini-tailscale-ip> -p 5432 -U postgres -c 'SELECT version();'` → Exit 0, output contains 'PostgreSQL 18.'
- `psql -h <mini-tailscale-ip> -p 5432 -U postgres -c 'CREATE EXTENSION IF NOT EXISTS vector;'` → Exit 0, no errors
- `psql -h <mini-tailscale-ip> -p 5432 -U postgres -c 'SHOW wal_level;'` → Exit 0, output shows 'logical'

## Scope

Writes: `services/platform/src/db/ (NEW — Drizzle schema home)` · `services/platform/src/cli/holo.ts (MODIFY — add db:* subcommand stubs)` · `docs/postgres-provisioning.md (NEW — how the mini PG is provisioned)`.  
Prohibited: `convex/** (read-only legacy)` · `app/** (not this sprint)` · `holocron-mcp/src/** (not this sprint)` · `tests/** (schema-5 owns the test suite)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: schema-1 — Provision Postgres 18 + pgvector + FTS + wal_level=logical, reachable over Tailscale
================================================================================

TASK_TYPE:  INFRA
STATUS:     Completed
PRIORITY:   P0
EFFORT:     L  (180 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-SYNC-01
SPRINT:     [Sprint 4 — Provision Postgres and Domain Schema](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      DB_IT=1 pnpm vitest run <path>     (schema-5 integration suite)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Postgres 18 responds to connections over Tailscale, pgvector is installed, wal_level=logical is confirmed, and the instance is ready for Drizzle migrations

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Use Postgres 18 exactly
- MUST Install pgvector extension
- MUST Configure wal_level=logical
- MUST Make reachable over Tailscale
- MUST Use single-user tailnet trust (NO RLS per AP-7)
- NEVER Use SQLite anywhere (AP-1 violation)
- NEVER Configure RLS or multi-tenant (AP-7 violation)
- NEVER Use earlier Postgres versions
- STRICTLY pgvector extension must be installed and verified
- STRICTLY wal_level must be logical, not replica or minimal

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): Postgres 18 running on mini, reachable over Tailscale
- [x] AC-2: pgvector extension installed and verified
- [x] AC-3: wal_level=logical configured for Zero replication
- [ ] `pnpm biome check .` clean + `pnpm tsgo --noEmit` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against real Postgres, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Postgres 18 running on mini, reachable over Tailscale (flow_ref UC-PLAT-01)
  GIVEN A mini server on the tailnet with Postgres 18 installed
  WHEN  An operator connects via psql over Tailscale
  THEN  Connection succeeds and Postgres reports version 18.x.x
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-mini · TDD_STATE: none
  SCENARIO — start_ref: mini_server_with_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if Postgres not installed; Tailscale not configured; Firewall blocks 5432; Wrong Postgres version; the required object/config is absent or a no-op stub
    MUST_OBSERVE: PostgreSQL 18.; psql `connected`
    MUST_NOT_OBSERVE: PostgreSQL 1[0-7].; connection refused; could not connect

AC-2 pgvector extension installed and verified (flow_ref T-PLAT-002)
  GIVEN Postgres 18 is running
  WHEN  An operator runs pgvector verification
  THEN  pgvector extension is installed and available
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-mini · TDD_STATE: none
  SCENARIO — start_ref: postgres_18_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if pgvector not installed; Extension not available; Insufficient permissions; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `vector`
    MUST_NOT_OBSERVE: extension does not exist; could not open extension; 0 rows / empty start state

AC-3 wal_level=logical configured for Zero replication (flow_ref T-PLAT-003)
  GIVEN Postgres 18 is running
  WHEN  An operator checks wal_level setting
  THEN  wal_level is set to 'logical'
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-mini · TDD_STATE: none
  SCENARIO — start_ref: postgres_18_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if wal_level set to replica/minimal; Postgres not restarted after config change; the required object/config is absent or a no-op stub
    MUST_OBSERVE: wal_level: logical
    MUST_NOT_OBSERVE: wal_level: replica; wal_level: minimal; 0 rows / empty start state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/ (NEW — Drizzle schema home)
- services/platform/src/cli/holo.ts (MODIFY — add db:* subcommand stubs)
- docs/postgres-provisioning.md (NEW — how the mini PG is provisioned)
writeProhibited: convex/** (read-only legacy), app/** (not this sprint), holocron-mcp/src/** (not this sprint), tests/** (schema-5 owns the test suite)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md:1-53 [Postgres requirements, pgvector, FTS]
2. .spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:AP-1, AP-7 [Postgres-only, no RLS, single-user tailnet trust]
3. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:CAP-SYNC-01 [Zero replication requirements]
4. .spec/prds/mk6-migration/tasks/sprint-01-mastra-compat-lock-fleet-manifest/SPRINT.md:1-50 [holo CLI foundation]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Postgres 18 reachable over Tailscale: `psql -h <mini-tailscale-ip> -p 5432 -U postgres -c 'SELECT version();'` → Exit 0, output contains 'PostgreSQL 18.'
- pgvector installed: `psql -h <mini-tailscale-ip> -p 5432 -U postgres -c 'CREATE EXTENSION IF NOT EXISTS vector;'` → Exit 0, no errors
- wal_level=logical: `psql -h <mini-tailscale-ip> -p 5432 -U postgres -c 'SHOW wal_level;'` → Exit 0, output shows 'logical'

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: Postgres is the sole datastore (AP-1); No RLS or multi-tenant (AP-7); Replication requires wal_level=logical
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: sprint-01-mastra-compat-lock-fleet-manifest  ·  Blocks: schema-2 · schema-3 · schema-4

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "schema-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "mini_server_with_postgres": {
      "description": "Mini server on tailnet with Postgres 18 installed and configured",
      "seed_method": "recorded_external",
      "records": [
        "Postgres 18.x.x installed on mini",
        "Tailscale network configured"
      ]
    },
    "postgres_18_running": {
      "description": "Postgres 18 service is running and accepting connections",
      "seed_method": "public_api",
      "records": [
        "Postgres service active",
        "Port 5432 listening"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "UC-PLAT-01",
      "description": "GIVEN Postgres 18 on mini WHEN connected over Tailscale THEN connection succeeds and version is 18.x.x",
      "verify": "psql -h <mini-tailscale-ip> -p 5432 -c 'SELECT version();'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-mini",
        "flow_ref": "UC-PLAT-01",
        "negative_control": {
          "would_fail_if": [
            "Postgres not installed",
            "Tailscale not configured",
            "Firewall blocks 5432",
            "Wrong Postgres version",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_server_with_postgres",
            "action": {
              "actor": "operator",
              "steps": [
                "Connect via psql over Tailscale to mini:5432",
                "Run SELECT version();"
              ]
            },
            "end_state": {
              "must_observe": [
                "PostgreSQL 18.",
                "psql `connected`"
              ],
              "must_not_observe": [
                "PostgreSQL 1[0-7].",
                "connection refused",
                "could not connect"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-002",
      "description": "GIVEN Postgres 18 running WHEN pgvector checked THEN extension is installed and available",
      "verify": "psql ... -c \"CREATE EXTENSION vector; SELECT * FROM pg_extension WHERE extname='vector';\"",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-mini",
        "flow_ref": "T-PLAT-002",
        "negative_control": {
          "would_fail_if": [
            "pgvector not installed",
            "Extension not available",
            "Insufficient permissions",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_18_running",
            "action": {
              "actor": "operator",
              "steps": [
                "Connect to Postgres",
                "CREATE EXTENSION vector;",
                "SELECT * FROM pg_extension WHERE extname='vector';"
              ]
            },
            "end_state": {
              "must_observe": [
                "`vector`"
              ],
              "must_not_observe": [
                "extension does not exist",
                "could not open extension",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-003",
      "description": "GIVEN Postgres 18 running WHEN wal_level checked THEN value is logical",
      "verify": "psql ... -c 'SHOW wal_level;'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-mini",
        "flow_ref": "T-PLAT-003",
        "negative_control": {
          "would_fail_if": [
            "wal_level set to replica/minimal",
            "Postgres not restarted after config change",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_18_running",
            "action": {
              "actor": "operator",
              "steps": [
                "Connect to Postgres",
                "SHOW wal_level;"
              ]
            },
            "end_state": {
              "must_observe": [
                "wal_level: logical"
              ],
              "must_not_observe": [
                "wal_level: replica",
                "wal_level: minimal",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Postgres 18 is reachable over Tailscale from the laptop",
      "verify": "psql -h <mini-tailscale-ip> -p 5432 -c 'SELECT version();' reports 18.x.x"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "pgvector extension is installed and listable",
      "verify": "SELECT * FROM pg_extension WHERE extname='vector' returns one row"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "wal_level is logical (not replica or minimal)",
      "verify": "SHOW wal_level returns 'logical'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Connection over the raw LAN IP without Tailscale is refused",
      "verify": "psql to the non-Tailscale address fails to connect"
    }
  ]
}
-->
</details>