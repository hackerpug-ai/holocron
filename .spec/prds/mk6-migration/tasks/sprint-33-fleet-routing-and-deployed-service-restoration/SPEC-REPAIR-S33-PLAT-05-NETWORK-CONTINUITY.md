# SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY: Replace disconnect proof with exact deployed-topology proof

> Status: Backlog
> Assignee: mastra-planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 45 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-PLAT-05
> Blocks: S33-PLAT-05 dispatch until its network-continuity conflict is removed

## Outcome

Repair S33-PLAT-05 so it proves the same product claim — a deployed public chat turn's tokens were generated on `inference1` or `inference2` with no laptop serving dependency — without disconnecting or reconfiguring any network, host, container, router, or model server.

**Success state:** the repaired task is machine-extractable and scenario-valid. The future positive path issues the deployed API turn from `inference1`, reads a bounded request window independently from both minis, correlates the exactly-one serving mini with `x-litellm-model-api-base` and telemetry, proves `cloudRequests===0`, and reads the running router's effective config through exact `ssh holocron@holocron`. Its two `implementer` rows are exactly the confirmed inference1/inference2 mini URLs and model. Missing-mini and forbidden-backend controls fail closed without runtime mutation. No literal disconnect is performed or claimed.

## Critical Constraints

**MUST**

- Preserve the deployed public chat turn, bounded request window, nonce, two independent mini log reads, exactly-one-mini attribution, header/telemetry correlation, `fleetRequests>=1`, `cloudRequests===0`, and nonempty assistant text.
- Replace the forbidden disconnect precondition with deterministic proof: execute the request from stable alias `inference1`, then inspect the running router's effective `/etc/litellm/config.yaml` read-only through exact identity `holocron@holocron`.
- Require exactly one running container labeled `com.docker.compose.project=holocron-router` and `com.docker.compose.service=litellm-router`; require exactly two `implementer` records, both model `openai/Qwen3.6-35B-A3B-MLX-8bit`, whose unique `api_base` set equals the exact inference1/inference2 URLs.
- Reject every serving backend outside the exact two-mini allowlist. `host.docker.internal:4545` is valid only as router ingress in deployed telemetry, never as an `implementer` backend.
- Keep `no-mini-evidence` and add `forbidden-backend`; each requirement `verify` must exit zero only after the underlying verifier exits nonzero with its exact error and fail-closed assertions.
- Keep human AC/TC commands and embedded REQUIREMENT-CONTRACT commands byte-equivalent after JSON decoding; every command must parse under `bash -n`.

**NEVER**

- Never stop, restart, deploy, reconfigure, or write through a service, router, model server, container config, Tailscale state, Wi-Fi setting, interface, route, DNS setting, or host network configuration.
- Never call live services, SSH to a host, write evidence/state, or execute future runtime verifiers while performing this planning-only repair.
- Never claim the laptop was disconnected. The proof is the independent request origin, exact deployed backend allowlist, and matching mini-owned log/header/telemetry evidence.
- Never expand the implementation WRITE-ALLOWED set beyond its existing verifier, telemetry endpoint recording, fleet-request accounting, and focused integration test.

**STRICTLY**

- Repository writes are limited to the two planning files under WRITE-ALLOWED.

## Acceptance Criteria

### AC-1 — S33-PLAT-05 carries one executable, fail-closed, network-safe contract

