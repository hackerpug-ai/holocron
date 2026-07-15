# mcp-manifest-05 — Review manifest protocol compliance; prove the completeness gate is un-fakeable

## What this does
A review task that validates the MCP manifest protocol compliance and reproduces the negative controls proving the completeness gate is un-fakeable. The reviewer removes a fixture block and observes `verify-manifest` exit non-zero naming the uncovered tool; removes a manifest entry and observes the orphan caught; confirms protocol 2025-11-25 + both transports + stateless/no-server-sampling + origin validation/API-key posture; confirms all 44 tools have entries with frozen fixtures and mutations carry replay contracts. Produces an APPROVED/NEEDS_FIXES verdict with evidence. Does NOT modify production/test/yaml source — it reproduces against the real surface and records a verdict.

## Why
The sprint's human testing gate requires proving the manifest covers every tool and both transports with frozen fixtures, and that the completeness gate fails closed when coverage is incomplete. A review that reproduces the negative controls and confirms protocol compliance provides the APPROVED verdict before the sprint marks complete — and a review that cannot reproduce a failure is the signal the gate is fakeable.

## How to verify
Reviewer reproduces against the real `holo mcp:*` surface: (1) `holo mcp:verify-manifest` → 44/44 tools, both transports; (2) remove a fixture block → `verify-manifest` exits 1 naming the uncovered tool; (3) remove a manifest entry → `verify-manifest` exits 1 naming the orphan; (4) `holo mcp:verify-manifest --protocol` → protocol 2025-11-25, both transports, stateless/no-server-sampling, origin validation, API-key policy; (5) `holo mcp:list-mutations` → mutation tools with replay contracts. Records the verdict in an evidence/ artifact.

## Scope
Produces a review verdict artifact only (writes to `.spec/prds/mk6-migration/tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/evidence/` or appends to this task file). Does NOT modify production code, test code, the committed YAML, fixtures, or `holocron-mcp/src/**`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: mcp-manifest-05 — Review manifest protocol compliance; prove the completeness gate is un-fakeable
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (75 min)
AGENT:      implementer=mcp-reviewer | reviewer=none
PROPOSED-BY: mcp-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (a review produces a verdict; no RED ceremony — but it reproduces REAL negative controls, so seeded-evidence is required)
CAPABILITY: CAP-CUT-01 (review-verified protocol compliance + un-fakeability of the frozen 44-tool contract)
SPRINT:     [Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      (none — review reproduces against the real holo mcp:* surface)
  typecheck: (none — review does not modify source)
  lint:      (none — review does not modify source)

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The reviewer produces an APPROVED verdict with evidence that: (a) the manifest pins MCP protocol 2025-11-25; (b) both transports (stdio + Streamable HTTP) are declared; (c) the stateless/no-server-sampling capability policy is present; (d) auth/cancellation posture (stdio trust boundary; HTTP origin validation + API-key policy) is documented; (e) all 44 tools have manifest entries with frozen success/error fixtures; (f) the verify-manifest gate cross-checks against the live registry (not self-referential) and exits non-zero naming uncovered tools or orphan entries; (g) mutation tools carry replay contracts (idempotency key → stored result); (h) the negative controls were reproduced (fixture block removed → non-zero naming the tool; entry removed → non-zero naming the orphan). Or NEEDS_FIXES with the specific gaps.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST reproduce the negative controls manually (remove a fixture block → observe verify-manifest non-zero naming the tool; remove a manifest entry → observe non-zero naming the orphan).
- MUST confirm protocol 2025-11-25 is pinned at the manifest top level; MUST confirm both transports (stdio + Streamable HTTP) are declared; MUST confirm the stateless/no-server-sampling capability policy; MUST confirm the auth/cancellation posture (stdio trust boundary; HTTP origin validation + API-key policy).
- MUST confirm all 44 tools have manifest entries with frozen fixtures and that mutation tools carry replay contracts.
- MUST confirm verify-manifest cross-checks against the live registry from `holocron-mcp/src/mastra/stdio.ts` (not a self-referential count).
- MUST record the verdict (APPROVED or NEEDS_FIXES) with evidence.
- NEVER modify production code (`services/platform/src/**`), test code (`tests/**`), the committed YAML (`14-mcp-compatibility-manifest.yaml`), `holocron-mcp/src/**`, or fixtures (`services/platform/tests/fixtures/**`).
- NEVER approve without reproducing the negative controls; NEVER approve without confirming protocol compliance and both transports; NEVER modify source to make a control pass.
- STRICTLY reproduction uses the real `holo mcp:*` entrypoints against the committed manifest and fixtures; the verdict is recorded in an evidence/ artifact, not by modifying source files.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): reviewer reproduces the fixture-missing negative control (verify-manifest exits non-zero naming the tool)
- [x] AC-2: reviewer reproduces the orphan-entry negative control (verify-manifest exits non-zero naming the orphan)
- [x] AC-3: reviewer confirms protocol 2025-11-25 + both transports + stateless/no-server-sampling + origin/API-key posture
- [x] AC-4: reviewer confirms all 44 tools have manifest entries + frozen fixtures + replay contracts (mutations)
- [ ] review verdict recorded (APPROVED or NEEDS_FIXES) in an evidence/ artifact
- [ ] NO production/test/yaml source modified (review reproduces, does not modify)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (review reproduces against the real surface; a verdict that cannot reproduce a failure means the gate is fakeable)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Reviewer reproduces the fixture-missing negative control (flow_ref UC-SVC-04)
  GIVEN the completed verify-manifest gate (mcp-manifest-04) + committed manifest (mcp-manifest-02) + fixtures (mcp-manifest-03)
  WHEN  the reviewer removes one tool's fixture block and runs `holo mcp:verify-manifest`
  THEN  verify-manifest exits non-zero with stderr naming the uncovered tool; reviewer records this as evidence
  TEST_TIER: human_gate · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: complete_manifest+fixtures · evidence: review_verdict
    NEGATIVE_CONTROL: would fail if verify-manifest passes with the fixture missing (the gate is fakeable), or the reviewer doesn't reproduce this control
    MUST_OBSERVE: verify-manifest exited != 0; stderr names the uncovered tool
    MUST_NOT_OBSERVE: verify-manifest exited 0; a generic pass; the tool not named

