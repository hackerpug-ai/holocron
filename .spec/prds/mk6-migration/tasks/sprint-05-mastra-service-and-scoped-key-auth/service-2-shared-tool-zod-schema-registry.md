# service-2 — Single shared Tool + Zod schema registry (agents/workflows/MCP consume identically)

## What this does

Create ONE shared tool registry with Zod input/output schemas registered once, exported identically to agents, workflows, and the MCP gateway — eliminating the duplicate validation layer the Convex-era split forced.

Provides: shared-tool-registry, shared-zod-registry, schema-identity-proof.

## Why

- A tool schema must resolve to the SAME Zod instance for the agent, workflow, and MCP paths — a second `.parse()` layer (the 373-line Convex-era duplication) is what this sprint removes.
- Every downstream consumer (Sprint 18 chat, Sprint 19 MCP rehost) imports from this single registry; duplicate validation here would propagate everywhere.
- Grounded in: UC-PLAT-02 (AC-2), T-PLAT-006, 02-system-components.md (C-4), brain/docs/dry-methodology.md (share-once).

## How to verify

- `holo registry:list | jq 'length'` → a count ≥ the registered tools.
- `holo registry:probe search --for=agent,workflow,mcp && holo verify:identity search | jq '.identity'` → `true` (=== identity).
- `holo verify:no-dup-validation | jq '.duplicates'` → `0`.
- `pnpm vitest run services/platform/src/tools/__tests__/registry.test.ts` → RED (fails) before implementation, GREEN after.

## Scope

