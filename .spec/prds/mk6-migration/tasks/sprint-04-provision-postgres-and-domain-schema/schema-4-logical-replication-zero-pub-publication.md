# schema-4 — Logical replication + zero_pub publication (reactive subset, vectors excluded) + replica identity

## What this does

Create the zero_pub publication for Zero reactive sync covering only the reactive UI subset, excluding vectors/passages/evidence/citations/telemetry, with single-column uuid PK replica identity on every published table (CAP-SYNC-01 boundary)

Provides: zero_pub-publication, replica-identity, wal_level-logical.


## Why

- CAP-SYNC-01: Zero reactive sync boundary - vectors/passages/evidence/citations/telemetry excluded, single-column uuid PK replica identity
- Grounded in: UC-PLAT-01, T-PLAT-003, CAP-SYNC-01.


## How to verify

- `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, wal_level: logical
- `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, zero_pub shows conversations/chat_messages/tool_calls/etc, NOT passages/sources/claims
- `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, every published table shows REPLICA IDENTITY: DEFAULT

## Scope

Writes: `services/platform/src/db/schema/*.ts (MODIFY - add publication config)` · `services/platform/src/db/migrations/ (NEW - publication migration SQL)` · `services/platform/src/cli/holo.ts (MODIFY - add repl:status command)`.  
Prohibited: `convex/** (read-only)` · `app/** (not this sprint)` · `holocron-mcp/src/** (not this sprint)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: schema-4 — Logical replication + zero_pub publication (reactive subset, vectors excluded) + replica identity
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
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
holo repl:status confirms wal_level=logical, zero_pub covers reactive subset only, excludes vectors/passages/evidence, and every published table has REPLICA IDENTITY DEFAULT

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Create zero_pub publication over reactive subset ONLY
- MUST EXCLUDE every vector/tsvector column from publication
- MUST EXCLUDE entire passages/evidence surface (sources, passages, claims, entities, relations, beliefs)
- MUST EXCLUDE citations, telemetry, rate-limit, server-only jsonb
- MUST Set REPLICA IDENTITY DEFAULT on every published table
- MUST Ensure single-column uuid PK on every published table
- MUST Publish conversations, chat_messages, tool_calls, agent_plans, tasks
- MUST Publish documents metadata-only (no vectors)
- MUST Publish research/mission progress, notifications, feed_items
- MUST Publish subscriptions display, improvements, audio jobs/segments, whats_new
- MUST Publish analysis/shop/assimilation sessions, app_settings
- NEVER Include vector columns in zero_pub
- NEVER Include passages or evidence tables in publication
- NEVER Include citations in publication
- NEVER Include telemetry or rate-limit in publication
- NEVER Publish a table without single-column uuid PK
- NEVER Publish a table without REPLICA IDENTITY DEFAULT
- STRICTLY zero_pub must exclude passages
- STRICTLY zero_pub must exclude all vector(1024) columns
- STRICTLY Every published table must have REPLICA IDENTITY DEFAULT
- STRICTLY Publication requires wal_level=logical

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): wal_level=logical configured
- [ ] AC-2: zero_pub publication covers reactive subset only (vectors/passages/evidence excluded)
- [ ] AC-3: Every published table has single-column uuid PK replica identity
- [ ] `pnpm biome check .` clean + `pnpm tsgo --noEmit` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against real Postgres, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] wal_level=logical configured (flow_ref T-PLAT-003)
  GIVEN Postgres 18 running
  WHEN  Checking replication status
  THEN  wal_level is set to 'logical'
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: postgres_18_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if wal_level set to replica/minimal; Postgres not restarted after config; wrong postgresql.conf setting; the required object/config is absent or a no-op stub
    MUST_OBSERVE: wal_level: logical
    MUST_NOT_OBSERVE: wal_level: replica; wal_level: minimal; wal_level not set; 0 rows / empty start state

AC-2 zero_pub publication covers reactive subset only (vectors/passages/evidence excluded) (flow_ref CAP-SYNC-01)
  GIVEN Postgres with zero_pub publication created
  WHEN  Checking publication tables
  THEN  zero_pub includes only reactive UI tables, excludes vectors/passages/evidence/citations/telemetry
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_zero_pub · evidence: stdout
    NEGATIVE_CONTROL: would fail if passages in publication; vector columns published; evidence tables included; citations included; telemetry included; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `conversations`; `chat_messages`; `tool_calls`; `agent_plans`; `tasks`; `documents`; `research_sessions`; `notifications`
    MUST_NOT_OBSERVE: passages; sources; claims; entities; relations; beliefs; citations; agent_telemetry; rate_limit_state; 0 rows / empty start state

AC-3 Every published table has single-column uuid PK replica identity (flow_ref CAP-SYNC-01)
  GIVEN zero_pub publication with published tables
  WHEN  Checking replica identity
  THEN  Every published table has REPLICA IDENTITY DEFAULT on a single-column uuid PK
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_zero_pub · evidence: stdout
    NEGATIVE_CONTROL: would fail if Table missing REPLICA IDENTITY; REPLICA IDENTITY FULL instead of DEFAULT; Composite PK instead of single-column uuid; PK not a uuid type; the required object/config is absent or a no-op stub
    MUST_OBSERVE: REPLICA IDENTITY: DEFAULT; single-column PK: uuid; `conversations` REPLICA IDENTITY DEFAULT; `chat_messages` REPLICA IDENTITY DEFAULT
    MUST_NOT_OBSERVE: REPLICA IDENTITY: FULL; REPLICA IDENTITY: NOTHING; composite PK; missing REPLICA IDENTITY

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/schema/*.ts (MODIFY - add publication config)
- services/platform/src/db/migrations/ (NEW - publication migration SQL)
- services/platform/src/cli/holo.ts (MODIFY - add repl:status command)
writeProhibited: convex/** (read-only), app/** (not this sprint), holocron-mcp/src/** (not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md:44-47 [Zero publication split - why passages are separate]
2. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:CAP-SYNC-01 [Zero reactive sync boundary contracts]
3. .spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:AP-1, AP-7 [Postgres-only, tailnet trust boundary]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- wal_level=logical: `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, wal_level: logical
- zero_pub reactive subset only: `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, zero_pub shows conversations/chat_messages/tool_calls/etc, NOT passages/sources/claims
- REPLICA IDENTITY DEFAULT: `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, every published table shows REPLICA IDENTITY: DEFAULT

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: Zero cannot sync pgvector types; 1024-float arrays would explode client; Keeping vectors in passages makes split clean; REPLICA IDENTITY DEFAULT required for Zero
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: schema-2  ·  Blocks: schema-5 · schema-6

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "schema-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_18_running": {
      "description": "Postgres 18 with wal_level=logical configured",
      "seed_method": "recorded_external",
      "records": [
        "Postgres service active",
        "wal_level=logical"
      ]
    },
    "postgres_with_zero_pub": {
      "description": "Postgres with zero_pub publication created and configured",
      "seed_method": "public_api",
      "records": [
        "zero_pub exists",
        "wal_level=logical",
        "Published tables configured"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-003",
      "description": "GIVEN Postgres 18 WHEN repl:status runs THEN wal_level is logical",
      "verify": "holo repl:status",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-PLAT-003",
        "negative_control": {
          "would_fail_if": [
            "wal_level set to replica/minimal",
            "Postgres not restarted after config",
            "wrong postgresql.conf setting",
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
              "actor": "cli_user",
              "steps": [
                "Run holo repl:status",
                "Check wal_level output"
              ]
            },
            "end_state": {
              "must_observe": [
                "wal_level: logical"
              ],
              "must_not_observe": [
                "wal_level: replica",
                "wal_level: minimal",
                "wal_level not set",
                "0 rows / empty start state"
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
      "flow_ref": "CAP-SYNC-01",
      "description": "GIVEN zero_pub publication WHEN repl:status runs THEN reactive tables included, vectors/passages/evidence excluded",
      "verify": "holo repl:status",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "CAP-SYNC-01",
        "negative_control": {
          "would_fail_if": [
            "passages in publication",
            "vector columns published",
            "evidence tables included",
            "citations included",
            "telemetry included",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_zero_pub",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo repl:status",
                "Inspect zero_pub table list"
              ]
            },
            "end_state": {
              "must_observe": [
                "`conversations`",
                "`chat_messages`",
                "`tool_calls`",
                "`agent_plans`",
                "`tasks`",
                "`documents`",
                "`research_sessions`",
                "`notifications`"
              ],
              "must_not_observe": [
                "passages",
                "sources",
                "claims",
                "entities",
                "relations",
                "beliefs",
                "citations",
                "agent_telemetry",
                "rate_limit_state",
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
      "flow_ref": "CAP-SYNC-01",
      "description": "GIVEN published tables WHEN repl:status runs THEN every table has REPLICA IDENTITY DEFAULT on single-column uuid PK",
      "verify": "holo repl:status",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "CAP-SYNC-01",
        "negative_control": {
          "would_fail_if": [
            "Table missing REPLICA IDENTITY",
            "REPLICA IDENTITY FULL instead of DEFAULT",
            "Composite PK instead of single-column uuid",
            "PK not a uuid type",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_zero_pub",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo repl:status",
                "Check replica identity for each published table"
              ]
            },
            "end_state": {
              "must_observe": [
                "REPLICA IDENTITY: DEFAULT",
                "single-column PK: uuid",
                "`conversations` REPLICA IDENTITY DEFAULT",
                "`chat_messages` REPLICA IDENTITY DEFAULT"
              ],
              "must_not_observe": [
                "REPLICA IDENTITY: FULL",
                "REPLICA IDENTITY: NOTHING",
                "composite PK",
                "missing REPLICA IDENTITY"
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
      "description": "wal_level is logical",
      "verify": "holo repl:status -> wal_level: logical"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "zero_pub excludes passages",
      "verify": "holo repl:status -> passages NOT in table list"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "zero_pub excludes evidence tables",
      "verify": "holo repl:status -> sources/claims/entities/relations/beliefs NOT in list"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Every published table has REPLICA IDENTITY DEFAULT",
      "verify": "holo repl:status -> all tables show REPLICA IDENTITY DEFAULT"
    }
  ]
}
-->
</details>