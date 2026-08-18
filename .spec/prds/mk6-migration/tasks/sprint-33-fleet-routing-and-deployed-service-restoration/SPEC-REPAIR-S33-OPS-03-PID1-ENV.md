# SPEC-REPAIR-S33-OPS-03-PID1-ENV: Verify the scheduler secret on PID 1 without exposing it to exec children

> Status: ✅ Completed
> Cycle: 2
> Commit: c60b2ffcf2b0256b3d815cce4c3fdab0a9db8903
> Reviewer: code-reviewer
> Completed: 2026-08-17T23:55:32Z
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 30 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-03
> Blocks: S33-OPS-03 review

## Outcome

Repair S33-OPS-03's impossible child-process oracle so the task verifies the secure secret-export design at the process that actually consumes it.

**Success state:** S33-OPS-03 keeps its one-file implementation scope and mounted-secret design, but every formal live verifier is self-contained from the orchestrator laptop: it begins with exact bounded authenticated `ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron`, uses only absolute remote `/usr/local/bin/docker`, proves nonempty FLEET_URL from the remote container environment, proves nonempty FLEET_KEY from remote `/proc/1/environ`, proves FLEET_KEY is literally unset in a separate remote `docker exec` child, and proves exact remote healthy status without printing either runtime value.

## Critical Constraints

**MUST**

- Keep the S33-OPS-03 human-readable and embedded AC-1/TC-1/TC-2 commands byte-equivalent after JSON decoding and shell-valid under `bash -n`.
- Assert FLEET_URL through the configured remote container environment, assert FLEET_KEY through a quiet nonempty record match in remote `/proc/1/environ`, and assert a separate remote `docker exec` child has FLEET_KEY literally unset with `test -z "${FLEET_KEY+x}"` rather than merely empty.
- Require every target formal live verifier (AC-1, TC-1, TC-2, and the two live Verification Gates) to begin exactly with `ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron` and use `/usr/local/bin/docker` for every remote Docker operation; a laptop-local same-name container MUST be unable to satisfy any live oracle.
- Preserve S33-OPS-03's exact implementation WRITE-ALLOWED list: only `services/platform/deploy/compose/compose.yaml` scheduler service block.
- Preserve the authenticated `holocron@holocron` remote-host context, real `holocron-production-scheduler-1` health oracle, mounted-secret mechanism, service continuity, and named-volume protections.

**NEVER**

- Never make FLEET_KEY a Compose environment literal merely to satisfy an exec-child check.
- Never print FLEET_URL, FLEET_KEY, `/proc/1/environ`, or any secret-bearing line in a verifier or evidence artifact.
- Never implement, deploy, recreate a service, access live secrets, harvest evidence, mutate tracker/state, touch main, or run a live verifier while performing this planning-only repair.
- Never run `docker compose down -v`, remove `holocron-postgres` or `holocron-blobs`, or broaden S33-OPS-03's implementation scope.

**STRICTLY**

- Repository writes for this repair are limited to this file and the existing S33-OPS-03 task Markdown.

## Acceptance Criteria

### AC-1 — S33-OPS-03 verifies the configured URL, PID-1 secret, exec-child isolation, and exact health state