AC-2 Reviewer reproduces the orphan-entry negative control (flow_ref UC-SVC-04)
  GIVEN the completed verify-manifest gate + committed manifest
  WHEN  the reviewer removes one manifest entry and runs `holo mcp:verify-manifest`
  THEN  verify-manifest exits non-zero with stderr naming the orphan registered tool; reviewer records this as evidence
  TEST_TIER: human_gate · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: complete_manifest · evidence: review_verdict
    NEGATIVE_CONTROL: would fail if verify-manifest passes with the missing entry (the gate is fakeable), or the reviewer doesn't reproduce this control
    MUST_OBSERVE: verify-manifest exited != 0; stderr names the orphan tool
    MUST_NOT_OBSERVE: verify-manifest exited 0; a generic pass; the orphan not named

AC-3 Reviewer confirms protocol 2025-11-25 + both transports + stateless/no-server-sampling + origin/API-key (flow_ref T-SVC-021)
  GIVEN the committed manifest header (mcp-manifest-01)
  WHEN  the reviewer runs `holo mcp:verify-manifest --protocol` and reads the manifest header
  THEN  protocol pinned to 2025-11-25; both transports (stdio + Streamable HTTP) declared; stateless/no-server-sampling present; auth/cancellation posture documented (stdio trust boundary; HTTP origin validation + API-key policy); reviewer records confirmation
  TEST_TIER: human_gate · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_header · evidence: review_verdict
    NEGATIVE_CONTROL: would fail if the protocol isn't pinned, only one transport is declared, there's no stateless policy, there's no auth posture, or the reviewer doesn't confirm
    MUST_OBSERVE: protocol: 2025-11-25; transports: stdio + streamable-http; stateless: true; no_server_sampling: true; auth/cancellation posture present
    MUST_NOT_OBSERVE: protocol unpinned; a single transport; no stateless policy; no auth posture

