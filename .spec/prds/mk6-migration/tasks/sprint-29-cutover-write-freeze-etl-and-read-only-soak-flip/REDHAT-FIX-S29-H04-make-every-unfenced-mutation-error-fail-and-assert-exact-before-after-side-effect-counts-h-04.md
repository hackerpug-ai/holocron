# REDHAT-FIX-S29-H04 — Make every unfenced mutation error fail and assert exact before/after side-effect counts (H-04; sprint29-write-fence-red.test.ts:414-477)

## What this does

Remediate red-hat HIGH finding H-04 (red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:102-108; also D06-01 AC-1–2 PARTIAL at lines 27 and AC-3 FAIL at line 28). Unfenced MCP mutation tools mark non-MIGRATION_READ_ONLY errors as ok:true (sprint29-write-fence-red.test.ts:445-477) despite AC-3 requiring every call to resolve. Fenced Hono writes calculate before/after row counts but intentionally do not compare them (:414-429). Make non-fence errors failures and assert exact before/after coun…

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-H04). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-010. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts`
- `! rg -n 'Non-fence errors still prove the path was entered|Soft-check deltas only' services/platform/tests/integration/sprint29-write-fence-red.test.ts`
- `rg -n 'expect\(after|toEqual\(postAc1|toEqual\(before' services/platform/tests/integration/sprint29-write-fence-red.test.ts`
- `pnpm tsgo --noEmit && pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint29-write-fence-red.test.ts`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/tests/integration/sprint29-write-fence-red.test.ts, .tmp/REDHAT-FIX-S29-H04/**, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md

Prohibited: Shrinking MCP mutation inventory to avoid failing tools, Mocking executePostgresMcpTool or SQL counts, Marking non-fence errors as ok:true, Leaving soft-check count comments without expect equality, Production fence implementation scope creep into D06-05 soak-fence durable deployment (C-02) beyond what tests already exercise, Deleting fenced TC-8 assertions to green unfenced hardening

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-H04 — Make every unfenced mutation error fail and assert exact before/after side-effect counts (H-04; sprint29-write-fence-red.test.ts:414-477)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
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
TC-7 unfenced MCP fails the suite if any tool throws a non-success error; fenced Hono TC asserts afterCounts deep-equal beforeCounts for every tracked table; evidence files reflect honest per-tool failures.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST — In unfenced MCP mutation loop (sprint29-write-fence-red.test.ts:445-477), treat any error that is NOT a successful resolve as a failure — including non-MIGRATION_READ_ONLY exceptions currently pushed as ok:true
- MUST — Only allow ok:true when executePostgresMcpTool resolves successfully (no throw); MIGRATION_READ_ONLY while unfenced remains a failure
- MUST — For fenced Hono writes (lines 414-429), assert exact equality of before/after row counts for every affected table (documents, subscription_sources, improvement_requests, and any other tables touched by the inventory), not a soft-check comment
- MUST — Preserve RED intent for fence-missing cases: fenced assertions still fail until production fence is green, but reachability oracles must not mask broken tools
- MUST — Capture evidence JSON that lists per-tool ok:false with error for unexpected failures
- NEVER mark non-fence errors as ok:true under unfenced TC-7 (lines 459-461 comment is the anti-pattern)
- NEVER calculate after counts without expect(after).toEqual(before) (or per-table equality) for fenced Hono AC-2
- NEVER mock executePostgresMcpTool or Postgres counts
- NEVER shrink mutation inventory to avoid failing tools
- NEVER weaken AC-3 to 'path entered' instead of 'call resolves'
- STRICTLY AC-3 'every call resolves' means Promise fulfills without throw for unfenced reachability
- STRICTLY fenced side-effect oracle is exact count equality, not delta soft-check
- STRICTLY real PLATFORM_IT=1 Postgres

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN fx_mcp_write_inventory and fx_hono_write_inventory on platform_it_postgres; curre...
- [ ] AC-2: GIVEN fx_broken_mcp_tool_error simulating a throw with message not starting with MIGRAT...
- [ ] AC-3: GIVEN fx_mcp_write_inventory with HOLO_MIGRATION_READ_ONLY=1 WHEN TC-8 fenced MCP loop ...
- [ ] AC-4: GIVEN remediated sprint29-write-fence-red.test.ts WHEN source is grepped and evidence w...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — unfenced MCP non-fence errors fail; fenced Hono asserts exact before/after row-count equality (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN fx_mcp_write_inventory and fx_hono_write_inventory on platform_it_postgres; current suite marks non-fence errors ok:true (:459-461) and skips count compare (:414-429) WHEN sprint29-write-fence-red.test.ts TC-7 and fenced Hono body/count assertions are remediated under red_first THEN (1) unfenced loop: success only if executePostgresMcpTool resolves; any throw is a failure (MIGRATION_READ_ONLY while unfenced is failure; other errors are also failure, never ok:true); (2) fenced Hono: after counts for every affected table exactly equal before/postAc1 counts via expect equality; suite fails if any write leaks rows under fence
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres+hono+mcp-executor
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'TC-7|TC-8|hono-fenced|row count|unfenced MCP'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if non-MIGRATION_READ_ONLY throw still recorded as ok:true; after counts calculated but not asserted equal to before; stub/mock MCP executor swallows errors; empty tool inventory
  START_REF: fx_mcp_write_inventory
  MUST_OBSERVE: results entries with throw have ok:false; failures array non-empty if any tool throws; expect(failures).toEqual([]) only when all 21 resolve; store_document success still seeds a real document id when tools are healthy
  MUST_NOT_OBSERVE: ok:true with error field for non-fence exceptions (lines 459-461 pattern); empty/start signature: all tools ok despite throws
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — Regression: non-fence error classification unit path fails closed (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN fx_broken_mcp_tool_error simulating a throw with message not starting with MIGRATION_READ_ONLY: WHEN classification helper or TC-7 logic evaluates the outcome THEN outcome is failure (ok:false); must_not_observe ok:true for that tool
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres+mcp-executor
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'non-fence|classification|H-04|unfenced'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if classifier still treats any non-fence error as reachability success; mock always returns ok
  START_REF: fx_broken_mcp_tool_error
  MUST_OBSERVE: ok:false for that toolId; error message preserved in results
  MUST_NOT_OBSERVE: ok:true with error: msg; empty failures while throw occurred
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — Fenced MCP path still requires MIGRATION_READ_ONLY prefix (no weakening) (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN fx_mcp_write_inventory with HOLO_MIGRATION_READ_ONLY=1 WHEN TC-8 fenced MCP loop runs after H-04 changes THEN every tool must reject with MIGRATION_READ_ONLY: prefix; non-fence rejects remain failures; successful resolves remain failures
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres+mcp-executor
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'TC-8|fenced MCP'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if fenced loop accepts any throw as success; fence assertions deleted to green unfenced hardening
  START_REF: fx_mcp_write_inventory
  MUST_OBSERVE: 21/21 reject with MIGRATION_READ_ONLY: when fence implemented; failures include any non-prefix reject or successful resolve
  MUST_NOT_OBSERVE: fenced success treated as ok; unfenced softening applied to fenced case
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Evidence artifacts and source comments no longer encode the soft-check anti-pattern (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN remediated sprint29-write-fence-red.test.ts WHEN source is grepped and evidence writers run THEN no comment remains that non-fence errors prove path entered as success; no comment that counts are soft-check only; evidence JSON includes before/after equality result
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: source+evidence
  VERIFY: `! rg -n 'Non-fence errors still prove the path was entered|Soft-check deltas only|intentionally do not compare' services/platform/tests/integration/sprint29-write-fence-red.test.ts; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'hono-fenced|TC-7'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if anti-pattern comments remain as the behavioral contract; evidence omits after vs before
  START_REF: platform_it_postgres
  MUST_OBSERVE: expect equality present in source; no ok:true on non-fence catch branch
  MUST_NOT_OBSERVE: Soft-check deltas only when fence works; Non-fence errors still prove the path was entered as ok:true
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | unfenced MCP catch branch never sets ok:true for thrown errors | AC-1 | `rg -n 'ok: true' services/platform/tests/integration/sprint29-write-fence-red.test.ts \...` |
| TC-2 | fenced Hono test asserts exact before/after row-count equality for every affe... | AC-1 | `rg -n 'toEqual\|toBe\(postAc1\|after\.documents\|expect\(after' services/platform/tests...` |
| TC-3 | non-fence error classification fails closed | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |
| TC-4 | fenced MCP TC-8 still requires MIGRATION_READ_ONLY prefix | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |
| TC-5 | soft-check anti-pattern comments and ok:true-on-error branch are gone | AC-4 | `! rg -n 'Non-fence errors still prove the path was entered\|Soft-check deltas only' ser...` |
| TC-6 | typecheck and biome clean on write-fence test | AC-1 | `pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error ...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/sprint29-write-fence-red.test.ts
- .tmp/REDHAT-FIX-S29-H04/**
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md
writeProhibited:
- Shrinking MCP mutation inventory to avoid failing tools
- Mocking executePostgresMcpTool or SQL counts
- Marking non-fence errors as ok:true
- Leaving soft-check count comments without expect equality
- Production fence implementation scope creep into D06-05 soak-fence durable deployment (C-02) beyond what tests already exercise
- Deleting fenced TC-8 assertions to green unfenced hardening

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:102-108 [H-04 HIGH — unfenced non-fence errors marked ok; fenced counts not asserted]
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:27-28 [D06-01 AC-1–2 PARTIAL (counts not asserted); AC-3 FAIL (non-fence errors as success)]
3. services/platform/tests/integration/sprint29-write-fence-red.test.ts:414-429 [Fenced Hono: counts calculated, intentionally not compared]
4. services/platform/tests/integration/sprint29-write-fence-red.test.ts:445-477 [Unfenced MCP: non-fence errors recorded as ok:true]
5. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-01-red-every-write-path-returns-migration-read-only-during-soak.md:57-98 [AC-2 row-count unchanged; AC-3 every unfenced call resolves]
6. services/platform/src/mcp/executor.ts:1-80 [executePostgresMcpTool real path under test]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- write-fence-red-suite: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts` → honest results: unfenced tools that throw fail; fenced counts equal when 423 path holds (suite may still be red on missing production fence — do not weaken oracles to green)
- no-soft-check-comments: `! rg -n 'Non-fence errors still prove the path was entered|Soft-check deltas only' services/platform/tests/integration/sprint29-write-fence-red.test.ts` → exit 0 (no matches)
- count-equality-present: `rg -n 'expect\(after|toEqual\(postAc1|toEqual\(before' services/platform/tests/integration/sprint29-write-fence-red.test.ts` → at least one equality assertion on after vs before counts
- typecheck-biome: `pnpm tsgo --noEmit && pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint29-write-fence-red.test.ts` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-01-red-every-write-path-returns-migration-read-only-during-soak.md
Interaction notes:
- This task hardens the RED suite oracles; production fence greening remains D06-03/D06-05 / C-02. After H-04, unfenced broken tools correctly fail RED reachability, which is desired honesty.
- If some mutation tools cannot resolve unfenced with minimal inputs, fix inputs/seeds — do not re-open ok:true-on-error.
pattern: Reachability = Promise resolves; fence = named error prefix + exact side-effect count equality; never treat alternate errors as success.
pattern_source: D06-01 AC-2/AC-3; H-04 remediation paragraph
anti_pattern: ok:true on any throw that is not MIGRATION_READ_ONLY; computing counts without expect equality; 'path entered' as substitute for resolve

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — H-04 is a gate-provability defect in the D06-01 write-fence integration suite: unfenced MCP errors are misclassified as ok and fenced Hono side-effect counts are calculated but not asserted. Hardening those oracles is test/CI honesty work under CAP-CUT-01; devops-engineer owns fail-closed verification so cutover cannot green on broken mutation tools or silent writes.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: devops-engineer

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-01
Blocks: —

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Preserves finding H-04 from red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md @ SHA 2b966c7b60559ec9986cf737ed5322a6146c7960. Evidence lineage: sprint29-write-fence-red.test.ts:414-429 (counts not compared) and :445-477 (ok:true on non-fence errors). PRIMARY AC requires both fail-closed unfenced errors AND exact row-count equality. D06-01 may remain RED on fence absence — H-04 does not authorize fake green. proposed_by: devops-engineer.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fx_mcp_write_inventory": {
      "description": "Manifest-derived 21 mutation tool ids (side_effects != null) cross-checked against toolsAsRecord().",
      "seed_method": "public_api",
      "records": [
        "buildMutationsReport(loadManifest(...)) yields 21 tool ids",
        "each id present in toolsAsRecord()",
        "minimalValidInput map per tool"
      ]
    },
    "fx_hono_write_inventory": {
      "description": "Live createHonoApp route table filtered to POST/PUT/PATCH/DELETE /api/*.",
      "seed_method": "public_api",
      "records": [
        ">=23 write routes",
        "authenticated min bodies per route",
        "tables: documents, subscription_sources, improvement_requests (+ any other touched tables)"
      ]
    },
    "fx_broken_mcp_tool_error": {
      "description": "Controlled case or injected tool invocation that throws a non-MIGRATION_READ_ONLY Error (e.g. validation or DB error) while HOLO_MIGRATION_READ_ONLY is unset \u2014 must fail TC-7 after remediation.",
      "seed_method": "public_api",
      "records": [
        "error message does not start with MIGRATION_READ_ONLY:",
        "current broken code path would mark ok:true"
      ]
    },
    "fx_fenced_hono_counts": {
      "description": "Pre-fence row counts captured after AC-1 reachability; HOLO_MIGRATION_READ_ONLY=1 for AC-2 sweep.",
      "seed_method": "public_api",
      "records": [
        "postAc1Counts for documents/subscription_sources/improvement_requests",
        "after counts selected with same SQL"
      ]
    },
    "platform_it_postgres": {
      "description": "PLATFORM_IT=1 with DATABASE_URL pointing at real holocron_nonprod Postgres.",
      "seed_method": "cli",
      "records": [
        "psql SELECT 1 succeeds",
        "documents table queryable"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN fx_mcp_write_inventory and fx_hono_write_inventory WHEN unfenced MCP and fenced Hono oracles are remediated THEN non-fence throws fail unfenced TC-7 and fenced Hono asserts exact before/after row-count equality for every affected table",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'TC-7|hono-fenced|row count'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+hono+mcp-executor",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "non-MIGRATION_READ_ONLY throw still ok:true",
            "counts calculated but not asserted",
            "stub MCP executor"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx_mcp_write_inventory",
            "action": {
              "actor": "tester",
              "steps": [
                "Run unfenced MCP loop",
                "Run fenced Hono count equality"
              ]
            },
            "end_state": {
              "must_observe": [
                "throws => ok:false",
                "after counts == before counts under fence",
                "expect equality in source"
              ],
              "must_not_observe": [
                "ok:true with error for non-fence throws",
                "soft-check only"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN fx_broken_mcp_tool_error WHEN classification runs THEN ok:false",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'non-fence|H-04'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+mcp-executor",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "non-fence error still success"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx_broken_mcp_tool_error",
            "action": {
              "actor": "tester",
              "steps": [
                "Induce non-fence throw",
                "Assert failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "ok:false",
                "error preserved"
              ],
              "must_not_observe": [
                "ok:true with error"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN fenced MCP inventory WHEN TC-8 runs THEN every tool rejects with MIGRATION_READ_ONLY: and non-prefix rejects fail",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'TC-8'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+mcp-executor",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "any throw accepted as fenced success"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx_mcp_write_inventory",
            "action": {
              "actor": "tester",
              "steps": [
                "Fence on",
                "Call all mutation tools"
              ]
            },
            "end_state": {
              "must_observe": [
                "MIGRATION_READ_ONLY: prefix required"
              ],
              "must_not_observe": [
                "successful resolve under fence"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN remediated test source WHEN grepped THEN soft-check and non-fence-ok comments/branches are gone",
      "verify": "! rg -n 'Non-fence errors still prove the path was entered|Soft-check deltas only' services/platform/tests/integration/sprint29-write-fence-red.test.ts",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "source+evidence",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "anti-pattern comments remain as contract"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform_it_postgres",
            "action": {
              "actor": "implementer",
              "steps": [
                "Remove soft-check comments",
                "Add expect equality"
              ]
            },
            "end_state": {
              "must_observe": [
                "expect equality present"
              ],
              "must_not_observe": [
                "soft-check comment contract"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "unfenced MCP catch branch never sets ok:true for thrown errors",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'TC-7'",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "fenced Hono test asserts exact before/after row-count equality",
      "verify": "rg -n 'toEqual|expect\\(after' services/platform/tests/integration/sprint29-write-fence-red.test.ts",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "non-fence error classification fails closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'non-fence|H-04'",
      "maps_to_ac": "AC-2",
      "test_tier": "integration"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "fenced MCP TC-8 still requires MIGRATION_READ_ONLY prefix",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-write-fence-red.test.ts -t 'TC-8'",
      "maps_to_ac": "AC-3",
      "test_tier": "integration"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "soft-check anti-pattern comments are gone",
      "verify": "! rg -n 'Non-fence errors still prove the path was entered|Soft-check deltas only' services/platform/tests/integration/sprint29-write-fence-red.test.ts",
      "maps_to_ac": "AC-4",
      "test_tier": "integration"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "typecheck and biome clean on write-fence test",
      "verify": "pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint29-write-fence-red.test.ts",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "unfenced MCP mutation suite that fails on any non-success non-fence-error",
    "fenced Hono write suite that asserts exact before/after row-count equality per affected table",
    "evidence artifacts listing per-tool outcomes without ok:true for unexpected errors"
  ],
  "consumes": [
    "services/platform/tests/integration/sprint29-write-fence-red.test.ts",
    "executePostgresMcpTool / MCP mutation inventory (21 tools)",
    "createHonoApp write-route inventory",
    "real Postgres PLATFORM_IT=1 holocron_nonprod"
  ],
  "boundary_contracts": [
    "D06-01 AC-2: fenced Hono writes return 423 migration_read_only AND row counts unchanged",
    "D06-01 AC-3: every unfenced MCP mutation call resolves without MIGRATION_READ_ONLY \u2014 resolution means success, not any thrown error",
    "CAP-CUT-01: every production write path is reachability-proven then fence-proven"
  ],
  "proposed_by": "devops-engineer"
}
-->

</details>
