# S33-OPS-01: Provision Qwen3.8-27B-8bit onto inference2 and inference1 (disk-headroom-gated) and verify oMLX serves it

> Status: 🔴 Needs Fixes
> Commit: a26b428acfbb6ad867d8e8894530fefa7d4bceca
> Fix: SPEC-REPAIR-S33-OPS-01-VERIFY
> Updated: 2026-08-16T22:58:56Z
> Assignee: devops-engineer
> Priority: P0
> Type: INFRA
> Effort: M · 150 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: devops-engineer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: —
> Blocks: S33-OPS-02

## Outcome

Get the real Qwen3.8-27B-8bit MLX weights resident and served by oMLX on inference2 unconditionally, and on inference1 only if live disk headroom allows it safely — proven by a real GET /v1/models on each mini, never a synthesized pass.

**Success state:** GET http://inference2.tail011a51.ts.net:8003/v1/models lists id 'Qwen3.8-27B-8bit'. On inference1, either the same is true AND >=15 GiB free disk remains, OR a recorded blocker documents the measured free-disk shortfall and inference1's disk/model-list are provably unchanged from before the attempt.

## Critical Constraints

**MUST**

- Re-measure LIVE free disk on the target mini immediately before copying — never trust a stale/planning-time number.
- On inference1, require post-copy free disk to remain >= 15 GiB (safety margin for oMLX SSD paged cache); this requires >= 44 GiB free measured BEFORE the 28 GB copy (28 + 15 + 1 GiB slack).
- Verify the copied model is actually discoverable and servable via a live GET :8003/v1/models call on that exact mini after restarting oMLX — a copied-but-unserved directory does not satisfy this task.
- Use the existing idempotent restart pattern `bash ~/start-omlx-node.sh` (per ~/models/DEVICES.md) — do not hand-roll a new oMLX launch mechanism.

**NEVER**

