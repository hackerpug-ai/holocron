# SPEC-REPAIR-S33-OPS-04-VERIFY: Make every fleet-independence verifier executable and fail closed

> Status: ✅ Completed
> Cycle: 2
> Commit: 0144e8d2497bd3db5eaefbafe1517072b5aa48ee
> Reviewer: product-manager+code-reviewer
> Completed: 2026-08-18T01:31:24Z
> Assignee: planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 30 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-03
> Blocks: S33-OPS-04 execution and review

## Outcome

Repair S33-OPS-04's non-executable and nonzero-success verifier text before implementation so every formal requirement has one shell-valid, fail-closed, exit-0-on-success command grounded in the actual Compose contract and the three real fleet endpoints.

**Success state:** S33-OPS-04 retains its one-file implementation scope, requires `production.env.example` to contain exactly one total `FLEET_URL=` assignment whose sole value is exactly `FLEET_URL=http://host.docker.internal:4545`, explicitly rejects `/v1`, renders the real Compose file with all required example-only variables, rejects grep errors rather than mistaking them for absence, directly validates exact nonempty model IDs on inference1, inference2, and Holocron with bounded curls, and accepts inference-body non-identity only when `cmp` exits exactly 1.

## Critical Constraints

**MUST**

- Keep every S33-OPS-04 human-readable AC/TC/Verification Gate command byte-equivalent to its REQUIREMENT-CONTRACT counterpart after JSON decoding.
- Require every formal verifier to be shell-valid under `bash -n` and to exit 0 only when its claimed state is observed.
- Require the future implementation to leave exactly one total `FLEET_URL=` assignment in `services/platform/deploy/compose/production.env.example`; require that sole assignment to be exactly `FLEET_URL=http://host.docker.internal:4545`, explicitly reject `/v1`, and match `services/platform/config/secrets.example.yaml`.
- Use the actual Docker Compose CLI and explicit non-secret example values for `POSTGRES_PASSWORD`, `DATABASE_URL`, `MASTRA_API_KEY`, `FLEET_KEY`, and `ZERO_ADMIN_PASSWORD`.
- Use bounded direct requests to inference1:8003, inference2:8003, and holocron:4545; validate each exact expected nonempty model ID array; and require the two validated inference response bodies to make `cmp` exit exactly 1.
- Preserve S33-OPS-04's exact future implementation WRITE-ALLOWED list: only `services/platform/deploy/compose/production.env.example (MODIFY)`.

**NEVER**

- Never leave a pseudo verifier, placeholder such as `grep + 3x curl`, ellipsis, an unbounded curl, or a command whose desired success is exit 1.
- Never treat grep exit 2 or `cmp` exit 2 as a successful absence/non-identity result.
- Never implement the production.env.example change, touch source/evidence/runtime state, mutate tracker state, merge, push, deploy, or mutate a remote host in this planning-only repair.
- Never perform a network-disruption drill; the sprint Human Testing Gate owns any separately authorized second-device continuity exercise.

**STRICTLY**

- Repository writes for this repair are limited to this file and the existing S33-OPS-04 task Markdown.

## Acceptance Criteria

### AC-1 — The target contract is exact, executable, fail closed, and implementation-bounded

