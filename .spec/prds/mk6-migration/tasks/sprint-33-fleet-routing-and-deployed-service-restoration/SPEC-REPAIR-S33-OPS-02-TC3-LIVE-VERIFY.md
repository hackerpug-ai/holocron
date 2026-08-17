# SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY: Make the router health-flip proof safe, exact, and harvestable

> Status: Backlog
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 30 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: technical-reviewer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-02
> Blocks: S33-OPS-02 evidence harvesting and review

## Outcome

Replace S33-OPS-02 TC-3's unsafe local `docker compose ... down` probe with one shell-valid invocation of a fail-closed `health-flip` verifier mode that uses canonical `ssh holocron`, targets only the isolated auxiliary router Compose file, proves the exact degraded and restored health states, preserves deployed Mastra identity/PID/uptime, and guarantees router restoration on every exit.

**Success state:** the human-readable and embedded S33-OPS-02 TC-3 verifiers decode to the same `health-flip` command; the old local-path probe is absent; remote Docker uses exact `/usr/local/bin/docker`; the scenario requires pre-stop `ok/true/null`, post-stop `degraded/false/fleet`, restored `ok/true/null`, unchanged Mastra identity and PID, monotonic uptime, unchanged production-service and protected-primary sentinels, and a final running/healthy router; the exact `fail-after-stop` negative control exits nonzero only after independently provable cleanup; only the existing verifier, focused integration test, and evidence paths are writable.

## Critical Constraints

**MUST**

- Add a fail-closed `health-flip` mode (or an exactly equivalent named mode) to `scripts/verify-s33-router-capacity.sh` and focused real-service coverage to `tests/integration/sprint33-ops-02-router-capacity.test.ts`; preserve the existing two modes and their proof obligations.
- Keep the prose TC-3 command and embedded REQUIREMENT-CONTRACT TC-3 `verify` byte-equivalent after JSON decoding, and make that command shell-valid under `bash -n`.
- Use the canonical SSH destination `ssh holocron`, which resolves to `holocron@holocron.tail011a51.ts.net`, the exact remote isolated Compose file `/Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml`, and required absolute remote Docker CLI `/usr/local/bin/docker`; the verifier must validate it is executable and never rely on non-interactive SSH PATH lookup.
- Arm an idempotent cleanup trap before the first mutation. On normal, error, and signal exit it must restore only `litellm-router` from the exact isolated Compose file and wait for final Docker state `running` with health `healthy`; cleanup failure is a verifier failure.
- Capture and validate pre-stop `status=ok`, `fleet.ready=true`, `failing_dependency=null`; router-only-stop `status=degraded`, `fleet.ready=false`, `failing_dependency=fleet`; and restored `status=ok`, `fleet.ready=true`, `failing_dependency=null`.
- Require the deployed Mastra identity tuple and PID to remain unchanged across the cycle, require `uptimeMs` to be monotonic, and fail on any changed four-production-service identity or protected remote primary checkout HEAD/status/hash.
- Preserve raw nonempty artifacts and emit `ok=true` only after cleanup and every state, identity, uptime, production-service, protected-primary, and final-router assertion passes.
- Define `--negative-control fail-after-stop` as valid only with `health-flip`: perform the real stop and degraded assertions, deliberately fail into the already-armed cleanup, persist `failure.json`, exit nonzero, and require the focused test to independently re-read restored health plus router Docker state before continuing.

**NEVER**

- Never implement product behavior, edit either Compose file, deploy, run the live health flip, mutate network state, or write evidence while performing this planning-only repair.
- Never use `docker compose down` or bare remote `docker`; never stop, recreate, or modify `postgres`, `mastra`, `scheduler`, or `zero-cache`; never write to the protected remote primary checkout.
- Never accept a substring-only `grep degraded` oracle, a wrong/local Compose path, a laptop-only Docker command, an unbounded SSH/curl, a cleanup path armed after mutation, or an `ok=true` result emitted before restoration is proven.
- Never broaden S33-OPS-02 beyond the TC-3 verifier/test/evidence seam already owned by that task.

**STRICTLY**

- Repository writes for this repair are limited to this task and the existing S33-OPS-02 task Markdown.

## Acceptance Criteria

### AC-1 — S33-OPS-02 carries one safe, exact, fail-closed TC-3 contract

