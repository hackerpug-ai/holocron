# SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS: Make router evidence immutable and invocation-addressed

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

Repair S33-OPS-02 so every verifier invocation writes one immutable evidence run and identifies it on stdout, rather than overwriting mutable artifacts at a shared evidence root.

**Success state:** existing formal verifier command arguments remain byte-for-byte exact; each accepted `--evidence-dir` is a base beneath which the invocation allocates `<base>/runs/<run_id>`; stdout carries the nonempty `run_id` and confined `run_dir`; all result, raw, request, status, header, body, log, and failure artifacts live beneath that one run; no base-level copies, symlinks, `latest` pointers, or newest-run discovery exist; and the intentional-failure gate captures nonzero stdout, validates the selected negative run physically, then applies every existing cleanup, raw-state, identity, uptime, container, primary, fresh-health, and router assertion to that same run.

## Critical Constraints

**MUST**

- Preserve all existing S33-OPS-02 AC/TC `verify` strings exactly, including every `--evidence-dir` argument. Those values become evidence bases; they are not rewritten to include a run ID.
- Keep the exact two-entry base allowlist only for mutating `health-flip`. `models-reviewer` and `implementer-distribution` retain their formal bases while focused-test bases may vary only when confined beneath `.tmp/S33-OPS-02/**`.
- Require every accepted invocation to allocate a new collision-free `<base>/runs/<run_id>`, emit one final stdout JSON object with nonempty `run_id` and `run_dir`, and keep every artifact in that directory.
- Rewrite the exact negative-control gate to capture stdout from the intentional nonzero exit, parse `run_id`/`run_dir`, require exact lexical and physical confinement beneath `.tmp/S33-OPS-02/health-flip-negative`, reject symlinks, and only then read failure/raw artifacts through `$neg_run`.
- Preserve all existing negative-control assertions, including the three raw health states, finite numeric uptime ordering, Mastra identity/PID, exactly four production-container identities, protected-primary sentinel, bounded fresh HTTP, and bounded absolute-Docker SSH.
- Align the human Design, Verification Gates, scenarios, and embedded S33-OPS-02 REQUIREMENT-CONTRACT without weakening its real-service topology or fakeability controls.

**NEVER**

- Never implement or edit product code, tests, verifier scripts, Compose files, evidence directories, local/remote services, containers, checkouts, credentials, fleet state, or network state in this planning-only repair.
- Never create a mutable base-level result/raw/failure/request copy, symlink, `latest` pointer, alias, or scan for a newest run.
- Never broaden the exact health-flip base allowlist to the non-mutating modes, whose focused integration-test bases are intentionally variable but confined.
- Never change the formal AC-1, AC-2, or TC-1 through TC-6 verifier command arguments.

**STRICTLY**

- Repository writes are limited to this repair task and the existing S33-OPS-02 task Markdown.

## Specification

**Objective:** Replace S33-OPS-02's shared-root artifact contract with a per-invocation immutable-run contract while preserving every formal verifier interface and operational invariant.

**Success looks like:** deterministic static verification proves exact command preservation, required run-addressing tokens, absence of stale fixed-root artifact reads/promises, shell validity of the rewritten negative gate, and canonical validity of both target scenarios.

## Acceptance Criteria

### AC-1 — S33-OPS-02 binds every proof artifact to one stdout-selected immutable run

