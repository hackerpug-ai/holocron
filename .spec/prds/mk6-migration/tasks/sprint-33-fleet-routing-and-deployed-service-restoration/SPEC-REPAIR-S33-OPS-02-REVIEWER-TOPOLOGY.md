# SPEC-REPAIR-S33-OPS-02-REVIEWER-TOPOLOGY: Reconcile router role topology with the completed provisioning dependency

> Status: In Progress
> Commit: pending
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

Repair S33-OPS-02 so its prose and embedded contract honor the completed S33-OPS-01 outcome: `reviewer` uses Qwen3.8 on inference2 only, while the preserved two-mini concurrent capacity-routing proof uses `implementer` with Qwen3.6 on inference1 and inference2.

**Success state:** S33-OPS-02 still requires the pinned, laptop-independent Holocron router, both public role names, the real `/health` flip, inference1-originated reachability, and real two-mini evidence; no prose, fixture, command, or REQUIREMENT-CONTRACT field claims that inference1 serves Qwen3.8 or that `reviewer` distributes across both minis; and `verification_policy.requires_tests` remains `true`.

## Critical Constraints

**MUST**

- Preserve S33-OPS-02's pinned image digest, sibling Compose service boundary, both role names, real `/health` flip, inference1-originated reachability proof, two-mini topology, response-header evidence, device-log corroboration, and negative controls.
- Describe and verify `reviewer` as a real Qwen3.8-27B-8bit backend on inference2 only.
- Move every concurrent two-mini distribution claim, command, fixture record, AC-2 field, TC-4 field, and embedded-contract equivalent to `implementer` backed by Qwen3.6-35B-A3B-MLX-8bit on both minis.
- Keep S33-OPS-02 `verification_policy.requires_tests` boolean `true` and keep its scenario topology and fakeability protections intact.

**NEVER**

- Never implement or edit `router.compose.yaml`, product code, tests, evidence artifacts, fleet configuration, remote files, remote services, model weights, or network state in this planning-only repair.
- Never weaken a multi-node scenario, remove inference1's own entrypoint, replace real response/log evidence with a static assertion, or drop the router-stop negative control.
- Never state or imply that inference1 has Qwen3.8-27B-8bit; S33-OPS-01 proved its live disk was below 44 GiB, no copy occurred, the target path is absent, and its model list remains Qwen3.6-only.

**STRICTLY**

- Repository writes are limited to this repair task and the existing S33-OPS-02 task file.

## Specification

**Objective:** Reconcile the S33-OPS-02 role/backend topology with the valid S33-OPS-01 dependency outcome without reducing any real-service proof obligation.

**Success looks like:** the human-readable task and REQUIREMENT-CONTRACT encode the same role topology, exact role-specific commands, fixtures, and scenario expectations, and both static governance verifiers pass.

## Acceptance Criteria

### AC-1 — Human-readable S33-OPS-02 topology is internally consistent

- **GIVEN** the completed dependency provisioned Qwen3.8 only on inference2 and left Qwen3.6 on both minis.
- **WHEN** the S33-OPS-02 task prose is inspected after repair.
- **THEN** it binds `reviewer` to inference2/Qwen3.8 only, binds `implementer` distribution to both Qwen3.6 minis, retains both role names plus the health/reachability/two-mini proof, and contains none of the superseded reviewer-on-both-minis statements.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import sys; t=open(sys.argv[1],encoding="utf-8").read(); required=["`reviewer` bound to the real Qwen3.8 backend on inference2 only","`implementer` capacity-routed across the real Qwen3.6 backends on both minis","S33-OPS-01 proved inference1 had less than 44 GiB free, no copy was attempted","AC-2 must send concurrent requests to `implementer`, not `reviewer`","GET https://holocron.tail011a51.ts.net:44111/health reports status ok and fleet.ready:true with failing_dependency:null","inference1 (a real second device inside the fleet"]; forbidden=["both serving real Qwen3.8-27B-8bit weights","both minis serve the reviewer model","(+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)"]; missing=[x for x in required if x not in t]; stale=[x for x in forbidden if x in t]; assert not missing,("missing",missing); assert not stale,("stale",stale)' "$task"`
- **Tier:** static · **Service:** task-contract · **Flow:** sprint governance

## Test Criteria

### TC-1 — Embedded contract matches the repaired topology and remains un-fakeable