- **GIVEN** the existing TC-3 command uses the wrong local path, tears down a Compose project, asserts only a degraded substring, and has no guaranteed restore or deployed-service identity oracle.
- **WHEN** the S33-OPS-02 prose and embedded contract are repaired.
- **THEN** the old command is absent; both TC-3 representations decode to one shell-valid `health-flip` invocation; the verifier/test/scenario contract contains every exact stop/degraded/restore/identity/uptime/final-health obligation; and WRITE-ALLOWED contains only the verifier, focused test, and evidence paths.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r["id"]:r for r in c["requirements"]}; v="bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip"; old="docker compose -f router.compose.yaml down && curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q degraded"; table=dict(re.findall(r"^\| (TC-\d+) \|.*?\| .*? \| `(.*?)` \|$",t,re.M)); assert req["TC-3"]["verify"]==table["TC-3"]==v; subprocess.run(["bash","-n","-c",v],check=True); assert old not in t; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==["- scripts/verify-s33-router-capacity.sh (MODIFY verifier modes only)","- tests/integration/sprint33-ops-02-router-capacity.test.ts (MODIFY focused verifier coverage only)","- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)"]; required=["canonical ssh holocron","--remote-docker-bin /usr/local/bin/docker","/usr/local/bin/docker compose","--negative-control fail-after-stop","intentional_failure_observed=true","cleanup_restore_attempted=true","failure.json","status=degraded","fleet.ready=false","failing_dependency=fleet","deployment_identity_unchanged==true","deployment_pid_unchanged==true","deployment_uptime_monotonic==true","production_service_identities_unchanged==true","remote_primary_unchanged==true","all three verifier modes"]; missing=[x for x in required if x not in t]; assert not missing,("missing",missing); assert c["verification_policy"]["requires_tests"] is True' "$task"`
- **Tier:** static · **Service:** task-contract parser + Bash grammar · **Flow:** sprint governance

## Test Criteria

### TC-1 — The repair contract is extractable, shell-valid, and scenario-valid

- **GIVEN** this repair task has exactly one outer REQUIREMENT-CONTRACT with AC-1 and TC-1.
- **WHEN** the contract is parsed, every static verifier is checked with `bash -n`, and the canonical Scenario Contract validator runs.
- **THEN** `requires_tests=true`, the requirement IDs are exactly `AC-1` and `TC-1`, both verifier strings are shell-valid, and validation emits `ok:true`, `scenario_count:1`, and zero violations.
- **Verify:** `repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); assert c["task_id"]=="SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY"; assert c["verification_policy"]["requires_tests"] is True; assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1"]; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; print(json.dumps(c))' "$repair" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
- **Tier:** static · **Service:** REQUIREMENT-CONTRACT parser + canonical Scenario Contract validator · **Flow:** sprint governance

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md` — only task contract being repaired.
- `/Users/justinrich/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md` — canonical fakeability and scenario validation rules.

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md

**WRITE-PROHIBITED**

- Every other repository path.
- All product code, test code, Compose/deployment files, evidence directories, local or remote services, containers, checkouts, credentials, and network state.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 repaired target contract | Run AC-1's exact static verifier from repository root | Exit 0 |
| TC-1 repair extraction + scenario | Run TC-1's exact extraction/validation pipeline from repository root | Exit 0; validator emits `"ok": true`, `"scenario_count": 1`, `"violations": []` |
| stale unsafe verifier scan | `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; ! rg -n -F "docker compose -f router.compose.yaml down && curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q degraded" "$task"` | Exit 0 with no matches |
| scope compliance | `git diff --name-only HEAD` | Exactly the two WRITE-ALLOWED planning files |

## Agent Assignment

**planner** — This is a task-contract correction that makes a live operational proof deterministic, safe, extractable, and testable without implementing or executing it.

## Dependencies

- **Depends on:** S33-OPS-02's completed live worker evidence identifying the exact isolated router Compose path and proving the stop/degraded/restore/identity cycle manually.
- **Blocks:** S33-OPS-02 evidence harvesting and review until TC-3 is safe and machine-runnable.

## Notes

- This repair authorizes future verifier/test/evidence work only through the repaired S33-OPS-02 WRITE-ALLOWED list; it authorizes no product or deployment change.
- TDD is skipped for this planning-only edit, but deterministic static tests remain required and `verification_policy.requires_tests` is intentionally `true`.

## Verification Policy

