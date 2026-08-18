# S33-OPS-04: Fix the fictional FLEET_URL example and prove the fleet dependency chain has zero laptop coupling

> Status: Backlog
> Assignee: devops-engineer
> Priority: P1
> Type: CONFIG
> Effort: S · 45 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: devops-engineer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-02, S33-OPS-03
> Blocks: —

## Outcome

Remove the last documentation drift (a fictional fleet hostname) from the deploy contract and provide a deterministic, inspectable, live-reconfirmed guarantee that the fleet-serving path has zero laptop dependency, so the sprint's human testing gate has nothing left to trip on from this lane.

**Success state:** production.env.example contains exactly `FLEET_URL=http://host.docker.internal:4545` and no reference to the fictional `inference-fleet` hostname; the real Docker Compose CLI renders the production contract with every required example-only secret variable supplied; config inspection finds zero laptop hostname or laptop-only IP references; and bounded direct curls to inference1:8003, inference2:8003, and holocron:4545 validate the exact nonempty model IDs while the two inference response bodies are proven non-byte-identical.

## Critical Constraints

**MUST**

- Replace the fictional `FLEET_URL=http://inference-fleet:4545/v1` placeholder in production.env.example with exactly `FLEET_URL=http://host.docker.internal:4545`, matching `services/platform/config/secrets.example.yaml` and intentionally omitting `/v1`.
- Prove — by config inspection AND live network calls from a real device other than holocron — that nothing in the fleet-serving path (router.compose.yaml, compose.yaml scheduler/mastra fleet vars) references the laptop's hostname, IP, or a loopback address that would only resolve on the laptop.
- Coordinate the corrected FLEET_URL value with S33-PLAT-01's services/platform/config/secrets.example.yaml so the two example files state the same value — different files, no edit collision, but they must agree.

**NEVER**

- Never claim a literal 'unplugged the laptop's Tailscale and it kept working' drill was executed from a single-device planning/implementation session — that specific cross-device drill belongs to the sprint's Human Testing Gate (kb-run-human-tests with a real second device), not this task.

## Acceptance Criteria

### AC-1 — production.env.example no longer names a fictional host

- **GIVEN** production.env.example line 6 currently reads FLEET_URL=http://inference-fleet:4545/v1, a hostname that resolves nowhere on the real tailnet.
- **WHEN** The line is corrected to the exact deployed-host default and the production Compose contract is rendered with non-secret example values for every required Compose secret input.
- **THEN** the fictional hostname search exits exactly 1, the corrected line occurs exactly once, and the actual `docker compose ... config --quiet` command exits 0.
- **Verify:** `{ if grep -RniF 'inference-fleet' services/platform/deploy/; then false; else test "$?" -eq 1; fi; } && test "$(grep -Fxc 'FLEET_URL=http://host.docker.internal:4545' services/platform/deploy/compose/production.env.example)" -eq 1 && env POSTGRES_PASSWORD=example DATABASE_URL=postgres://example:example@postgres:5432/holocron MASTRA_API_KEY=example FLEET_KEY=sk-none ZERO_ADMIN_PASSWORD=example docker compose --env-file services/platform/deploy/compose/production.env.example -f services/platform/deploy/compose/compose.yaml config --quiet`
- **Tier:** integration · **Service:** docker compose config render (real CLI, real files) · **Flow:** UC-PLAT-05
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: static

### AC-2 — Fleet-serving path is provably laptop-independent

