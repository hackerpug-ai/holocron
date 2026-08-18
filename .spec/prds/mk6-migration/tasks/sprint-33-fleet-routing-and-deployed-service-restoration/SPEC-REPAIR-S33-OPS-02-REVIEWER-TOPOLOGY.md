# SPEC-REPAIR-S33-OPS-02-REVIEWER-TOPOLOGY: Reconcile router role topology with the completed provisioning dependency

> Status: ✅ Completed
> Cycle: 1
> Commit: cc01a94cd7782f524bfa10986daf9fe5c81b0546
> Reviewer: product-manager+code-reviewer
> Completed: 2026-08-17T02:11:16Z
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 30 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: technical-reviewer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-01
> Blocks: S33-OPS-02 review

## Outcome

Repair S33-OPS-02 so its prose and embedded contract honor the completed S33-OPS-01 outcome and make the real router proof fail closed: `reviewer` uses Qwen3.8 on inference2 only, while the preserved two-mini concurrent capacity-routing proof uses `implementer` with Qwen3.6 on inference1 and inference2.

**Success state:** S33-OPS-02 still requires the pinned, laptop-independent Holocron router, both public role names, the real `/health` flip, independently persisted laptop-originated and inference1-originated models responses with both exact roles in each, and real two-mini evidence; its future verifier fails closed on either missing observer oracle, wrong reviewer backend, failed/untracked requests, absent backend headers, non-distinct bodies, or stale log tails; it authorizes the focused real integration test and test-reality evidence; no field claims that inference1 serves Qwen3.8 or that `reviewer` distributes across both minis; and `verification_policy.requires_tests` remains `true`.

## Critical Constraints

**MUST**

- Preserve S33-OPS-02's pinned image digest, sibling Compose service boundary, both role names, real `/health` flip, inference1-originated reachability proof, two-mini topology, response-header evidence, device-log corroboration, and negative controls.
- Describe and verify `reviewer` as a real Qwen3.8-27B-8bit backend on inference2 only.
- Move every concurrent two-mini distribution claim, command, fixture record, AC-2 field, TC-4 field, and embedded-contract equivalent to `implementer` backed by Qwen3.6-35B-A3B-MLX-8bit on both minis.
- Keep S33-OPS-02 `verification_policy.requires_tests` boolean `true` and keep its scenario topology and fakeability protections intact.
- Replace the fakeable inline AC-1, AC-2, and TC-4 probes with shell-valid invocations of the future `scripts/verify-s33-router-capacity.sh`; AC-2 and TC-4 must decode to the same bytes.
- Authorize, but do not implement, `scripts/verify-s33-router-capacity.sh`, `tests/integration/sprint33-ops-02-router-capacity.test.ts`, and `.tmp/S33-OPS-02/**`; require the exact focused integration and canonical test-reality gates.
- Require `models-reviewer` to persist and independently validate both the laptop-originated and inference1-originated `/v1/models` responses, including separate result artifact paths and distinct both-role booleans; removing either oracle must fail this repair's TC-1.

**NEVER**

- Never implement or edit `router.compose.yaml`, product code, tests, evidence artifacts, fleet configuration, remote files, remote services, model weights, or network state in this planning-only repair.
- Never weaken a multi-node scenario, remove inference1's own entrypoint, replace real response/log evidence with a static assertion, or drop the router-stop negative control.
- Never state or imply that inference1 has Qwen3.8-27B-8bit; S33-OPS-01 proved its live disk was below 44 GiB, no copy occurred, the target path is absent, and its model list remains Qwen3.6-only.
- Never use network disruption, pre-existing log tails, untracked background jobs, ignored HTTP failures, mocks, canned bodies, or runtime skips as completion evidence.

**STRICTLY**

- Repository writes are limited to this repair task and the existing S33-OPS-02 task file.

## Specification

**Objective:** Reconcile the S33-OPS-02 role/backend topology with the valid S33-OPS-01 dependency outcome without reducing any real-service proof obligation.

**Success looks like:** the human-readable task and REQUIREMENT-CONTRACT encode the same role topology, exact role-specific commands, fixtures, and scenario expectations, and both static governance verifiers pass.

## Acceptance Criteria

### AC-1 — Human-readable S33-OPS-02 topology is internally consistent