AC-4 Reviewer confirms all 44 tools have manifest entries + frozen fixtures + replay contracts (mutations) (flow_ref UC-SVC-04)
  GIVEN the committed manifest (mcp-manifest-02) + fixtures (mcp-manifest-03)
  WHEN  the reviewer runs `holo mcp:list-mutations` and inspects the fixture directory
  THEN  all 44 tools have manifest entries; all have frozen success/error fixtures; mutation tools (store_document, add_subscription, etc.) carry replay contracts (idempotency key → stored result); reviewer records confirmation
  TEST_TIER: human_gate · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: complete_manifest+fixtures · evidence: review_verdict
    NEGATIVE_CONTROL: would fail if a tool is missing an entry/fixtures, a mutation is missing a replay contract, or the reviewer doesn't confirm
    MUST_OBSERVE: 44 tools have manifest entries; all have frozen fixtures; mutation tools carry replay contracts
    MUST_NOT_OBSERVE: a tool with no entry/fixtures; a mutation with no replay contract

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- Review verdict artifact only (e.g. .spec/prds/mk6-migration/tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/evidence/review-verdict.md, or an append to this task file)
writeProhibited: services/platform/src/** (production code), tests/** (test code), .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (committed manifest), services/platform/tests/fixtures/** (frozen fixtures), holocron-mcp/src/** (read-only source of truth), convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:23-27 [PRIMARY SOURCE] — MCP compatibility manifest contract (protocol 2025-11-25, both transports, stateless/no-server-sampling, auth/cancellation, per-tool fixtures)
2. .spec/prds/mk6-migration/06-uc-svc.md:56-65 — UC-SVC-04 AC-5 (manifest covers every tool + both transports with frozen fixtures and replay/idempotency)
3. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:139 — T-SVC-021 (all 44 tools + both transports have frozen success/error fixtures; mutation replay contract present)
4. holocron-mcp/src/mastra/stdio.ts:139-843 — the live registry the verify-manifest cross-check must read (confirm the gate isn't self-referential)
5. .spec/prds/mk6-migration/tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/SPRINT.md:1-90 — sprint overview (manifest is the frozen 44-tool contract; the completeness gate must be un-fakeable)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- fixture-missing control reproduced: Manual — remove a fixture block; run `holo mcp:verify-manifest`; observe exit non-zero with the tool name → recorded in the verdict
- orphan-entry control reproduced: Manual — remove a manifest entry; run `holo mcp:verify-manifest`; observe exit non-zero with the orphan name → recorded in the verdict
- protocol pin confirmed: Manual — run `holo mcp:verify-manifest --protocol`; read the manifest header → protocol: 2025-11-25, both transports, stateless/no-server-sampling, auth posture present
- 44 tools + fixtures + replay confirmed: Manual — run `holo mcp:list-mutations`; inspect the fixture directory → 44 tools with entries, all with fixtures, mutations with replay contracts
- review verdict recorded: verdict written to the evidence/ artifact → APPROVED or NEEDS_FIXES with specific gaps
- NO source modified: `git diff --name-only` after the review shows only the evidence/ artifact (no production/test/yaml/holocron-mcp changes)

--------------------------------------------------------------------------------
REVIEW (mcp-reviewer — self-verdict task)
--------------------------------------------------------------------------------
Must pass: reviewer reproduces the fixture-missing negative control (verify-manifest non-zero with the tool name); reproduces the orphan-entry negative control (verify-manifest non-zero with the orphan name); confirms protocol 2025-11-25; confirms both transports; confirms stateless/no-server-sampling; confirms auth/cancellation posture; confirms all 44 tools have manifest entries + frozen fixtures; confirms mutation tools carry replay contracts; confirms verify-manifest cross-checks the live registry (not self-referential); records an APPROVED verdict with evidence. Or NEEDS_FIXES with the specific gaps. Verdict recorded in the evidence/ artifact, not by modifying source.

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: mcp-manifest-01 (header/protocol), mcp-manifest-02 (populated per-tool contracts), mcp-manifest-03 (frozen fixtures + RED controls), mcp-manifest-04 (verify-manifest gate) · Blocks: Sprint 03 completion gate (the APPROVED verdict is required before the sprint marks complete), Sprint 19 (the rehost trusts this frozen, review-verified manifest)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "mcp-manifest-05",
  "proposed_by": "mcp-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "complete_manifest": { "description": "The committed 14-mcp-compatibility-manifest.yaml populated by mcp-manifest-02 (read-only for review)", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml"] },
    "fixtures": { "description": "The frozen fixtures under services/platform/tests/fixtures/mcp-manifest/** from mcp-manifest-03 (read-only for review)", "seed_method": "read_only", "records": ["services/platform/tests/fixtures/mcp-manifest/** success/error/replay fixtures"] },
    "verify_gate": { "description": "The holo mcp:verify-manifest entrypoint from mcp-manifest-04 (read-only for review reproduction)", "seed_method": "cli", "records": ["services/platform/src/cli/holo.ts mcp:* commands"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN complete manifest + fixtures WHEN the reviewer removes a fixture block and runs verify-manifest THEN verify-manifest exits non-zero naming the uncovered tool",
      "verify": "Manual reproduction by reviewer (remove a fixture block; run holo mcp:verify-manifest; observe non-zero exit naming the tool)",
      "scenario": { "test_tier": "human_gate", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["verify-manifest passes with the fixture missing (gate is fakeable)", "reviewer doesn't reproduce this control"] },
        "evidence": { "artifact_type": "review_verdict", "required_capture": true },
        "cases": [ { "start_ref": "complete_manifest+fixtures", "action": { "actor": "mcp-reviewer", "steps": ["remove the store_document fixture block; run holo mcp:verify-manifest; observe non-zero exit with 'store_document' in stderr"] },
          "end_state": { "must_observe": ["verify-manifest exited != 0", "stderr names the uncovered tool"], "must_not_observe": ["verify-manifest exited 0", "a generic pass", "the tool not named"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN complete manifest WHEN the reviewer removes a manifest entry and runs verify-manifest THEN verify-manifest exits non-zero naming the orphan",
      "verify": "Manual reproduction by reviewer (remove a manifest entry; run holo mcp:verify-manifest; observe non-zero exit naming the orphan)",
      "scenario": { "test_tier": "human_gate", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["verify-manifest passes with the missing entry (gate is fakeable)", "reviewer doesn't reproduce this control"] },
        "evidence": { "artifact_type": "review_verdict", "required_capture": true },
        "cases": [ { "start_ref": "complete_manifest", "action": { "actor": "mcp-reviewer", "steps": ["remove the store_document entry; run holo mcp:verify-manifest; observe non-zero exit with 'store_document' in stderr"] },
          "end_state": { "must_observe": ["verify-manifest exited != 0", "stderr names the orphan tool"], "must_not_observe": ["verify-manifest exited 0", "a generic pass", "the orphan not named"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "T-SVC-021",
      "description": "GIVEN the manifest header WHEN the reviewer runs verify-manifest --protocol THEN confirms protocol 2025-11-25, both transports, stateless/no-server-sampling, origin/API-key posture",
      "verify": "Manual reproduction by reviewer (run holo mcp:verify-manifest --protocol; read the manifest header)",
      "scenario": { "test_tier": "human_gate", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "T-SVC-021",
        "negative_control": { "would_fail_if": ["protocol not pinned", "single transport", "no stateless policy", "no auth posture", "reviewer doesn't confirm"] },
        "evidence": { "artifact_type": "review_verdict", "required_capture": true },
        "cases": [ { "start_ref": "complete_manifest", "action": { "actor": "mcp-reviewer", "steps": ["run holo mcp:verify-manifest --protocol; read the manifest header; confirm protocol/transports/policy"] },
          "end_state": { "must_observe": ["protocol: 2025-11-25", "transports: stdio + streamable-http", "stateless: true", "no_server_sampling: true", "auth/cancellation posture present"], "must_not_observe": ["protocol unpinned", "single transport", "no stateless policy", "no auth posture"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN complete manifest + fixtures WHEN the reviewer runs list-mutations and inspects fixtures THEN confirms 44 tools with entries + frozen fixtures + replay contracts",
      "verify": "Manual reproduction by reviewer (run holo mcp:list-mutations; inspect the fixture directory)",
      "scenario": { "test_tier": "human_gate", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["a tool is missing an entry/fixtures", "a mutation is missing a replay contract", "reviewer doesn't confirm"] },
        "evidence": { "artifact_type": "review_verdict", "required_capture": true },
        "cases": [ { "start_ref": "complete_manifest+fixtures", "action": { "actor": "mcp-reviewer", "steps": ["run holo mcp:list-mutations; inspect the fixture directory; confirm 44 entries + fixtures + replay contracts"] },
          "end_state": { "must_observe": ["44 tools with manifest entries", "all have frozen fixtures", "mutation tools carry replay contracts"], "must_not_observe": ["a tool with no entry/fixtures", "a mutation with no replay contract"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "reviewer reproduces the fixture-missing negative control and observes verify-manifest non-zero with the tool name", "verify": "Manual reproduction by reviewer (remove a fixture block; run holo mcp:verify-manifest; observe non-zero exit naming the tool)" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "reviewer reproduces the orphan-entry negative control and observes verify-manifest non-zero with the orphan name", "verify": "Manual reproduction by reviewer (remove a manifest entry; run holo mcp:verify-manifest; observe non-zero exit naming the orphan)" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "reviewer confirms protocol 2025-11-25 + both transports + stateless/no-server-sampling + origin/API-key posture", "verify": "Manual reproduction by reviewer (run holo mcp:verify-manifest --protocol; read the manifest header)" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "reviewer confirms all 44 tools have manifest entries + frozen fixtures + replay contracts (mutations)", "verify": "Manual reproduction by reviewer (run holo mcp:list-mutations; inspect the fixture directory)" }
  ]
}
-->
</details>
