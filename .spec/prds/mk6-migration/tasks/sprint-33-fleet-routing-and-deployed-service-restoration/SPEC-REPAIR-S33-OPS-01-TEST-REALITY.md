# SPEC-REPAIR-S33-OPS-01-TEST-REALITY: Authorize and declare S33-OPS-01 real-test gates

> Status: ✅ Completed
> Cycle: 1
> Commit: 1dc68303b350c4341eb006151db04fc35e5da2a1
> Reviewer: product-manager+code-reviewer
> Completed: 2026-08-17T00:29:25Z
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 20 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: technical-reviewer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-01
> Blocks: S33-OPS-01 remediation

## Outcome

Repair S33-OPS-01's task contract so a follow-up implementer is explicitly authorized to add the real fleet integration test and its immutable evidence, and must run both the exact integration-test and test-reality gates without weakening the existing test requirement.

**Success state:** S33-OPS-01 WRITE-ALLOWED names `tests/integration/sprint33-ops-01-fleet-state.test.ts` and `.tmp/S33-OPS-01/**`; its Verification Gates declare the exact integration and test-reality commands; and its REQUIREMENT-CONTRACT still sets `requires_tests` to `true`.

## Scope

**MUST**

- Add only the missing test/evidence write authorization and exact verification-gate declarations to S33-OPS-01.
- Preserve S33-OPS-01's existing operational behavior and `requires_tests: true` policy.
- Prove the static task-contract repair through deterministic AC-1 and TC-1 checks.

**NEVER**

- Never implement `tests/integration/sprint33-ops-01-fleet-state.test.ts` or `.tmp/S33-OPS-01/reality-spec.json` in this planning-only repair.
- Never mutate fleet hosts, model weights, services, network state, or product code.
- Never weaken or bypass the real-test and test-reality requirements.

**STRICTLY**

- Writes are limited to this repair contract, the existing S33-OPS-01 task Markdown, and this task's evidence directory.

## Acceptance Criteria

### AC-1 — S33-OPS-01 explicitly authorizes the real test and evidence paths

- **GIVEN** the technical review found no authorized committed real integration test or reality-spec evidence path.
- **WHEN** the task contract is repaired.
- **THEN** WRITE-ALLOWED explicitly names the single integration test and `.tmp/S33-OPS-01/**` evidence tree required by the remediation.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md; rg -Fxq -- '- tests/integration/sprint33-ops-01-fleet-state.test.ts' "$task" && rg -Fxq -- '- .tmp/S33-OPS-01/**' "$task"`
- **Tier:** static · **Service:** task-contract · **Flow:** sprint governance

### TC-1 — S33-OPS-01 declares both exact real-test gates and still requires tests

- **GIVEN** the canonical contract already requires tests but the task omitted executable integration and reality-audit gates.
- **WHEN** the repaired verification policy is inspected.
- **THEN** both exact commands appear once in Verification Gates and the embedded REQUIREMENT-CONTRACT retains `requires_tests: true`.
- **Verify:** `python3 -c 'import json,re,sys; t=open(sys.argv[1], encoding="utf-8").read(); a="PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-01-fleet-state.test.ts"; b="python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-01/reality-spec.json"; assert t.count(a)==1 and t.count(b)==1; c=json.loads(re.search(r"<!-- REQUIREMENT-CONTRACT v1 -->\s*<!--\s*(\{.*?\})\s*-->",t,re.S).group(1)); assert c["verification_policy"]["requires_tests"] is True' .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md`
- **Tier:** static · **Service:** task-contract · **Flow:** sprint governance

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-01-TEST-REALITY.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md
- .tmp/SPEC-REPAIR-S33-OPS-01-TEST-REALITY/**

**WRITE-PROHIBITED**

- Every other repository path.
- tests/integration/sprint33-ops-01-fleet-state.test.ts and .tmp/S33-OPS-01/** (authorized by S33-OPS-01 for its later implementation, but prohibited in this repair).
- All remote files, services, model directories, configuration, and network state.

## Verification Policy

- TDD mode: skipped.
- Tests required for this planning-only repair: no.
- RED evidence required: no.
- Seeded evidence required: no.
- Deterministic evidence harvesting and lineage validation remain required.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-01-TEST-REALITY",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {},
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "S33-OPS-01 explicitly authorizes the real integration test and its evidence tree.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md; rg -Fxq -- '- tests/integration/sprint33-ops-01-fleet-state.test.ts' \"$task\" && rg -Fxq -- '- .tmp/S33-OPS-01/**' \"$task\""
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "S33-OPS-01 declares the exact integration and test-reality gates while retaining requires_tests=true.",
      "verify": "python3 -c 'import json,re,sys; t=open(sys.argv[1], encoding=\"utf-8\").read(); a=\"PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-01-fleet-state.test.ts\"; b=\"python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-01/reality-spec.json\"; assert t.count(a)==1 and t.count(b)==1; c=json.loads(re.search(r\"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->\",t,re.S).group(1)); assert c[\"verification_policy\"][\"requires_tests\"] is True' .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md"
    }
  ]
}
-->