- **GIVEN** the completed dependency provisioned Qwen3.8 only on inference2 and left Qwen3.6 on both minis.
- **WHEN** the S33-OPS-02 task prose is inspected after repair.
- **THEN** it binds `reviewer` to inference2/Qwen3.8 only, binds `implementer` distribution to both Qwen3.6 minis, independently requires both role IDs from separately persisted laptop and inference1 models responses, retains the health/reachability/two-mini proof, authorizes the verifier/test/evidence paths, spells out every fail-closed evidence obligation, and contains none of the superseded or fakeable commands.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import sys; t=open(sys.argv[1],encoding="utf-8").read(); required=["`reviewer` bound to the real Qwen3.8 backend on inference2 only","`implementer` capacity-routed across the real Qwen3.6 backends on both minis","S33-OPS-01 proved inference1 had less than 44 GiB free, no copy was attempted","capture and persist a laptop-originated `${router_url}/v1/models` response","independently capture and persist `${router_url}/v1/models` by running curl from inside the real inference1 SSH session","laptop_models_has_both_roles==true","inference1_models_has_both_roles==true","distinct nonempty laptop_models_artifact_path and inference1_models_artifact_path values","removing or weakening either the laptop or inference1 oracle must fail the test","record each mini\x27s remote log byte length before sending requests","waits for every tracked PID with failure propagation","at least two byte-distinct nonempty bodies","reads only bytes added after each captured baseline","- scripts/verify-s33-router-capacity.sh (NEW)","- tests/integration/sprint33-ops-02-router-capacity.test.ts (NEW)","- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)"]; forbidden=["both serving real Qwen3.8-27B-8bit weights","both minis serve the reviewer model","(+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)","for i in 1 2 3 4 5 6; do curl","grep x-litellm-model-api-base headers for both mini hostnames"]; missing=[x for x in required if x not in t]; stale=[x for x in forbidden if x in t]; assert not missing,("missing",missing); assert not stale,("stale",stale)' "$task"`
- **Tier:** static · **Service:** task-contract · **Flow:** sprint governance

## Test Criteria

### TC-1 — Embedded contract matches the repaired topology and remains un-fakeable

- **GIVEN** S33-OPS-02 has one REQUIREMENT-CONTRACT v1 block with AC-1, AC-2, and TC-4 topology fields.
- **WHEN** the JSON is parsed and passed to the canonical Scenario Contract validator without executing any remote command.
- **THEN** `requires_tests` remains true; both originally primary ACs remain primary; AC-1, AC-2, and TC-4 decode to shell-valid concrete verifier invocations; AC-2 equals TC-4 byte-for-byte after JSON decoding; AC-1's contract and scenario contain load-bearing laptop and inference1 role-list oracles with separate artifacts and true booleans; the new paths are WRITE-ALLOWED; the focused real-test and test-reality gates are exact; both AC scenarios remain multi-node with negative controls; and scenario validation reports `ok:true`, `scenario_count:2`, and zero violations.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,shlex,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; pattern=re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end); m=re.findall(pattern,t,re.S); assert len(m)==1; c=json.loads(m[0]); req={r["id"]:r for r in c["requirements"]}; records=c["fixtures"]["mini-backends"]["records"]; a="bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer"; b="bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution"; ac1_prose=re.search(r"### AC-1.*?\*\*Verify:\*\* `(.*?)`\n",t,re.S).group(1); ac2_prose=re.search(r"### AC-2.*?\*\*Verify:\*\* `(.*?)`\n",t,re.S).group(1); tc4_prose=re.search(r"\| TC-4 .*? \| AC-2 \| `(.*?)` \|",t).group(1); table=dict(re.findall(r"^\| (TC-\d+) \|.*?\| .*? \| `(.*?)` \|$",t,re.M)); assert all(req[x]["verify"]==table[x] for x in ("TC-1","TC-2","TC-3","TC-4","TC-5","TC-6")); assert req["AC-1"]["verify"]==ac1_prose==a; assert req["AC-2"]["verify"]==ac2_prose==req["TC-4"]["verify"]==tc4_prose==b; [subprocess.run(["bash","-n","-c",x],check=True) for x in (a,b)]; pa,pb=map(shlex.split,(a,b)); assert pa[:4]==["bash","scripts/verify-s33-router-capacity.sh","--mode","models-reviewer"] and pb[:4]==["bash","scripts/verify-s33-router-capacity.sh","--mode","implementer-distribution"]; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert all(x in allowed for x in ("- scripts/verify-s33-router-capacity.sh (NEW)","- tests/integration/sprint33-ops-02-router-capacity.test.ts (NEW)","- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)")); assert all(x in t for x in ("capture and persist a laptop-originated `${router_url}/v1/models` response","independently capture and persist `${router_url}/v1/models` by running curl from inside the real inference1 SSH session","distinct nonempty `laptop_models_artifact_path` and `inference1_models_artifact_path` values")); assert req["TC-5"]["verify"]=="PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts" and req["TC-6"]["verify"]=="python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json"; assert c["tdd_mode"]=="skipped" and c["verification_policy"]["requires_tests"] is True; assert all(req[x].get("primary") is True and req[x]["scenario"].get("primary") is True and req[x]["scenario"]["topology"]=="multi-node" and req[x]["scenario"]["negative_control"]["would_fail_if"] for x in ("AC-1","AC-2")); assert any("reviewer -> http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.8-27B-8bit (only reviewer backend)"==x for x in records) and any("implementer -> http://inference1.tail011a51.ts.net:8003/v1 + http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (both backends, weight=100)"==x for x in records) and not any("reviewer -> http://inference1" in x for x in records); obligations=" ".join((req["AC-1"]["description"],req["AC-2"]["description"],req["TC-4"]["description"],req["TC-1"]["description"],req["TC-5"]["description"],json.dumps(req["AC-1"]["scenario"]),json.dumps(req["AC-2"]["scenario"]))); assert all(x in obligations for x in ("both exact public","laptop-originated and inference1-originated models responses","laptop_models_has_both_roles==true","inference1_models_has_both_roles==true","distinct nonempty laptop_models_artifact_path and inference1_models_artifact_path values","independently checks both persisted models artifacts","HTTP-success","inference2","log baseline","failure propagation","both backend","distinct","post-baseline","both minis")); print(json.dumps(c))' "$task" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
- **Tier:** static · **Service:** REQUIREMENT-CONTRACT parser + canonical Scenario Contract validator · **Flow:** sprint governance

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md` — completed dependency and authoritative model inventory outcome.
- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md` — only task contract being repaired.
- `/Users/justinrich/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md` — fakeability and multi-node proof rules.

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-REVIEWER-TOPOLOGY.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md

