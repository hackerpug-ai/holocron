# mcp-manifest-01 — Author the MCP manifest header: protocol, transports, 44-tool skeleton

## What this does
Authors the machine-readable migration-contract artifact `14-mcp-compatibility-manifest.yaml`: pins MCP protocol **2025-11-25**, declares both transports (existing stdio + Streamable HTTP), records the stateless / no-server-sampling capability policy and the auth/cancellation posture, and writes a skeleton entry for every one of the 44 registered tool IDs enumerated from the live holocron-mcp registry (`holocron-mcp/src/mastra/stdio.ts`). Each skeleton entry carries an `id` matching a real registered tool exactly plus placeholders for the per-tool fields mcp-manifest-02 populates.

## Why
This manifest is the frozen contract baseline Sprint 19's MCP Gateway Rehost flips against (UC-SVC-04 AC-5; T-SVC-021). Without a complete header and skeleton grounded in the real registry, the cutover has no authoritative source of truth for tool IDs, transport support, or protocol compliance — a partial or invented template is a broken contract, exactly the failure mode the catalog sprint (catalog-1) avoided by enumerating real surfaces.

## How to verify
With mcp-manifest-04's verify gate in place, run `bun services/platform/src/cli/holo.ts mcp:verify-manifest` → exit 0, "44/44 tools, both transports covered"; `holo mcp:verify-manifest --protocol` → protocol 2025-11-25, stdio + Streamable HTTP, stateless/no-server-sampling. Then enumerate the real registry and confirm every tool ID from `holocron-mcp/src/mastra/stdio.ts` has a skeleton entry — no invented tools, no missing tools.

## Scope
Authors `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` (header + 44 skeleton entries). Does NOT populate per-tool schemas/fixtures (mcp-manifest-02), build the verify gate (mcp-manifest-04), write the RED controls (mcp-manifest-03), or touch `holocron-mcp/src/**` (read-only source of truth).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: mcp-manifest-01 — Author the MCP manifest header: protocol, transports, 44-tool skeleton
================================================================================