- **GIVEN** S33-OPS-03 securely exports FLEET_KEY inside the PID-1 command script before `exec`, so a separately launched `docker exec` child correctly does not inherit that runtime-only export.
- **WHEN** the S33-OPS-03 acceptance prose, test criteria, verification gates, scenario, and REQUIREMENT-CONTRACT are repaired.
- **THEN** AC-1, TC-1, and TC-2 decode to shell-valid fail-closed commands beginning with the exact bounded authenticated SSH prefix and using only absolute remote Docker; AC-1 proves the combined remote process contract and exact healthy state; TC-1 proves `FLEET_URL_PRESENT`, `FLEET_KEY_PID1_PRESENT`, and literal variable-unset `FLEET_KEY_CHILD_ABSENT` without printing runtime values; TC-2 proves exact remote healthy state; both target live Verification Gates match TC-1/TC-2 exactly; the old child-side nonempty or merely-empty FLEET_KEY predicates are absent; and WRITE-ALLOWED remains exactly one scheduler-block Compose path.
- **Verify:** `target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md; python3 -c 'import hashlib,json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r["id"]:r for r in c["requirements"]}; ac=re.search(r"### AC-1.*?\n- \*\*Verify:\*\* `(.*?)`",t,re.S).group(1); table=dict(re.findall(r"^\| (TC-\d+) \|.*?\| AC-\d+ \| `(.*?)` \|$",t,re.M)); gates=dict(re.findall(r"^\| (live scheduler process has the bounded fleet contract|scheduler health is exactly healthy) \| `(.*?)` \|",t,re.M)); assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1","TC-2"]; assert ac==req["AC-1"]["verify"] and table["TC-1"]==req["TC-1"]["verify"] and table["TC-2"]==req["TC-2"]["verify"]; assert gates=={"live scheduler process has the bounded fleet contract":table["TC-1"],"scheduler health is exactly healthy":table["TC-2"]}; assert hashlib.sha256(ac.encode()).hexdigest()=="3cf2b56f3b00baf19b666565e20e414a9dc06d98d185d3aa79b594185b3476bc"; assert hashlib.sha256(table["TC-1"].encode()).hexdigest()=="6ecdfed4cf5ca97d979c16b8ecbc2eb21e03206bb389a6d2aab3bd6ea3ad43ee"; assert hashlib.sha256(table["TC-2"].encode()).hexdigest()=="3d3bb13f1ead3e6d0b8437dec24ba920d290cc776d3d1a0c064cba4b6247eed3"; cmds={"AC-1":ac,"TC-1":table["TC-1"],"TC-2":table["TC-2"]}; prefix="ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron"; assert all(v.startswith(prefix+" ") and v.count(prefix)==1 for v in cmds.values()); assert all(not re.search(r"(?<!/usr/local/bin/)docker\s+(?:exec|inspect)",v) for v in cmds.values()); assert "/usr/local/bin/docker exec " in ac and "/usr/local/bin/docker inspect " in ac; assert "/usr/local/bin/docker exec " in table["TC-1"] and "docker inspect" not in table["TC-1"]; assert "/usr/local/bin/docker inspect " in table["TC-2"] and "docker exec" not in table["TC-2"]; child=r"test -z \"\${FLEET_KEY+x}\""; old_empty=r"test -z \"\${FLEET_KEY:-}\""; assert child in ac and child in table["TC-1"]; assert old_empty not in ac and old_empty not in table["TC-1"]; sentinel=r"printf \"%s\\n\" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT"; assert sentinel in ac and sentinel in table["TC-1"]; assert all("printenv" not in v and "echo " not in v for v in cmds.values()); [subprocess.run(["bash","-n","-c",v],check=True) for v in cmds.values()]; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==["- services/platform/deploy/compose/compose.yaml (MODIFY - scheduler service block only)"]; assert req["AC-1"]["maps_to_ac"] is None and req["TC-1"]["maps_to_ac"]=="AC-1" and req["TC-2"]["maps_to_ac"]=="AC-1"; print("target_contract_ok=1 commands_bash_n=3 remote_wrappers=3 verification_gates=2 target_write_allowed=1")' "$target"`
- **Tier:** integration · **Service:** S33-OPS-03 task-contract parser + Bash grammar + canonical Scenario Contract validator · **Flow:** sprint governance
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: impossible child-side secret oracle, empty process evidence, or broadened implementation scope

## Test Criteria

### TC-1 — The repaired target contract is exact, remote-only, shell-valid, and bounded