- Never copy the model to inference1 without the live headroom re-check passing first.
- Never delete, evict, or move any other file on either mini to force room for this model.
- Never report inference1 as serving the role if the headroom gate failed — record an honest blocker with the measured GiB numbers instead.
- Never edit services/platform/fleet/manifest.json or any services/platform/src/** file — role-name/manifest wiring is mastra-planner's lane.

**STRICTLY**

- Source of truth for the weights is the laptop's existing ~/models/mlx-community/Qwen3.8-27B-8bit (already downloaded, config.json sha256 8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d) — do not re-download from HuggingFace on the minis.

## Acceptance Criteria

### AC-1 — inference2 provisions and serves the model

- **GIVEN** inference2 has 269 GiB free disk (live-verified 2026-08-16) and its oMLX :8003 currently lists only Qwen3.6-35B-A3B-MLX-8bit.
- **WHEN** The real weight directory is rsynced from the laptop to inference2:~/models/mlx-community/Qwen3.8-27B-8bit and `bash ~/start-omlx-node.sh` is run on inference2.
- **THEN** GET http://inference2.tail011a51.ts.net:8003/v1/models includes id 'Qwen3.8-27B-8bit', the directory holds 40 files, and config.json's sha256 matches the source.
- **Verify:** `ssh inference2 'find ~/models/mlx-community/Qwen3.8-27B-8bit -type f | wc -l && shasum -a 256 ~/models/mlx-community/Qwen3.8-27B-8bit/config.json' && curl -sS http://inference2.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3.8-27B-8bit'`
- **Tier:** integration · **Service:** oMLX on inference2:8003 (real Mac mini) · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect, stub, empty

### AC-2 — inference1 provisions only under a real, live disk-headroom gate

- **GIVEN** inference1 has 42 GiB free disk (live-verified 2026-08-16), below the 44 GiB threshold (28 GB model + 15 GiB safety margin + 1 GiB slack) required to safely fit the model.
- **WHEN** The provisioning script re-measures live free disk on inference1 immediately before acting via `df -k /`.
- **THEN** If measured free >= 44 GiB: the copy proceeds, oMLX restarts, and GET :8003/v1/models on inference1 includes 'Qwen3.8-27B-8bit' with >=15 GiB free remaining. If measured free < 44 GiB (the current live state): no copy is attempted, inference1's free-disk bytes are unchanged before/after, its /v1/models list is unchanged (still only Qwen3.6-35B-A3B-MLX-8bit), and a blocker artifact records the measured shortfall in GiB.
- **Verify:** `ssh inference1 'df -k / | awk "NR==2{print \$4}"' before and after the attempt, plus curl http://inference1.tail011a51.ts.net:8003/v1/models before and after`
- **Tier:** integration · **Service:** oMLX on inference1:8003 + live disk-capacity gate (real Mac mini) · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `file_artifact` · negative control: stub, static

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | inference2 GET /v1/models lists Qwen3.8-27B-8bit after provisioning | AC-1 | `curl -sS http://inference2.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3.8-27B-8bit'` |
| TC-2 | inference1 never receives a partial copy when live headroom is below 44 GiB | AC-2 | `ssh inference1 'test ! -d ~/models/mlx-community/Qwen3.8-27B-8bit || find ~/models/mlx-community/Qwen3.8-27B-8bit -type f | wc -l | grep -q ^40$'` |


## Remediation Trail
| Cycle | FIX | Failed Reqs | Reviewer | At |
|-------|-----|-------------|----------|----|
| — | SPEC-REPAIR-S33-OPS-01-VERIFY | — | — | 2026-08-16T22:58:56Z |
## Fixtures

**`qwen38-27b-8bit-source`** — Real, already-downloaded MLX weight directory on the laptop: 6 safetensors shards (~27.5 GiB), config.json sha256 8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d, 40 files total. _(seed: cli)_

- path=/Users/justinrich/models/mlx-community/Qwen3.8-27B-8bit
- file_count=40
- config_json_sha256=8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d

## Reading List

- `~/models/DEVICES.md` (60-95) — SSH aliases + oMLX restart command for inference1/inference2
- `~/models/FLEET-SPEC.md` (1-60) — model directory layout convention (publisher/repo) and oMLX multi-model discovery
- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPRINT.md` (52-65) — live disk-headroom ground truth table

## Guardrails

**WRITE-ALLOWED**

- .tmp/sprint-33/S33-OPS-01-*.json (NEW evidence/blocker artifacts)
- ~/models/mlx-community/Qwen3.8-27B-8bit on inference1/inference2 (NEW, remote hosts, not repo-tracked)

**WRITE-PROHIBITED**

- services/platform/src/** - application code owned by mastra-planner
- services/platform/fleet/manifest.json - role/manifest wiring owned by mastra-planner

## Design

**Interaction notes**

- Both ACs kept as topology:multi-node (not downgraded) after applying the reword-vs-downgrade test: each has a real cross-device property backed by a load-bearing assertion, not decorative wording. AC-1: config.json sha256 is computed on inference2 itself over SSH and compared against the laptop source's hash — a fixture or stub could not produce that exact match without the real file bytes having actually transited to that device. AC-2: inference1's live free-disk bytes (df -k / over SSH) and the presence/absence of the blocker artifact are facts sourced from inference1's own real state at execution time, not fixable from the orchestrator side.

**Pattern** — rsync + idempotent oMLX restart, matching the existing implementer-model provisioning pattern

_Source:_ `~/models/DEVICES.md:60-95`

**Anti-pattern** — Assuming disk headroom from stale PRD ground truth instead of re-measuring live at execution time

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| inference2 serves new model | `curl -sS http://inference2.tail011a51.ts.net:8003/v1/models` | response contains id 'Qwen3.8-27B-8bit' |
| inference1 headroom gate is honest | `ssh inference1 'df -k /'` | free bytes unchanged from pre-attempt measurement if threshold not met |

## Agent Assignment

**devops-engineer** — Real SCP/rsync file provisioning onto two remote Mac minis over SSH plus oMLX service-restart verification is infrastructure/deployment work, not application code — squarely devops-engineer's lane (model provisioning + disk-headroom safety per the sprint charter).

## Coding Standards

- Never fabricate a passing state for a capacity gate that actually failed (Unforgivable Stubbing Rule).
- Use the fleet's existing idempotent scripts (~/models/scripts/*) rather than ad hoc commands.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-OPS-01",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "qwen38-27b-8bit-source": {
      "description": "Real, already-downloaded MLX weight directory on the laptop: 6 safetensors shards (~27.5 GiB), config.json sha256 8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d, 40 files total.",
      "seed_method": "cli",
      "records": [
        "path=/Users/justinrich/models/mlx-community/Qwen3.8-27B-8bit",
        "file_count=40",
        "config_json_sha256=8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN inference2 lacks the model WHEN it is rsynced and oMLX restarted THEN GET /v1/models lists it with a verified file count and hash",
      "verify": "curl -sS http://inference2.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3.8-27B-8bit'",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX on inference2:8003",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "qwen38-27b-8bit-source",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "rsync -avz -e ssh /Users/justinrich/models/mlx-community/Qwen3.8-27B-8bit/ inference2:~/models/mlx-community/Qwen3.8-27B-8bit/   # writes real files across two devices: the laptop as source, inference2 as target",
                "ssh inference2 'bash ~/start-omlx-node.sh'   # then reads the result back from inference2's own /v1/models entrypoint, its own real service, not a fixture"
              ]
            },
            "end_state": {
              "must_observe": [
                "v1/models response contains id 'Qwen3.8-27B-8bit'",
                "file_count=40 on inference2",
                "config.json sha256 == 8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d"
              ],
              "must_not_observe": [
                "v1/models response containing only 'Qwen3.6-35B-A3B-MLX-8bit' (the pre-copy state)",
                "inference2 /v1/models returns 0 entries matching 'Qwen3.8-27B-8bit'"
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
      "description": "GIVEN inference1's live headroom is below the safety threshold WHEN provisioning is attempted THEN it fails closed with a recorded blocker and zero disk delta (or succeeds if headroom is actually sufficient)",
      "verify": "ssh inference1 'df -k /' before/after diff + curl :8003/v1/models diff",
      "scenario": {
        "id": "AC-2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX on inference1:8003",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "qwen38-27b-8bit-source",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "ssh inference1 df -k /   # measures live state on a second device \u2014 inference1's own real disk, read through its own SSH entrypoint, not a fixture",
                "compute free_gib = free_kb / 1024 / 1024; compare against 44 GiB threshold",
                "IF free_gib < 44: write .tmp/sprint-33/S33-OPS-01-inference1-blocker.json with measured free_gib, threshold, and 'insufficient headroom' status; do NOT rsync",
                "IF free_gib >= 44: rsync real files across two devices (laptop source, inference1 target) and run bash ~/start-omlx-node.sh on inference1"
              ]
            },
            "end_state": {
              "must_observe": [
                "given today's live 42 GiB reading: .tmp/sprint-33/S33-OPS-01-inference1-blocker.json exists recording free_gib=~42 and threshold_gib=44",
                "inference1 free-disk bytes identical before/after (within df's rounding)",
                "inference1 /v1/models unchanged: contains only 'Qwen3.6-35B-A3B-MLX-8bit'"
              ],
              "must_not_observe": [
                "a partial/incomplete Qwen3.8-27B-8bit directory left on inference1's disk",
                "inference1 reported as serving the role while the blocker file also exists (contradictory state)",
                "inference1 /v1/models returns 0 entries matching 'Qwen3.6-35B-A3B-MLX-8bit' (would mean the pre-existing model vanished)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "inference2 serves the new model",
      "maps_to_ac": "AC-1",
      "verify": "curl -sS http://inference2.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3.8-27B-8bit'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "inference1 never left with a partial write",
      "maps_to_ac": "AC-2",
      "verify": "ssh inference1 'find ~/models/mlx-community/Qwen3.8-27B-8bit -type f 2>/dev/null | wc -l'"
    }
  ]
}
-->