- TDD mode: skipped.
- Tests required: yes.
- RED evidence required: no.
- Seeded evidence required: no.
- Exact AC-1 verification and canonical TC-1 scenario validation are blocking before commit.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "unsafe-tc3-contract": {
      "description": "S33-OPS-02 contains a local-path docker compose down command with a substring-only degraded oracle and no guaranteed restore.",
      "seed_method": "cli",
      "records": [
        "old TC-3 verify=docker compose -f router.compose.yaml down followed by grep -q degraded"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "The S33-OPS-02 prose and embedded TC-3 contracts use one shell-valid fail-closed health-flip verifier with canonical SSH, exact absolute remote Docker and isolated Compose targeting, guaranteed restoration, exact health triplet, unchanged Mastra identity/PID, monotonic uptime, unchanged production/primary sentinels, final running/healthy router proof, and an exact intentional-failure cleanup control.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; v=\"bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip\"; old=\"docker compose -f router.compose.yaml down && curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q degraded\"; table=dict(re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| .*? \\| `(.*?)` \\|$\",t,re.M)); assert req[\"TC-3\"][\"verify\"]==table[\"TC-3\"]==v; subprocess.run([\"bash\",\"-n\",\"-c\",v],check=True); assert old not in t; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==[\"- scripts/verify-s33-router-capacity.sh (MODIFY verifier modes only)\",\"- tests/integration/sprint33-ops-02-router-capacity.test.ts (MODIFY focused verifier coverage only)\",\"- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)\"]; required=[\"canonical ssh holocron\",\"--remote-docker-bin /usr/local/bin/docker\",\"/usr/local/bin/docker compose\",\"--negative-control fail-after-stop\",\"intentional_failure_observed=true\",\"cleanup_restore_attempted=true\",\"failure.json\",\"status=degraded\",\"fleet.ready=false\",\"failing_dependency=fleet\",\"deployment_identity_unchanged==true\",\"deployment_pid_unchanged==true\",\"deployment_uptime_monotonic==true\",\"production_service_identities_unchanged==true\",\"remote_primary_unchanged==true\",\"all three verifier modes\"]; missing=[x for x in required if x not in t]; assert not missing,(\"missing\",missing); assert c[\"verification_policy\"][\"requires_tests\"] is True' \"$task\"",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "S33-OPS-02 task-contract parser + Bash grammar + canonical Scenario Contract validator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the old unsafe command remains",
            "the embedded verifier is static or differs from prose",
            "the cleanup, absolute Docker, intentional-failure, identity, or final-router oracle is omitted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "unsafe-tc3-contract",
            "action": {
              "actor": "planner",
              "steps": [
                "replace the prose and embedded TC-3 verifier with the same shell-valid health-flip invocation",
                "align the S33-OPS-02 scenario, absolute remote Docker requirement, fail-after-stop interface, verifier/test contract, and WRITE-ALLOWED list",
                "run the exact AC-1 static verifier and canonical Scenario Contract validator"
              ]
            },
            "end_state": {
              "must_observe": [
                "prose TC-3 verify == embedded TC-3 verify == the exact health-flip command",
                "verification_policy.requires_tests==true",
                "WRITE-ALLOWED contains exactly 3 verifier/test/evidence entries",
                "health-flip requires remote_docker_bin=='/usr/local/bin/docker' and fail-after-stop writes failure.json before an independently observed restored router",
                "canonical scenario validation returns ok==true and scenario_count==1"
              ],
              "must_not_observe": [
                "the old docker compose down plus grep command remains",
                "an empty cleanup, absolute-Docker, intentional-failure, identity, uptime, or final-router assertion set",
                "router.compose.yaml appears in WRITE-ALLOWED"
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
      "description": "The repair contract is uniquely extractable, requires tests, contains exactly AC-1 and TC-1, has shell-valid static verifiers, and passes canonical scenario validation with one scenario and zero violations.",
      "verify": "repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); assert c[\"task_id\"]==\"SPEC-REPAIR-S33-OPS-02-TC3-LIVE-VERIFY\"; assert c[\"verification_policy\"][\"requires_tests\"] is True; assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"TC-1\"]; [subprocess.run([\"bash\",\"-n\",\"-c\",r[\"verify\"]],check=True) for r in c[\"requirements\"]]; print(json.dumps(c))' \"$repair\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"
    }
  ]
}
-->
