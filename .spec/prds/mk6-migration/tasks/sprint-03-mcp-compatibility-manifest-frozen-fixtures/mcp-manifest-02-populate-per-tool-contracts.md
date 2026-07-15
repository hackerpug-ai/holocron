# mcp-manifest-02 — Populate per-tool contract for all 44 tools (schemas, defaults, errors, pagination, idempotency)

## What this does
Populates every one of the 44 skeleton entries in `14-mcp-compatibility-manifest.yaml` with complete per-tool contracts: input/output JSON Schemas (converted from the real Zod schemas in `holocron-mcp/src/config/validation.ts` and `holocron-mcp/src/tools/*.ts`), default values, error code/data, ordering/pagination behavior, side effects, idempotency/replay contracts (for mutation tools), and supported transports. Reads the REAL tool implementations to extract behavior — never invented stubs.

## Why
The manifest is the frozen contract Sprint 19's rehost compares against (UC-SVC-04; T-SVC-021). Without complete schemas, defaults, error handling, and idempotency documented from the real Zod, the cutover has no basis to prove byte-identical behavior or generate contract tests. A skeleton manifest is not completion; populated entries grounded in real Zod schemas are the contract.

## How to verify
With mcp-manifest-04 in place, run `holo mcp:manifest-schema store_document` → prints input/output JSON Schema + defaults; `holo mcp:list-mutations` → lists mutating tools each with a replay-contract entry; `holo mcp:verify-manifest --protocol` → both transports covered. Every tool's schemas translate from the real Zod without loss.

## Scope
Populates `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` (per-tool contracts). Does NOT build the verify gate (mcp-manifest-04), write the RED controls (mcp-manifest-03), or touch `holocron-mcp/src/**` (read-only source of truth).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: mcp-manifest-02 — Populate per-tool contract for all 44 tools (schemas, defaults, errors, pagination, idempotency)
================================================================================

