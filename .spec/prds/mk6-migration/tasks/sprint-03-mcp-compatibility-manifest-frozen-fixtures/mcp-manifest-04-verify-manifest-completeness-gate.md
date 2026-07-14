# mcp-manifest-04 — Build `holo mcp:verify-manifest` completeness gate + operator inspection commands

## What this does
Adds the completeness build-gate for the MCP manifest: `holo mcp:verify-manifest` exits 0 only when all 44 live-registered tool IDs resolve to manifest entries carrying frozen success/error fixtures and both transports are covered, and exits non-zero naming any uncovered tool (registered tool with no manifest entry) or any orphan manifest entry (manifest entry naming a tool not in the registry). Plus the operator inspection commands: `mcp:manifest-schema <tool>` (input/output JSON Schema + defaults), `mcp:manifest-replay <tool>` (frozen idempotency key + stored result), `mcp:verify-manifest --protocol` (pinned MCP protocol 2025-11-25 both transports), `mcp:list-mutations` (mutation tools each with a replay-contract entry).

## Why
This is the T-SVC-021 build-gate that makes "all 44 tools + both transports have frozen fixtures" enforceable in CI (UC-SVC-04 AC-5). Without a gate that fails closed the instant a registered tool lacks a manifest entry — or a manifest entry names a tool no longer registered — an entire tool can vanish unnoticed and the completeness claim becomes a lie. The gate cross-checks the manifest against the LIVE registry, not a self-referential count of the manifest's own keys.

## How to verify
`MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts` against the committed manifest (mcp-manifest-02) + frozen fixtures (mcp-manifest-03) → exit 0, "44/44 tools, both transports covered". Then remove one manifest entry → verify-manifest exits non-zero naming the orphan registered tool; add one manifest entry not in the registry → verify-manifest exits non-zero naming the orphan manifest entry.

