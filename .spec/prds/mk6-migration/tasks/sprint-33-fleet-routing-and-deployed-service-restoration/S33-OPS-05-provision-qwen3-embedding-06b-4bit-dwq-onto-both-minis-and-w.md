# S33-OPS-05: Provision Qwen3-Embedding-0.6B-4bit-DWQ onto both minis and wire the embed role into the holocron router

> Status: ✅ Completed
> Cycle: 1
> Commit: 8c2ccf6de04a6084bd8ea2e00057de8ecbd99d75
> Reviewer: product-manager+code-reviewer
> Completed: 2026-08-17T23:01:54Z
> Assignee: devops-engineer
> Priority: P0
> Type: INFRA
> Effort: S · 75 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: devops-engineer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-02
> Blocks: —

## Outcome

Make the embed role resolvable from the holocron-hosted router with the laptop off the tailnet, closing the gap where 'a fleet that does not depend on the laptop' was false for embeddings.

**Success state:** GET :8003/v1/models on both inference1 and inference2 lists Qwen3-Embedding-0.6B-4bit-DWQ; POST http://holocron.tail011a51.ts.net:4545/v1/embeddings with model=qwen3-embedding returns a real 1024-dimension, non-zero vector served by one of the two real minis.

## Critical Constraints

**MUST**