- **GIVEN** S33-OPS-04 currently encodes desired grep exit 1 as verifier success, uses the literal pseudo command `grep + 3x curl`, leaves TC-2 as an ellipsis, and sequences prose checks with semicolons and `echo`.
- **WHEN** the task prose, tables, scenarios, and REQUIREMENT-CONTRACT are repaired.
- **THEN** all four requirement commands and both Verification Gates are byte-equivalent by role, shell-valid, hash-pinned, free of placeholders/ellipses/nonzero-success drift, and structurally require exactly one total FLEET_URL assignment, exactly one exact canonical assignment, explicit `/v1` absence, all required Compose inputs, three bounded direct curls, exact model IDs, `cmp_status == 1`, and the unchanged one-file implementation scope; a canonical-plus-stale duplicate fixture exits exactly 1.
- **Verify:** `target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md; python3 -c 'import hashlib,json,re,subprocess,sys,tempfile; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r["id"]:r for r in c["requirements"]}; assert [r["id"] for r in c["requirements"]]==["AC-1","AC-2","TC-1","TC-2"]; one=req["AC-1"]["verify"]; two=req["AC-2"]["verify"]; assert one==req["TC-1"]["verify"] and two==req["TC-2"]["verify"]; tick=chr(96); assert t.count(tick+one+tick)==3 and t.count(tick+two+tick)==3; assert "| corrected example renders | "+tick+one+tick+" |" in t and "| direct fleet endpoints are real and independent | "+tick+two+tick+" |" in t; assert hashlib.sha256(one.encode()).hexdigest()=="ce26f3728823be34cfe23d5a52d679db84448659466591e78d4a9775bf01c15c" and hashlib.sha256(two.encode()).hexdigest()=="4c660aeb98a4411273ba7fdf10c1841c136f7c19884c63a3762e227761669890"; cmds=[r["verify"] for r in c["requirements"]]; assert all("grep + 3x curl" not in v and "..." not in v and "echo exit=$?" not in v for v in cmds); [subprocess.run(["bash","-n","-c",v],check=True) for v in cmds]; required_env=["POSTGRES_PASSWORD=example","DATABASE_URL=postgres://example:example@postgres:5432/holocron","MASTRA_API_KEY=example","FLEET_KEY=sk-none","ZERO_ADMIN_PASSWORD=example"]; assert all(x in one for x in required_env); quote=chr(39); fleet_shape="total_assignments=$(grep -c "+quote+"^FLEET_URL="+quote+" \"$fleet_env\") && test \"$total_assignments\" -eq 1 && canonical_assignments=$(grep -Fxc "+quote+"FLEET_URL=http://host.docker.internal:4545"+quote+" \"$fleet_env\") && test \"$canonical_assignments\" -eq 1 && { if grep -nE "+quote+"^FLEET_URL=.*/v1(/|$)"+quote+" \"$fleet_env\"; then false; else test \"$?\" -eq 1; fi; }"; assert one.count(fleet_shape)==1 and one.count("test \"$?\" -eq 1")==2; assert "fleet_env=services/platform/deploy/compose/production.env.example" in one and "docker compose --env-file \"$fleet_env\"" in one and "config --quiet" in one; guard=fleet_shape.replace("$fleet_env","$1"); fixture=tempfile.NamedTemporaryFile(mode="w+",encoding="utf-8"); fixture.write("FLEET_URL=http://host.docker.internal:4545\n"); fixture.flush(); canonical_status=subprocess.run(["bash","-c",guard,"_",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.write("FLEET_URL=http://host.docker.internal:4545/v1\n"); fixture.flush(); duplicate_status=subprocess.run(["bash","-c",guard,"_",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.close(); assert canonical_status==0 and duplicate_status==1; prefix="curl --fail --silent --show-error --connect-timeout 5 --max-time 20"; assert two.count(prefix)==3; urls=["http://inference1.tail011a51.ts.net:8003/v1/models","http://inference2.tail011a51.ts.net:8003/v1/models","http://holocron.tail011a51.ts.net:4545/v1/models"]; assert all(two.count(x)==1 for x in urls); arrays=["[\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\"]","[\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\",\"Qwen3.8-27B-8bit\"]","[\"reviewer\",\"implementer\",\"qwen3-embedding\"]"]; assert all(x in two for x in arrays); assert two.count("test \"$?\" -eq 1")==2 and "cmp_status=$?" in two and "test \"$cmp_status\" -eq 1" in two; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==["- services/platform/deploy/compose/production.env.example (MODIFY)"]; print("target_contract_ok=1 formal_commands_bash_n=4 verification_gates=2 fleet_url_total_assignments=1 duplicate_assignment_negative_exit=1 direct_curls=3 exact_model_arrays=3 target_write_allowed=1")' "$target"`
- **Tier:** integration · **Service:** S33-OPS-04 task-contract parser + Bash grammar + canonical Scenario Contract validator · **Flow:** sprint governance
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: pseudo, empty, nonzero-success, unbounded, or broadened verifier

## Test Criteria

### TC-1 — The deterministic repair oracle rejects every known contract-drift shape