**WRITE-PROHIBITED**

- Every other repository path.
- All product code, test code, deployment manifests other than the task prose describing their future change, and evidence directories.
- All local or remote host files, services, containers, model directories, fleet configuration, credentials, network state, and tracker state.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 prose topology | Run AC-1's exact `python3` verifier from repository root | Exit 0 |
| TC-1 contract + scenario topology | Run TC-1's exact extraction/assertion pipeline from repository root | Exit 0; validator emits `"ok": true`, `"scenario_count": 2`, `"violations": []` |
| stale/fakeable command scan | `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; ! rg -n -F -e "The router's 'reviewer' model_name has two backends" -e "both serving real Qwen3.8-27B-8bit weights" -e "model 'reviewer' has two backends at weight=100" -e "(+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)" -e "for i in 1 2 3 4 5 6; do curl" -e "grep x-litellm-model-api-base headers for both mini hostnames" -e "tail -n 20 ~/local-llm/logs/omlx-mini-8003.log" "$task"` | Exit 0 with no matches |
| scope compliance | `git diff --name-only HEAD` | Exactly the two WRITE-ALLOWED task files |
| main immutability before commit | `test "$(git rev-parse main)" = "6529c60367ebb02809db9f28576a8a96a185b874"` | Exit 0 |

## Agent Assignment

**planner** — This task changes only planning contracts, preserving a validated operational topology while making the prose and machine-readable requirements deterministic and semantically identical.

## Dependencies

- **Depends on:** S33-OPS-01 completed outcome: inference2 serves Qwen3.8; inference1 did not copy Qwen3.8 and remains Qwen3.6-only.
- **Blocks:** S33-OPS-02 implementation/review until its topology contract stops contradicting that dependency.

## Notes

- This task authorizes no product implementation and no local or remote operational mutation.
- TDD is skipped because the deliverable is a deterministic planning-contract correction. Static contract verification and scenario fakeability validation remain blocking.

## Verification Policy