- **GIVEN** the repaired S33-OPS-03 task contains human-readable and machine-readable requirement representations.
- **WHEN** the target contract is parsed from the repository root.
- **THEN** its commands, hashes, exact SSH wrappers, absolute remote Docker paths, literal-unset process-boundary predicate, Verification Gate parity, maps, and one-entry implementation WRITE-ALLOWED list match exactly.
- **Verify:** `target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md; python3 -c 'import hashlib,json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r["id"]:r for r in c["requirements"]}; ac=re.search(r"### AC-1.*?\n- \*\*Verify:\*\* `(.*?)`",t,re.S).group(1); table=dict(re.findall(r"^\| (TC-\d+) \|.*?\| AC-\d+ \| `(.*?)` \|$",t,re.M)); gates=dict(re.findall(r"^\| (live scheduler process has the bounded fleet contract|scheduler health is exactly healthy) \| `(.*?)` \|",t,re.M)); assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1","TC-2"]; assert ac==req["AC-1"]["verify"] and table["TC-1"]==req["TC-1"]["verify"] and table["TC-2"]==req["TC-2"]["verify"]; assert gates=={"live scheduler process has the bounded fleet contract":table["TC-1"],"scheduler health is exactly healthy":table["TC-2"]}; assert hashlib.sha256(ac.encode()).hexdigest()=="3cf2b56f3b00baf19b666565e20e414a9dc06d98d185d3aa79b594185b3476bc"; assert hashlib.sha256(table["TC-1"].encode()).hexdigest()=="6ecdfed4cf5ca97d979c16b8ecbc2eb21e03206bb389a6d2aab3bd6ea3ad43ee"; assert hashlib.sha256(table["TC-2"].encode()).hexdigest()=="3d3bb13f1ead3e6d0b8437dec24ba920d290cc776d3d1a0c064cba4b6247eed3"; cmds={"AC-1":ac,"TC-1":table["TC-1"],"TC-2":table["TC-2"]}; prefix="ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron"; assert all(v.startswith(prefix+" ") and v.count(prefix)==1 for v in cmds.values()); assert all(not re.search(r"(?<!/usr/local/bin/)docker\s+(?:exec|inspect)",v) for v in cmds.values()); assert "/usr/local/bin/docker exec " in ac and "/usr/local/bin/docker inspect " in ac; assert "/usr/local/bin/docker exec " in table["TC-1"] and "docker inspect" not in table["TC-1"]; assert "/usr/local/bin/docker inspect " in table["TC-2"] and "docker exec" not in table["TC-2"]; child=r"test -z \"\${FLEET_KEY+x}\""; old_empty=r"test -z \"\${FLEET_KEY:-}\""; assert child in ac and child in table["TC-1"]; assert old_empty not in ac and old_empty not in table["TC-1"]; sentinel=r"printf \"%s\\n\" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT"; assert sentinel in ac and sentinel in table["TC-1"]; assert all("printenv" not in v and "echo " not in v for v in cmds.values()); [subprocess.run(["bash","-n","-c",v],check=True) for v in cmds.values()]; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==["- services/platform/deploy/compose/compose.yaml (MODIFY - scheduler service block only)"]; assert req["AC-1"]["maps_to_ac"] is None and req["TC-1"]["maps_to_ac"]=="AC-1" and req["TC-2"]["maps_to_ac"]=="AC-1"; print("target_contract_ok=1 commands_bash_n=3 remote_wrappers=3 verification_gates=2 target_write_allowed=1")' "$target"`

## Fixtures

**`impossible-child-env-verifier`** — The current task asks an ad-hoc `docker exec` child to observe a variable exported only by the PID-1 command script. _(seed: cli)_

- implementation_commit=0892b96a4632cf41d15f19f8c60f4ad28f30c76b
- mounted_secret=/run/secrets/fleet_key
- process_oracle=/proc/1/environ
- incorrect_child_oracle=[ -n "$FLEET_KEY" ]

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-03-PID1-ENV.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md

**WRITE-PROHIBITED**

- Every other repository path.
- `.kb-run-sprint/state.json` and all task/sprint/roadmap status surfaces.
- `services/**`, `.tmp/**`, remote hosts, containers, services, volumes, secrets, and network configuration.

## Verification Gates