## Scope
Creates `services/platform/src/mcp/{verify-manifest,manifest-schema,manifest-replay,list-mutations}.ts`, registers `mcp:verify-manifest` + `mcp:manifest-schema` + `mcp:manifest-replay` + `mcp:list-mutations` in `services/platform/src/cli/holo.ts`, and creates `tests/integration/mcp-verify-manifest.test.ts`. Reuses the committed manifest (mcp-manifest-02, read-only) and frozen fixtures (mcp-manifest-03, read-only). Does NOT touch the committed `14-*.yaml`, mcp-manifest-03's tests, or `holocron-mcp/src/**` (reads the live registry, does not edit).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: mcp-manifest-04 — Build holo mcp:verify-manifest completeness gate + operator inspection commands
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=mcp-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-CUT-01 (the un-fakeable completeness gate for the frozen 44-tool contract)
SPRINT:     [Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      MCP_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
`bun services/platform/src/cli/holo.ts mcp:verify-manifest` exits 0 when — cross-checked against the live registry (`holocron-mcp/src/mastra/stdio.ts`) — all 44 registered tool IDs have manifest entries with frozen fixtures and both transports are covered, and exits non-zero naming any registered tool missing a manifest entry or any manifest entry naming a tool not in the registry. `mcp:manifest-schema <tool>` prints input/output JSON Schema + defaults; `mcp:manifest-replay <tool>` returns the frozen idempotency key + stored result; `mcp:verify-manifest --protocol` reports pinned MCP protocol 2025-11-25 for both transports; `mcp:list-mutations` lists all mutation tools with replay contracts.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST cross-check manifest tool IDs against the LIVE-registered tool IDs read from `holocron-mcp/src/mastra/stdio.ts` MCPServer tools object — NOT a self-referential count of the manifest's own keys.
- MUST require, per tool, a manifest entry with frozen fixtures (success + error) — a missing fixture block is an unmapped tool.
- `mcp:verify-manifest` exit code is the gate: 0 iff 44/44 tools covered + both transports + all fixtures present; non-zero MUST name the offending surface(s).
- `mcp:manifest-schema <tool>` MUST print the tool's input/output JSON Schema + defaults from the manifest; `mcp:manifest-replay <tool>` MUST return the frozen idempotency key + stored result; `mcp:verify-manifest --protocol` MUST report pinned protocol 2025-11-25 for both transports; `mcp:list-mutations` MUST list all mutation tools from the manifest, each with a replay-contract entry.
- NEVER pass a 44/44 when a registered tool lacks a manifest entry or fixtures; NEVER use a self-referential count of manifest keys without cross-checking the live registry; NEVER report coverage at tool granularity while claiming fixture coverage.
- NEVER touch the committed `14-*.yaml` (mcp-manifest-02, read-only); NEVER touch `tests/integration/mcp-manifest-*.test.ts` (mcp-manifest-03, read-only); NEVER touch `services/platform/tests/fixtures/mcp-manifest/**` (mcp-manifest-03, read-only); NEVER touch `holocron-mcp/src/**` (read-only registry), `convex/**`, `app/**`.
- STRICTLY the registry cross-check reads the real MCPServer tools object from stdio.ts; manifest entries are read from the committed `14-*.yaml`; fixtures are read from `services/platform/tests/fixtures/mcp-manifest/**`; reuses the manifest loader read-only and extends `services/platform`.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): `mcp:verify-manifest` on the live registry + complete manifest ⇒ exit 0, 44/44 tools covered + both transports
- [ ] AC-2: `mcp:verify-manifest --protocol` ⇒ protocol 2025-11-25, both transports (stdio + Streamable HTTP)
- [ ] AC-3: a registered tool with no manifest entry ⇒ `mcp:verify-manifest` exits non-zero naming the uncovered tool
- [ ] AC-4: a manifest entry with no registered tool ⇒ `mcp:verify-manifest` exits non-zero naming the orphan entry
- [ ] `mcp:manifest-schema <tool>` prints input/output JSON Schema + defaults; `mcp:manifest-replay <tool>` returns frozen idempotency key + stored result; `mcp:list-mutations` lists all mutations with replay contracts
- [ ] mcp-manifest-03's fixture-missing control goes GREEN against this implementation
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean; only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED against the absent `mcp:verify-manifest` command first)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] verify-manifest against live registry + complete manifest → 44/44 covered + both transports (flow_ref UC-SVC-04)
  GIVEN the live holocron-mcp registry (live_registry from stdio.ts) + the complete committed manifest (manifest_committed) with all 44 tool entries + frozen fixtures (from mcp-manifest-03)
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest` runs
  THEN  exit 0, 44/44 tools covered, both transports covered, all fixtures present
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: manifest_committed+live_registry · evidence: stdout
    NEGATIVE_CONTROL: would fail if 44/44 is hard-coded without cross-checking the live registry, the registry isn't read from stdio.ts, or fixtures aren't checked
    MUST_OBSERVE: exit 0; "44/44 tools covered"; "both transports covered"; every registered tool ID has a manifest entry with fixtures
    MUST_NOT_OBSERVE: a registered tool with no manifest entry; missing fixtures; a single transport only; a self-referential count of manifest keys

AC-2 verify-manifest --protocol reports pinned MCP protocol 2025-11-25 both transports (flow_ref T-SVC-021)
  GIVEN manifest_committed with the protocol pin (mcp-manifest-01)
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol` runs
  THEN  exit 0, protocol: 2025-11-25, transports: stdio + Streamable HTTP, stateless/no-server-sampling present
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_committed · evidence: stdout
    NEGATIVE_CONTROL: would fail if the protocol isn't pinned, only one transport is declared, or there is no stateless/no-server-sampling policy
    MUST_OBSERVE: protocol: 2025-11-25; transports: stdio + streamable-http; stateless: true; no_server_sampling: true
    MUST_NOT_OBSERVE: protocol unpinned; a single transport; no stateless policy