Writes: `services/platform/src/tools/registry.ts (NEW — shared tool registry)` · `services/platform/src/tools/schemas/*.ts (NEW — tool Zod schemas)` · `services/platform/src/cli/holo.ts (MODIFY — registry:* subcommands)` · `services/platform/src/tools/__tests__/registry.test.ts (NEW — RED test suite)`.
Prohibited: `convex/** (read-only legacy)` · `app/** (not this sprint)` · `holocron-mcp/src/** (MCP rehost is Sprint 19)` · `services/platform/src/agents/** (later sprint)` · `services/platform/src/workflows/** (later sprint)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: service-2 — Single shared Tool + Zod schema registry (agents/workflows/MCP consume identically)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (210 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 5 — Mastra Service and Scoped-Key Auth](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/src/tools/__tests__/registry.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Every tool is registered ONCE with a Zod `inputSchema`/`outputSchema` in `services/platform/src/tools/registry.ts`, and `getToolSchema(toolId)` returns the SAME Zod instance to the agent, workflow, and MCP paths — proven by `===` identity and a zero-duplicate grep audit.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST create ONE shared tool registry in `services/platform/src/tools/registry.ts`
- MUST register each tool ONCE with its Zod `inputSchema` and `outputSchema`
- MUST expose `getToolSchema(toolId)` returning the SAME Zod instance to all consumers
- MUST implement `holo registry:probe <tool>` and `holo verify:no-dup-validation` CLI commands
- MUST ensure agents, workflows, and the MCP gateway import from the shared registry
- NEVER define duplicate Zod schemas for the same tool across agents/workflows/MCP
- NEVER re-parse or re-validate the same tool input/output (the duplicate-validation anti-pattern)
- NEVER use string refs to Convex functions (legacy proxy pattern removed)
- NEVER create separate registries for different consumers
- NEVER stub tool execution and report it as complete (SUPREME RULE) — tool `execute` bodies are explicitly deferred to later sprints and must be honestly marked, not faked
- STRICTLY every tool must have `inputSchema` and `outputSchema` (no `z.any()`)
- STRICTLY schema identity must be proven by instance equality (`===`), not deep equality
- STRICTLY the RED test must FAIL when a schema is duplicated or validation is stubbed, before going green

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): shared tool registry with Zod schemas; `getToolSchema` returns the schema instance
- [ ] AC-2: agents, workflows, and MCP consume the SAME schema instance (`===`)
- [ ] AC-3: zero duplicate validation layer (`holo verify:no-dup-validation` → duplicates 0)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, schema identity proven, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Shared tool registry with Zod schemas (flow_ref UC-PLAT-02 / T-PLAT-006)
  GIVEN the Mastra service composition root exists (service-1)
  WHEN  an operator creates `services/platform/src/tools/registry.ts` with tool registrations
  THEN  all tools are registered ONCE with Zod inputSchema/outputSchema and `getToolSchema(toolId)` returns the schema instance
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: red
  SCENARIO — start_ref: mastra_service_booted · evidence: stdout
    NEGATIVE_CONTROL: would fail if tools not registered in shared registry; inputSchema or outputSchema missing on a tool; getToolSchema returns undefined; registry not exported from services/platform/src/tools/registry.ts; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `holo registry:list` reports >=44 tool rows; each tool row has id + inputSchema + outputSchema (>=1 property each); `holo registry:probe search` prints a Zod schema JSON object; inputSchema object has >=1 declared property
    MUST_NOT_OBSERVE: registry:list reports 0 tools (empty); a tool row missing inputSchema (none); 'command not found: holo registry' exit code 1

AC-2 Agents, workflows, MCP consume same schema instance (flow_ref T-PLAT-006)
  GIVEN the shared tool registry exists
  WHEN  an operator probes schema identity across the agent/workflow/MCP paths
  THEN  getToolSchema returns the SAME Zod instance (`===`) for all three paths
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: red
  SCENARIO — start_ref: shared_tool_registry_exists · evidence: stdout
    NEGATIVE_CONTROL: would fail if agent imports a separate schema definition; workflow imports a separate schema definition; MCP gateway redefines schemas (373-line duplicate layer); schema instances are not === equal; the required object/config is absent or a no-op stub
    MUST_OBSERVE: agent, workflow, and MCP return the SAME Zod schema instance (===); `holo verify:identity search` prints identity:true (count 1); 3 consumer paths resolve to exactly 1 schema instance
    MUST_NOT_OBSERVE: 2+ distinct schema instances (!==); `holo verify:identity search` prints identity:false (count 0); schema undefined in 1 of the 3 paths (none)

AC-3 No duplicate validation layer (flow_ref T-PLAT-006)
  GIVEN the shared registry is consumed by agents/workflows/MCP
  WHEN  an operator runs `holo verify:no-dup-validation`
  THEN  zero duplicate `.parse()`/`.safeParse()` calls exist outside the shared registry
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: red
  SCENARIO — start_ref: shared_registry_consumed_by_all · evidence: stdout
    NEGATIVE_CONTROL: would fail if MCP gateway has its own .parse() layer (373-line duplicate); agents re-validate tool inputs; workflows re-validate tool inputs; grep finds .parse or .safeParse outside registry; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `holo verify:no-dup-validation` prints duplicates:0; grep '.parse' in services/platform/src/mcp/ returns 0 lines; grep '.safeParse' in services/platform/src/mcp/ returns 0 lines; registry is the 1 (only) parse site
    MUST_NOT_OBSERVE: `holo verify:no-dup-validation` prints duplicates > 0; 373-line duplicate Zod layer present (nonzero); grep '.parse' in services/platform/src/mcp/ returns >=1 line

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/tools/registry.ts (NEW — shared tool registry)
- services/platform/src/tools/schemas/*.ts (NEW — tool Zod schemas)
- services/platform/src/cli/holo.ts (MODIFY — add registry:*, verify:identity, verify:no-dup-validation subcommands)
- services/platform/src/tools/__tests__/registry.test.ts (NEW — RED test suite)
writeProhibited: convex/** (read-only legacy), app/** (not this sprint), holocron-mcp/src/** (MCP rehost is Sprint 19), services/platform/src/agents/** (later sprint), services/platform/src/workflows/** (later sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/02-system-components.md:16-18 [C-4 Tool + Schema Registry component]
2. brain/docs/mastra/agents-core.md:1-100 [Mastra 1.x createTool with inputSchema/outputSchema]
3. .spec/prds/mk6-migration/tasks/sprint-01-mastra-compat-lock-fleet-manifest/compat-2-pin-compatibility-lockfile-and-record.md [44 MCP tools cataloged]
4. holocron-mcp/src/server.ts:1-100 [current MCP server structure — Convex proxy pattern to remove]
5. brain/docs/dry-methodology.md [share-once principle]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- registry-exists: `test -f services/platform/src/tools/registry.ts` → Exit 0
- registry-has-tools: `holo registry:list | jq 'length > 0'` → Exit 0
- schema-identity: `holo verify:identity search | jq '.identity == true'` → Exit 0
- no-dup-validation: `holo verify:no-dup-validation | jq '.duplicates == 0'` → Exit 0
- red-tests: `pnpm vitest run services/platform/src/tools/__tests__/registry.test.ts` → RED exits nonzero before impl; GREEN exits 0 after
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check services/platform/src/tools/` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: one registry source of truth; schema identity is `===` (instance equality) not deep equality; zero duplicate `.parse()`/`.safeParse()` outside the registry (grep audit); every tool has real inputSchema/outputSchema (no `z.any()`); tool `execute` bodies honestly deferred (no fake-success stubs); type-safe (no `any`).
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: service-1 (composition root) · sprint-01-mastra-compat-lock-fleet-manifest (44-tool catalog)
Blocks: service-3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "service-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "mastra_service_booted": { "description": "Mastra service running on port 4111", "seed_method": "public_api", "records": ["bun run index.ts succeeded", "Hono listening on :4111", "/health accessible"] },
    "shared_tool_registry_exists": { "description": "registry.ts exists with getToolSchema exported and >=1 tool registered", "seed_method": "recorded_external", "records": ["services/platform/src/tools/registry.ts exists", "getToolSchema exported", ">=1 tool with schemas"] },
    "shared_registry_consumed_by_all": { "description": "registry imported by agents, workflows, and MCP gateway", "seed_method": "public_api", "records": ["agent imports registry", "workflow imports registry", "mcp imports registry"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "flow_ref": "UC-PLAT-02", "description": "GIVEN Mastra composition root exists WHEN create shared tool registry THEN all tools registered ONCE with Zod schemas; getToolSchema returns schema", "verify": "holo registry:probe search && holo registry:list | jq 'length > 0'", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-006", "negative_control": { "would_fail_if": ["Tools not registered in shared registry", "inputSchema or outputSchema missing on a tool", "getToolSchema returns undefined", "Registry not exported from services/platform/src/tools/registry.ts", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_booted", "action": { "actor": "cli_user", "steps": ["holo registry:list", "holo registry:probe search"] }, "end_state": { "must_observe": ["`holo registry:list` reports >=44 tool rows", "each tool row has id + inputSchema + outputSchema (>=1 property each)", "`holo registry:probe search` prints a Zod schema JSON object", "inputSchema object has >=1 declared property"], "must_not_observe": ["registry:list reports 0 tools (empty)", "a tool row missing inputSchema (none)", "'command not found: holo registry' exit code 1"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-006", "description": "GIVEN shared registry exists WHEN probe schema identity across agent/workflow/MCP THEN same Zod instance (===) returned", "verify": "holo registry:probe search --for=agent,workflow,mcp && holo verify:identity search | jq '.identity == true'", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-006", "negative_control": { "would_fail_if": ["Agent imports separate schema definition", "Workflow imports separate schema definition", "MCP gateway redefines schemas (373-line duplicate layer)", "Schema instances are not === equal", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "shared_tool_registry_exists", "action": { "actor": "cli_user", "steps": ["holo registry:probe search --for=agent", "holo registry:probe search --for=workflow", "holo registry:probe search --for=mcp", "holo verify:identity search"] }, "end_state": { "must_observe": ["agent, workflow, and MCP return the SAME Zod schema instance (===)", "`holo verify:identity search` prints identity:true (count 1)", "3 consumer paths resolve to exactly 1 schema instance"], "must_not_observe": ["2+ distinct schema instances (!==)", "`holo verify:identity search` prints identity:false (count 0)", "schema undefined in 1 of the 3 paths (none)"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-006", "description": "GIVEN registry consumed by all WHEN holo verify:no-dup-validation THEN zero duplicate .parse()/.safeParse() found", "verify": "holo verify:no-dup-validation | jq '.duplicates == 0'", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-006", "negative_control": { "would_fail_if": ["MCP gateway has its own .parse() layer (373-line duplicate)", "Agents re-validate tool inputs", "Workflows re-validate tool inputs", "grep finds .parse or .safeParse outside registry", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "shared_registry_consumed_by_all", "action": { "actor": "cli_user", "steps": ["holo verify:no-dup-validation", "grep -rn '.parse\\|.safeParse' services/platform/src/mcp/"] }, "end_state": { "must_observe": ["`holo verify:no-dup-validation` prints duplicates:0", "grep '.parse' in services/platform/src/mcp/ returns 0 lines", "grep '.safeParse' in services/platform/src/mcp/ returns 0 lines", "registry is the 1 (only) parse site"], "must_not_observe": ["`holo verify:no-dup-validation` prints duplicates > 0", "373-line duplicate Zod layer present (nonzero)", "grep '.parse' in services/platform/src/mcp/ returns >=1 line"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "description": "Tool registry returns schema for a registered tool", "maps_to_ac": "AC-1", "verify": "holo registry:probe search returns schema JSON" },
    { "id": "TC-2", "type": "test_criterion", "description": "Schema identity is the same across agent/workflow/MCP", "maps_to_ac": "AC-2", "verify": "holo verify:identity search returns true" },
    { "id": "TC-3", "type": "test_criterion", "description": "No duplicate validation layers exist", "maps_to_ac": "AC-3", "verify": "holo verify:no-dup-validation returns 0 duplicates" },
    { "id": "TC-4", "type": "test_criterion", "description": "Registry fails on an unregistered tool", "maps_to_ac": "AC-1", "verify": "holo registry:probe nonexistent returns error" }
  ]
}
-->
</details>