1. **Target task contract:** Run the exact AC-1 verifier. Expected: `target_contract_ok=1 commands_bash_n=3 remote_wrappers=3 verification_gates=2 target_write_allowed=1`.
2. **Target scenario:** `python3 -c 'import json,re,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; print(json.dumps(json.loads(matches[0])))' .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`. Expected: `ok=true`, `scenario_count=1`, zero violations.
3. **Repair contract:** `repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-03-PID1-ENV.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); assert c["task_id"]=="SPEC-REPAIR-S33-OPS-03-PID1-ENV" and c["tdd_mode"]=="skipped"; assert c["verification_policy"]=={"requires_tests":True,"requires_red_evidence":False,"requires_seeded_evidence":False,"tdd_lineage_required":False}; assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1"]; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; print(json.dumps(c))' "$repair" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`. Expected: `ok=true`, `scenario_count=1`, zero violations.
4. **Planning-only scope:** `python3 -c 'import subprocess; got=subprocess.check_output(["git","diff","--name-only","10c4e6c2870cdc4841a2c0c3d773f53408196667...HEAD"],text=True).splitlines(); expected={".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-03-PID1-ENV.md",".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md"}; assert len(got)==2 and set(got)==expected'`. Expected: exit 0 after commit.

## Agent Assignment

**planner** — This is a bounded task-contract correction that aligns the verifier with the existing secure process boundary; it authorizes no implementation or runtime action.

## Dependencies

- **Depends on:** S33-OPS-03 implementation commit `0892b96a4632cf41d15f19f8c60f4ad28f30c76b` and the reviewer finding that the separate exec child does not inherit PID-1-only exports.
- **Blocks:** S33-OPS-03 review until its verifier tests the correct process without weakening secret handling.

## Notes

- Future execution of S33-OPS-03 remains responsible for the already-planned real remote host, scheduler health, named-volume preservation, and no-secret-output proof.
- This repair changes only what constitutes truthful verification of the landed design.

## Verification Policy