- **GIVEN** the target has both human-readable and embedded machine-readable requirement representations.
- **WHEN** the target repair oracle parses them from the repository root.
- **THEN** it rejects missing/extra commands, byte drift, placeholder or ellipsis commands, desired exit 1, grep/cmp error acceptance, unbounded or indirect curls, wrong/empty model arrays, zero or multiple total FLEET_URL assignments, a canonical-plus-stale `/v1` duplicate, missing Compose inputs, and broadened WRITE-ALLOWED scope.
- **Verify:** `target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md; python3 -c 'import hashlib,json,re,subprocess,sys,tempfile; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r["id"]:r for r in c["requirements"]}; assert [r["id"] for r in c["requirements"]]==["AC-1","AC-2","TC-1","TC-2"]; one=req["AC-1"]["verify"]; two=req["AC-2"]["verify"]; assert one==req["TC-1"]["verify"] and two==req["TC-2"]["verify"]; tick=chr(96); assert t.count(tick+one+tick)==3 and t.count(tick+two+tick)==3; assert "| corrected example renders | "+tick+one+tick+" |" in t and "| direct fleet endpoints are real and independent | "+tick+two+tick+" |" in t; assert hashlib.sha256(one.encode()).hexdigest()=="ce26f3728823be34cfe23d5a52d679db84448659466591e78d4a9775bf01c15c" and hashlib.sha256(two.encode()).hexdigest()=="4c660aeb98a4411273ba7fdf10c1841c136f7c19884c63a3762e227761669890"; cmds=[r["verify"] for r in c["requirements"]]; assert all("grep + 3x curl" not in v and "..." not in v and "echo exit=$?" not in v for v in cmds); [subprocess.run(["bash","-n","-c",v],check=True) for v in cmds]; required_env=["POSTGRES_PASSWORD=example","DATABASE_URL=postgres://example:example@postgres:5432/holocron","MASTRA_API_KEY=example","FLEET_KEY=sk-none","ZERO_ADMIN_PASSWORD=example"]; assert all(x in one for x in required_env); quote=chr(39); fleet_shape="total_assignments=$(grep -c "+quote+"^FLEET_URL="+quote+" \"$fleet_env\") && test \"$total_assignments\" -eq 1 && canonical_assignments=$(grep -Fxc "+quote+"FLEET_URL=http://host.docker.internal:4545"+quote+" \"$fleet_env\") && test \"$canonical_assignments\" -eq 1 && { if grep -nE "+quote+"^FLEET_URL=.*/v1(/|$)"+quote+" \"$fleet_env\"; then false; else test \"$?\" -eq 1; fi; }"; assert one.count(fleet_shape)==1 and one.count("test \"$?\" -eq 1")==2; assert "fleet_env=services/platform/deploy/compose/production.env.example" in one and "docker compose --env-file \"$fleet_env\"" in one and "config --quiet" in one; guard=fleet_shape.replace("$fleet_env","$1"); fixture=tempfile.NamedTemporaryFile(mode="w+",encoding="utf-8"); fixture.write("FLEET_URL=http://host.docker.internal:4545\n"); fixture.flush(); canonical_status=subprocess.run(["bash","-c",guard,"_",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.write("FLEET_URL=http://host.docker.internal:4545/v1\n"); fixture.flush(); duplicate_status=subprocess.run(["bash","-c",guard,"_",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.close(); assert canonical_status==0 and duplicate_status==1; prefix="curl --fail --silent --show-error --connect-timeout 5 --max-time 20"; assert two.count(prefix)==3; urls=["http://inference1.tail011a51.ts.net:8003/v1/models","http://inference2.tail011a51.ts.net:8003/v1/models","http://holocron.tail011a51.ts.net:4545/v1/models"]; assert all(two.count(x)==1 for x in urls); arrays=["[\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\"]","[\"Qwen3-Embedding-0.6B-4bit-DWQ\",\"Qwen3.6-35B-A3B-MLX-8bit\",\"Qwen3.8-27B-8bit\"]","[\"reviewer\",\"implementer\",\"qwen3-embedding\"]"]; assert all(x in two for x in arrays); assert two.count("test \"$?\" -eq 1")==2 and "cmp_status=$?" in two and "test \"$cmp_status\" -eq 1" in two; allowed=re.search(r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==["- services/platform/deploy/compose/production.env.example (MODIFY)"]; print("target_contract_ok=1 formal_commands_bash_n=4 verification_gates=2 fleet_url_total_assignments=1 duplicate_assignment_negative_exit=1 direct_curls=3 exact_model_arrays=3 target_write_allowed=1")' "$target"`