- Provision the SAME real weight directory (~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ, 335 MB, 28 files, config.json sha256 e7dfa5b73fb2a03cbc8fb40c394e95b99f03348e237f7f28e7a1daf56a2169bb) onto BOTH inference1 and inference2 — no headroom gate needed at this size even at inference1's 42 GiB free.
- Add a qwen3-embedding model_list entry to router.compose.yaml (created by S33-OPS-02) pointing at both minis, weight=100, matching the litellmModelId already declared for the embed role in services/platform/fleet/manifest.json (read-only reference, not edited by this task).
- Prove the embed role actually works end-to-end through the real router: a live POST /v1/embeddings must return exactly 1024 dimensions (per manifest.json's embeddingDimension:1024) and a non-all-zero vector — a wrong-dimension or all-zero response is a failure, not a pass.
- Confirm via x-litellm-model-api-base (or equivalent) that the embedding was actually served by a real mini, not fabricated by the router container itself.

**NEVER**

- Do NOT provision or route qwen3-reranker — no reranker model exists anywhere on the fleet; it stays a recorded gap in SPRINT.md, not silently worked around.
- Never edit services/platform/fleet/manifest.json or any services/platform/src/** file.
- Never claim search/re-embedding works end-to-end through Mastra from this task alone — that still depends on mastra-planner's FLEET_URL-precedence fix (S33-PLAT-02), same caveat as S33-OPS-02.

## Acceptance Criteria

### AC-1 — Embed model provisions and serves on both minis

- **GIVEN** Neither inference1 nor inference2 currently has the embedding model resident (embed today is laptop-only per SPRINT.md ground truth).
- **WHEN** The real weight directory is rsynced from the laptop to both inference1 and inference2, and bash ~/start-omlx-node.sh is run on each.
- **THEN** GET :8003/v1/models on each mini includes id 'Qwen3-Embedding-0.6B-4bit-DWQ', with matching file count and config.json hash.
- **Verify:** `ssh inference1 'find ~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ -type f | wc -l && shasum -a 256 ~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ/config.json' && curl -sS http://inference1.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3-Embedding-0.6B-4bit-DWQ'; (repeat for inference2)`
- **Tier:** integration · **Service:** oMLX on inference1:8003 + inference2:8003 (real Mac minis) · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect, stub, empty

### AC-2 — Real embedding request through the holocron router returns a genuine 1024-dim vector from a real mini

- **GIVEN** router.compose.yaml (S33-OPS-02) is live on holocron; both minis now serve the embed model (AC-1).
- **WHEN** A qwen3-embedding model_list entry (both minis, weight=100) is added to router.compose.yaml and redeployed, then a real POST /v1/embeddings is sent through http://holocron.tail011a51.ts.net:4545.
- **THEN** The response's data[0].embedding array has exactly 1024 elements, is not all-zero, and the response's x-litellm-model-api-base header names a real mini (inference1 or inference2), not the router's own loopback.
- **Verify:** `curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/embeddings -H 'Content-Type: application/json' -d '{"model":"qwen3-embedding","input":"query: what is the capital of France?"}' | python3 -c "import json,sys; raw=sys.stdin.read(); body=raw.split('\r\n\r\n',1)[-1]; d=json.loads(body); v=d['data'][0]['embedding']; assert len(v)==1024 and any(abs(x)>0.0001 for x in v)"`
- **Tier:** integration · **Service:** holocron:4545 router -> real mini embed backend · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect, stub, empty

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | both minis serve the embed model after provisioning | AC-1 | `curl -sS http://inference1.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3-Embedding-0.6B-4bit-DWQ' && curl -sS http://inference2.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3-Embedding-0.6B-4bit-DWQ'` |
| TC-2 | a real embeddings call through the router returns a correctly-dimensioned, non-zero vector from a real mini | AC-2 | `curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/embeddings ... | assert len==1024 and non-zero and api-base is a real mini` |

## Fixtures

**`qwen3-embedding-source`** — Real, already-downloaded MLX embedding weight directory on the laptop: 28 files, 335 MB total, config.json sha256 e7dfa5b73fb2a03cbc8fb40c394e95b99f03348e237f7f28e7a1daf56a2169bb. Live-verified 2026-08-16 to produce a real 1024-dim non-zero vector via POST /v1/embeddings against the laptop's own oMLX :8003 (first value observed: -0.0225830078125). _(seed: cli)_

- path=/Users/justinrich/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ
- file_count=28
- config_json_sha256=e7dfa5b73fb2a03cbc8fb40c394e95b99f03348e237f7f28e7a1daf56a2169bb
- verified_dims=1024
- verified_all_zero=false

## Reading List

- `services/platform/fleet/manifest.json` (56-79) — embed role: litellmModelId qwen3-embedding, embeddingDimension 1024, degradationAction fail-closed — read-only, do not edit
- `services/platform/deploy/compose/router.compose.yaml` (all) — the file created by S33-OPS-02 that this task adds one model_list entry to
- `~/llm-router/config.yaml` (122-131) — existing laptop router's qwen3-embedding entry pattern to replicate

## Guardrails

**WRITE-ALLOWED**

- services/platform/deploy/compose/router.compose.yaml (MODIFY - add qwen3-embedding model_list entry only)

**WRITE-PROHIBITED**

- services/platform/fleet/manifest.json - mastra-planner's lane
- services/platform/src/** - mastra-planner's lane
- services/platform/deploy/compose/compose.yaml - out of scope for this task

## Design

**Interaction notes**

- Both ACs kept as topology:multi-node after the reword-vs-downgrade test. AC-1 mirrors S33-OPS-01's real cross-device pattern: config.json sha256 is verified on each mini's own filesystem over SSH against the laptop source's hash, on BOTH inference1 and inference2 independently. AC-2 was strengthened beyond wording: after identifying which mini's api-base the router names, the case SSHes into that exact device and asserts its own oMLX log gained a new line after the request — a fabricated or stubbed router response header naming a mini would not produce a corresponding new log line on that real device.

**Pattern** — Same rsync + idempotent oMLX restart pattern as S33-OPS-01, plus a single additional router model_list entry

_Source:_ `~/models/DEVICES.md:60-95`

**Anti-pattern** — Leaving embed silently laptop-only, which contradicts this sprint's stated premise of a fleet that does not depend on the laptop

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| both minis serve embed model | `curl -sS http://inference1.tail011a51.ts.net:8003/v1/models && curl -sS http://inference2.tail011a51.ts.net:8003/v1/models` | both responses contain id 'Qwen3-Embedding-0.6B-4bit-DWQ' |
| real embeddings call through router | `curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/embeddings -d '{"model":"qwen3-embedding","input":"test"}'` | 1024-length non-zero vector, x-litellm-model-api-base names a real mini |

## Agent Assignment

**devops-engineer** — Small-model provisioning onto both real minis plus a router model_list edit is the same infra/deployment pattern as S33-OPS-01/02 — devops-engineer's lane. Closes a real gap: without this, 'a fleet that does not depend on the laptop' (this sprint's stated premise) is false for the embed role.

## Coding Standards

- Never fabricate embedding dimensions or vector content — the manifest declares an exact contract (1024-d) and a wrong-shape response is a real failure.
- Do not add reranker provisioning under cover of this task — it is explicitly out of scope and a recorded gap.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-OPS-05",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "qwen3-embedding-source": {
      "description": "Real, already-downloaded MLX embedding weight directory on the laptop: 28 files, 335 MB total, config.json sha256 e7dfa5b73fb2a03cbc8fb40c394e95b99f03348e237f7f28e7a1daf56a2169bb. Live-verified 2026-08-16 to produce a real 1024-dim non-zero vector via POST /v1/embeddings against the laptop's own oMLX :8003 (first value observed: -0.0225830078125).",
      "seed_method": "cli",
      "records": [
        "path=/Users/justinrich/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ",
        "file_count=28",
        "config_json_sha256=e7dfa5b73fb2a03cbc8fb40c394e95b99f03348e237f7f28e7a1daf56a2169bb",
        "verified_dims=1024",
        "verified_all_zero=false"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN neither mini has the embed model WHEN it is rsynced to both and oMLX restarted THEN both list it via /v1/models",
      "verify": "curl -sS http://inference1.tail011a51.ts.net:8003/v1/models | grep -q 'Qwen3-Embedding-0.6B-4bit-DWQ'",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "oMLX on inference1:8003 + inference2:8003 (real Mac minis)",
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
            "start_ref": "qwen3-embedding-source",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "rsync -avz -e ssh /Users/justinrich/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ/ inference1:~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ/   # writes real files across two devices: the laptop source and inference1 as the first target",
                "rsync -avz -e ssh /Users/justinrich/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ/ inference2:~/models/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ/   # and again to inference2, the second target device, independently",
                "ssh inference1 'bash ~/start-omlx-node.sh'   # each device's own oMLX process is what will answer /v1/models below, not a shared fixture",
                "ssh inference2 'bash ~/start-omlx-node.sh'"
              ]
            },
            "end_state": {
              "must_observe": [
                "inference1 v1/models response contains id 'Qwen3-Embedding-0.6B-4bit-DWQ'",
                "inference2 v1/models response contains id 'Qwen3-Embedding-0.6B-4bit-DWQ'",
                "file_count=28 on both inference1 and inference2",
                "config.json sha256 == e7dfa5b73fb2a03cbc8fb40c394e95b99f03348e237f7f28e7a1daf56a2169bb on both minis"
              ],
              "must_not_observe": [
                "inference1 /v1/models returns 0 entries matching 'Qwen3-Embedding-0.6B-4bit-DWQ' (pre-copy state)",
                "inference2 /v1/models returns 0 entries matching 'Qwen3-Embedding-0.6B-4bit-DWQ' (pre-copy state)"
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
      "description": "GIVEN the router is wired for embed WHEN a real embeddings request is sent THEN it returns a correct-dimension non-zero vector served by a real mini",
      "verify": "curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/embeddings ...",
      "scenario": {
        "id": "AC-2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holocron:4545 router -> real mini embed backend",
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
            "start_ref": "qwen3-embedding-source",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "add a qwen3-embedding model_list entry (both minis, weight=100) to services/platform/deploy/compose/router.compose.yaml and redeploy the router on holocron",
                "curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/embeddings -H 'Content-Type: application/json' -d '{\"model\":\"qwen3-embedding\",\"input\":\"query: what is the capital of France?\"}'",
                "note which of the two devices (inference1 or inference2) the x-litellm-model-api-base header names, then ssh into that exact device and tail its own oMLX log \u2014 a second real device corroborating the router's claim through its own entrypoint, not just trusting the response header"
              ]
            },
            "end_state": {
              "must_observe": [
                "response 'data'[0].embedding array length == 1024",
                "at least one embedding value has absolute magnitude > 0.0001 (non-zero vector; laptop source model produced -0.0225830078125 as its first value)",
                "x-litellm-model-api-base header equals 'http://inference1.tail011a51.ts.net:8003/v1' or 'http://inference2.tail011a51.ts.net:8003/v1'",
                "the named device's own oMLX log (~/local-llm/logs/omlx-mini-8003.log, read via SSH directly on that device) shows a new line appended after the request was sent"
              ],
              "must_not_observe": [
                "embedding array length == 0",
                "all 1024 values equal 0.0 (degenerate all-zero vector)",
                "x-litellm-model-api-base header absent or pointing to 127.0.0.1 (laptop loopback, not a real mini)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "both minis serve embed model",
      "maps_to_ac": "AC-1",
      "verify": "curl -sS http://inference1.tail011a51.ts.net:8003/v1/models | grep -q Qwen3-Embedding"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "real embeddings call succeeds with correct shape",
      "maps_to_ac": "AC-2",
      "verify": "curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/embeddings ..."
    }
  ]
}
-->