- **GIVEN** the task currently promises shared-root `result.json`, `requests/`, raw health files, and negative-control files that a later invocation can overwrite.
- **WHEN** its prose and embedded scenario contract are repaired.
- **THEN** all eight formal requirement verifier strings remain exact; every accepted base allocates a unique run and emits `run_id`/`run_dir`; model/distribution focused bases retain confined flexibility; health-flip retains only its exact normal/control bases; the negative gate is shell-valid and reads only its validated `$neg_run`; stale shared-root reads/promises are absent; and target scenario validation returns two valid scenarios with zero violations.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r["id"]:r for r in c["requirements"]}; models="bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer"; distribution="bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution"; health="bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip"; integration="PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts"; reality="python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json"; expected={"AC-1":models,"AC-2":distribution,"TC-1":models,"TC-2":models,"TC-3":health,"TC-4":distribution,"TC-5":integration,"TC-6":reality}; assert {k:req[k]["verify"] for k in expected}==expected; ac1=re.search(r"### AC-1.*?\*\*Verify:\*\* `(.*?)`\n",t,re.S).group(1); ac2=re.search(r"### AC-2.*?\*\*Verify:\*\* `(.*?)`\n",t,re.S).group(1); table=dict(re.findall(r"^\| (TC-\d+) \|.*?\| .*? \| `(.*?)` \|$",t,re.M)); assert ac1==models and ac2==distribution and table=={k:expected[k] for k in ("TC-1","TC-2","TC-3","TC-4","TC-5","TC-6")}; design=re.search(r"### Fail-closed verifier contract\s*(.*?)\s*## Verification Gates",t,re.S).group(1); rows={name.strip():cmd for name,cmd,_ in re.findall(r"^\| ([^|]+) \| `(.*?)` \| (.*?) \|$",t,re.M)}; neg=rows["cleanup negative control bites and independently restores"]; subprocess.run(["bash","-n","-c",neg],check=True); required=["<base>/runs/<run_id>","one final stdout JSON object","nonempty `run_id` and confined `run_dir`","collision-free","focused integration-test bases for those two non-mutating modes may vary but must remain confined beneath `.tmp/S33-OPS-02/**`","Keep the exact two-entry allowlist only for mutating `health-flip`","<run_dir>/result.json","<run_dir>/failure.json","<run_dir>/requests/","never create or update base-level artifact copies, symlinks, or `latest` pointers","capture stdout despite the intentional nonzero exit","must never scan `runs/` to guess the newest proof"]; assert not [x for x in required if x not in t]; stale=["<evidence-dir>/result.json","<evidence-dir>/requests/","\"$neg/failure.json\"","\"$neg/health.pre.json\"","\"$neg/health.degraded.json\"","\"$neg/health.restored.json\"","\"$neg/production-containers.pre.json\"","\"$neg/production-containers.post.json\"","\"$neg/remote-primary.pre.json\"","\"$neg/remote-primary.post.json\""]; assert not [x for x in stale if x in t]; neg_required=["if neg_json=$(bash scripts/verify-s33-router-capacity.sh","run_id=$(printf","neg_run=$(printf",".run_dir | select(type == \"string\" and . == ($neg + \"/runs/\" + $run_id))","test -d \"$neg_run\"","test ! -L \"$neg_run\"","neg_real=$(realpath \"$neg\")","run_real=$(realpath \"$neg_run\")","test \"$run_real\" = \"$neg_real/runs/$run_id\"","$neg_run/failure.json","$neg_run/health.pre.json","$neg_run/health.degraded.json","$neg_run/health.restored.json","$neg_run/production-containers.pre.json","$neg_run/production-containers.post.json","$neg_run/remote-primary.pre.json","$neg_run/remote-primary.post.json","curl --fail --silent --show-error --connect-timeout 5 --max-time 20","ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 holocron"]; assert not [x for x in neg_required if x not in neg]; assert neg.count("jq -s -e")==3 and neg.count("curl ")==1 and neg.count("ssh ")==1; assert all(x in design for x in ("same run","All result, raw, request, status, header, body, log, and failure artifacts live only below that run directory","no mutable artifact copies, symlinks, `latest` pointers, or aliases")); print(json.dumps(c))' "$task" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
- **Tier:** static · **Service:** task-contract parser + Bash grammar + canonical Scenario Contract validator · **Flow:** sprint governance

## Test Criteria

### TC-1 — The repair contract is extractable, shell-valid, and scenario-valid

- **GIVEN** this repair task has exactly one outer REQUIREMENT-CONTRACT with AC-1 and TC-1.
- **WHEN** the contract is parsed, both static verifier strings are checked with `bash -n`, and the canonical Scenario Contract validator runs.
- **THEN** `requires_tests=true`, the IDs are exactly `AC-1` and `TC-1`, both verifier strings are shell-valid, and validation emits `ok:true`, `scenario_count:1`, and zero violations.
- **Verify:** `repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); assert c["task_id"]=="SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS"; assert c["verification_policy"]["requires_tests"] is True; assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1"]; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; print(json.dumps(c))' "$repair" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
- **Tier:** static · **Service:** REQUIREMENT-CONTRACT parser + canonical Scenario Contract validator · **Flow:** sprint governance

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md` — only existing task contract being repaired.
- `/Users/justinrich/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md` — canonical fakeability and scenario validation rules.

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md

**WRITE-PROHIBITED**