- **GIVEN** the original task required a literal laptop tailnet disconnect that conflicts with Network Continuity.
- **WHEN** its prose, scenarios, test table, verification gates, fixtures, guardrails, and embedded REQUIREMENT-CONTRACT are repaired.
- **THEN** stable IDs `AC-1..AC-3` and `TC-1..TC-5` remain; `AC-4`, `TC-6`, and `TC-7` cover exact deployed topology and forbidden-backend failure; human/embedded verifiers match and parse; canonical validation passes four scenarios; stale disconnect operations are absent; and implementation WRITE-ALLOWED is unchanged.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; ms=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; c=json.loads(ms[0]); req={r["id"]:r for r in c["requirements"]}; ids=["AC-1","AC-2","AC-3","AC-4","TC-1","TC-2","TC-3","TC-4","TC-5","TC-6","TC-7"]; assert list(req)==ids; human_ac=dict(re.findall(r"^### (AC-\d+) [^\n]*\n(?:(?!^### |^## )[\s\S])*?^- \*\*Verify:\*\* `(.*?)`$",t,re.M)); table={i:v for i,v in re.findall(r"^\| (TC-\d+) \|.*?\| AC-\d+ \| `(.*?)` \|$",t,re.M)}; assert list(human_ac)==ids[:4] and list(table)==ids[4:]; assert all(human_ac[i]==req[i]["verify"] for i in human_ac) and all(table[i]==req[i]["verify"] for i in table); assert req["AC-1"]["verify"]==req["TC-1"]["verify"]==req["TC-2"]["verify"]==req["TC-6"]["verify"]; assert req["AC-2"]["verify"]==req["TC-3"]["verify"] and req["AC-3"]["verify"]==req["TC-4"]["verify"]==req["TC-5"]["verify"] and req["AC-4"]["verify"]==req["TC-7"]["verify"]; assert req["AC-2"]["verify"].startswith("set -o pipefail;") and "S33_MINI_NEGATIVE=no-mini-evidence" in req["AC-2"]["verify"] and "MINI_EVIDENCE_UNAVAILABLE" in req["AC-2"]["verify"]; assert req["AC-4"]["verify"].startswith("set -o pipefail;") and "S33_MINI_NEGATIVE=forbidden-backend" in req["AC-4"]["verify"] and "LAPTOP_DEPENDENCY_DETECTED" in req["AC-4"]["verify"] and ".chat_request_issued == false" in req["AC-4"]["verify"] and ".effective_config_sha256_before == .effective_config_sha256_after" in req["AC-4"]["verify"]; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; assert not [s for s in ["tailscale down","laptop_off_tailnet","with the laptop off the tailnet"] if s.lower() in t.lower()]; required=["holocron@holocron","com.docker.compose.project=holocron-router","com.docker.compose.service=litellm-router","http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1","openai/Qwen3.6-35B-A3B-MLX-8bit","network_mutation_performed=false","literal_disconnect_claimed=false"]; assert not [s for s in required if s not in t]; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==["- scripts/verify-s33-mini-served-turn.sh (NEW)","- services/platform/src/inference/telemetry.ts (MODIFY — endpoint recording only)","- services/platform/src/compat/cells/agent.ts (MODIFY — fleet-request accounting only; unowned by any other S33 lane, and its hardcoded loopback match would otherwise invalidate AC-3)","- services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts (NEW)"]; v=subprocess.run(["python3","/Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"],input=json.dumps(c).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE); assert v.returncode==0,(v.stdout+v.stderr).decode(); assert json.loads(v.stdout)=={"ok":True,"scenario_count":4,"violations":[]}; print(json.dumps({"ok":True,"task":c["task_id"],"requirement_count":len(ids),"scenario_count":4,"network_mutation_count":0}))' "$task"`
- **Tier:** static · **Service:** task-contract parser + Bash grammar + canonical Scenario Contract validator · **Flow:** sprint governance

## Test Criteria

### TC-1 — The repair task is uniquely extractable, shell-valid, and scenario-valid