- **GIVEN** router.compose.yaml (S33-OPS-02) and compose.yaml's scheduler/mastra fleet vars (S33-OPS-03) reference only inference1/inference2/holocron endpoints.
- **WHEN** Fail-closed config-absence checks run and bounded direct curls save each real host's response independently.
- **THEN** The config searches each exit exactly 1; inference1 advertises exactly the embedding and Qwen3.6 IDs; inference2 advertises those IDs plus Qwen3.8; Holocron advertises reviewer, implementer, and qwen3-embedding; and `cmp` exits exactly 1 for the two inference response files, proving the validated bodies are non-byte-identical rather than treating a comparison error as success.
- **Verify:** `{ if grep -rniF 'laptop' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test "$?" -eq 1; fi; } && { if grep -rniF '100.123.216.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test "$?" -eq 1; fi; } && probe_dir=$(mktemp -d) && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference1.tail011a51.ts.net:8003/v1/models -o "$probe_dir/inference1.json" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference2.tail011a51.ts.net:8003/v1/models -o "$probe_dir/inference2.json" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://holocron.tail011a51.ts.net:4545/v1/models -o "$probe_dir/holocron.json" && jq -e '[.data[].id] == ["Qwen3-Embedding-0.6B-4bit-DWQ","Qwen3.6-35B-A3B-MLX-8bit"]' "$probe_dir/inference1.json" >/dev/null && jq -e '[.data[].id] == ["Qwen3-Embedding-0.6B-4bit-DWQ","Qwen3.6-35B-A3B-MLX-8bit","Qwen3.8-27B-8bit"]' "$probe_dir/inference2.json" >/dev/null && jq -e '[.data[].id] == ["reviewer","implementer","qwen3-embedding"]' "$probe_dir/holocron.json" >/dev/null && { cmp -s "$probe_dir/inference1.json" "$probe_dir/inference2.json"; cmp_status=$?; test "$cmp_status" -eq 1; } && printf '%s\n' FLEET_CONFIG_NO_LAPTOP_REFERENCES INFERENCE1_MODELS_VALID INFERENCE2_MODELS_VALID HOLOCRON_ROUTER_MODELS_VALID INFERENCE_BODIES_NONIDENTICAL`
- **Tier:** integration · **Service:** real tailnet endpoints (inference1, inference2, holocron) · **Flow:** UC-PLAT-05
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | no fictional hostname remains, the exact FLEET_URL occurs once, and real Compose renders with all required example inputs | AC-1 | `{ if grep -RniF 'inference-fleet' services/platform/deploy/; then false; else test "$?" -eq 1; fi; } && test "$(grep -Fxc 'FLEET_URL=http://host.docker.internal:4545' services/platform/deploy/compose/production.env.example)" -eq 1 && env POSTGRES_PASSWORD=example DATABASE_URL=postgres://example:example@postgres:5432/holocron MASTRA_API_KEY=example FLEET_KEY=sk-none ZERO_ADMIN_PASSWORD=example docker compose --env-file services/platform/deploy/compose/production.env.example -f services/platform/deploy/compose/compose.yaml config --quiet` |
| TC-2 | fleet config has zero laptop references and all three direct model endpoints return the exact independent real model sets | AC-2 | `{ if grep -rniF 'laptop' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test "$?" -eq 1; fi; } && { if grep -rniF '100.123.216.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test "$?" -eq 1; fi; } && probe_dir=$(mktemp -d) && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference1.tail011a51.ts.net:8003/v1/models -o "$probe_dir/inference1.json" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference2.tail011a51.ts.net:8003/v1/models -o "$probe_dir/inference2.json" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://holocron.tail011a51.ts.net:4545/v1/models -o "$probe_dir/holocron.json" && jq -e '[.data[].id] == ["Qwen3-Embedding-0.6B-4bit-DWQ","Qwen3.6-35B-A3B-MLX-8bit"]' "$probe_dir/inference1.json" >/dev/null && jq -e '[.data[].id] == ["Qwen3-Embedding-0.6B-4bit-DWQ","Qwen3.6-35B-A3B-MLX-8bit","Qwen3.8-27B-8bit"]' "$probe_dir/inference2.json" >/dev/null && jq -e '[.data[].id] == ["reviewer","implementer","qwen3-embedding"]' "$probe_dir/holocron.json" >/dev/null && { cmp -s "$probe_dir/inference1.json" "$probe_dir/inference2.json"; cmp_status=$?; test "$cmp_status" -eq 1; } && printf '%s\n' FLEET_CONFIG_NO_LAPTOP_REFERENCES INFERENCE1_MODELS_VALID INFERENCE2_MODELS_VALID HOLOCRON_ROUTER_MODELS_VALID INFERENCE_BODIES_NONIDENTICAL` |