- Every other repository path.
- All product code, test code, verifier scripts, Compose/deployment files, evidence directories, local or remote services, containers, checkouts, credentials, fleet configuration, tracker state, and network state.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 target contract | Run AC-1's exact static extraction/validation pipeline from repository root | Exit 0; target validator emits `"ok": true`, `"scenario_count": 2`, `"violations": []` |
| TC-1 repair contract | Run TC-1's exact extraction/validation pipeline from repository root | Exit 0; repair validator emits `"ok": true`, `"scenario_count": 1`, `"violations": []` |
| stale fixed-root scan | `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; ! rg -n -F -e '<evidence-dir>/result.json' -e '<evidence-dir>/requests/' -e '"$neg/failure.json"' -e '"$neg/health.pre.json"' -e '"$neg/health.degraded.json"' -e '"$neg/health.restored.json"' -e '"$neg/production-containers.pre.json"' -e '"$neg/production-containers.post.json"' -e '"$neg/remote-primary.pre.json"' -e '"$neg/remote-primary.post.json"' "$task"` | Exit 0 with no matches |
| scope compliance | `git diff --name-only HEAD` | Exactly the two WRITE-ALLOWED planning files |
| protected main | `test "$(git rev-parse main)" = "ddf85d302e036574e53a393e95c47db000eb7b9f"` | Exit 0 |

## Agent Assignment

**planner** — This task repairs only deterministic planning contracts and static proof gates while preserving the existing real-service operational scope.

## Dependencies

- **Depends on:** S33-OPS-02's existing fail-closed live verifier contract and exact formal command surface.
- **Blocks:** S33-OPS-02 evidence harvesting and review until proof runs cannot overwrite or ambiguously alias one another.

## Notes

- This repair authorizes no implementation, evidence generation, deployment, or service mutation.
- TDD is skipped for the planning-only edit; deterministic static checks and canonical scenario validation remain required.

## Verification Policy