## Fixtures

**`invalid-s33-ops-04-verifiers`** — The target task's original formal verifiers were not executable success oracles. _(seed: cli)_

- AC-1/TC-1 expected grep exit 1 instead of normalizing the required absence to verifier exit 0.
- AC-2 used the literal placeholder `grep + 3x curl`.
- TC-2 ended in an ellipsis.
- The prose command used semicolon/echo sequencing that could report success after a failed absence check.

**`duplicate-fleet-url-assignment`** — A deterministic temporary-file fixture for the corrected assignment guard. _(seed: cli)_

- Positive record: exactly `FLEET_URL=http://host.docker.internal:4545`; expected guard exit 0.
- Negative record: the canonical line followed by `FLEET_URL=http://host.docker.internal:4545/v1`; expected guard exit exactly 1.

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-04-VERIFY.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md

**WRITE-PROHIBITED**

- Every other repository path.
- `.kb-run-sprint/state.json` and all task/sprint/roadmap status surfaces.
- `services/**`, `.tmp/**`, remote hosts, containers, services, volumes, secrets, and network configuration.

## Verification Gates

1. **Target contract and duplicate negative oracle:** Run the exact AC-1 verifier. Expected: `target_contract_ok=1 formal_commands_bash_n=4 verification_gates=2 fleet_url_total_assignments=1 duplicate_assignment_negative_exit=1 direct_curls=3 exact_model_arrays=3 target_write_allowed=1`.
2. **Target scenarios:** `python3 -c 'import json,re,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; print(json.dumps(json.loads(matches[0])))' .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`. Expected: `ok=true`, `scenario_count=2`, zero violations.
3. **Repair contract/scenario:** `repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-04-VERIFY.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; matches=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); assert c["task_id"]=="SPEC-REPAIR-S33-OPS-04-VERIFY" and c["tdd_mode"]=="skipped"; assert c["verification_policy"]=={"requires_tests":True,"requires_red_evidence":False,"requires_seeded_evidence":False,"tdd_lineage_required":False}; assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1"]; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; print(json.dumps(c))' "$repair" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`. Expected: `ok=true`, `scenario_count=1`, zero violations.
4. **Planning-only scope:** `python3 -c 'import subprocess; got=subprocess.check_output(["git","diff","--name-only","7ff12bc4729c3710fc0960fcab68614281d8ef75...HEAD"],text=True).splitlines(); expected={".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-OPS-04-VERIFY.md",".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md"}; assert len(got)==2 and set(got)==expected'`. Expected: exit 0 after commit.

## Agent Assignment

**planner** — This is a bounded task-contract repair. It authorizes no source, evidence, runtime, tracker, landing, or deployment mutation.

## Dependencies

- **Depends on:** the landed S33-OPS-02 router contract and S33-OPS-03 scheduler wiring that make the three endpoint expectations concrete.
- **Blocks:** S33-OPS-04 execution/review until every verifier is an executable exit-0 success oracle.

## Notes

- Fresh read-only observation on 2026-08-17 confirmed the expected model ID arrays and distinct inference response SHA-256 values; future S33-OPS-04 execution must re-run the bounded exact command rather than trusting that observation as current.
- The verifier does not perform or claim a network-disruption drill.

## Verification Policy