- TDD mode: skipped.
- Tests required for this planning-only repair: no.
- RED evidence required: no.
- Seeded evidence required: no.
- Deterministic AC-1/TC-1 verification and canonical scenario validation are required before commit.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-02-REVIEWER-TOPOLOGY",
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
      "description": "The human-readable S33-OPS-02 contract preserves the valid role topology and independently requires both exact roles in separately persisted laptop and inference1 models responses through a maintainable fail-closed verifier and real-test surface.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); required=[\"`reviewer` bound to the real Qwen3.8 backend on inference2 only\",\"`implementer` capacity-routed across the real Qwen3.6 backends on both minis\",\"S33-OPS-01 proved inference1 had less than 44 GiB free, no copy was attempted\",\"capture and persist a laptop-originated `${router_url}/v1/models` response\",\"independently capture and persist `${router_url}/v1/models` by running curl from inside the real inference1 SSH session\",\"laptop_models_has_both_roles==true\",\"inference1_models_has_both_roles==true\",\"distinct nonempty laptop_models_artifact_path and inference1_models_artifact_path values\",\"removing or weakening either the laptop or inference1 oracle must fail the test\",\"record each mini\\x27s remote log byte length before sending requests\",\"waits for every tracked PID with failure propagation\",\"at least two byte-distinct nonempty bodies\",\"reads only bytes added after each captured baseline\",\"- scripts/verify-s33-router-capacity.sh (NEW)\",\"- tests/integration/sprint33-ops-02-router-capacity.test.ts (NEW)\",\"- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)\"]; forbidden=[\"both serving real Qwen3.8-27B-8bit weights\",\"both minis serve the reviewer model\",\"(+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)\",\"for i in 1 2 3 4 5 6; do curl\",\"grep x-litellm-model-api-base headers for both mini hostnames\"]; missing=[x for x in required if x not in t]; stale=[x for x in forbidden if x in t]; assert not missing,(\"missing\",missing); assert not stale,(\"stale\",stale)' \"$task\""
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "The embedded S33-OPS-02 contract preserves requires_tests and primary topology while binding prose and JSON to shell-valid fail-closed verifier commands, independent laptop and inference1 models oracles, future write authorization, exact real-test gates, and two valid scenarios.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,shlex,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; pattern=re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end); m=re.findall(pattern,t,re.S); assert len(m)==1; c=json.loads(m[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; records=c[\"fixtures\"][\"mini-backends\"][\"records\"]; a=\"bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer\"; b=\"bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution\"; ac1_prose=re.search(r\"### AC-1.*?\\*\\*Verify:\\*\\* `(.*?)`\\n\",t,re.S).group(1); ac2_prose=re.search(r\"### AC-2.*?\\*\\*Verify:\\*\\* `(.*?)`\\n\",t,re.S).group(1); tc4_prose=re.search(r\"\\| TC-4 .*? \\| AC-2 \\| `(.*?)` \\|\",t).group(1); table=dict(re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| .*? \\| `(.*?)` \\|$\",t,re.M)); assert all(req[x][\"verify\"]==table[x] for x in (\"TC-1\",\"TC-2\",\"TC-3\",\"TC-4\",\"TC-5\",\"TC-6\")); assert req[\"AC-1\"][\"verify\"]==ac1_prose==a; assert req[\"AC-2\"][\"verify\"]==ac2_prose==req[\"TC-4\"][\"verify\"]==tc4_prose==b; [subprocess.run([\"bash\",\"-n\",\"-c\",x],check=True) for x in (a,b)]; pa,pb=map(shlex.split,(a,b)); assert pa[:4]==[\"bash\",\"scripts/verify-s33-router-capacity.sh\",\"--mode\",\"models-reviewer\"] and pb[:4]==[\"bash\",\"scripts/verify-s33-router-capacity.sh\",\"--mode\",\"implementer-distribution\"]; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert all(x in allowed for x in (\"- scripts/verify-s33-router-capacity.sh (NEW)\",\"- tests/integration/sprint33-ops-02-router-capacity.test.ts (NEW)\",\"- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)\")); assert all(x in t for x in (\"capture and persist a laptop-originated `${router_url}/v1/models` response\",\"independently capture and persist `${router_url}/v1/models` by running curl from inside the real inference1 SSH session\",\"distinct nonempty `laptop_models_artifact_path` and `inference1_models_artifact_path` values\")); assert req[\"TC-5\"][\"verify\"]==\"PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts\" and req[\"TC-6\"][\"verify\"]==\"python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json\"; assert c[\"tdd_mode\"]==\"skipped\" and c[\"verification_policy\"][\"requires_tests\"] is True; assert all(req[x].get(\"primary\") is True and req[x][\"scenario\"].get(\"primary\") is True and req[x][\"scenario\"][\"topology\"]==\"multi-node\" and req[x][\"scenario\"][\"negative_control\"][\"would_fail_if\"] for x in (\"AC-1\",\"AC-2\")); assert any(\"reviewer -> http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.8-27B-8bit (only reviewer backend)\"==x for x in records) and any(\"implementer -> http://inference1.tail011a51.ts.net:8003/v1 + http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (both backends, weight=100)\"==x for x in records) and not any(\"reviewer -> http://inference1\" in x for x in records); obligations=\" \".join((req[\"AC-1\"][\"description\"],req[\"AC-2\"][\"description\"],req[\"TC-4\"][\"description\"],req[\"TC-1\"][\"description\"],req[\"TC-5\"][\"description\"],json.dumps(req[\"AC-1\"][\"scenario\"]),json.dumps(req[\"AC-2\"][\"scenario\"]))); assert all(x in obligations for x in (\"both exact public\",\"laptop-originated and inference1-originated models responses\",\"laptop_models_has_both_roles==true\",\"inference1_models_has_both_roles==true\",\"distinct nonempty laptop_models_artifact_path and inference1_models_artifact_path values\",\"independently checks both persisted models artifacts\",\"HTTP-success\",\"inference2\",\"log baseline\",\"failure propagation\",\"both backend\",\"distinct\",\"post-baseline\",\"both minis\")); print(json.dumps(c))' \"$task\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"
    }
  ]
}
-->
