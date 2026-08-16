# SPEC-REPAIR-S33-OPS-01-VERIFY: Replace the S33-OPS-01 AC-2 pseudo verifier and prove the live replacement

> Status: ✅ Completed
> Cycle: 1
> Commit: 02104b1b124e3d8bd33368b85171866674f5fd54
> Reviewer: product-manager+code-reviewer
> Completed: 2026-08-16T23:33:17Z
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 30 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: technical-reviewer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-01
> Blocks: S33-OPS-01 review

## Outcome

Replace the non-executable S33-OPS-01 AC-2 pseudo verifier in both task representations with one shell-valid, fail-closed command, then prove that exact command executes successfully against the preserved blocker artifact and live inference1 state.

**Success state:** the obsolete pseudo command is absent from the S33-OPS-01 task, its prose and REQUIREMENT-CONTRACT AC-2 verifiers decode to the same executable command, and that command exits 0 only while the recorded insufficient-headroom blocker agrees with inference1's live below-threshold disk, absent Qwen3.8 target directory, and unchanged Qwen3.6-only model list.

## Scope

**MUST**

- Keep the S33-OPS-01 prose AC-2 verifier and REQUIREMENT-CONTRACT AC-2 verify value byte-equivalent after JSON decoding.
- Preserve the original 44 GiB admission threshold, fail-closed no-copy behavior, incumbent-model identity, and blocker-artifact checks.
- Execute the exact replacement command against the preserved S33-OPS-01 evidence and live inference1 before reporting completion.

**NEVER**

- Never change product code, fleet configuration, model weights, remote files, or remote service state.
- Never weaken the verifier to a static string check alone; the live/evidence execution requirement remains independently blocking.
- Never synthesize a blocker artifact or replace the live SSH/HTTP reads with fixtures.

**STRICTLY**

- This repair is task-contract-only. Read-only SSH and HTTP verification is allowed; remote mutation is prohibited.

## Acceptance Criteria

### AC-1 — The obsolete AC-2 pseudo verifier is removed

- **GIVEN** S33-OPS-01 declared a prose-like REQUIREMENT-CONTRACT verifier that the deterministic harvester executed as invalid shell arguments.
- **WHEN** the task contract is repaired.
- **THEN** the obsolete pseudo command is absent from the S33-OPS-01 task while the prose and embedded JSON representations contain the replacement.
- **Verify:** `! rg -F "ssh inference1 'df -k /' before/after diff + curl :8003/v1/models diff" .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md`
- **Tier:** static · **Service:** task-contract · **Flow:** sprint governance

### TC-1 — The exact replacement verifier executes against real evidence and live inference1

- **GIVEN** the preserved S33-OPS-01 worktree contains the recorded insufficient-headroom blocker artifact.
- **WHEN** the exact replacement AC-2 verifier is run from that worktree.
- **THEN** it exits 0 only after validating the blocker, live below-44-GiB disk state, absent Qwen3.8 target directory, and exact Qwen3.6-only /v1/models response.
- **Verify:** `cd /Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-01 && { blocker=.tmp/S33-OPS-01/S33-OPS-01-inference1-blocker.json; test -f "$blocker" && jq -e '.task_id == "S33-OPS-01" and .status == "blocked_insufficient_headroom" and .reason == "inference1 live free disk is below the 44 GiB provisioning threshold" and .threshold_gib == 44 and .threshold_kb == 46137344 and .measured_free_gib_before < .threshold_gib and .measured_free_gib_after < .threshold_gib and .measured_free_kb_before < .threshold_kb and .measured_free_kb_after < .threshold_kb and .measured_free_kb_after == (.measured_free_kb_before + .disk_free_kb_delta) and .disk_free_kb_delta >= -2048 and .disk_free_kb_delta <= 2048 and .copy_attempted == false and .model_ids_before == ["Qwen3.6-35B-A3B-MLX-8bit"] and .model_ids_after == .model_ids_before and .qwen38_file_count_before == 0 and .qwen38_file_count_after == 0' "$blocker" >/dev/null && live_free_kb=$(ssh inference1 'df -k / | awk "NR==2{print \$4}"') && test "$live_free_kb" -lt 46137344 && ssh inference1 'test ! -e ~/models/mlx-community/Qwen3.8-27B-8bit' && curl -fsS http://inference1.tail011a51.ts.net:8003/v1/models | jq -e '[.data[].id] == ["Qwen3.6-35B-A3B-MLX-8bit"]' >/dev/null; } && printf 'exact_replacement_verifier_exit=0\n'`
- **Tier:** integration · **Service:** preserved S33-OPS-01 evidence + inference1 SSH/oMLX · **Flow:** sprint governance

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-01-VERIFY.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md
- .tmp/SPEC-REPAIR-S33-OPS-01-VERIFY/**

**WRITE-PROHIBITED**

- Every other repository path.
- All remote files, services, model directories, and configuration on inference1, inference2, and the deployed Holocron host.
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
  "task_id": "SPEC-REPAIR-S33-OPS-01-VERIFY",
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
      "description": "The obsolete S33-OPS-01 AC-2 pseudo verifier is absent from the task contract.",
      "verify": "! rg -F \"ssh inference1 'df -k /' before/after diff + curl :8003/v1/models diff\" .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "The exact replacement AC-2 verifier executes successfully against the preserved blocker artifact and live inference1 state.",
      "verify": "cd /Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-01 && { blocker=.tmp/S33-OPS-01/S33-OPS-01-inference1-blocker.json; test -f \"$blocker\" && jq -e '.task_id == \"S33-OPS-01\" and .status == \"blocked_insufficient_headroom\" and .reason == \"inference1 live free disk is below the 44 GiB provisioning threshold\" and .threshold_gib == 44 and .threshold_kb == 46137344 and .measured_free_gib_before < .threshold_gib and .measured_free_gib_after < .threshold_gib and .measured_free_kb_before < .threshold_kb and .measured_free_kb_after < .threshold_kb and .measured_free_kb_after == (.measured_free_kb_before + .disk_free_kb_delta) and .disk_free_kb_delta >= -2048 and .disk_free_kb_delta <= 2048 and .copy_attempted == false and .model_ids_before == [\"Qwen3.6-35B-A3B-MLX-8bit\"] and .model_ids_after == .model_ids_before and .qwen38_file_count_before == 0 and .qwen38_file_count_after == 0' \"$blocker\" >/dev/null && live_free_kb=$(ssh inference1 'df -k / | awk \"NR==2{print \\$4}\"') && test \"$live_free_kb\" -lt 46137344 && ssh inference1 'test ! -e ~/models/mlx-community/Qwen3.8-27B-8bit' && curl -fsS http://inference1.tail011a51.ts.net:8003/v1/models | jq -e '[.data[].id] == [\"Qwen3.6-35B-A3B-MLX-8bit\"]' >/dev/null; } && printf 'exact_replacement_verifier_exit=0\\n'"
    }
  ]
}
-->