- TDD mode: skipped.
- Tests required: yes.
- RED evidence required: no.
- Seeded evidence required: no.
- Exact AC-1 and TC-1 static verification is blocking before commit.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "mutable-evidence-root-contract": {
      "description": "S33-OPS-02 promises fixed-root result, request, failure, and raw artifacts that later verifier invocations can overwrite or mix.",
      "seed_method": "cli",
      "records": [
        "stale result path=<evidence-dir>/result.json",
        "stale request path=<evidence-dir>/requests/",
        "stale negative reads=$neg/{failure,health.*,production-containers.*,remote-primary.*}.json"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "The S33-OPS-02 prose, Design, Verification Gates, scenarios, and embedded contract preserve every formal verifier command while requiring a fresh stdout-addressed immutable runs/<run_id> directory, run-local artifacts, no mutable base aliases, and same-run negative-control recomputation.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; models=\"bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer\"; distribution=\"bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution\"; health=\"bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip\"; integration=\"PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts\"; reality=\"python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json\"; expected={\"AC-1\":models,\"AC-2\":distribution,\"TC-1\":models,\"TC-2\":models,\"TC-3\":health,\"TC-4\":distribution,\"TC-5\":integration,\"TC-6\":reality}; assert {k:req[k][\"verify\"] for k in expected}==expected; ac1=re.search(r\"### AC-1.*?\\*\\*Verify:\\*\\* `(.*?)`\\n\",t,re.S).group(1); ac2=re.search(r\"### AC-2.*?\\*\\*Verify:\\*\\* `(.*?)`\\n\",t,re.S).group(1); table=dict(re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| .*? \\| `(.*?)` \\|$\",t,re.M)); assert ac1==models and ac2==distribution and table=={k:expected[k] for k in (\"TC-1\",\"TC-2\",\"TC-3\",\"TC-4\",\"TC-5\",\"TC-6\")}; design=re.search(r\"### Fail-closed verifier contract\\s*(.*?)\\s*## Verification Gates\",t,re.S).group(1); rows={name.strip():cmd for name,cmd,_ in re.findall(r\"^\\| ([^|]+) \\| `(.*?)` \\| (.*?) \\|$\",t,re.M)}; neg=rows[\"cleanup negative control bites and independently restores\"]; subprocess.run([\"bash\",\"-n\",\"-c\",neg],check=True); required=[\"<base>/runs/<run_id>\",\"one final stdout JSON object\",\"nonempty `run_id` and confined `run_dir`\",\"collision-free\",\"focused integration-test bases for those two non-mutating modes may vary but must remain confined beneath `.tmp/S33-OPS-02/**`\",\"Keep the exact two-entry allowlist only for mutating `health-flip`\",\"<run_dir>/result.json\",\"<run_dir>/failure.json\",\"<run_dir>/requests/\",\"never create or update base-level artifact copies, symlinks, or `latest` pointers\",\"capture stdout despite the intentional nonzero exit\",\"must never scan `runs/` to guess the newest proof\"]; assert not [x for x in required if x not in t]; stale=[\"<evidence-dir>/result.json\",\"<evidence-dir>/requests/\",\"\\\"$neg/failure.json\\\"\",\"\\\"$neg/health.pre.json\\\"\",\"\\\"$neg/health.degraded.json\\\"\",\"\\\"$neg/health.restored.json\\\"\",\"\\\"$neg/production-containers.pre.json\\\"\",\"\\\"$neg/production-containers.post.json\\\"\",\"\\\"$neg/remote-primary.pre.json\\\"\",\"\\\"$neg/remote-primary.post.json\\\"\"]; assert not [x for x in stale if x in t]; neg_required=[\"if neg_json=$(bash scripts/verify-s33-router-capacity.sh\",\"run_id=$(printf\",\"neg_run=$(printf\",\".run_dir | select(type == \\\"string\\\" and . == ($neg + \\\"/runs/\\\" + $run_id))\",\"test -d \\\"$neg_run\\\"\",\"test ! -L \\\"$neg_run\\\"\",\"neg_real=$(realpath \\\"$neg\\\")\",\"run_real=$(realpath \\\"$neg_run\\\")\",\"test \\\"$run_real\\\" = \\\"$neg_real/runs/$run_id\\\"\",\"$neg_run/failure.json\",\"$neg_run/health.pre.json\",\"$neg_run/health.degraded.json\",\"$neg_run/health.restored.json\",\"$neg_run/production-containers.pre.json\",\"$neg_run/production-containers.post.json\",\"$neg_run/remote-primary.pre.json\",\"$neg_run/remote-primary.post.json\",\"curl --fail --silent --show-error --connect-timeout 5 --max-time 20\",\"ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 holocron\"]; assert not [x for x in neg_required if x not in neg]; assert neg.count(\"jq -s -e\")==3 and neg.count(\"curl \")==1 and neg.count(\"ssh \")==1; assert all(x in design for x in (\"same run\",\"All result, raw, request, status, header, body, log, and failure artifacts live only below that run directory\",\"no mutable artifact copies, symlinks, `latest` pointers, or aliases\")); print(json.dumps(c))' \"$task\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "S33-OPS-02 task-contract parser + Bash grammar + canonical Scenario Contract validator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "a static rewrite changes a formal verifier command",
            "a stub keeps a fixed-root artifact read or mutable alias",
            "empty intentional-failure stdout prevents run confinement before artifact reads"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mutable-evidence-root-contract",
            "action": {
              "actor": "planner",
              "steps": [
                "preserve all formal S33-OPS-02 verifier commands while redefining accepted evidence-dir arguments as bases",
                "align prose, Design, Verification Gates, and target scenarios on immutable base/runs/run_id allocation and stdout discovery",
                "rewrite the intentional-nonzero gate to validate the stdout-selected negative run before applying every existing assertion",
                "run the exact static verifier and canonical target scenario validator"
              ]
            },
            "end_state": {
              "must_observe": [
                "formal_verify_string_count==8 and changed_formal_verify_string_count==0",
                "target_run_contract_tokens_present>=12",
                "stale_fixed_root_artifact_reference_count==0",
                "negative_gate_shell_parse_exit==0",
                "negative_gate_same_run_artifact_read_count==8",
                "target scenario validation returns ok==true and scenario_count==2"
              ],
              "must_not_observe": [
                "empty stdout run_id/run_dir or stale_fixed_root_artifact_reference_count>0",
                "a base-level result, request, failure, health, production-container, or remote-primary artifact read",
                "a mutable copy, symlink, latest pointer, or newest-run scan",
                "an exact-only models-reviewer or implementer-distribution base allowlist"
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
      "verify": "repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); assert c[\"task_id\"]==\"SPEC-REPAIR-S33-OPS-02-EVIDENCE-RUNS\"; assert c[\"verification_policy\"][\"requires_tests\"] is True; assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"TC-1\"]; [subprocess.run([\"bash\",\"-n\",\"-c\",r[\"verify\"]],check=True) for r in c[\"requirements\"]]; print(json.dumps(c))' \"$repair\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"
    }
  ]
}
-->