- TDD mode: skipped.
- Tests required: yes, deterministic target/repair contract parsing and shell-grammar validation.
- RED evidence required: no.
- Seeded evidence required: no; the downstream S33-OPS-04 task retains live endpoint evidence responsibility.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-OPS-04-VERIFY",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "invalid-s33-ops-04-verifiers": {
      "description": "The original S33-OPS-04 task encoded nonzero desired success, a pseudo verifier, an ellipsis, and non-fail-closed semicolon/echo sequencing.",
      "seed_method": "cli",
      "records": [
        "AC-1/TC-1 desired grep exit == 1",
        "AC-2 verify == grep + 3x curl",
        "TC-2 verify ends with ellipsis",
        "prose verifier uses semicolon/echo sequencing"
      ]
    },
    "duplicate-fleet-url-assignment": {
      "description": "A real temporary file proves the assignment guard accepts one canonical line and rejects a canonical line plus a stale /v1 duplicate.",
      "seed_method": "cli",
      "records": [
        "positive: FLEET_URL=http://host.docker.internal:4545 => exit 0",
        "negative: canonical line plus FLEET_URL=http://host.docker.internal:4545/v1 => exit 1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN invalid S33-OPS-04 verifiers and a canonical-plus-stale FLEET_URL duplicate fixture WHEN its task contract is repaired THEN all human and JSON representations are exact, hash-pinned, shell-valid, fail closed, require exactly one total and one exact canonical FLEET_URL assignment without /v1, reject the duplicate with exit 1, directly validate the real Compose and fleet contracts, and retain exactly one future implementation path.",
      "verify": "target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md; python3 -c 'import hashlib,json,re,subprocess,sys,tempfile; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"AC-2\",\"TC-1\",\"TC-2\"]; one=req[\"AC-1\"][\"verify\"]; two=req[\"AC-2\"][\"verify\"]; assert one==req[\"TC-1\"][\"verify\"] and two==req[\"TC-2\"][\"verify\"]; tick=chr(96); assert t.count(tick+one+tick)==3 and t.count(tick+two+tick)==3; assert \"| corrected example renders | \"+tick+one+tick+\" |\" in t and \"| direct fleet endpoints are real and independent | \"+tick+two+tick+\" |\" in t; assert hashlib.sha256(one.encode()).hexdigest()==\"ce26f3728823be34cfe23d5a52d679db84448659466591e78d4a9775bf01c15c\" and hashlib.sha256(two.encode()).hexdigest()==\"4c660aeb98a4411273ba7fdf10c1841c136f7c19884c63a3762e227761669890\"; cmds=[r[\"verify\"] for r in c[\"requirements\"]]; assert all(\"grep + 3x curl\" not in v and \"...\" not in v and \"echo exit=$?\" not in v for v in cmds); [subprocess.run([\"bash\",\"-n\",\"-c\",v],check=True) for v in cmds]; required_env=[\"POSTGRES_PASSWORD=example\",\"DATABASE_URL=postgres://example:example@postgres:5432/holocron\",\"MASTRA_API_KEY=example\",\"FLEET_KEY=sk-none\",\"ZERO_ADMIN_PASSWORD=example\"]; assert all(x in one for x in required_env); quote=chr(39); fleet_shape=\"total_assignments=$(grep -c \"+quote+\"^FLEET_URL=\"+quote+\" \\\"$fleet_env\\\") && test \\\"$total_assignments\\\" -eq 1 && canonical_assignments=$(grep -Fxc \"+quote+\"FLEET_URL=http://host.docker.internal:4545\"+quote+\" \\\"$fleet_env\\\") && test \\\"$canonical_assignments\\\" -eq 1 && { if grep -nE \"+quote+\"^FLEET_URL=.*/v1(/|$)\"+quote+\" \\\"$fleet_env\\\"; then false; else test \\\"$?\\\" -eq 1; fi; }\"; assert one.count(fleet_shape)==1 and one.count(\"test \\\"$?\\\" -eq 1\")==2; assert \"fleet_env=services/platform/deploy/compose/production.env.example\" in one and \"docker compose --env-file \\\"$fleet_env\\\"\" in one and \"config --quiet\" in one; guard=fleet_shape.replace(\"$fleet_env\",\"$1\"); fixture=tempfile.NamedTemporaryFile(mode=\"w+\",encoding=\"utf-8\"); fixture.write(\"FLEET_URL=http://host.docker.internal:4545\\n\"); fixture.flush(); canonical_status=subprocess.run([\"bash\",\"-c\",guard,\"_\",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.write(\"FLEET_URL=http://host.docker.internal:4545/v1\\n\"); fixture.flush(); duplicate_status=subprocess.run([\"bash\",\"-c\",guard,\"_\",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.close(); assert canonical_status==0 and duplicate_status==1; prefix=\"curl --fail --silent --show-error --connect-timeout 5 --max-time 20\"; assert two.count(prefix)==3; urls=[\"http://inference1.tail011a51.ts.net:8003/v1/models\",\"http://inference2.tail011a51.ts.net:8003/v1/models\",\"http://holocron.tail011a51.ts.net:4545/v1/models\"]; assert all(two.count(x)==1 for x in urls); arrays=[\"[\\\"Qwen3-Embedding-0.6B-4bit-DWQ\\\",\\\"Qwen3.6-35B-A3B-MLX-8bit\\\"]\",\"[\\\"Qwen3-Embedding-0.6B-4bit-DWQ\\\",\\\"Qwen3.6-35B-A3B-MLX-8bit\\\",\\\"Qwen3.8-27B-8bit\\\"]\",\"[\\\"reviewer\\\",\\\"implementer\\\",\\\"qwen3-embedding\\\"]\"]; assert all(x in two for x in arrays); assert two.count(\"test \\\"$?\\\" -eq 1\")==2 and \"cmp_status=$?\" in two and \"test \\\"$cmp_status\\\" -eq 1\" in two; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==[\"- services/platform/deploy/compose/production.env.example (MODIFY)\"]; print(\"target_contract_ok=1 formal_commands_bash_n=4 verification_gates=2 fleet_url_total_assignments=1 duplicate_assignment_negative_exit=1 direct_curls=3 exact_model_arrays=3 target_write_allowed=1\")' \"$target\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "S33-OPS-04 task-contract parser + Bash grammar + canonical Scenario Contract validator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "a formal verifier is empty, pseudo, contains an ellipsis, or reports desired exit 1 as success",
            "a curl is unbounded, indirect, or accepts an empty/wrong model array",
            "grep or cmp errors are accepted as successful absence/non-identity",
            "the future implementation WRITE-ALLOWED list is broadened",
            "a canonical FLEET_URL line plus a stale /v1 duplicate passes the assignment guard"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "invalid-s33-ops-04-verifiers",
            "action": {
              "actor": "planner",
              "steps": [
                "replace every target formal verifier with executable exit-0-on-success shell",
                "pin human/JSON/gate parity, hashes, exactly-one-total and exactly-one-canonical FLEET_URL semantics, explicit /v1 absence, expected Compose inputs, direct endpoints, exact model IDs, and cmp status semantics",
                "run the assignment guard against one canonical line and then a canonical-plus-stale /v1 duplicate in a real temporary file",
                "run target and repair contract parsers, bash grammar checks, and canonical Scenario Contract validation"
              ]
            },
            "end_state": {
              "must_observe": [
                "target_contract_ok=1",
                "formal_commands_bash_n=4",
                "verification_gates=2",
                "fleet_url_total_assignments=1",
                "duplicate_assignment_negative_exit=1",
                "direct_curls=3",
                "exact_model_arrays=3",
                "target_write_allowed=1"
              ],
              "must_not_observe": [
                "an empty or placeholder verifier",
                "a formal command containing an ellipsis or desired exit 1",
                "an unbounded or indirect model request",
                "grep exit 2 or cmp exit 2 accepted as success",
                "future implementation WRITE-ALLOWED count=2",
                "a canonical FLEET_URL assignment plus a stale /v1 duplicate exits 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The deterministic repair oracle rejects placeholder, ellipsis, nonzero-success, unbounded, wrong-model, comparison-error, representation-drift, duplicate FLEET_URL assignment, /v1, and scope-broadening regressions.",
      "maps_to_ac": "AC-1",
      "verify": "target=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md; python3 -c 'import hashlib,json,re,subprocess,sys,tempfile; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; matches=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(matches)==1 and t.count(end)==2; c=json.loads(matches[0]); req={r[\"id\"]:r for r in c[\"requirements\"]}; assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"AC-2\",\"TC-1\",\"TC-2\"]; one=req[\"AC-1\"][\"verify\"]; two=req[\"AC-2\"][\"verify\"]; assert one==req[\"TC-1\"][\"verify\"] and two==req[\"TC-2\"][\"verify\"]; tick=chr(96); assert t.count(tick+one+tick)==3 and t.count(tick+two+tick)==3; assert \"| corrected example renders | \"+tick+one+tick+\" |\" in t and \"| direct fleet endpoints are real and independent | \"+tick+two+tick+\" |\" in t; assert hashlib.sha256(one.encode()).hexdigest()==\"ce26f3728823be34cfe23d5a52d679db84448659466591e78d4a9775bf01c15c\" and hashlib.sha256(two.encode()).hexdigest()==\"4c660aeb98a4411273ba7fdf10c1841c136f7c19884c63a3762e227761669890\"; cmds=[r[\"verify\"] for r in c[\"requirements\"]]; assert all(\"grep + 3x curl\" not in v and \"...\" not in v and \"echo exit=$?\" not in v for v in cmds); [subprocess.run([\"bash\",\"-n\",\"-c\",v],check=True) for v in cmds]; required_env=[\"POSTGRES_PASSWORD=example\",\"DATABASE_URL=postgres://example:example@postgres:5432/holocron\",\"MASTRA_API_KEY=example\",\"FLEET_KEY=sk-none\",\"ZERO_ADMIN_PASSWORD=example\"]; assert all(x in one for x in required_env); quote=chr(39); fleet_shape=\"total_assignments=$(grep -c \"+quote+\"^FLEET_URL=\"+quote+\" \\\"$fleet_env\\\") && test \\\"$total_assignments\\\" -eq 1 && canonical_assignments=$(grep -Fxc \"+quote+\"FLEET_URL=http://host.docker.internal:4545\"+quote+\" \\\"$fleet_env\\\") && test \\\"$canonical_assignments\\\" -eq 1 && { if grep -nE \"+quote+\"^FLEET_URL=.*/v1(/|$)\"+quote+\" \\\"$fleet_env\\\"; then false; else test \\\"$?\\\" -eq 1; fi; }\"; assert one.count(fleet_shape)==1 and one.count(\"test \\\"$?\\\" -eq 1\")==2; assert \"fleet_env=services/platform/deploy/compose/production.env.example\" in one and \"docker compose --env-file \\\"$fleet_env\\\"\" in one and \"config --quiet\" in one; guard=fleet_shape.replace(\"$fleet_env\",\"$1\"); fixture=tempfile.NamedTemporaryFile(mode=\"w+\",encoding=\"utf-8\"); fixture.write(\"FLEET_URL=http://host.docker.internal:4545\\n\"); fixture.flush(); canonical_status=subprocess.run([\"bash\",\"-c\",guard,\"_\",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.write(\"FLEET_URL=http://host.docker.internal:4545/v1\\n\"); fixture.flush(); duplicate_status=subprocess.run([\"bash\",\"-c\",guard,\"_\",fixture.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode; fixture.close(); assert canonical_status==0 and duplicate_status==1; prefix=\"curl --fail --silent --show-error --connect-timeout 5 --max-time 20\"; assert two.count(prefix)==3; urls=[\"http://inference1.tail011a51.ts.net:8003/v1/models\",\"http://inference2.tail011a51.ts.net:8003/v1/models\",\"http://holocron.tail011a51.ts.net:4545/v1/models\"]; assert all(two.count(x)==1 for x in urls); arrays=[\"[\\\"Qwen3-Embedding-0.6B-4bit-DWQ\\\",\\\"Qwen3.6-35B-A3B-MLX-8bit\\\"]\",\"[\\\"Qwen3-Embedding-0.6B-4bit-DWQ\\\",\\\"Qwen3.6-35B-A3B-MLX-8bit\\\",\\\"Qwen3.8-27B-8bit\\\"]\",\"[\\\"reviewer\\\",\\\"implementer\\\",\\\"qwen3-embedding\\\"]\"]; assert all(x in two for x in arrays); assert two.count(\"test \\\"$?\\\" -eq 1\")==2 and \"cmp_status=$?\" in two and \"test \\\"$cmp_status\\\" -eq 1\" in two; allowed=re.search(r\"\\*\\*WRITE-ALLOWED\\*\\*\\s*(.*?)\\s*\\*\\*WRITE-PROHIBITED\\*\\*\",t,re.S).group(1); assert [x.strip() for x in allowed.splitlines() if x.strip()]==[\"- services/platform/deploy/compose/production.env.example (MODIFY)\"]; print(\"target_contract_ok=1 formal_commands_bash_n=4 verification_gates=2 fleet_url_total_assignments=1 duplicate_assignment_negative_exit=1 direct_curls=3 exact_model_arrays=3 target_write_allowed=1\")' \"$target\""
    }
  ]
}
-->