- TDD mode: skipped.
- Tests required: yes, deterministic contract and shell-grammar validation.
- RED evidence required: no.
- Seeded evidence required: no; the downstream S33-OPS-03 task retains its real-service seeded-evidence requirement.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-03-PID1-ENV",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "impossible-child-env-verifier": {
      "description": "The current S33-OPS-03 verifier asks a separate docker exec child to observe FLEET_KEY even though the secure command script exports it only into PID 1.",
      "seed_method": "cli",
      "records": [
        "implementation_commit=0892b96a4632cf41d15f19f8c60f4ad28f30c76b",
        "mounted_secret=/run/secrets/fleet_key",
        "process_oracle=/proc/1/environ",
        "incorrect_child_oracle=[ -n $FLEET_KEY ]"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN FLEET_KEY is securely exported only into scheduler PID 1 WHEN the S33-OPS-03 contract is repaired THEN its exact shell-valid commands use bounded authenticated SSH and absolute remote Docker to prove configured FLEET_URL, nonempty PID-1 FLEET_KEY, literal exec-child FLEET_KEY absence, exact remote healthy state, no runtime-value output, and the unchanged one-file implementation scope.",
      "verify": "target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md; python3 -c 'import hashlib,json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; ac=re.search(r\"### AC-1.*?\\n- \\*\\*Verify:\\*\\* `(.*?)`\",t,re.S).group(1); table=dict(re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| AC-\\d+ \\| `(.*?)` \\|$\",t,re.M)); gates=dict(re.findall(r\"^\\| (live scheduler process has the bounded fleet contract|scheduler health is exactly healthy) \\| `(.*?)` \\|\",t,re.M)); assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"TC-1\",\"TC-2\"]; assert ac==req[\"AC-1\"][\"verify\"] and table[\"TC-1\"]==req[\"TC-1\"][\"verify\"] and table[\"TC-2\"]==req[\"TC-2\"][\"verify\"]; assert gates=={\"live scheduler process has the bounded fleet contract\":table[\"TC-1\"],\"scheduler health is exactly healthy\":table[\"TC-2\"]}; assert hashlib.sha256(ac.encode()).hexdigest()==\"3cf2b56f3b00baf19b666565e20e414a9dc06d98d185d3aa79b594185b3476bc\"; assert hashlib.sha256(table[\"TC-1\"].encode()).hexdigest()==\"6ecdfed4cf5ca97d979c16b8ecbc2eb21e03206bb389a6d2aab3bd6ea3ad43ee\"; assert hashlib.sha256(table[\"TC-2\"].encode()).hexdigest()==\"3d3bb13f1ead3e6d0b8437dec24ba920d290cc776d3d1a0c064cba4b6247eed3\"; cmds={\"AC-1\":ac,\"TC-1\":table[\"TC-1\"],\"TC-2\":table[\"TC-2\"]}; prefix=\"ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron\"; assert all(v.startswith(prefix+\" \") and v.count(prefix)==1 for v in cmds.values()); assert all(not re.search(r\"(?<!/usr/local/bin/)docker\\s+(?:exec|inspect)\",v) for v in cmds.values()); assert \"/usr/local/bin/docker exec \" in ac and \"/usr/local/bin/docker inspect \" in ac; assert \"/usr/local/bin/docker exec \" in table[\"TC-1\"] and \"docker inspect\" not in table[\"TC-1\"]; assert \"/usr/local/bin/docker inspect \" in table[\"TC-2\"] and \"docker exec\" not in table[\"TC-2\"]; child=r\"test -z \\\"\\${FLEET_KEY+x}\\\"\"; old_empty=r\"test -z \\\"\\${FLEET_KEY:-}\\\"\"; assert child in ac and child in table[\"TC-1\"]; assert old_empty not in ac and old_empty not in table[\"TC-1\"]; sentinel=r\"printf \\\"%s\\\\n\\\" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT\"; assert sentinel in ac and sentinel in table[\"TC-1\"]; assert all(\"printenv\" not in v and \"echo \" not in v for v in cmds.values()); [subprocess.run([\"bash\",\"-n\",\"-c\",v],check=True) for v in cmds.values()]; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==[\"- services/platform/deploy/compose/compose.yaml (MODIFY - scheduler service block only)\"]; assert req[\"AC-1\"][\"maps_to_ac\"] is None and req[\"TC-1\"][\"maps_to_ac\"]==\"AC-1\" and req[\"TC-2\"][\"maps_to_ac\"]==\"AC-1\"; print(\"target_contract_ok=1 commands_bash_n=3 remote_wrappers=3 verification_gates=2 target_write_allowed=1\")' \"$target\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "S33-OPS-03 task-contract parser + Bash grammar + canonical Scenario Contract validator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the old impossible child-side secret check or merely-empty absence predicate remains",
            "a formal live verifier can be satisfied by a laptop-local same-name container",
            "the PID-1 process oracle is empty, static, or disconnected from the target contract",
            "the implementation WRITE-ALLOWED list is broadened"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "impossible-child-env-verifier",
            "action": {
              "actor": "planner",
              "steps": [
                "replace the impossible exec-child FLEET_KEY assertion with distinct remote configured-container, PID-1, and literal exec-child-unset predicates",
                "wrap every target formal live verifier in exact bounded authenticated SSH and use absolute /usr/local/bin/docker for every remote Docker operation",
                "keep the target implementation WRITE-ALLOWED list at exactly one scheduler-block Compose path",
                "run the exact target-contract verifier plus canonical Scenario Contract validation"
              ]
            },
            "end_state": {
              "must_observe": [
                "target_contract_ok=1",
                "commands_bash_n=3",
                "remote_wrappers=3",
                "verification_gates=2",
                "target_write_allowed=1",
                "target AC-1 verify SHA-256 == '3cf2b56f3b00baf19b666565e20e414a9dc06d98d185d3aa79b594185b3476bc'",
                "target TC-1 verify SHA-256 == '6ecdfed4cf5ca97d979c16b8ecbc2eb21e03206bb389a6d2aab3bd6ea3ad43ee'",
                "target TC-2 verify SHA-256 == '3d3bb13f1ead3e6d0b8437dec24ba920d290cc776d3d1a0c064cba4b6247eed3'",
                "target formal live verifiers begin with exact ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron",
                "target remote Docker binary == '/usr/local/bin/docker'",
                "target TC-1 uses test -z ${FLEET_KEY+x} for literal child-variable absence"
              ],
              "must_not_observe": [
                "the target task contains the old literal '[ -n $FLEET_KEY ]' child-side check",
                "the target task uses test -z ${FLEET_KEY:-} as the child absence oracle",
                "a laptop-local same-name container can satisfy a formal live verifier",
                "an empty PID-1 process oracle passes target validation",
                "target implementation WRITE-ALLOWED count=2",
                "a verifier prints the actual FLEET_URL or FLEET_KEY value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The target task's prose and embedded requirements encode exact bounded SSH wrappers, absolute remote Docker paths, the literal-unset PID-1 secret boundary, live Verification Gate parity, and exactly one implementation WRITE-ALLOWED path.",
      "maps_to_ac": "AC-1",
      "verify": "target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md; python3 -c 'import hashlib,json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; ac=re.search(r\"### AC-1.*?\\n- \\*\\*Verify:\\*\\* `(.*?)`\",t,re.S).group(1); table=dict(re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| AC-\\d+ \\| `(.*?)` \\|$\",t,re.M)); gates=dict(re.findall(r\"^\\| (live scheduler process has the bounded fleet contract|scheduler health is exactly healthy) \\| `(.*?)` \\|\",t,re.M)); assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"TC-1\",\"TC-2\"]; assert ac==req[\"AC-1\"][\"verify\"] and table[\"TC-1\"]==req[\"TC-1\"][\"verify\"] and table[\"TC-2\"]==req[\"TC-2\"][\"verify\"]; assert gates=={\"live scheduler process has the bounded fleet contract\":table[\"TC-1\"],\"scheduler health is exactly healthy\":table[\"TC-2\"]}; assert hashlib.sha256(ac.encode()).hexdigest()==\"3cf2b56f3b00baf19b666565e20e414a9dc06d98d185d3aa79b594185b3476bc\"; assert hashlib.sha256(table[\"TC-1\"].encode()).hexdigest()==\"6ecdfed4cf5ca97d979c16b8ecbc2eb21e03206bb389a6d2aab3bd6ea3ad43ee\"; assert hashlib.sha256(table[\"TC-2\"].encode()).hexdigest()==\"3d3bb13f1ead3e6d0b8437dec24ba920d290cc776d3d1a0c064cba4b6247eed3\"; cmds={\"AC-1\":ac,\"TC-1\":table[\"TC-1\"],\"TC-2\":table[\"TC-2\"]}; prefix=\"ssh -o BatchMode=yes -o ConnectTimeout=10 holocron@holocron\"; assert all(v.startswith(prefix+\" \") and v.count(prefix)==1 for v in cmds.values()); assert all(not re.search(r\"(?<!/usr/local/bin/)docker\\s+(?:exec|inspect)\",v) for v in cmds.values()); assert \"/usr/local/bin/docker exec \" in ac and \"/usr/local/bin/docker inspect \" in ac; assert \"/usr/local/bin/docker exec \" in table[\"TC-1\"] and \"docker inspect\" not in table[\"TC-1\"]; assert \"/usr/local/bin/docker inspect \" in table[\"TC-2\"] and \"docker exec\" not in table[\"TC-2\"]; child=r\"test -z \\\"\\${FLEET_KEY+x}\\\"\"; old_empty=r\"test -z \\\"\\${FLEET_KEY:-}\\\"\"; assert child in ac and child in table[\"TC-1\"]; assert old_empty not in ac and old_empty not in table[\"TC-1\"]; sentinel=r\"printf \\\"%s\\\\n\\\" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT\"; assert sentinel in ac and sentinel in table[\"TC-1\"]; assert all(\"printenv\" not in v and \"echo \" not in v for v in cmds.values()); [subprocess.run([\"bash\",\"-n\",\"-c\",v],check=True) for v in cmds.values()]; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==[\"- services/platform/deploy/compose/compose.yaml (MODIFY - scheduler service block only)\"]; assert req[\"AC-1\"][\"maps_to_ac\"] is None and req[\"TC-1\"][\"maps_to_ac\"]==\"AC-1\" and req[\"TC-2\"][\"maps_to_ac\"]==\"AC-1\"; print(\"target_contract_ok=1 commands_bash_n=3 remote_wrappers=3 verification_gates=2 target_write_allowed=1\")' \"$target\""
    }
  ]
}
-->