AC-3 Registered tool with no manifest entry → verify-manifest exits non-zero naming it (flow_ref UC-SVC-04)
  GIVEN live_registry with 44 tools + manifest_committed with one entry removed (manifest_missing_entry)
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest` runs
  THEN  exit non-zero, the removed entry's tool ID named (e.g. "store_document not covered by manifest")
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_missing_entry+live_registry · evidence: stdout
    NEGATIVE_CONTROL: would fail if verify-manifest passes with the missing entry, or exits 0 without naming the tool
    MUST_OBSERVE: exit != 0; the removed tool ID named (e.g. "store_document not covered")
    MUST_NOT_OBSERVE: exit 0; a generic pass; the missing tool silently ignored

AC-4 Manifest entry with no registered tool → verify-manifest exits non-zero naming it
  GIVEN live_registry + manifest_committed with one added entry not in the registry (manifest_orphan_entry)
  WHEN  `bun services/platform/src/cli/holo.ts mcp:verify-manifest` runs
  THEN  exit non-zero, the orphan entry's tool ID named (e.g. "fake_tool not registered in holocron-mcp")
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_orphan_entry+live_registry · evidence: stdout
    NEGATIVE_CONTROL: would fail if verify-manifest passes with the orphan entry, or exits 0 without naming the orphan
    MUST_OBSERVE: exit != 0; the orphan tool ID named (e.g. "fake_tool not registered")
    MUST_NOT_OBSERVE: exit 0; a generic pass; the orphan entry silently ignored

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/mcp/verify-manifest.ts (NEW), services/platform/src/mcp/manifest-schema.ts (NEW), services/platform/src/mcp/manifest-replay.ts (NEW), services/platform/src/mcp/list-mutations.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — register mcp:verify-manifest + mcp:manifest-schema + mcp:manifest-replay + mcp:list-mutations)
- tests/integration/mcp-verify-manifest.test.ts (NEW — happy 44/44 + protocol pin + negative controls for missing-entry and orphan-entry)
writeProhibited: .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (read-only from mcp-manifest-02), tests/integration/mcp-manifest-*.test.ts (mcp-manifest-03, read-only), services/platform/tests/fixtures/mcp-manifest/** (mcp-manifest-03, read-only), holocron-mcp/src/** (read-only source of truth for the registry), convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/tasks/sprint-02-convex-source-catalog-asset-inventory/catalog-3-catalog-verify-coverage-gate.md:1-188 [PRIMARY MODEL] — verify-gate task that cross-checks against a real surface and carries negative controls for missing entries
2. holocron-mcp/src/mastra/stdio.ts:139-843 — the live MCPServer tools object: the REAL 44 registered tool IDs to cross-check against
3. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:23-27 — MCP compatibility manifest contract (protocol pin, transports, per-tool fixtures)
4. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:139 — T-SVC-021 build-gate (all 44 tools + both transports have frozen fixtures)
5. services/platform/src/cli/holo.ts:1-60 — the `holo` CLI the `mcp:*` subcommands extend (from Sprint 01 compat-1)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- 44/44 green: `MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t '44/44 completeness'` → Exit 0 (captured "44/44 tools covered, both transports covered", not merely "Exit 0")
- protocol pin green: `MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'protocol pin'` → Exit 0
- negative: missing entry → non-zero: `MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'unregistered tool'` → Exit 0 (captured non-zero exit with the tool name)
- negative: orphan entry → non-zero: `MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'orphan entry'` → Exit 0
- manifest-schema command: `bun services/platform/src/cli/holo.ts mcp:manifest-schema store_document` → Exit 0, prints input/output JSON Schema + defaults
- manifest-replay command: `bun services/platform/src/cli/holo.ts mcp:manifest-replay add_subscription` → Exit 0, prints frozen idempotency key + stored result
- list-mutations command: `bun services/platform/src/cli/holo.ts mcp:list-mutations` → Exit 0, lists all mutation tools with replay contracts
- root typecheck `pnpm tsgo --noEmit` → Exit 0 · lint `pnpm biome check .` → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1 cross-checks the manifest against the LIVE registry (grep the real MCPServer tools object, not a self-referential key count); a manifest missing a registered tool or inventing one is caught. AC-1 was watched RED against the absent `mcp:verify-manifest` command before green; captured stdout shows a real 44/44 tally + a real named failure.

--------------------------------------------------------------------------------
REVIEW (mcp-reviewer)
--------------------------------------------------------------------------------
Must pass: one integration test per AC driving the real `holo mcp:*` surface; RED evidence present; verify-manifest cross-checks the LIVE registry from stdio.ts (not a self-referential count); a registered tool with no manifest entry fails non-zero naming the tool; a manifest entry with no registered tool fails non-zero naming the orphan; protocol 2025-11-25 + both transports asserted; operator commands work (manifest-schema, manifest-replay, list-mutations); mcp-manifest-03's fixture-missing control turns green; SCOPE respected. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: mcp-manifest-02 (populated manifest), mcp-manifest-03 (frozen fixtures + the RED controls this turns green), mcp-manifest-01 (manifest header/protocol pin) · Blocks: mcp-manifest-05 (review validates this gate's un-fakeable control), Sprint 19 (MCP Gateway Rehost — the rehost flips against the manifest this gate keeps honest)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "mcp-manifest-04",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "manifest_committed": { "description": "The committed 14-mcp-compatibility-manifest.yaml populated by mcp-manifest-02 (read-only)", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml"] },
    "live_registry": { "description": "The live MCPServer tools object from holocron-mcp/src/mastra/stdio.ts — 44 real registered tool IDs (read-only)", "seed_method": "read_only", "records": ["holocron-mcp/src/mastra/stdio.ts:139-843 (MCPServer tools object)"] },
    "manifest_missing_entry": { "description": "Negative control: manifest copy with one entry removed (e.g. store_document)", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/mcp-manifest/manifest-missing-store_document.yaml"] },
    "manifest_orphan_entry": { "description": "Negative control: manifest copy with one fake entry added (e.g. fake_tool)", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/mcp-manifest/manifest-orphan-fake_tool.yaml"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN the live registry + the complete manifest WHEN holo mcp:verify-manifest runs THEN exit 0, 44/44 tools covered, both transports covered",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t '44/44 completeness'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["44/44 hard-coded without cross-check", "registry not read from stdio.ts", "fixtures not checked"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed+live_registry", "action": { "actor": "cli_user", "steps": ["run holo mcp:verify-manifest"] },
          "end_state": { "must_observe": ["exit 0", "44/44 tools covered", "both transports covered", "every registered tool ID has a manifest entry with fixtures"], "must_not_observe": ["exit non-zero", "a registered tool with no manifest entry", "missing fixtures", "single transport only", "a self-referential count of manifest keys"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "T-SVC-021",
      "description": "GIVEN the manifest with protocol pin WHEN holo mcp:verify-manifest --protocol runs THEN exit 0, protocol 2025-11-25, both transports, stateless/no-server-sampling",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'protocol pin'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "T-SVC-021",
        "negative_control": { "would_fail_if": ["protocol not pinned", "only one transport", "no stateless/no-server-sampling"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed", "action": { "actor": "cli_user", "steps": ["run holo mcp:verify-manifest --protocol"] },
          "end_state": { "must_observe": ["exit 0", "protocol: 2025-11-25", "transports: stdio + streamable-http", "stateless: true", "no_server_sampling: true"], "must_not_observe": ["protocol unpinned", "single transport", "no stateless policy"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN a manifest with one entry removed WHEN holo mcp:verify-manifest runs THEN exit non-zero naming the uncovered registered tool",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'unregistered tool'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["verify-manifest passes with the missing entry (fails open)", "exits 0 without naming the tool"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_missing_entry+live_registry", "action": { "actor": "cli_user", "steps": ["run verify-manifest against the manifest with one entry removed"] },
          "end_state": { "must_observe": ["exit != 0", "the removed tool ID named (e.g. 'store_document not covered')"], "must_not_observe": ["exit 0", "a generic pass", "the missing tool silently ignored"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN a manifest with one orphan entry WHEN holo mcp:verify-manifest runs THEN exit non-zero naming the tool not in the registry",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'orphan entry'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["verify-manifest passes with the orphan entry", "exits 0 without naming the orphan"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_orphan_entry+live_registry", "action": { "actor": "cli_user", "steps": ["run verify-manifest against the manifest with a fake entry added"] },
          "end_state": { "must_observe": ["exit != 0", "the orphan tool ID named (e.g. 'fake_tool not registered')"], "must_not_observe": ["exit 0", "a generic pass", "the orphan entry silently ignored"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "verify-manifest against the live registry + complete manifest reports 44/44 tools covered + both transports", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t '44/44 completeness'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "verify-manifest --protocol reports pinned protocol 2025-11-25 + both transports", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'protocol pin'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "verify-manifest with one manifest entry removed exits non-zero naming the uncovered registered tool", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'unregistered tool'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "verify-manifest with one orphan manifest entry exits non-zero naming the tool not in the registry", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts -t 'orphan entry'" }
  ]
}
-->
</details>