- **GIVEN** S33-OPS-02 has one REQUIREMENT-CONTRACT v1 block with AC-1, AC-2, and TC-4 topology fields.
- **WHEN** the JSON is parsed and passed to the canonical Scenario Contract validator without executing any remote command.
- **THEN** `requires_tests` remains true; both originally primary ACs remain primary; the fixture, AC-1, AC-2, and TC-4 agree on reviewer→inference2/Qwen3.8 and implementer→both minis/Qwen3.6; both AC scenarios remain multi-node with negative controls; and scenario validation reports `ok:true`, `scenario_count:2`, and zero violations.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,sys; t=open(sys.argv[1],encoding="utf-8").read(); m=re.findall(r"<!-- REQUIREMENT-CONTRACT v1 -->\s*<!--\s*(\{.*?\})\s*-->",t,re.S); assert len(m)==1; c=json.loads(m[0]); req={r["id"]:r for r in c["requirements"]}; records=c["fixtures"]["mini-backends"]["records"]; ac1_prose=re.search(r"### AC-1.*?\*\*Verify:\*\* `(.*?)`\n",t,re.S).group(1); ac2_prose=re.search(r"### AC-2.*?\*\*Verify:\*\* `(.*?)`\n",t,re.S).group(1); tc4_prose=re.search(r"\| TC-4 .*? \| AC-2 \| `(.*?)` \|",t).group(1); assert req["AC-1"]["verify"]==ac1_prose and req["AC-2"]["verify"]==ac2_prose and req["TC-4"]["verify"]==tc4_prose; assert c["tdd_mode"]=="skipped"; assert c["verification_policy"]["requires_tests"] is True; assert all(req[x].get("primary") is True and req[x]["scenario"].get("primary") is True for x in ("AC-1","AC-2")); assert any("reviewer -> http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.8-27B-8bit (only reviewer backend)"==x for x in records); assert any("implementer -> http://inference1.tail011a51.ts.net:8003/v1 + http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (both backends, weight=100)"==x for x in records); assert not any("reviewer -> http://inference1" in x for x in records); assert "\"model\":\"reviewer\"" in req["AC-1"]["verify"] and "inference2.tail011a51.ts.net:8003/v1" in req["AC-1"]["verify"]; assert "\"model\":\"implementer\"" in req["AC-2"]["verify"] and "\"model\":\"reviewer\"" not in req["AC-2"]["verify"]; assert "Qwen3.6" in req["AC-2"]["description"] and "implementer" in req["TC-4"]["description"] and "Qwen3.6" in req["TC-4"]["description"]; assert all(req[x]["scenario"]["topology"]=="multi-node" and req[x]["scenario"]["negative_control"]["would_fail_if"] for x in ("AC-1","AC-2")); print(json.dumps(c))' "$task" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
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
| stale contradiction scan | `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; ! rg -n -F -e "The router's 'reviewer' model_name has two backends" -e "both serving real Qwen3.8-27B-8bit weights" -e "model 'reviewer' has two backends at weight=100" -e "(+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)" "$task"` | Exit 0 with no matches |
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
      "description": "The human-readable S33-OPS-02 contract binds reviewer to inference2/Qwen3.8 only and implementer distribution to both Qwen3.6 minis with no stale contradiction.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); required=[\"`reviewer` bound to the real Qwen3.8 backend on inference2 only\",\"`implementer` capacity-routed across the real Qwen3.6 backends on both minis\",\"S33-OPS-01 proved inference1 had less than 44 GiB free, no copy was attempted\",\"AC-2 must send concurrent requests to `implementer`, not `reviewer`\",\"GET https://holocron.tail011a51.ts.net:44111/health reports status ok and fleet.ready:true with failing_dependency:null\",\"inference1 (a real second device inside the fleet\"]; forbidden=[\"both serving real Qwen3.8-27B-8bit weights\",\"both minis serve the reviewer model\",\"(+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)\"]; missing=[x for x in required if x not in t]; stale=[x for x in forbidden if x in t]; assert not missing,(\"missing\",missing); assert not stale,(\"stale\",stale)' \"$task\""
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "The embedded S33-OPS-02 contract preserves requires_tests=true, preserves both primary ACs, and validates two non-fakeable scenarios for the repaired role topology.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); m=re.findall(r\"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->\",t,re.S); assert len(m)==1; c=json.loads(m[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; records=c[\"fixtures\"][\"mini-backends\"][\"records\"]; ac1_prose=re.search(r\"### AC-1.*?\\*\\*Verify:\\*\\* `(.*?)`\\n\",t,re.S).group(1); ac2_prose=re.search(r\"### AC-2.*?\\*\\*Verify:\\*\\* `(.*?)`\\n\",t,re.S).group(1); tc4_prose=re.search(r\"\\| TC-4 .*? \\| AC-2 \\| `(.*?)` \\|\",t).group(1); assert req[\"AC-1\"][\"verify\"]==ac1_prose and req[\"AC-2\"][\"verify\"]==ac2_prose and req[\"TC-4\"][\"verify\"]==tc4_prose; assert c[\"tdd_mode\"]==\"skipped\"; assert c[\"verification_policy\"][\"requires_tests\"] is True; assert all(req[x].get(\"primary\") is True and req[x][\"scenario\"].get(\"primary\") is True for x in (\"AC-1\",\"AC-2\")); assert any(\"reviewer -> http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.8-27B-8bit (only reviewer backend)\"==x for x in records); assert any(\"implementer -> http://inference1.tail011a51.ts.net:8003/v1 + http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (both backends, weight=100)\"==x for x in records); assert not any(\"reviewer -> http://inference1\" in x for x in records); assert \"\\\"model\\\":\\\"reviewer\\\"\" in req[\"AC-1\"][\"verify\"] and \"inference2.tail011a51.ts.net:8003/v1\" in req[\"AC-1\"][\"verify\"]; assert \"\\\"model\\\":\\\"implementer\\\"\" in req[\"AC-2\"][\"verify\"] and \"\\\"model\\\":\\\"reviewer\\\"\" not in req[\"AC-2\"][\"verify\"]; assert \"Qwen3.6\" in req[\"AC-2\"][\"description\"] and \"implementer\" in req[\"TC-4\"][\"description\"] and \"Qwen3.6\" in req[\"TC-4\"][\"description\"]; assert all(req[x][\"scenario\"][\"topology\"]==\"multi-node\" and req[x][\"scenario\"][\"negative_control\"][\"would_fail_if\"] for x in (\"AC-1\",\"AC-2\")); print(json.dumps(c))' \"$task\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"
    }
  ]
}
-->