## Fixtures

**`fictional-hostname`** — The current placeholder that must not survive this task. _(seed: cli)_

- services/platform/deploy/compose/production.env.example:6 FLEET_URL=http://inference-fleet:4545/v1

## Reading List

- `services/platform/deploy/compose/production.env.example` (1-16) — the fictional FLEET_URL placeholder to fix

## Guardrails

**WRITE-ALLOWED**

- services/platform/deploy/compose/production.env.example (MODIFY)

**WRITE-PROHIBITED**

- services/platform/src/** - mastra-planner's lane
- services/platform/fleet/manifest.json - mastra-planner's lane
- services/platform/config/secrets.example.yaml - S33-PLAT-01's file, coordinate value only, do not edit

## Design

**Interaction notes**

- AC-2 kept as topology:multi-node after the reword-vs-downgrade test: its subject genuinely is device independence (no laptop proxying), so it earns the declaration honestly rather than by wording alone. Strengthened with a real assertion — inference1's and inference2's /v1/models response bodies are asserted NOT byte-identical, which only holds if they are two independently-running oMLX processes each reporting their own real state, not a single relayed/fixture response standing in for both.

**Pattern** — Documentation-drift correction plus deterministic config-grep + live-reachability proof

_Source:_ `services/platform/deploy/compose/README.md`

**Anti-pattern** — Fabricating a laptop-unplugged drill result from a single-device session instead of leaving that specific cross-device step to kb-run-human-tests

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| corrected example renders | `{ if grep -RniF 'inference-fleet' services/platform/deploy/; then false; else test "$?" -eq 1; fi; } && test "$(grep -Fxc 'FLEET_URL=http://host.docker.internal:4545' services/platform/deploy/compose/production.env.example)" -eq 1 && env POSTGRES_PASSWORD=example DATABASE_URL=postgres://example:example@postgres:5432/holocron MASTRA_API_KEY=example FLEET_KEY=sk-none ZERO_ADMIN_PASSWORD=example docker compose --env-file services/platform/deploy/compose/production.env.example -f services/platform/deploy/compose/compose.yaml config --quiet` | exit 0; no fictional host; exact value once; real Compose render succeeds |
| direct fleet endpoints are real and independent | `{ if grep -rniF 'laptop' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test "$?" -eq 1; fi; } && { if grep -rniF '100.123.216.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test "$?" -eq 1; fi; } && probe_dir=$(mktemp -d) && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference1.tail011a51.ts.net:8003/v1/models -o "$probe_dir/inference1.json" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference2.tail011a51.ts.net:8003/v1/models -o "$probe_dir/inference2.json" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://holocron.tail011a51.ts.net:4545/v1/models -o "$probe_dir/holocron.json" && jq -e '[.data[].id] == ["Qwen3-Embedding-0.6B-4bit-DWQ","Qwen3.6-35B-A3B-MLX-8bit"]' "$probe_dir/inference1.json" >/dev/null && jq -e '[.data[].id] == ["Qwen3-Embedding-0.6B-4bit-DWQ","Qwen3.6-35B-A3B-MLX-8bit","Qwen3.8-27B-8bit"]' "$probe_dir/inference2.json" >/dev/null && jq -e '[.data[].id] == ["reviewer","implementer","qwen3-embedding"]' "$probe_dir/holocron.json" >/dev/null && { cmp -s "$probe_dir/inference1.json" "$probe_dir/inference2.json"; cmp_status=$?; test "$cmp_status" -eq 1; } && printf '%s\n' FLEET_CONFIG_NO_LAPTOP_REFERENCES INFERENCE1_MODELS_VALID INFERENCE2_MODELS_VALID HOLOCRON_ROUTER_MODELS_VALID INFERENCE_BODIES_NONIDENTICAL` | exit 0; five exact sentinel lines; direct bounded responses; inference bodies differ with `cmp` status exactly 1 |

## Agent Assignment

**devops-engineer** — Deploy-contract example/documentation correction plus a config-grep + live-reachability topology proof is deployment-contract hygiene within devops-engineer's owned services/platform/deploy/** lane.

## Coding Standards

- Keep example/documentation files honest about what actually resolves — a fictional hostname in an .example file is a real operator trap.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-OPS-04",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "fictional-hostname": {
      "description": "The current placeholder that must not survive this task.",
      "seed_method": "cli",
      "records": [
        "services/platform/deploy/compose/production.env.example:6 FLEET_URL=http://inference-fleet:4545/v1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a fictional FLEET_URL placeholder WHEN it is corrected to the exact deployed-host default THEN the absence check exits exactly 1, the corrected value occurs once, and real Docker Compose renders with every required example input.",
      "verify": "{ if grep -RniF 'inference-fleet' services/platform/deploy/; then false; else test \"$?\" -eq 1; fi; } && test \"$(grep -Fxc 'FLEET_URL=http://host.docker.internal:4545' services/platform/deploy/compose/production.env.example)\" -eq 1 && env POSTGRES_PASSWORD=example DATABASE_URL=postgres://example:example@postgres:5432/holocron MASTRA_API_KEY=example FLEET_KEY=sk-none ZERO_ADMIN_PASSWORD=example docker compose --env-file services/platform/deploy/compose/production.env.example -f services/platform/deploy/compose/compose.yaml config --quiet",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "docker compose CLI",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fictional-hostname",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "edit production.env.example to the exact FLEET_URL=http://host.docker.internal:4545 line",
                "run the fail-closed fictional-host grep and real Docker Compose render with all required example inputs"
              ]
            },
            "end_state": {
              "must_observe": [
                "the fictional-host grep exits exactly 1 (no matches)",
                "production.env.example contains exactly one FLEET_URL=http://host.docker.internal:4545 line",
                "docker compose config --quiet exits 0 with POSTGRES_PASSWORD, DATABASE_URL, MASTRA_API_KEY, FLEET_KEY, and ZERO_ADMIN_PASSWORD supplied as example-only values"
              ],
              "must_not_observe": [
                "'inference-fleet' string present anywhere under services/platform/deploy/",
                "zero corrected FLEET_URL lines or an empty FLEET_URL value",
                "the negative grep exits with an error but is accepted as absence",
                "the corrected FLEET_URL contains /v1",
                "Compose is rendered without all five required example-only secret inputs"
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
      "description": "GIVEN the packaged router and platform wiring WHEN fail-closed config checks and bounded direct model requests execute THEN no laptop coupling exists, all three hosts expose their exact nonempty model IDs, and the two inference bodies are non-byte-identical.",
      "verify": "{ if grep -rniF 'laptop' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test \"$?\" -eq 1; fi; } && { if grep -rniF '100.123.216.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test \"$?\" -eq 1; fi; } && probe_dir=$(mktemp -d) && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference1.tail011a51.ts.net:8003/v1/models -o \"$probe_dir/inference1.json\" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference2.tail011a51.ts.net:8003/v1/models -o \"$probe_dir/inference2.json\" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://holocron.tail011a51.ts.net:4545/v1/models -o \"$probe_dir/holocron.json\" && jq -e '[.data[].id] == [\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\"]' \"$probe_dir/inference1.json\" >/dev/null && jq -e '[.data[].id] == [\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\",\"Qwen3.8-27B-8bit\"]' \"$probe_dir/inference2.json\" >/dev/null && jq -e '[.data[].id] == [\"reviewer\",\"implementer\",\"qwen3-embedding\"]' \"$probe_dir/holocron.json\" >/dev/null && { cmp -s \"$probe_dir/inference1.json\" \"$probe_dir/inference2.json\"; cmp_status=$?; test \"$cmp_status\" -eq 1; } && printf '%s\\n' FLEET_CONFIG_NO_LAPTOP_REFERENCES INFERENCE1_MODELS_VALID INFERENCE2_MODELS_VALID HOLOCRON_ROUTER_MODELS_VALID INFERENCE_BODIES_NONIDENTICAL",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "inference1:8003 + inference2:8003 + holocron:4545",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "a config grep exits 2 but is accepted as absence",
            "any direct endpoint is unavailable or omits an expected model ID",
            "the validated inference1 and inference2 response bodies are byte-identical"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fictional-hostname",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "run separate fail-closed literal searches for the laptop hostname and laptop-only address in the two fleet configuration files",
                "curl inference1:8003, inference2:8003, and holocron:4545 directly with bounded connection and total timeouts into separate response files",
                "validate each response's exact expected model ID array and require cmp to exit exactly 1 for the two inference files"
              ]
            },
            "end_state": {
              "must_observe": [
                "both config greps exit exactly 1 with no matches",
                "inference1 returns exactly Qwen3-Embedding-0.6B-4bit-DWQ and Qwen3.6-35B-A3B-MLX-8bit",
                "inference2 returns exactly Qwen3-Embedding-0.6B-4bit-DWQ, Qwen3.6-35B-A3B-MLX-8bit, and Qwen3.8-27B-8bit",
                "holocron returns exactly reviewer, implementer, and qwen3-embedding",
                "cmp exits exactly 1 for the validated inference1 and inference2 response files"
              ],
              "must_not_observe": [
                "any fleet-related config line referencing 'laptop.tail011a51.ts.net' or '100.123.216.92'",
                "a config grep error is treated as a successful absence check",
                "a curl has no connect or total timeout",
                "a response with an empty, partial, or unexpected model ID array passes",
                "inference1 and inference2 /v1/models responses are byte-identical",
                "cmp exit status 2 is treated as a successful non-identity result"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "no fictional hostname remains, the exact FLEET_URL occurs once, and real Compose renders with all required example inputs",
      "maps_to_ac": "AC-1",
      "verify": "{ if grep -RniF 'inference-fleet' services/platform/deploy/; then false; else test \"$?\" -eq 1; fi; } && test \"$(grep -Fxc 'FLEET_URL=http://host.docker.internal:4545' services/platform/deploy/compose/production.env.example)\" -eq 1 && env POSTGRES_PASSWORD=example DATABASE_URL=postgres://example:example@postgres:5432/holocron MASTRA_API_KEY=example FLEET_KEY=sk-none ZERO_ADMIN_PASSWORD=example docker compose --env-file services/platform/deploy/compose/production.env.example -f services/platform/deploy/compose/compose.yaml config --quiet"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "fleet config has zero laptop references and all three direct model endpoints return exact independent real model sets",
      "maps_to_ac": "AC-2",
      "verify": "{ if grep -rniF 'laptop' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test \"$?\" -eq 1; fi; } && { if grep -rniF '100.123.216.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml; then false; else test \"$?\" -eq 1; fi; } && probe_dir=$(mktemp -d) && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference1.tail011a51.ts.net:8003/v1/models -o \"$probe_dir/inference1.json\" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://inference2.tail011a51.ts.net:8003/v1/models -o \"$probe_dir/inference2.json\" && curl --fail --silent --show-error --connect-timeout 5 --max-time 20 http://holocron.tail011a51.ts.net:4545/v1/models -o \"$probe_dir/holocron.json\" && jq -e '[.data[].id] == [\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\"]' \"$probe_dir/inference1.json\" >/dev/null && jq -e '[.data[].id] == [\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\",\"Qwen3.8-27B-8bit\"]' \"$probe_dir/inference2.json\" >/dev/null && jq -e '[.data[].id] == [\"reviewer\",\"implementer\",\"qwen3-embedding\"]' \"$probe_dir/holocron.json\" >/dev/null && { cmp -s \"$probe_dir/inference1.json\" \"$probe_dir/inference2.json\"; cmp_status=$?; test \"$cmp_status\" -eq 1; } && printf '%s\\n' FLEET_CONFIG_NO_LAPTOP_REFERENCES INFERENCE1_MODELS_VALID INFERENCE2_MODELS_VALID HOLOCRON_ROUTER_MODELS_VALID INFERENCE_BODIES_NONIDENTICAL"
    }
  ]
}
-->
