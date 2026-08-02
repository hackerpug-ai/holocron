# REDHAT-FIX-S29-H01 — Verify deployed network /mcp and /article endpoints with schema-valid Postgres-backed per-tool results (H-01; soak-fence.ts:554-590,769-782)

## What this does

Close red-hat H-01 by making cutover tool and article verification execute against deployed network /mcp and /article endpoints with schema-valid Postgres-backed per-tool success criteria and preserved per-tool results.

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-H01). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-010, CAP-CUT-01. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h01-red.log`
- `HOLO_VERIFY_BASE_URL=${PLATFORM_URL:-http://127.0.0.1:4111} bun services/platform/src/cli/holo.ts cutover:verify-tools --json`
- `HOLO_VERIFY_BASE_URL=http://127.0.0.1:1 bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '.ok==false'`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h01-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyTools/runVerifyArticle network transport + schema_valid read criteria + report fields, services/platform/src/cli/holo.ts — MODIFY verify-tools/verify-soak flags for base URL if needed, services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY network assertions; remove in-process-only green paths, services/platform/tests/integration/redhat-fix-s29-h01-network-verify.test.ts — NEW optional, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/** — evidence

Prohibited: Hardcoding toolsTotal=44, executePostgresMcpTool as sole verify path, app/, components/, hooks/, screens/, convex/** deletion, Weakening mutation MIGRATION_READ_ONLY criterion, H-02 full-table parity rewrite (separate task)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-H01 — Verify deployed network /mcp and /article endpoints with schema-valid Postgres-backed per-tool results (H-01; soak-fence.ts:554-590,769-782)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
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
verify-tools over real HTTP accounts every manifest tool with non-null toolsPassed/toolsTotal; reads are schema-valid Postgres-backed successes; mutations blocked; article network GET byte-matches baseline; in-process createHonoApp is not the sole production oracle.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST invoke MCP tools via real network HTTP to the deployed /mcp endpoint (fetch/curl to PLATFORM_URL or HOLO_VERIFY_BASE_URL), never as the sole production oracle via createHonoApp().request in-process (soak-fence.ts:554-565)
- MUST derive toolsTotal from live manifest.tools.length at runtime — never hardcode 44
- MUST require for every non-mutation (read) tool: HTTP transport success AND application-level success (isError!==true) AND schema-valid result payload matching the tool's manifest/output contract AND evidence the data is Postgres-backed (non-stub; real rows/fields from holocron_nonprod where the tool reads DB)
- MUST NOT treat HTTP 200/202 alone as read-tool pass when MCP result is an application-level error (fix soak-fence.ts:584-590)
- MUST keep mutation tools pass criterion: blocked with MIGRATION_READ_ONLY (isError true + code/message prefix) when soak fence engaged
- MUST preserve per-tool results array with one entry per manifest tool_id including tool_id, is_mutation, invoked, ok, status, code/message, and for reads a schema_valid boolean
- MUST fetch /article/:shareToken over real network HTTP (not in-process app.request at soak-fence.ts:769-782) and sha256+byteLength match D06-03 article-baseline.json
- MUST leave toolsPassed and toolsTotal as concrete integers (never null) in verify-tools and verify-soak aggregate reports
- MUST capture RED evidence showing in-process transport and/or 200-with-error counted as pass on pre-fix HEAD
- NEVER count a read tool as ok when res.isError===true
- NEVER count toolsStubbed>0 as overall pass
- NEVER use static article:compat stub as the parity oracle
- NEVER silently drop per-tool results from the report
- NEVER executePostgresMcpTool directly as the verify-tools production path
- NEVER hardcode toolsTotal=44
- STRICTLY tdd_mode red_first; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/
- STRICTLY test_tier e2e for PRIMARY network ACs; topology single-node; verification_service mcp-gateway + hono
- STRICTLY requires a running server at PLATFORM_URL/HOLO_VERIFY_BASE_URL — suite must fail-closed (not skip-pass) when base URL unreachable
- STRICTLY soak fence engaged for mutation-block assertions (depends on durable fence from C-02 when available; may use controlled server env for isolated H-01 if documented)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN soak_engaged_with_running_server WHEN cutover:verify-tools --json against PLATFOR...
- [ ] AC-2: GIVEN soak_engaged_with_running_server WHEN verify-tools evaluates read tools THEN sche...
- [ ] AC-3: GIVEN soak_engaged_with_running_server WHEN mutation tools called over network THEN all...
- [ ] AC-4: GIVEN article_baseline_available WHEN network GET /article/:shareToken THEN byte-parity...
- [ ] AC-5: GIVEN pre_fix_in_process_verify WHEN implementer completes H-01 THEN evidence chain + f...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Network /mcp tools/call for all manifest tools (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN soak_engaged_with_running_server WHEN cutover:verify-tools --json against PLATFORM_URL THEN all tools invoked over network; counts non-null and complete
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway
  VERIFY: `HOLO_VERIFY_BASE_URL=$PLATFORM_URL bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '.toolsTotal>0 and .toolsPassed==.toolsTotal and .toolsStubbed==0 and (.tools|length)==.toolsTotal and all(.tools[].invoked)'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub — only createHonoApp().request in-process (soak-fence.ts:554-565) as sole oracle; empty — toolsPassed/toolsTotal null (gate step5.log anti-pattern); static — toolsTotal hardcoded 44 without reading manifest; disconnect — unreachable base URL treated as pass
  START_REF: soak_engaged_with_running_server
  MUST_OBSERVE: toolsTotal equals live manifest.tools.length (integer >= 1, typically 44); toolsPassed equals toolsTotal (both concrete integers, not null); toolsStubbed equals the literal 0; tools array length equals toolsTotal; every tools[i].invoked === true; report records transport mode 'network' or base_url non-empty matching PLATFORM_URL host
  MUST_NOT_OBSERVE: empty/start signature: toolsPassed null or toolsTotal null; toolsStubbed greater than 0; toolsTotal equals 0; sole transport is in-process createHonoApp without network base_url
  EVIDENCE: api_response (required_capture=True)

### AC-2 — Read tools require schema-valid Postgres-backed success (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN soak_engaged_with_running_server WHEN verify-tools evaluates read tools THEN schema-valid Postgres-backed success required; 200+isError is fail
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway+postgres
  VERIFY: `jq -e '[.tools[] | select(.is_mutation==false)] | all(.ok==true and .schema_valid==true and .isError!=true)' verify-tools.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if HTTP 200/202 alone counted as pass despite isError (soak-fence.ts:584-590); schema_valid never computed; stub empty content counted as Postgres-backed success
  START_REF: soak_engaged_with_running_server
  MUST_OBSERVE: every read tool has ok === true; every read tool has schema_valid === true; every read tool has isError !== true; every read tool has status in {200,202} AND non-empty result payload (byte length > 0 or structured content keys present); overall verify-tools.ok === true only when all reads pass the above
  MUST_NOT_OBSERVE: empty/start signature: read tool ok true solely because status===200; read tool ok true with isError true; schema_valid false or absent while ok true; empty result body counted as Postgres-backed success
  EVIDENCE: api_response (required_capture=True)

### AC-3 — Mutation tools blocked with MIGRATION_READ_ONLY over network (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN soak_engaged_with_running_server WHEN mutation tools called over network THEN all mutations blocked with MIGRATION_READ_ONLY
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway
  VERIFY: `jq -e '[.tools[] | select(.is_mutation==true)] | all(.ok==true and .isError==true and (.code=="MIGRATION_READ_ONLY" or (.message|startswith("MIGRATION_READ_ONLY:"))))'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if mutation isError false (write succeeded); mutation counted pass without MIGRATION_READ_ONLY
  START_REF: soak_engaged_with_running_server
  MUST_OBSERVE: mutation tool count >= 1; every mutation has isError === true; every mutation code==='MIGRATION_READ_ONLY' OR message starts with 'MIGRATION_READ_ONLY:'; every mutation ok === true (blocked criterion satisfied)
  MUST_NOT_OBSERVE: empty/start signature: mutation isError false; mutation ok true without MIGRATION_READ_ONLY evidence; mutation tools array empty while manifest has mutations
  EVIDENCE: api_response (required_capture=True)

### AC-4 — Network /article byte-parity with D06-03 baseline (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN article_baseline_available WHEN network GET /article/:shareToken THEN byte-parity with D06-03 baseline
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: hono
  VERIFY: `HOLO_VERIFY_BASE_URL=$PLATFORM_URL bun services/platform/src/cli/holo.ts cutover:verify-soak --json | jq -e '.article.ok==true and .article.match==true and .article.status==200 and (.article.sha256|length)==64'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if in-process app.request sole oracle (soak-fence.ts:769-782); static article:compat stub compared; sha256 mismatch ignored
  START_REF: article_baseline_available
  MUST_OBSERVE: HTTP status equals the literal 200; response sha256 equals article-baseline.json.sha256 exactly (64-hex match); response byteLength equals article-baseline.json.byteLength exactly (e.g. 4821==4821); article report records base_url or transport network
  MUST_NOT_OBSERVE: empty/start signature: byteLength equals 0; HTTP status equals 404; sha256 differs from baseline while ok true; sole transport in-process createHonoApp request
  EVIDENCE: api_response (required_capture=True)

### AC-5 — TDD evidence + fail-closed unreachable base URL (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre_fix_in_process_verify WHEN implementer completes H-01 THEN evidence chain + fail-closed unreachable URL
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: tdd evidence + negative network
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h01-red.log && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h01-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if empty red log; unreachable URL treated as pass; green without network base_url field
  START_REF: pre_fix_in_process_verify
  MUST_OBSERVE: red log file size > 0; path.json path equals 'A'; path.json agent equals 'devops-engineer'; unreachable base URL run has ok === false
  MUST_NOT_OBSERVE: empty/start signature: green only without red; unreachable URL ok true; toolsPassed null in green report
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | toolsTotal equals live manifest length; toolsPassed==toolsTotal; toolsStubbed==0 | AC-1 | `jq -e '.toolsPassed==.toolsTotal and .toolsStubbed==0 and .toolsTotal>0'` |
| TC-2 | transport is network with non-empty base_url | AC-1 | `jq -e '.transport=="network" or (.base_url\|length)>0'` |
| TC-3 | every read tool schema_valid and not isError | AC-2 | `jq '[.tools[]\|select(.is_mutation==false)]\|all(.schema_valid and .isError!=true)'` |
| TC-4 | every mutation blocked with MIGRATION_READ_ONLY | AC-3 | `jq '[.tools[]\|select(.is_mutation)]\|all(.code=="MIGRATION_READ_ONLY" or (.message\|st...` |
| TC-5 | article network sha256 matches baseline | AC-4 | `jq -e '.article.sha256==.article.baselineSha256 and .article.status==200'` |
| TC-6 | unreachable base URL fails closed | AC-5 | `HOLO_VERIFY_BASE_URL=http://127.0.0.1:1 holo cutover:verify-tools --json; jq -e '.ok==f...` |
| TC-7 | per-tool results array length equals toolsTotal | AC-1 | `jq -e '(.tools\|length)==.toolsTotal'` |
| TC-8 | RED log non-empty for in-process/200-error HEAD behavior | AC-5 | `test -s redhat-fix-s29-h01-red.log` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyTools/runVerifyArticle network transport + schema_valid read criteria + report fields
- services/platform/src/cli/holo.ts — MODIFY verify-tools/verify-soak flags for base URL if needed
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY network assertions; remove in-process-only green paths
- services/platform/tests/integration/redhat-fix-s29-h01-network-verify.test.ts — NEW optional
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/** — evidence
writeProhibited:
- Hardcoding toolsTotal=44
- executePostgresMcpTool as sole verify path
- app/, components/, hooks/, screens/
- convex/** deletion
- Weakening mutation MIGRATION_READ_ONLY criterion
- H-02 full-table parity rewrite (separate task)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:78-84 — H-01 HIGH finding + remediation
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:42-45 — D06-05 AC-2/AC-4 FAIL matrix
3. services/platform/src/cutover/soak-fence.ts:554-565 — createHonoApp in-process tools verify
4. services/platform/src/cutover/soak-fence.ts:584-590 — read tools pass on HTTP 200/202 despite app errors
5. services/platform/src/cutover/soak-fence.ts:769-782 — in-process article app.request
6. services/platform/src/mcp/gateway.ts — handleMcpRequest real transport
7. services/platform/src/mcp/executor.ts — Postgres-backed tool execution
8. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — tools catalog
9. .spec/prds/mk6-migration/08-uc-sync.md:51-52 — UC-SYNC-03 all 44 tools + /article/
10. D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md — AC-2/AC-4 contracts

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED baseline: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h01-red.log` → Non-empty red log for in-process / 200-error pass behavior
- Network verify-tools: `HOLO_VERIFY_BASE_URL=${PLATFORM_URL:-http://127.0.0.1:4111} bun services/platform/src/cli/holo.ts cutover:verify-tools --json` → ok true; toolsPassed==toolsTotal; per-tool schema_valid reads; mutations MIGRATION_READ_ONLY
- Unreachable fail-closed: `HOLO_VERIFY_BASE_URL=http://127.0.0.1:1 bun services/platform/src/cli/holo.ts cutover:verify-tools --json | jq -e '.ok==false'` → ok false
- Integration suite: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts` → Exit 0 with H-01 network cases
- path.json: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h01-path.json` → path A + devops-engineer

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md#H-01, services/platform/src/cutover/soak-fence.ts:554-590,769-782, services/platform/src/mcp/gateway.ts, .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, D06-05 AC-2/AC-4
Interaction notes:
- Prefer shared helper for network MCP JSON-RPC initialize+tools/call with auth Bearer HOLO_KEY_MCP
- Schema validation may reuse manifest-schema / verify-rehost contracts — do not invent weaker checks
- Depends on a running server; document PLATFORM_URL setup in test harness
- C-02 durable fence improves mutation realism; H-01 may still start a controlled server with env for isolation if process generation work is parallel
pattern: Replace in-process createHonoApp MCP/article oracles with fetch/HTTP client against HOLO_VERIFY_BASE_URL/PLATFORM_URL. For reads, parse MCP tools/call JSON-RPC result, validate against manifest schema (or tool output contract), require !isError and non-empty Postgres-backed payload. Keep mutation block criterion. Preserve tools[] detail in reports.
pattern_source: D06-05 MUST invoke tools over real /mcp; UC-SYNC-03 AC-3/AC-4; gateway handleMcpRequest
anti_pattern: createHonoApp in-process sole oracle (554-565,769-782); HTTP 200/202 as read success despite isError (584-590); null toolsPassed/toolsTotal; hardcoded 44

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is cutover verify-tools / verify-article CLI transport against a real deployed Hono/MCP network endpoint (PLATFORM_URL), preserving per-tool results and schema-valid Postgres-backed read success. This is CAP-CUT-01 operator verification owned by devops-engineer (same family as D06-05), not Mastra agent graph work. Implementer stays devops-engineer; proposed_by mastra-planner; reviewer mastra-reviewer.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-05, REDHAT-FIX-S29-C02
Blocks: unqualified-sprint-29-close

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: red-hat-20260802T010915Z C-02 matrix also notes D06-05 AC-2/AC-4 FAIL; H-01 is the remediation task', 'Reviewed SHA 2b966c7b60559ec9986cf737ed5322a6146c7960', 'Soft-depends on C-02 for realistic soak on deployed process; may use controlled server env for parallel implementation if documented in evidence']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "soak_engaged_with_running_server": {
      "description": "Real Hono/MCP server listening on PLATFORM_URL with HOLO_MIGRATION_READ_ONLY observed by that process and DATABASE_URL=holocron_nonprod loaded with ETL data.",
      "seed_method": "cli",
      "records": [
        "GET $PLATFORM_URL/health \u2192 200",
        "POST $PLATFORM_URL/mcp initialize \u2192 200",
        "soak fence engaged on server process"
      ]
    },
    "article_baseline_available": {
      "description": "D06-03 article-baseline.json with shareToken, sha256 (64-hex), byteLength > 0 for a document present in Postgres.",
      "seed_method": "recorded_external",
      "records": [
        "article-baseline.json exists",
        "shareToken document present in documents table"
      ]
    },
    "pre_fix_in_process_verify": {
      "description": "Pre-fix HEAD at 2b966c7b: runVerifyTools/runVerifyArticle use createHonoApp in-process; read tools pass on HTTP 200/202 even with isError.",
      "seed_method": "recorded_external",
      "records": [
        "soak-fence.ts:554-565 createHonoApp in-process",
        "soak-fence.ts:584-590 read accounted on status 200/202",
        "soak-fence.ts:769-782 article app.request in-process"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN soak_engaged_with_running_server WHEN verify-tools runs THEN all manifest tools invoked over network /mcp with non-null toolsPassed==toolsTotal and toolsStubbed==0",
      "verify": "holo cutover:verify-tools --json against PLATFORM_URL",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "mcp-gateway",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "in-process createHonoApp sole oracle (soak-fence.ts:554-565)",
            "toolsPassed null"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak_engaged_with_running_server",
            "action": {
              "actor": "operator",
              "steps": [
                "run verify-tools over network",
                "inspect counts and tools[]"
              ]
            },
            "end_state": {
              "must_observe": [
                "toolsTotal == manifest.tools.length >= 1",
                "toolsPassed == toolsTotal (integers not null)",
                "toolsStubbed == 0",
                "tools length == toolsTotal",
                "every tools[i].invoked == true",
                "base_url or transport network present"
              ],
              "must_not_observe": [
                "empty/start signature: toolsPassed null or toolsTotal null",
                "toolsStubbed > 0",
                "toolsTotal == 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN soak_engaged_with_running_server WHEN read tools evaluated THEN each requires !isError && schema_valid && Postgres-backed non-empty result; HTTP 200+isError is fail",
      "verify": "jq read tools schema_valid",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "mcp-gateway",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "status 200/202 alone pass (soak-fence.ts:584-590)"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak_engaged_with_running_server",
            "action": {
              "actor": "operator",
              "steps": [
                "verify-tools",
                "assert read schema_valid"
              ]
            },
            "end_state": {
              "must_observe": [
                "every read ok true",
                "every read schema_valid true",
                "every read isError not true",
                "non-empty result payload"
              ],
              "must_not_observe": [
                "empty/start signature: ok true solely from status 200",
                "ok true with isError true",
                "empty body counted success"
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
      "description": "GIVEN soak_engaged_with_running_server WHEN mutation tools invoked over network THEN all blocked with MIGRATION_READ_ONLY",
      "verify": "jq mutation tools MIGRATION_READ_ONLY",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "mcp-gateway",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "mutation write success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak_engaged_with_running_server",
            "action": {
              "actor": "operator",
              "steps": [
                "verify-tools mutations"
              ]
            },
            "end_state": {
              "must_observe": [
                "mutation count >= 1",
                "every mutation isError true",
                "MIGRATION_READ_ONLY code or message prefix",
                "mutation ok true for blocked criterion"
              ],
              "must_not_observe": [
                "empty/start signature: mutation isError false",
                "missing MIGRATION_READ_ONLY"
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
      "description": "GIVEN article_baseline_available WHEN network GET /article/:token THEN sha256 and byteLength match baseline at status 200",
      "verify": "network article verify",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "hono",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "in-process app.request sole oracle (soak-fence.ts:769-782)"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "article_baseline_available",
            "action": {
              "actor": "operator",
              "steps": [
                "network GET article",
                "compare baseline"
              ]
            },
            "end_state": {
              "must_observe": [
                "status 200",
                "sha256 64-hex equals baseline",
                "byteLength equals baseline"
              ],
              "must_not_observe": [
                "empty/start signature: byteLength 0",
                "status 404",
                "in-process-only transport"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre_fix_in_process_verify WHEN complete THEN red/green/path evidence and unreachable URL fail-closed",
      "verify": "red log + path.json + closed-port verify",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "unreachable URL pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_in_process_verify",
            "action": {
              "actor": "cli_user",
              "steps": [
                "red",
                "implement",
                "closed port",
                "path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "red log size > 0",
                "path A",
                "agent devops-engineer",
                "unreachable ok false"
              ],
              "must_not_observe": [
                "empty/start signature: green only",
                "toolsPassed null"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "toolsPassed==toolsTotal>0 toolsStubbed==0",
      "maps_to_ac": "AC-1",
      "verify": "jq counts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "network transport recorded",
      "maps_to_ac": "AC-1",
      "verify": "jq base_url/transport"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "read schema_valid",
      "maps_to_ac": "AC-2",
      "verify": "jq schema_valid"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "mutations MIGRATION_READ_ONLY",
      "maps_to_ac": "AC-3",
      "verify": "jq mutations"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "article sha match",
      "maps_to_ac": "AC-4",
      "verify": "jq article"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "unreachable fail-closed",
      "maps_to_ac": "AC-5",
      "verify": "closed port ok false"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "per-tool array complete",
      "maps_to_ac": "AC-1",
      "verify": "jq tools length"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "red log present",
      "maps_to_ac": "AC-5",
      "verify": "test -s red log"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "network-mcp-verify-tools",
    "schema-valid-postgres-backed-tool-results",
    "network-article-byte-parity"
  ],
  "consumes": [
    "d06-05-verify-cli-surface",
    "14-mcp-compatibility-manifest",
    "d06-03-article-baseline",
    "running-hono-mcp-deployment"
  ],
  "boundary_contracts": [
    "Network HTTP is production oracle",
    "Read success requires schema_valid + !isError",
    "Per-tool results preserved; toolsPassed/toolsTotal never null on success path"
  ],
  "proposed_by": "mastra-planner"
}
-->

</details>
