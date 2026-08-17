# SPEC-REPAIR-S33-OPS-01-TC2-VERIFY: Make S33-OPS-01 TC-2 fail closed and prove live execution

> Status: 🟡 In Progress
> Commit: pending
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 20 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: technical-reviewer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-01
> Blocks: S33-OPS-01 review

## Outcome

Replace S33-OPS-01 TC-2's weak file-count output with one fail-closed assertion in both task representations and prove that exact replacement against live inference1.

**Success state:** the old non-asserting count command is absent, the prose and embedded JSON TC-2 verifiers both decode to `ssh inference1 'test ! -e ~/models/mlx-community/Qwen3.8-27B-8bit'`, and that command exits 0 against live inference1.

## Scope

**MUST**

- Keep the S33-OPS-01 prose TC-2 verifier and REQUIREMENT-CONTRACT TC-2 verify value byte-equivalent after JSON decoding.
- Preserve TC-2's fail-closed no-partial-copy semantics.
- Execute the exact replacement through read-only SSH before reporting completion.

**NEVER**

- Never change product code, fleet configuration, model weights, remote files, remote services, or network state.
- Never replace the live SSH assertion with static output, a fixture, or a synthesized pass.

**STRICTLY**

- Writes are limited to this repair contract, the existing S33-OPS-01 task Markdown, and this task's evidence directory.

## Acceptance Criteria

### AC-1 — The weak non-asserting TC-2 verifier is removed

- **GIVEN** S33-OPS-01's embedded TC-2 verifier printed a file count without asserting the required absent state.
- **WHEN** the task contract is repaired.
- **THEN** the weak command is absent and both TC-2 representations use the exact fail-closed `test ! -e` verifier.
- **Verify:** `! rg -F "ssh inference1 'find ~/models/mlx-community/Qwen3.8-27B-8bit -type f 2>/dev/null | wc -l'" .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md`
- **Tier:** static · **Service:** task-contract · **Flow:** sprint governance

### TC-1 — The exact replacement verifier executes against live inference1

- **GIVEN** inference1's fail-closed path did not copy Qwen3.8-27B-8bit.
- **WHEN** the exact replacement TC-2 SSH assertion executes.
- **THEN** it exits 0 because the target path does not exist, and the evidence stream records the successful execution.
- **Verify:** `ssh inference1 'test ! -e ~/models/mlx-community/Qwen3.8-27B-8bit' && printf 'exact_tc2_verifier_exit=0\n'`
- **Tier:** integration · **Service:** inference1 SSH · **Flow:** sprint governance

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-01-TC2-VERIFY.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md
- .tmp/SPEC-REPAIR-S33-OPS-01-TC2-VERIFY/**

**WRITE-PROHIBITED**

- Every other repository path.
- All remote files, services, model directories, configuration, and network state.
- services/**, app/**, components/**, hooks/**, screens/**, lib/**, and assets/**.

## Verification Policy

- TDD mode: skipped.
- Tests required: no.
- RED evidence required: no.
- Seeded evidence required: no.
- Deterministic evidence harvesting and lineage validation remain required.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-01-TC2-VERIFY",
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
      "description": "The weak non-asserting S33-OPS-01 TC-2 verifier is absent from both task representations.",
      "verify": "! rg -F \"ssh inference1 'find ~/models/mlx-community/Qwen3.8-27B-8bit -type f 2>/dev/null | wc -l'\" .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "The exact replacement TC-2 verifier executes successfully against live inference1.",
      "verify": "ssh inference1 'test ! -e ~/models/mlx-community/Qwen3.8-27B-8bit' && printf 'exact_tc2_verifier_exit=0\\n'"
    }
  ]
}
-->