TASK_TYPE:  MIGRATION  (machine-readable migration-contract artifact — per-tool bodies)
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      implementer=mcp-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (data artifact; completeness machine-verified via the gate against the real registry/Zod, seeded-evidence required)
CAPABILITY: CAP-CUT-01 (the populated per-tool contract + mutation idempotency/replay the cutover flips against)
SPRINT:     [Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      MCP_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The committed `14-mcp-compatibility-manifest.yaml` carries all 44 tools fully populated: input_schema (JSON Schema converted from real Zod), output_schema (JSON Schema), defaults (from schema `.optional()` fields), errors (code/data from implementations), pagination (cursor/limit behavior for list tools), side_effects (state mutations), idempotency (keys for safe retries), replay (stored-result contracts for mutations: add_subscription `identifier+sourceType`→subscriptionId; store_document `title+content`→documentId; etc.), and supported transports (stdio and/or Streamable HTTP). mcp-manifest-03 freezes success/error fixtures against these contracts.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST read the REAL Zod schemas from holocron-mcp/src/config/validation.ts and holocron-mcp/src/tools/*.ts and convert each tool's inputSchema Zod to JSON Schema in the manifest's input_schema field, preserving Zod semantics (enums, min/max, patterns, optional/required).
- MUST document output_schema as JSON Schema (infer from tool implementation return types) and extract defaults from `.optional()` fields (e.g. limit: 20, cursor: null).
- MUST document error code/data from tool try/catch blocks (e.g. NOT_FOUND, VALIDATION_ERROR).
- MUST document pagination for the list tools (list_documents, list_subscriptions, list_tools, list_improvements, list_whats_new_reports): cursor-based, limit default, limit max, ordering field, cursor field name.
- MUST document side_effects AND idempotency keys for every mutation tool (store_document, update_document, share_document, add_subscription, remove_subscription, check_subscriptions, set_subscription_filter, store_tool, update_tool, remove_tool, shop_products, start_assimilation, approve_assimilation_plan, reject_assimilation_plan, cancel_assimilation, steer_assimilation, assimilate_creator, regenerate_transcript, add_improvement, close_improvement, set_improvement_status) and populate a replay contract (idempotency_key_field → stored_result_field).
- MUST declare supported transports per tool (most support both stdio + Streamable HTTP).
- NEVER invent schemas not present in the real Zod definitions; NEVER use placeholder `TODO`/`any` schemas — all 44 must have real JSON Schemas; NEVER skip defaults/errors/pagination; NEVER leave idempotency/replay blank for mutations.
- NEVER touch holocron-mcp/src/** (read-only source of truth); NEVER modify the skeleton structure (mcp-manifest-01's scope) — only populate the fields.
- STRICTLY JSON Schema conversion preserves Zod semantics; mutation replay contracts identify the exact field combination that forms an idempotency key; transport declarations match real MCP server capabilities.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): every tool has input_schema (JSON Schema from real Zod) + output_schema + defaults
- [x] AC-2: list tools (list_documents, list_subscriptions, list_tools, list_improvements, list_whats_new_reports) document pagination: cursor/limit/ordering
- [x] AC-3: mutation tools document side_effects + idempotency keys; `holo mcp:list-mutations` lists all mutations with replay contracts
- [x] AC-4: all tools declare supported transports; `verify-manifest --protocol` shows both transports covered
- [x] AC-5: error codes documented from real implementations; mcp-manifest-03 can freeze success/error fixtures against these contracts
- [ ] `pnpm biome check .` clean (+ `pnpm tsgo --noEmit` clean if any TS touched); only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against the real Zod, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] All 44 tools have input_schema (JSON Schema from real Zod) + output_schema + defaults (flow_ref UC-SVC-04)
  GIVEN the skeleton manifest (manifest_skeleton) from mcp-manifest-01 and the real Zod schemas (zod_schemas) from holocron-mcp/src/config/validation.ts and tools/*.ts
  WHEN  mcp-manifest-02 reads each tool's Zod inputSchema and converts to JSON Schema in the manifest
  THEN  every tool entry has input_schema (JSON Schema preserving Zod semantics), output_schema (JSON Schema), and defaults (values for `.optional()` fields like limit=20)
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: manifest_skeleton+zod_schemas · evidence: stdout
    NEGATIVE_CONTROL: would fail if a tool uses a TODO/any input_schema, a Zod enum is not preserved in JSON Schema, or defaults are missing from optional fields
    MUST_OBSERVE: all 44 tools have input_schema (JSON Schema); Zod semantics preserved (e.g. AddSubscriptionSchema.sourceType enum in JSON Schema); defaults present (e.g. limit: 20 for list tools); output_schema present for each tool
    MUST_NOT_OBSERVE: input_schema: TODO or any; a Zod enum lost; defaults missing; a tool with no schemas

AC-2 List tools document pagination: cursor/limit/ordering
  GIVEN the real tool implementations for list_documents, list_subscriptions, list_tools, list_improvements, list_whats_new_reports
  WHEN  mcp-manifest-02 reads their pagination/cursor behavior from implementations
  THEN  each list tool's manifest entry documents pagination: type (cursor-based), limit default (e.g. 20), limit max, ordering field, cursor field name
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: list_tool_implementations · evidence: stdout
    NEGATIVE_CONTROL: would fail if a list tool is missing a pagination field, the limit default is not documented, or cursor behavior is unspecified
    MUST_OBSERVE: list_documents.pagination: cursor-based, limit default 20; same shape present on list_subscriptions, list_tools, list_improvements, list_whats_new_reports
    MUST_NOT_OBSERVE: a list tool with no pagination field; pagination: TODO; limit default missing

AC-3 Mutation tools document side_effects + idempotency; list-mutations shows replay contracts (flow_ref T-SVC-021)
  GIVEN the real tool implementations for the mutation tools
  WHEN  mcp-manifest-02 reads their side effects and identifies idempotency keys from implementations
  THEN  each mutation tool's manifest entry documents side_effects (e.g. "INSERTS documents row") and idempotency (the field combination that forms a replay key); `holo mcp:list-mutations` lists all mutations with replay contracts
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: mutation_tool_implementations · evidence: stdout
    NEGATIVE_CONTROL: would fail if a mutation tool is missing side_effects, an idempotency_key is blank, or list-mutations omits a mutation
    MUST_OBSERVE: store_document.side_effects documented; store_document.idempotency_key: [title, content]; add_subscription.idempotency_key: [identifier, sourceType]; remove_subscription.idempotency_key: [subscriptionId]; list-mutations lists all mutation tools (the 21 listed above)
    MUST_NOT_OBSERVE: a mutation tool with no side_effects; idempotency_key: null/TODO; list-mutations missing a mutation tool

AC-4 All tools declare supported transports; verify-manifest --protocol shows both covered
  GIVEN the populated manifest with transport declarations per tool
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol` runs
  THEN  exit 0, "both transports covered"; every tool declares transports: [stdio] or [streamable-http] or [stdio, streamable-http]
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_populated · evidence: stdout
    NEGATIVE_CONTROL: would fail if a tool is missing a transports field or both transports are not covered overall
    MUST_OBSERVE: exit 0; both transports covered; each tool has a transports field (stdio, streamable-http, or both)
    MUST_NOT_OBSERVE: exit non-zero; a tool with no transports; only one transport covered overall

AC-5 Error codes documented from real implementations; fixtures ready for freezing
  GIVEN the real tool implementations with try/catch error handling
  WHEN  mcp-manifest-02 reads error code/data from implementations
  THEN  each tool's manifest entry documents errors: code and data shape; mcp-manifest-03 can freeze success/error fixtures against these contracts
  TEST_TIER: integration · VERIFICATION_SERVICE: mcp-manifest-03
  SCENARIO — start_ref: tool_implementations · evidence: yaml_structure
    NEGATIVE_CONTROL: would fail if the errors field is missing or error codes are not documented from implementations
    MUST_OBSERVE: each tool has an errors field; error codes from implementations (e.g. get_document.errors: [{code: NOT_FOUND, data: {documentId}}])
    MUST_NOT_OBSERVE: errors: TODO/any; a tool with no errors documented

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (MODIFY — populate per-tool contracts into the skeleton)
writeProhibited: holocron-mcp/src/** (read-only source of truth for Zod schemas and implementations), services/platform/src/** (the verify gate — mcp-manifest-04), tests/** (the RED suite — mcp-manifest-03), services/platform/tests/fixtures/** (mcp-manifest-03), any existing *.test.ts, convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. holocron-mcp/src/config/validation.ts:1-200 [PRIMARY SOURCE] — Zod schemas for all tool inputs: ResearchTopicSchema, StoreDocumentSchema, UpdateDocumentSchema, SearchSchema, SearchVectorSchema, AddSubscriptionSchema, etc.
2. holocron-mcp/src/mastra/stdio.ts:139-843 — tool registration with inputSchema references; each createTool call shows which Zod schema each tool uses
3. holocron-mcp/src/tools/*.ts — real tool implementations: read side effects, error handling, pagination behavior, return types for output_schema inference
4. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:23-27 — per-tool entry shape (input/output JSON Schemas, defaults, errors, ordering/pagination, side effects, idempotency/replay, transports, fixtures)
5. .spec/prds/mk6-migration/06-uc-svc.md:56-65 — UC-SVC-04 AC-5 (manifest covers every tool + both transports with frozen fixtures and replay/idempotency)
6. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:139 — T-SVC-021 (all 44 tools + both transports have frozen success/error fixtures; mutation replay contract present)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- manifest-schema prints schemas+defaults: `bun services/platform/src/cli/holo.ts mcp:manifest-schema store_document` → Exit 0, input_schema + output_schema + defaults printed
- list-mutations shows all mutations: `bun services/platform/src/cli/holo.ts mcp:list-mutations` → Exit 0, lists all mutation tools with replay contracts
- verify-manifest --protocol both transports: `bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol` → Exit 0, both transports covered
- all 44 tools have input_schema: `grep -c 'input_schema:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml | xargs test 44 -eq` → Exit 0
- lint clean: `pnpm biome check .` → Exit 0 (+ `pnpm tsgo --noEmit` if a TS fixture was touched)
- Gate 8 (un-fakeable PRIMARY): AC-1 schemas are converted from the REAL Zod (read at author time, re-checked by the gate against the live registry); a TODO/any schema or a lost enum is caught. Captured manifest-schema output shows a real JSON Schema (concrete properties/enums), not a stub.

--------------------------------------------------------------------------------
REVIEW (mcp-reviewer)
--------------------------------------------------------------------------------
Must pass: all 44 tools have input_schema (JSON Schema from real Zod, preserving semantics: enums, min/max, patterns), output_schema, defaults (from `.optional()` fields), error codes (from implementations); list tools document pagination; mutation tools document side_effects + idempotency keys; `holo mcp:list-mutations` lists all mutations with replay contracts; all tools declare supported transports; SCOPE respected (holocron-mcp/src/** read-only). Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: mcp-manifest-01 (skeleton manifest with 44 tool entries) · Blocks: mcp-manifest-03 (freezes fixtures against these populated contracts), mcp-manifest-04 (verify-manifest validates completeness), mcp-manifest-05 (reviews the populated manifest)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "mcp-manifest-02",
  "proposed_by": "mcp-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "manifest_skeleton": { "description": "The skeleton manifest from mcp-manifest-01 with 44 tool entries (ids only, per-tool fields blank)", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (after mcp-manifest-01)"] },
    "zod_schemas": { "description": "The real Zod schemas from holocron-mcp/src/config/validation.ts and tool implementations", "seed_method": "read_only", "records": ["holocron-mcp/src/config/validation.ts", "holocron-mcp/src/tools/*.ts"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN skeleton manifest + real Zod schemas WHEN mcp-manifest-02 converts Zod to JSON Schema THEN every tool has input_schema (JSON Schema preserving Zod semantics), output_schema, and defaults",
      "verify": "bun services/platform/src/cli/holo.ts mcp:manifest-schema store_document",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["a tool uses TODO/any input_schema", "Zod semantics lost", "defaults missing"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_skeleton+zod_schemas", "action": { "actor": "mcp-implementer", "steps": ["convert Zod to JSON Schema; populate manifest"] },
          "end_state": { "must_observe": ["all 44 tools have input_schema (JSON Schema)", "Zod enums preserved", "defaults present (limit: 20)"], "must_not_observe": ["input_schema: TODO/any", "Zod semantics lost"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN list tool implementations WHEN pagination behavior read THEN each list tool documents pagination: cursor-based, limit default/max, ordering",
      "verify": "bun services/platform/src/cli/holo.ts mcp:manifest-schema list_documents",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["list tool missing pagination", "limit default not documented"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "list_tool_implementations", "action": { "actor": "mcp-implementer", "steps": ["read pagination; document in manifest"] },
          "end_state": { "must_observe": ["list_documents.pagination: cursor-based, limit default 20", "all list tools have pagination field"], "must_not_observe": ["a list tool with no pagination", "pagination: TODO"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "T-SVC-021",
      "description": "GIVEN mutation tool implementations WHEN side effects + idempotency read THEN each mutation documents side_effects and idempotency_key; list-mutations lists all mutations with replay contracts",
      "verify": "bun services/platform/src/cli/holo.ts mcp:list-mutations",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "T-SVC-021",
        "negative_control": { "would_fail_if": ["mutation missing side_effects", "idempotency_key blank", "list-mutations omits a mutation"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "mutation_implementations", "action": { "actor": "mcp-implementer", "steps": ["read side effects; document idempotency keys"] },
          "end_state": { "must_observe": ["store_document.side_effects documented", "store_document.idempotency_key: [title, content]", "add_subscription.idempotency_key: [identifier, sourceType]", "list-mutations lists all mutation tools"], "must_not_observe": ["a mutation with no side_effects", "idempotency_key: TODO/null", "list-mutations missing a tool"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN populated manifest WHEN verify-manifest --protocol runs THEN exit 0, both transports covered, each tool declares transports",
      "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["a tool missing transports", "both transports not covered"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_populated", "action": { "actor": "cli_user", "steps": ["run verify-manifest --protocol"] },
          "end_state": { "must_observe": ["exit 0", "both transports covered", "each tool has transports field"], "must_not_observe": ["exit non-zero", "a tool with no transports"] } } ] } },
    { "id": "AC-5", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN tool implementations with error handling WHEN error codes read THEN each tool documents errors: code and data shape; mcp-manifest-03 can freeze fixtures",
      "verify": "grep -c 'errors:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml | xargs test 44 -eq",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mcp-manifest-03", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["errors field missing", "error codes not documented from implementations"] },
        "evidence": { "artifact_type": "yaml_structure", "required_capture": true },
        "cases": [ { "start_ref": "tool_implementations", "action": { "actor": "mcp-implementer", "steps": ["read error handling; document error codes"] },
          "end_state": { "must_observe": ["each tool has an errors field", "error codes from implementations (e.g. NOT_FOUND)"], "must_not_observe": ["errors: TODO/any", "a tool with no errors"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "manifest-schema prints input/output JSON Schema + defaults for any tool", "verify": "bun services/platform/src/cli/holo.ts mcp:manifest-schema store_document && bun services/platform/src/cli/holo.ts mcp:manifest-schema add_subscription" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "all list tools document pagination cursor/limit/ordering", "verify": "grep -c 'pagination:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml | xargs test 5 -eq" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "list-mutations shows all mutation tools with replay contracts", "verify": "bun services/platform/src/cli/holo.ts mcp:list-mutations | grep -c 'idempotency_key' | xargs test 21 -eq" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "all tools declare supported transports", "verify": "grep -c 'transports:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml | xargs test 44 -eq" },
    { "id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "all tools document error codes", "verify": "grep -c 'errors:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml | xargs test 44 -eq" }
  ]
}
-->
</details>