- **GIVEN** this file has one outer REQUIREMENT-CONTRACT with `AC-1` and `TC-1`.
- **WHEN** the contract is parsed, both verifier strings are checked with `bash -n`, and canonical scenario validation runs.
- **THEN** `requires_tests=true`, the IDs are exact, both static verifiers parse, and validation returns one scenario with zero violations.
- **Verify:** `repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; ms=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; c=json.loads(ms[0]); assert c["task_id"]=="SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY" and c["verification_policy"]=={"requires_tests":True,"requires_red_evidence":False,"requires_seeded_evidence":False,"tdd_lineage_required":False}; assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1"]; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; print(json.dumps(c))' "$repair" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
- **Tier:** static · **Service:** REQUIREMENT-CONTRACT parser + canonical Scenario Contract validator · **Flow:** sprint governance

## Scenario Validation

- **Positive:** normal mode reads the live effective config and requires both exact mini implementer backends before chat from inference1.
- **Negative — topology:** `forbidden-backend` adds one forbidden backend only to an in-memory copy, then its wrapper exits zero only after `LAPTOP_DEPENDENCY_DETECTED`, no chat, and unchanged live-config hash are proven.
- **Negative — attribution:** `no-mini-evidence` suppresses both read results only inside the verifier, then its wrapper exits zero only after `MINI_EVIDENCE_UNAVAILABLE` and both attempted nodes are proven.
- **Cross-source:** a normal pass needs public response, two mini-owned log results, exactly-one match, matching backend header, fleet/cloud telemetry, and effective backend allowlist.

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY.md

**WRITE-PROHIBITED**

- Every other repository path.
- All product code, tests, evidence, `.kb-run-sprint/state.json`, credentials, services, containers, checkouts, Tailscale, Wi-Fi, interfaces, routes, DNS, and network configuration.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| repaired target contract | Run AC-1's exact static verifier | Exit 0; four target scenarios; eleven stable requirements; no network mutation |
| repair extraction + scenario | Run TC-1's exact pipeline | Exit 0; `ok=true`, `scenario_count=1`, `violations=[]` |
| stale operation scan | `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md; ! rg -n -i "tailscale down|laptop_off_tailnet|with the laptop off the tailnet" "$task"` | Exit 0 with no matches |
| scope compliance | `git diff --name-only HEAD` | Exactly the two WRITE-ALLOWED planning files |

## Agent Assignment

**mastra-planner** — preserves the product claim and implementation ownership while replacing prohibited network disruption with exact read-only deployed-topology and multi-node evidence contracts.

## Notes

- This authorizes future runtime work only through S33-PLAT-05's unchanged implementation WRITE-ALLOWED list.
- TDD is skipped for this planning-only edit, but deterministic static tests are required.
- No live service was called and no runtime/network state was mutated while authoring this repair.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "conflicting-s33-plat-05-contract": {
      "description": "S33-PLAT-05 required a literal laptop tailnet disconnect even though project Network Continuity forbids network disruption.",
      "seed_method": "cli",
      "records": [
        "target task originally required tailscale down",
        "replacement is read-only effective router topology plus independent request and two-mini evidence"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN S33-PLAT-05 conflicts with Network Continuity WHEN its prose and embedded contract are repaired THEN the same no-laptop-serving claim is proven through exact read-only topology, inference1 request origin, two-mini evidence, correlation, zero cloud calls, and fail-closed controls without runtime mutation.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; ms=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; c=json.loads(ms[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; ids=[\"AC-1\",\"AC-2\",\"AC-3\",\"AC-4\",\"TC-1\",\"TC-2\",\"TC-3\",\"TC-4\",\"TC-5\",\"TC-6\",\"TC-7\"]; assert list(req)==ids; human_ac=dict(re.findall(r\"^### (AC-\\d+) [^\\n]*\\n(?:(?!^### |^## )[\\s\\S])*?^- \\*\\*Verify:\\*\\* `(.*?)`$\",t,re.M)); table={i:v for i,v in re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| AC-\\d+ \\| `(.*?)` \\|$\",t,re.M)}; assert list(human_ac)==ids[:4] and list(table)==ids[4:]; assert all(human_ac[i]==req[i][\"verify\"] for i in human_ac) and all(table[i]==req[i][\"verify\"] for i in table); assert req[\"AC-1\"][\"verify\"]==req[\"TC-1\"][\"verify\"]==req[\"TC-2\"][\"verify\"]==req[\"TC-6\"][\"verify\"]; assert req[\"AC-2\"][\"verify\"]==req[\"TC-3\"][\"verify\"] and req[\"AC-3\"][\"verify\"]==req[\"TC-4\"][\"verify\"]==req[\"TC-5\"][\"verify\"] and req[\"AC-4\"][\"verify\"]==req[\"TC-7\"][\"verify\"]; assert req[\"AC-2\"][\"verify\"].startswith(\"set -o pipefail;\") and \"S33_MINI_NEGATIVE=no-mini-evidence\" in req[\"AC-2\"][\"verify\"] and \"MINI_EVIDENCE_UNAVAILABLE\" in req[\"AC-2\"][\"verify\"]; assert req[\"AC-4\"][\"verify\"].startswith(\"set -o pipefail;\") and \"S33_MINI_NEGATIVE=forbidden-backend\" in req[\"AC-4\"][\"verify\"] and \"LAPTOP_DEPENDENCY_DETECTED\" in req[\"AC-4\"][\"verify\"] and \".chat_request_issued == false\" in req[\"AC-4\"][\"verify\"] and \".effective_config_sha256_before == .effective_config_sha256_after\" in req[\"AC-4\"][\"verify\"]; [subprocess.run([\"bash\",\"-n\",\"-c\",r[\"verify\"]],check=True) for r in c[\"requirements\"]]; assert not [s for s in [\"tailscale down\",\"laptop_off_tailnet\",\"with the laptop off the tailnet\"] if s.lower() in t.lower()]; required=[\"holocron@holocron\",\"com.docker.compose.project=holocron-router\",\"com.docker.compose.service=litellm-router\",\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\",\"openai/Qwen3.6-35B-A3B-MLX-8bit\",\"network_mutation_performed=false\",\"literal_disconnect_claimed=false\"]; assert not [s for s in required if s not in t]; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==[\"- scripts/verify-s33-mini-served-turn.sh (NEW)\",\"- services/platform/src/inference/telemetry.ts (MODIFY — endpoint recording only)\",\"- services/platform/src/compat/cells/agent.ts (MODIFY — fleet-request accounting only; unowned by any other S33 lane, and its hardcoded loopback match would otherwise invalidate AC-3)\",\"- services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts (NEW)\"]; v=subprocess.run([\"python3\",\"/Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py\"],input=json.dumps(c).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE); assert v.returncode==0,(v.stdout+v.stderr).decode(); assert json.loads(v.stdout)=={\"ok\":True,\"scenario_count\":4,\"violations\":[]}; print(json.dumps({\"ok\":True,\"task\":c[\"task_id\"],\"requirement_count\":len(ids),\"scenario_count\":4,\"network_mutation_count\":0}))' \"$task\"",
      "scenario": {
        "id": "SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "task-contract parser + canonical Scenario Contract validator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stale_disconnect",
            "missing_topology",
            "missing_negative_control",
            "write_scope_expansion",
            "prose_contract_drift"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "conflicting-s33-plat-05-contract",
            "action": {
              "actor": "mastra-planner",
              "steps": [
                "repair only the two authorized planning files",
                "parse target prose and embedded contract for exact verifier parity and eleven stable IDs",
                "assert exact Holocron identity, two-mini model/backend allowlist, fail-closed controls, unchanged implementation WRITE-ALLOWED, and no stale disconnect operations",
                "run Bash grammar and canonical scenario checks without live calls"
              ]
            },
            "end_state": {
              "must_observe": [
                "target requirement IDs equal exactly 11 literals: AC-1, AC-2, AC-3, AC-4, TC-1, TC-2, TC-3, TC-4, TC-5, TC-6, TC-7",
                "target scenario validation returns ok=true, scenario_count=4, violations=[]",
                "target WRITE-ALLOWED contains exactly 4 original implementation paths",
                "exact deployed host identity is holocron@holocron and exact serving backend count is 2",
                "network mutation count === 0"
              ],
              "must_not_observe": [
                "tailscale down remains in the target task",
                "a target requirement command fails Bash grammar",
                "a forbidden implementer backend is accepted",
                "an empty target requirement list with 0 requirements",
                "a repository write outside the two planning files"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "The repair contract is uniquely extractable, requires static tests, contains exactly AC-1 and TC-1, has shell-valid verifiers, and passes canonical scenario validation with one scenario and zero violations.",
      "verify": "repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; ms=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; c=json.loads(ms[0]); assert c[\"task_id\"]==\"SPEC-REPAIR-S33-PLAT-05-NETWORK-CONTINUITY\" and c[\"verification_policy\"]=={\"requires_tests\":True,\"requires_red_evidence\":False,\"requires_seeded_evidence\":False,\"tdd_lineage_required\":False}; assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"TC-1\"]; [subprocess.run([\"bash\",\"-n\",\"-c\",r[\"verify\"]],check=True) for r in c[\"requirements\"]]; print(json.dumps(c))' \"$repair\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"
    }
  ]
}
-->