TASK_TYPE:  MIGRATION  (machine-readable migration-contract artifact)
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=mcp-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (data artifact; no RED-first — but completeness is machine-verified against the live registry, seeded-evidence required)
CAPABILITY: CAP-CUT-01 (the frozen 44-tool contract header/skeleton the cutover flips against)
SPRINT:     [Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      MCP_IT=1 pnpm vitest run <path>   (single file: MCP_IT=1 pnpm vitest run <path>)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The committed `14-mcp-compatibility-manifest.yaml` carries the protocol pin (2025-11-25), both transports (stdio + Streamable HTTP), stateless/no-server-sampling capability policy, auth/cancellation posture, and exactly 44 skeleton tool entries — each with an `id` matching a REAL registered tool ID from `holocron-mcp/src/mastra/stdio.ts` (get_research_session, search_research, search_fts, search_vector, store_document, update_document, share_document, get_document, list_documents, hybrid_search, add_subscription, remove_subscription, list_subscriptions, check_subscriptions, get_subscription_content, set_subscription_filter, get_subscription_filters, store_tool, search_tools, get_tool, list_tools, update_tool, remove_tool, shop_products, get_shop_session, get_shop_listings, get_whats_new_report, list_whats_new_reports, start_assimilation, approve_assimilation_plan, reject_assimilation_plan, get_assimilation_status, cancel_assimilation, steer_assimilation, assimilate_creator, get_creator_transcripts, regenerate_transcript, search_improvements, get_improvement, list_improvements, add_improvement, close_improvement, set_improvement_status, findRecommendations).

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST enumerate the REAL 44 tool IDs from holocron-mcp/src/mastra/stdio.ts (the MCPServer `tools` object) — do NOT invent tools or pad to a count.
- MUST pin protocol to MCP 2025-11-25 at the manifest top level.
- MUST declare both transports: stdio and Streamable HTTP.
- MUST declare the stateless / no-server-sampling capability policy (no per-session server→client sampling) and the auth/cancellation posture (stdio trust boundary; HTTP API-key policy with origin validation).
- MUST give every one of the 44 tool IDs a skeleton entry with `id` matching the registered name exactly (snake_case except `findRecommendations`).
- NEVER invent a tool ID not present in the live registry; NEVER leave the protocol field blank/unpinned; NEVER declare only one transport; NEVER use a self-referential count or hand-fabricated "44/44" — the skeleton must match real registrations.
- NEVER touch holocron-mcp/src/** (read-only source of truth); NEVER write per-tool schemas/fixtures (that is mcp-manifest-02's scope).
- STRICTLY header shape follows `12-migration-contract-artifacts.md` § "MCP compatibility manifest"; each skeleton entry carries an `id` field and placeholders (input_schema, output_schema, defaults, errors, pagination, side_effects, idempotency, replay, transports, fixtures) that mcp-manifest-02 fills.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): `mcp:verify-manifest` against the live registry ⇒ exit 0, "44/44 tools, both transports covered"
- [x] AC-2: manifest header pins protocol 2025-11-25, declares stdio + Streamable HTTP, stateless/no-server-sampling, auth/cancellation policy
- [x] AC-3: every one of the 44 registered tool IDs has a skeleton entry with matching `id` (no invented tools, no missing tools)
- [x] AC-4: mcp-manifest-02 can populate per-tool schemas/fixtures into each skeleton entry without re-creating the structure
- [ ] `pnpm biome check .` clean (+ `pnpm tsgo --noEmit` clean if any TS fixture touched); only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against the live registry, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] 44/44 tool skeleton completeness verified against live registry (flow_ref UC-SVC-04)
  GIVEN the committed manifest (manifest_committed) with 44 skeleton tool IDs and the live holocron-mcp registry (live_registry)
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest` runs (via mcp-manifest-04)
  THEN  exit 0, "44/44 tools, both transports covered"; every registered tool ID has a matching skeleton entry
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: manifest_committed+live_registry · evidence: stdout
    NEGATIVE_CONTROL: would fail if a registered tool ID has no skeleton entry, the skeleton invents a tool not in the registry, transport support is incomplete, or the protocol is not pinned
    MUST_OBSERVE: exit 0; "44/44 tools, both transports covered"; every registered tool ID (get_research_session … findRecommendations) has a skeleton entry
    MUST_NOT_OBSERVE: a registered tool with no skeleton entry; an invented tool not in the registry; only one transport covered; protocol field blank/unpinned

AC-2 Header declares protocol 2025-11-25, both transports, capability/auth policy (flow_ref T-SVC-021)
  GIVEN manifest_committed
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol` runs (via mcp-manifest-04)
  THEN  exit 0, protocol pinned to 2025-11-25, both transports (stdio + Streamable HTTP) declared, stateless/no-server-sampling present, auth/cancellation posture declared
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_committed · evidence: stdout
    NEGATIVE_CONTROL: would fail if the protocol field is missing/unpinned, only one transport is declared, there is no capability policy, or no auth/cancellation posture
    MUST_OBSERVE: protocol: 2025-11-25; transports: [stdio, streamable-http]; stateless: true; no_server_sampling: true; auth_policy present; cancellation_policy present
    MUST_NOT_OBSERVE: protocol unpinned/latest; transports [stdio only]; no capability policy; no auth/cancellation sections

AC-3 Every one of the 44 registered tool IDs has a skeleton entry (flow_ref UC-SVC-04)
  GIVEN manifest_committed
  WHEN  the manifest tool IDs are extracted and cross-referenced against live_registry
  THEN  all 44 IDs from the MCPServer tools object have skeleton entries; count matches 44; no invented tools
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_committed+live_registry · evidence: stdout
    NEGATIVE_CONTROL: would fail if the skeleton count ≠ 44, a registered tool ID is missing from the skeleton, or an invented tool not in stdio.ts is present
    MUST_OBSERVE: 44 skeleton entries; each ID matches a registered tool (get_research_session … findRecommendations)
    MUST_NOT_OBSERVE: count ≠ 44; a tool in stdio.ts with no skeleton; a skeleton tool not in stdio.ts

AC-4 Skeleton entries are populate-ready for mcp-manifest-02
  GIVEN manifest_committed
  WHEN  mcp-manifest-02 reads the skeleton to populate per-tool contracts
  THEN  each skeleton entry has an `id` field and placeholders for input_schema, output_schema, defaults, errors, pagination, side_effects, idempotency, replay, transports, fixtures
  TEST_TIER: integration · VERIFICATION_SERVICE: mcp-manifest-02
  SCENARIO — start_ref: manifest_committed · evidence: yaml_structure
    NEGATIVE_CONTROL: would fail if skeleton entries lack placeholders or the structure is incompatible with mcp-manifest-02's populate logic
    MUST_OBSERVE: each of 44 skeleton entries has `id` + placeholders for input_schema, output_schema, defaults, errors, pagination, side_effects, idempotency, replay, transports, fixtures
    MUST_NOT_OBSERVE: skeleton entries missing placeholders; mcp-manifest-02 needing to re-create entry structure

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (NEW — header + 44 skeleton entries)
writeProhibited: holocron-mcp/src/** (read-only source of truth for tool IDs and schemas), services/platform/src/** (the verify gate — mcp-manifest-04), tests/** (the RED suite — mcp-manifest-03), services/platform/tests/fixtures/** (mcp-manifest-03), any existing *.test.ts, convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:23-27 [PRIMARY PATTERN] — MCP compatibility manifest shape: protocol 2025-11-25, both transports, stateless/no-server-sampling, per-tool schemas/defaults/errors/ordering/side-effects/idempotency/fixtures
2. holocron-mcp/src/mastra/stdio.ts:139-843 — the REAL 44 registered tool IDs in the MCPServer `tools` object; enumerate these, do not invent or pad
3. .spec/prds/mk6-migration/06-uc-svc.md:56-65 — UC-SVC-04 AC-5 (manifest covers every registered tool and both transports with frozen fixtures and replay/idempotency)
4. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:139 — T-SVC-021 (all 44 tools + both transports have frozen success/error fixtures; mutation tool replay contract present)
5. services/platform/src/cli/holo.ts:1-60 — the operator CLI the `mcp:*` subcommands extend (from Sprint 01 compat-1)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- verify 44/44 completeness: `bun services/platform/src/cli/holo.ts mcp:verify-manifest` (via mcp-manifest-04) → Exit 0, "44/44 tools, both transports covered"
- verify protocol pin: `bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol` → Exit 0, protocol: 2025-11-25, transports: [stdio, streamable-http]
- cross-check skeleton IDs: `grep -cE '^  - id:|^    id:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` → 44, each matching a registered tool in holocron-mcp/src/mastra/stdio.ts
- lint clean: `pnpm biome check .` → Exit 0 (+ `pnpm tsgo --noEmit` if a TS fixture was touched)
- Gate 8 (un-fakeable PRIMARY): AC-1 cross-checks the manifest skeleton against the LIVE registry (not a self-referential key count); a manifest missing a registered tool, or inventing one, is caught. Captured output shows the real 44/44 tally + a real named failure, not a bare "44/44".

--------------------------------------------------------------------------------
REVIEW (mcp-reviewer)
--------------------------------------------------------------------------------
Must pass: header declares protocol 2025-11-25, both transports (stdio + Streamable HTTP), stateless/no-server-sampling policy, auth/cancellation posture; exactly 44 skeleton tool IDs enumerated from the live registry (no invented tools, no missing tools); each skeleton entry has placeholders ready for mcp-manifest-02 to populate; SCOPE respected (holocron-mcp/src/** read-only). Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: Sprint 01 (the `holo` operator CLI + manifest-driven fail-closed posture from compat-1) · Blocks: mcp-manifest-02 (populates per-tool contracts into the skeleton), mcp-manifest-04 (verify-manifest gate validates this manifest), mcp-manifest-03 (fixtures derive from these tool entries)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "mcp-manifest-01",
  "proposed_by": "mcp-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "manifest_committed": { "description": "The committed 14-mcp-compatibility-manifest.yaml with header + 44 skeleton entries", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml"] },
    "live_registry": { "description": "The live Mastra MCPServer tools object in holocron-mcp/src/mastra/stdio.ts — the real 44 registered tool IDs the skeleton is cross-checked against", "seed_method": "read_only", "records": ["holocron-mcp/src/mastra/stdio.ts:139-843 (MCPServer tools object)"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN the committed manifest with 44 skeleton tool IDs and the live registry WHEN holo mcp:verify-manifest runs THEN exit 0, 44/44 tools, both transports covered, every registered tool has a skeleton entry",
      "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["a registered tool has no skeleton", "skeleton invents a tool", "transport support incomplete", "protocol not pinned"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed+live_registry", "action": { "actor": "cli_user", "steps": ["run holo mcp:verify-manifest"] },
          "end_state": { "must_observe": ["exit 0", "44/44 tools, both transports covered"], "must_not_observe": ["exit non-zero", "unmapped registered tool", "invented tool"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "T-SVC-021",
      "description": "GIVEN manifest_committed WHEN holo mcp:verify-manifest --protocol runs THEN protocol pinned to 2025-11-25, both transports declared, stateless/no-server-sampling, auth/cancellation policy present",
      "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "T-SVC-021",
        "negative_control": { "would_fail_if": ["protocol unpinned", "only one transport", "no capability policy", "no auth posture"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed", "action": { "actor": "cli_user", "steps": ["run holo mcp:verify-manifest --protocol"] },
          "end_state": { "must_observe": ["protocol: 2025-11-25", "transports: [stdio, streamable-http]", "stateless: true", "no_server_sampling: true", "auth_policy present", "cancellation_policy present"], "must_not_observe": ["protocol unpinned", "single transport", "no policy sections"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN manifest_committed WHEN tool IDs are extracted and cross-checked against stdio.ts THEN all 44 IDs from the MCPServer tools object have skeleton entries; count 44; no invented tools",
      "verify": "grep -cE '^  - id:|^    id:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["count not 44", "a registered tool missing", "an invented tool present"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed+live_registry", "action": { "actor": "cli_user", "steps": ["extract tool IDs; verify each in stdio.ts"] },
          "end_state": { "must_observe": ["44 entries", "each ID matches a registered tool"], "must_not_observe": ["count not 44", "unmapped registered tool", "invented tool"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN manifest_committed WHEN mcp-manifest-02 reads skeleton to populate per-tool contracts THEN each skeleton has id + placeholders for all per-tool fields; populate succeeds without re-creating structure",
      "verify": "mcp-manifest-02 execution succeeds reading the skeleton",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mcp-manifest-02", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["skeleton lacks placeholders", "structure incompatible with mcp-manifest-02"] },
        "evidence": { "artifact_type": "yaml_structure", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed", "action": { "actor": "mcp-implementer", "steps": ["mcp-manifest-02 populates skeleton"] },
          "end_state": { "must_observe": ["each of 44 skeleton entries has id + placeholders for input_schema, output_schema, defaults, errors, pagination, side_effects, idempotency, replay, transports, fixtures"], "must_not_observe": ["skeleton missing placeholders", "structure recreation needed"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "verify-manifest cross-checks skeleton tool IDs against live registry and reports 44/44 completeness", "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "verify-manifest --protocol confirms protocol 2025-11-25 and both transports declared", "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "grep skeleton IDs yields 44 and each ID matches a registered tool in holocron-mcp/src/mastra/stdio.ts", "verify": "grep -cE '^  - id:|^    id:' .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml | xargs test 44 -eq" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "mcp-manifest-02 populates skeleton entries without re-creating structure", "verify": "mcp-manifest-02 succeeds reading skeleton and populating per-tool contracts" }
  ]
}
-->
</details>
