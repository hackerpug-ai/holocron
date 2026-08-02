# REDHAT-FIX-S29-R2-H02 — Require deployed endpoint identity and schema-valid non-sentinel Postgres-backed MCP/article results (H-02; sprint29-soak-flip.test.ts:159-173, soak-fence.ts:957-1004)

## What this does

Close red-hat H-02 (cycle-2) by requiring verify-tools/verify-article evidence to bind a deployed endpoint identity (not only an ephemeral free-port localhost child that overwrites HOLO_VERIFY_BASE_URL), by making evaluateReadToolSuccess require registered Zod outputSchema success (reject structural null/array/object fallback), and by eliminating fixed UUID sentinels that allow null/not-found payloads to pass as postgres_backed.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01 (`REDHAT-FIX-S29-R2-H02`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-red.log`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts`
- `HOLO_VERIFY_BASE_URL=$PLATFORM_URL bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '(.target_identity.host|length)>0 and all(.tools[] | select(.is_mutation==false) | .schema_valid==true)'`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/soak-fence.ts — MODIFY evaluateReadToolSuccess, runVerifyTools seeds, target_identity report fields, services/platform/src/cli/holo.ts — MODIFY verify-tools flags if identity passthrough needed, services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY identity + seed assertions, services/platform/tests/integration/redhat-fix-s29-r2-h02-*.test.ts — NEW optional, services/platform/tests/fixtures/sprint29/** — seed helpers if needed, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-** — evidence

Prohibited: Hardcoding toolsTotal=44, Keeping structural schema_valid fallback, app/, components/, hooks/, screens/, convex/** deletion, executePostgresMcpTool as sole production verify path, Self-authored article baseline rewrite (owned by R2-H03)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-H02 — Require deployed endpoint identity and schema-valid non-sentinel Postgres-backed MCP/article results (H-02; sprint29-soak-flip.test.ts:159-173, soak-fence.ts:957-1004)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
verify-tools reports base_url + target_identity (host, port, service generation or deployment label) for the intended soak endpoint; schema_valid is true only when outputSchema.safeParse succeeds; postgres_backed requires non-null structured content with real seeded ids (not 00000000-0000-4000-8000-000000000001 style sentinels unless those rows truly exist and return non-null data); suite fails closed when identity missing or Zod fails.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST bind verify-tools/verify-article runs to a deployed endpoint identity recorded in the report (base_url host+port, optional service generation/pid/deployment label) — not sole free-port child overwrite of HOLO_VERIFY_BASE_URL/PLATFORM_URL without identity fields (sprint29-soak-flip.test.ts:159-173)
- MUST set schema_valid true only when the tool's registered Zod outputSchema.safeParse(payload).success is true; NEVER promote structural null|array|object to schema_valid when Zod fails (soak-fence.ts:957-974)
- MUST set postgres_backed true only for schema_valid non-error payloads that contain real non-null application data for the tool (not empty not-found shells)
- MUST replace fixed UUID sentinels (soak-fence.ts:1000-1004) with seeded real row ids from holocron_nonprod (or fail closed when seeds unavailable)
- MUST capture RED evidence at cab5c071 proving structural fallback + sentinel path can green null/not-found
- NEVER count schema_valid true when Zod fails but payload is null/array/object (soak-fence.ts:957-974)
- NEVER allow fixed all-zero-ish UUID seeds as the only path for 'postgres_backed' success when tools return null/not-found (1000-1004)
- NEVER treat free-port localhost child alone as deployed identity without recording target_identity evidence fields
- NEVER hardcode toolsTotal=44
- NEVER use createHonoApp().request as the sole production oracle
- STRICTLY tdd_mode red_first; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-*
- STRICTLY PRIMARY ACs test_tier e2e with real network /mcp
- STRICTLY toolsPassed/toolsTotal concrete integers never null
- STRICTLY soak fence engaged for mutation-block assertions
- STRICTLY fail-closed when base_url unreachable or target_identity missing

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN deployed_or_labeled_soak_endpoint with known identity (HOLO_VERIFY_BASE_U…
- [ ] AC-2: GIVEN deployed_or_labeled_soak_endpoint with real seeded Postgres rows for read…
- [ ] AC-3: GIVEN negative_payloads fixture with null payload and Zod-failing object WHEN e…
- [ ] AC-4: GIVEN deployed_or_labeled_soak_endpoint with soak fence engaged WHEN mutation t…
- [ ] AC-5: GIVEN pre_fix_structural_fallback_and_sentinels at cab5c071 WHEN implementer co…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN deployed_or_labeled_soak_endpoint with known identity (HOLO_VER… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN deployed_or_labeled_soak_endpoint with known identity (HOLO_VERIFY_BASE_URL pointing at intended server; not anonymously overwritten without record) WHEN operator runs cutover:verify-tools --json THEN report includes base_url and target_identity fields (host, port, and service label or pid/generation) matching the intended endpoint
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway
  VERIFY: `HOLO_VERIFY_BASE_URL=$PLATFORM_URL bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '(.base_url|length)>0 and (.target_identity.host|length)>0 and (.target_identity.port>0) and .toolsTotal>0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: deployed_or_labeled_soak_endpoint
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; report.target_identity.port is integer > 0; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; AC-1 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 [PRIMARY] — GIVEN deployed_or_labeled_soak_endpoint with real seeded Postgres row… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN deployed_or_labeled_soak_endpoint with real seeded Postgres rows for read tools WHEN verify-tools evaluates each non-mutation tool THEN schema_valid true only on Zod success; postgres_backed true only with non-null real data; null/not-found fails
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway+postgres
  VERIFY: `jq -e '[.tools[] | select(.is_mutation==false)] | all(.schema_valid==true and .postgres_backed==true and .ok==true and .isError!=true)' verify-tools.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: seeded_real_row_ids
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; every read tool schema_valid === true implies registered Zod parse success; every read tool postgres_backed === true implies payload is non-null and contains real fields from Postgres; seeds used are not the fixed sentinel pair 00000000-0000-4000-8000-000000000001 / ...0002 unless those exact rows exist and return non-null; overall verify-tools.ok === true only when all reads pass above
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN negative_payloads fixture with null payload and Zod-failing obj… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN negative_payloads fixture with null payload and Zod-failing object WHEN evaluateReadToolSuccess is invoked THEN schema_valid false; postgres_backed false; ok false for both
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: unit-in-integration
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts -t 'R2-H02|evaluateReadToolSuccess|schema_valid'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: negative_payloads
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; for payload null: schema_valid === false and postgres_backed === false and ok === false; for Zod-failing object: schema_valid === false and ok === false
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN deployed_or_labeled_soak_endpoint with soak fence engaged WHEN … (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN deployed_or_labeled_soak_endpoint with soak fence engaged WHEN mutation tools called over network THEN all mutations blocked with MIGRATION_READ_ONLY
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway
  VERIFY: `jq -e '[.tools[] | select(.is_mutation==true)] | all(.ok==true and .isError==true and (.code=="MIGRATION_READ_ONLY" or (.message|startswith("MIGRATION_READ_ONLY:"))))' verify-tools.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: deployed_or_labeled_soak_endpoint
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; every mutation isError === true; AC-4 observed_status equals literal 'PASS' and observed_count >= 1; AC-4 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — GIVEN pre_fix_structural_fallback_and_sentinels at cab5c071 WHEN impl… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre_fix_structural_fallback_and_sentinels at cab5c071 WHEN implementer completes R2-H02 THEN red+green+path.json under redhat-fix-s29-r2-h02-*
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-red.log && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_structural_fallback_and_sentinels
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; red log size > 0; AC-5 observed_status equals literal 'PASS' and observed_count >= 1; AC-5 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | verify-tools report includes base_url and target_identity.host/port | AC-1 | `jq .base_url .target_identity` |
| TC-2 | schema_valid is false when Zod fails even if payload is object/array/… | AC-2 | `unit cases + read tool entries` |
| TC-3 | seeds are real holocron_nonprod row ids, not fixed 00000000-0000-4000… | AC-2 | `rg seeds in soak-fence; DB existence assert` |
| TC-4 | evaluateReadToolSuccess(null) returns schema_valid false postgres_bac… | AC-3 | `vitest R2-H02 negative payloads` |
| TC-5 | all mutation tools blocked with MIGRATION_READ_ONLY over network | AC-4 | `jq mutation all` |
| TC-6 | RED evidence non-empty for structural fallback defect | AC-5 | `test -s redhat-fix-s29-r2-h02-red.log` |
| TC-7 | missing base_url fails closed (ok false, tools not counted pass) | AC-1 | `HOLO_VERIFY_BASE_URL unset path` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/soak-fence.ts — MODIFY evaluateReadToolSuccess, runVerifyTools seeds, target_identity report fields
- services/platform/src/cli/holo.ts — MODIFY verify-tools flags if identity passthrough needed
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY identity + seed assertions
- services/platform/tests/integration/redhat-fix-s29-r2-h02-*.test.ts — NEW optional
- services/platform/tests/fixtures/sprint29/** — seed helpers if needed
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-** — evidence
writeProhibited:
- Hardcoding toolsTotal=44
- Keeping structural schema_valid fallback
- app/, components/, hooks/, screens/
- convex/** deletion
- executePostgresMcpTool as sole production verify path
- Self-authored article baseline rewrite (owned by R2-H03)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:85-91 — H-02 HIGH finding
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:112 — remediation #6 schema + non-sentinel
3. services/platform/src/cutover/soak-fence.ts:957-974 — structural schema_valid fallback
4. services/platform/src/cutover/soak-fence.ts:1000-1004 — fixed UUID sentinels
5. services/platform/tests/integration/sprint29-soak-flip.test.ts:159-173 — free-port child overwrites HOLO_VERIFY_BASE_URL/PLATFORM_URL
6. services/platform/src/cutover/soak-fence.ts:698-705 — resolveVerifyBaseUrl order
7. REDHAT-FIX-S29-H01-verify-deployed-network-mcp-and-article-endpoints-with-schema-valid-postgres-backed-per-tool.md — prior H01
8. D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md — AC-2 tools

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-red.log` → Exit 0
- gate: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts` → Exit 0
- gate: `HOLO_VERIFY_BASE_URL=$PLATFORM_URL bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '(.target_identity.host|length)>0 and all(.tools[] | select(.is_mutation==false) | .schema_valid==true)'` → Exit 0
- gate: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-path.json` → Exit 0
- gate: `pnpm tsgo --noEmit` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md#H-02, services/platform/src/cutover/soak-fence.ts:957-1004, sprint29-soak-flip.test.ts:159-173, REDHAT-FIX-S29-H01
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: Record target_identity on every verify-tools/article report; schema_valid = Zod only; seed tools with real DB ids; fail null/not-found; keep network transport as production oracle.
pattern_source: Review H-02 + H01 network contract + MCP tool outputSchema registry
anti_pattern: schema_valid = zodOk || structuralOk; fixed UUID sentinels; free-port overwrite without identity; null as postgres_backed

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is cutover verify-tools/article network oracles: deployed endpoint identity binding, Zod-true schema_valid without structural fallback, and non-sentinel Postgres-backed read seeds. Continues H01 ownership on CAP-CUT-01. Implementer = devops-engineer; planner = mastra-planner; reviewers = mastra-reviewer + test-quality-reviewer.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-S29-H01, REDHAT-FIX-S29-R2-C01, D06-05
Blocks: unqualified-sprint-29-close

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md finding H-02 HIGH; reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d', 'Cycle-2 strengthens H01: identity binding + Zod-only success + real seeds', 'Article byte-parity baseline immutability is R2-H03; this task may share verify-article identity fields but must not reintroduce SUT-authored baselines']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-H02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "deployed_or_labeled_soak_endpoint": {
      "description": "A listening Hono/MCP endpoint with documented identity. May be local stack labeled as soak target but must record host/port/generation; production path uses real PLATFORM_URL.",
      "seed_method": "cli",
      "records": [
        "GET $PLATFORM_URL/health 200",
        "HOLO_VERIFY_BASE_URL set to that URL",
        "identity label recorded before verify"
      ]
    },
    "seeded_real_row_ids": {
      "description": "Real documents/subscriptions (or tool-required entities) rows in holocron_nonprod with UUIDs returned by SELECT, not fixed sentinels.",
      "seed_method": "cli",
      "records": [
        "SELECT id FROM documents LIMIT 1 yields non-null UUID",
        "tool input seeds use those live ids"
      ]
    },
    "negative_payloads": {
      "description": "Synthetic MCP-shaped results with payload null and Zod-invalid object for evaluateReadToolSuccess.",
      "seed_method": "migration_fixture",
      "records": [
        "payload: null",
        "payload: { unexpected: true } failing outputSchema"
      ]
    },
    "pre_fix_structural_fallback_and_sentinels": {
      "description": "cab5c071: evaluateReadToolSuccess structural fallback; fixed UUID seeds; free-port child overwrites URLs.",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/src/cutover/soak-fence.ts:957-974",
        "services/platform/src/cutover/soak-fence.ts:1000-1004",
        "services/platform/tests/integration/sprint29-soak-flip.test.ts:159-173",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md H-02"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN deployed_or_labeled_soak_endpoint with known identity (HOLO_VERIFY_BASE_URL pointing at intended server; not anonymously overwritten without record) WHEN operator runs cutover:verify-tools --json THEN report includes base_url and target_identity fields (host, port, and service label or pid/generation) matching the intended endpoint",
      "verify": "HOLO_VERIFY_BASE_URL=$PLATFORM_URL bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '(.base_url|length)>0 and (.target_identity.host|length)>0 and (.target_identity.port>0) and .toolsTotal>0'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "mcp-gateway",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deployed_or_labeled_soak_endpoint",
            "action": {
              "actor": "operator",
              "steps": [
                "set HOLO_VERIFY_BASE_URL to labeled endpoint",
                "run verify-tools",
                "assert identity fields"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "report.target_identity.port is integer > 0",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN deployed_or_labeled_soak_endpoint with real seeded Postgres rows for read tools WHEN verify-tools evaluates each non-mutation tool THEN schema_valid true only on Zod success; postgres_backed true only with non-null real data; null/not-found fails",
      "verify": "jq -e '[.tools[] | select(.is_mutation==false)] | all(.schema_valid==true and .postgres_backed==true and .ok==true and .isError!=true)' verify-tools.json",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "mcp-gateway+postgres",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_real_row_ids",
            "action": {
              "actor": "operator",
              "steps": [
                "seed real documentId/subscriptionId",
                "verify-tools",
                "inspect read tool entries"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "every read tool schema_valid === true implies registered Zod parse success",
                "every read tool postgres_backed === true implies payload is non-null and contains real fields from Postgres",
                "seeds used are not the fixed sentinel pair 00000000-0000-4000-8000-000000000001 / ...0002 unless those exact rows exist and return non-null",
                "overall verify-tools.ok === true only when all reads pass above"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN negative_payloads fixture with null payload and Zod-failing object WHEN evaluateReadToolSuccess is invoked THEN schema_valid false; postgres_backed false; ok false for both",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts -t 'R2-H02|evaluateReadToolSuccess|schema_valid'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "unit-in-integration",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "negative_payloads",
            "action": {
              "actor": "cli_user",
              "steps": [
                "call evaluateReadToolSuccess with payload null",
                "call with non-conforming object",
                "assert both fail"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "for payload null: schema_valid === false and postgres_backed === false and ok === false",
                "for Zod-failing object: schema_valid === false and ok === false"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN deployed_or_labeled_soak_endpoint with soak fence engaged WHEN mutation tools called over network THEN all mutations blocked with MIGRATION_READ_ONLY",
      "verify": "jq -e '[.tools[] | select(.is_mutation==true)] | all(.ok==true and .isError==true and (.code==\"MIGRATION_READ_ONLY\" or (.message|startswith(\"MIGRATION_READ_ONLY:\"))))' verify-tools.json",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "mcp-gateway",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deployed_or_labeled_soak_endpoint",
            "action": {
              "actor": "operator",
              "steps": [
                "verify-tools mutations"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "every mutation isError === true",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre_fix_structural_fallback_and_sentinels at cab5c071 WHEN implementer completes R2-H02 THEN red+green+path.json under redhat-fix-s29-r2-h02-*",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-red.log && jq -e '.path==\"A\" and .agent==\"devops-engineer\"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h02-path.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_structural_fallback_and_sentinels",
            "action": {
              "actor": "cli_user",
              "steps": [
                "red",
                "implement",
                "green",
                "path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-5 report field ok equals true OR exit_code equals 1",
                "AC-5 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "red log size > 0",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "verify-tools report includes base_url and target_identity.host/port",
      "maps_to_ac": "AC-1",
      "verify": "jq .base_url .target_identity"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "schema_valid is false when Zod fails even if payload is object/array/null",
      "maps_to_ac": "AC-2",
      "verify": "unit cases + read tool entries"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "seeds are real holocron_nonprod row ids, not fixed 00000000-0000-4000-8000-000000000001 sentinels without row proof",
      "maps_to_ac": "AC-2",
      "verify": "rg seeds in soak-fence; DB existence assert"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "evaluateReadToolSuccess(null) returns schema_valid false postgres_backed false ok false",
      "maps_to_ac": "AC-3",
      "verify": "vitest R2-H02 negative payloads"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "all mutation tools blocked with MIGRATION_READ_ONLY over network",
      "maps_to_ac": "AC-4",
      "verify": "jq mutation all"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence non-empty for structural fallback defect",
      "maps_to_ac": "AC-5",
      "verify": "test -s redhat-fix-s29-r2-h02-red.log"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "missing base_url fails closed (ok false, tools not counted pass)",
      "maps_to_ac": "AC-1",
      "verify": "HOLO_VERIFY_BASE_URL unset path"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "deployed-endpoint-identity-on-verify-tools",
    "zod-only-schema-valid-read-oracle",
    "non-sentinel-postgres-seeded-reads"
  ],
  "consumes": [
    "h01-network-verify-tools",
    "mcp-tool-output-schemas",
    "holocron_nonprod-seeded-rows"
  ],
  "boundary_contracts": [
    "schema_valid requires registered Zod success",
    "target_identity required for green verify-tools",
    "null/not-found is not postgres_backed success"
  ],
  "proposed_by": "mastra-planner",
  "source_finding": {
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d"
  }
}
-->

</details>
