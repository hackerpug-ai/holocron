# SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE: Scope the MCP-02 integration gate to its real-service proof

> Status: Backlog
> Assignee: mcp-planner
> Priority: P0
> Type: SPEC-REPAIR
> Effort: S · 30 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mcp-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-MCP-02
> Blocks: S33-MCP-02 dispatch until its broad integration gate is removed

## Outcome

Replace S33-MCP-02's repository-wide `pnpm test:integration` Verification Gate with the already-defined focused real-service hybrid-search command and the already-defined focused manifest command, without changing any product behavior or requirement.

**Success state:** S33-MCP-02 retains byte-identical AC-1 through AC-4 and TC-1 through TC-6 prose, embedded verifiers, scenarios, fixtures, TDD policy, implementation WRITE-ALLOWED scope, and MCP behavior. Its Verification Gates table contains the preserved lint, typecheck, unit, and PRD-consistency commands plus exactly the focused real-service and manifest commands; no gate invokes bare `pnpm test:integration`.

## Critical Constraints

**MUST**

- Preserve every byte outside S33-MCP-02's `## Verification Gates` body; fixed prefix, suffix, and embedded-contract SHA-256 values enforce this.
- Use the existing AC-1 real-fleet command as the focused real-service gate and the existing TC-6 command as the separate manifest gate.
- Keep every formal AC/TC verifier shell-valid and every target scenario valid under the canonical Scenario Contract validator.
- Prove the committed diff from dispatch base `5e9e6af796223c16d6f29fc2e3a7575d2464f317` contains exactly the two planning files listed under WRITE-ALLOWED.

**NEVER**

- Never edit source, tests, fixtures, manifests, evidence, state, services, dependencies, runtime configuration, credentials, or network state.
- Never execute the focused integration commands, call a live service, start Postgres, start the fleet router, or invoke the MCP server while performing this repair.
- Never change S33-MCP-02's SDK, transports, auth boundary, tool schemas, tool annotations, resource/prompt surface, error semantics, task dependencies, or semver scope.
- Never weaken `tdd_mode: red_first` or any `requires_tests`, `requires_red_evidence`, or `requires_seeded_evidence` value in S33-MCP-02.

**STRICTLY**

- Repository writes are limited to the two planning files under WRITE-ALLOWED.

## Acceptance Criteria

### AC-1 — S33-MCP-02 has an exact, focused, fail-closed Verification Gates contract

- **GIVEN** the target task's bare integration gate expands to the entire integration project while its AC/TC commands already identify the real-service and manifest proofs.
- **WHEN** only the target Verification Gates table is repaired.
- **THEN** all bytes outside that table remain hash-identical, the ten embedded requirements and four scenarios remain exact and valid, the table has exactly six expected gates, both focused integration commands parse under Bash, no gate command equals bare `pnpm test:integration`, and the branch diff contains exactly the two authorized planning files.
- **Verify:** `task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-02-hybridsearch-performs-real-fleet-backed-rrf-retrieval-or-fai.md; repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE.md; python3 -c 'import hashlib,json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); prefix,rest=t.split("## Verification Gates\n\n",1); gates,suffix=rest.split("\n## Agent Assignment\n",1); assert hashlib.sha256(prefix.encode()).hexdigest()=="f2f38f11966929962fb8f974ecdc3de70ce58830c0cfb5dead5c1ce304baa2f3"; assert hashlib.sha256(suffix.encode()).hexdigest()=="4644b219388ff82b91ee135fb5f1f71baf68dc2d5979e8716c2b22ffa8a79761"; end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; ms=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; raw=ms[0]; assert hashlib.sha256(raw.encode()).hexdigest()=="7da58c739598fa7fc149953ba9474f50bcd8dd9bce289ca30ee9ceb639c2a442"; c=json.loads(raw); assert c["task_id"]=="S33-MCP-02" and c["tdd_mode"]=="red_first"; assert c["verification_policy"]=={"requires_tests":True,"requires_red_evidence":True,"requires_seeded_evidence":True}; ids=["AC-1","AC-2","AC-3","AC-4","TC-1","TC-2","TC-3","TC-4","TC-5","TC-6"]; assert [r["id"] for r in c["requirements"]]==ids; live="PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"; closed="PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"; manifest="pnpm test:integration tests/integration/mcp-verify-manifest.test.ts tests/integration/mcp-manifest-negative-controls.test.ts"; expected_verify={"AC-1":live,"AC-2":closed,"AC-3":closed,"AC-4":live,"TC-1":live,"TC-2":live,"TC-3":closed,"TC-4":closed,"TC-5":live,"TC-6":manifest}; req={r["id"]:r for r in c["requirements"]}; assert {i:req[i]["verify"] for i in ids}==expected_verify; human_ac=dict(re.findall(r"^### (AC-\d+) [^\n]*\n(?:(?!^### |^## )[\s\S])*?^- \*\*Verify:\*\* `(.*?)`$",t,re.M)); human_tc={i:v for i,v in re.findall(r"^\| (TC-\d+) \|.*?\| AC-\d+ \| `(.*?)` \|$",t,re.M)}; assert human_ac=={i:expected_verify[i] for i in ids[:4]}; assert human_tc=={i:expected_verify[i] for i in ids[4:]}; lint="pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/mcp/executor.ts services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"; expected_rows=[("lint",lint,"Exit 0"),("typecheck","pnpm tsgo --noEmit","Exit 0"),("unit","pnpm test:unit","Exit 0"),("integration-real-service",live,"Exit 0"),("manifest",manifest,"Exit 0"),("prd-consistency","pnpm prd:consistency","Exit 0")]; rows=re.findall(r"^\| ([^|]+) \| `(.*?)` \| (Exit 0) \|$",gates,re.M); assert rows==expected_rows; assert not any(cmd=="pnpm test:integration" for _,cmd,_ in rows); [subprocess.run(["bash","-n","-c",cmd],check=True) for cmd in [r["verify"] for r in c["requirements"]]+[cmd for _,cmd,_ in rows]]; v=subprocess.run(["python3","/Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"],input=json.dumps(c).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE); assert v.returncode==0,(v.stdout+v.stderr).decode(); assert json.loads(v.stdout)=={"ok":True,"scenario_count":4,"violations":[]}; got=subprocess.check_output(["git","diff","--name-only","5e9e6af796223c16d6f29fc2e3a7575d2464f317","--"],text=True).splitlines(); allowed={sys.argv[1],sys.argv[2]}; assert len(got)==2 and set(got)==allowed; print(json.dumps({"ok":True,"target":"S33-MCP-02","preserved_requirement_count":10,"gate_count":6,"focused_real_service_gates":2,"scenario_count":4,"scope_file_count":2,"bare_broad_gate_count":0}))' "$task" "$repair"`
- **Tier:** static · **Service:** task-contract parser + Bash grammar + canonical Scenario Contract validator + Git diff · **Flow:** sprint governance

## Test Criteria

### TC-1 — The repair contract is uniquely extractable, shell-valid, and scenario-valid

- **GIVEN** this repair file contains exactly one outer REQUIREMENT-CONTRACT with AC-1 and TC-1.
- **WHEN** the contract is parsed, both static verifier strings are checked with `bash -n`, and canonical scenario validation runs.
- **THEN** the planning policy is exact, the IDs are exactly AC-1 and TC-1, both verifiers parse, and validation returns one scenario with zero violations.
- **Verify:** `repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding="utf-8").read(); end="--"+">"; marker="<!-- REQUIREMENT-CONTRACT v1 "+end; ms=re.findall(re.escape(marker)+r"\s*<!--\s*(\{.*?\})\s*"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; c=json.loads(ms[0]); assert c["task_id"]=="SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE" and c["tdd_mode"]=="skipped"; assert c["verification_policy"]=={"requires_tests":True,"requires_red_evidence":False,"requires_seeded_evidence":False,"tdd_lineage_required":False}; assert [r["id"] for r in c["requirements"]]==["AC-1","TC-1"] and c["requirements"][1]["maps_to_ac"]=="AC-1"; [subprocess.run(["bash","-n","-c",r["verify"]],check=True) for r in c["requirements"]]; print(json.dumps(c))' "$repair" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py`
- **Tier:** static · **Service:** REQUIREMENT-CONTRACT parser + Bash grammar + canonical Scenario Contract validator · **Flow:** sprint governance

## Fixtures

**`broad-s33-mcp02-integration-gate`** — The target task has one repository-wide integration gate even though its formal requirements already carry focused real-service commands. _(seed: cli)_

- Original gate: `integration -> pnpm test:integration -> Exit 0`.
- Focused product proof: the existing AC-1 real fleet + Postgres + HTTP/stdio test command.
- Focused manifest proof: the existing TC-6 manifest and negative-control command.
- The canonical target contract contains ten requirements and four scenarios that this repair does not alter.

## MCP Maintenance Decisions

- **SDK:** Preserve the official `@modelcontextprotocol/sdk` used by `services/platform/src/mcp/gateway.ts` (resolved locally at 1.30.0 through the current lockfile). No dependency or peer-dependency change. Reference: `brain/docs/mcp-rules/sdk-selection.md`, `maintenance.md`.
- **Runtime/transport:** Preserve Bun, stateless Streamable HTTP with JSON responses, and stdio. The focused test remains the correct proof because it drives both existing real transports. Reference: `brain/docs/mcp-rules/transport.md`, `testing.md`.
- **Auth:** Preserve the existing project-scoped `HOLO_KEY_MCP` bearer boundary on `/mcp`; this repair adds no route or auth behavior. OAuth 2.1 + PKCE remains the MCP-rules requirement for any future remote-auth redesign, which is outside this two-file repair. Reference: `brain/docs/mcp-rules/security.md`.
- **Surface:** No tool, resource, prompt, Zod schema, annotation, or error contract changes. `hybrid_search` and `search_fts` behavior remains wholly owned by S33-MCP-02.
- **Semver:** No server version change; this is a planning-only gate correction with no observable public-contract change. Reference: `brain/docs/mcp-rules/maintenance.md`.

## Guardrails

**WRITE-ALLOWED**

- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-02-hybridsearch-performs-real-fleet-backed-rrf-retrieval-or-fai.md
- .spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE.md

**WRITE-PROHIBITED**

- Every other repository path.
- All source, tests, fixtures, manifests, dependencies, evidence, `.kb-run-sprint/state.json`, services, containers, databases, credentials, runtime configuration, hosts, and network state.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| repaired target contract | Run AC-1's exact static verifier | Exit 0; ten preserved requirements, six exact gates, two focused proof gates, four target scenarios, two-file scope, zero bare broad gates |
| repair contract | Run TC-1's exact static verifier | Exit 0; `ok=true`, `scenario_count=1`, `violations=[]` |
| target scenario contract | Extract S33-MCP-02's embedded contract and run `/Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py` | Exit 0; `ok=true`, `scenario_count=4`, `violations=[]` |
| scope compliance | `actual=$(git diff --name-only '5e9e6af796223c16d6f29fc2e3a7575d2464f317' 'HEAD' | LC_ALL=C sort); expected=$(printf '%s\n' '.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-02-hybridsearch-performs-real-fleet-backed-rrf-retrieval-or-fai.md' '.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE.md' | LC_ALL=C sort); test "$actual" = "$expected"` | Exit 0 after commit |

## Agent Assignment

**mcp-planner** — This is a bounded MCP task-contract maintenance repair. It preserves the official SDK, transports, auth boundary, public surface, and real-service proof while correcting only the over-broad gate selection.

## Notes

- Planning only: no live service, network, database, MCP, fleet, or runtime command is authorized by this repair.
- TDD is skipped for this planning-only edit, but deterministic static tests are required.
- `agent-workflows` and `standup`, named by the mcp-planner role, were unavailable in this Codex skill catalog; no substitute workflow or external log was invented.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false,
    "tdd_lineage_required": false
  },
  "fixtures": {
    "broad-s33-mcp02-integration-gate": {
      "description": "S33-MCP-02 has a bare repository-wide integration gate even though its formal requirements already carry the focused real-service hybrid-search and manifest commands.",
      "seed_method": "cli",
      "records": [
        "original gate: integration -> pnpm test:integration -> Exit 0",
        "target contract: 10 requirements and 4 scenarios",
        "replacement table: 6 total gates including 2 focused proof gates and 0 bare broad integration gates",
        "repair scope: exactly 2 planning files"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN S33-MCP-02 has one bare repository-wide integration gate WHEN only its Verification Gates table is repaired THEN every byte outside the table remains hash-identical, all ten requirements and four scenarios remain exact and valid, six exact gates include two focused proofs, no gate equals bare pnpm test:integration, every formal command parses, and the diff contains exactly two planning files.",
      "verify": "task=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-MCP-02-hybridsearch-performs-real-fleet-backed-rrf-retrieval-or-fai.md; repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE.md; python3 -c 'import hashlib,json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); prefix,rest=t.split(\"## Verification Gates\\n\\n\",1); gates,suffix=rest.split(\"\\n## Agent Assignment\\n\",1); assert hashlib.sha256(prefix.encode()).hexdigest()==\"f2f38f11966929962fb8f974ecdc3de70ce58830c0cfb5dead5c1ce304baa2f3\"; assert hashlib.sha256(suffix.encode()).hexdigest()==\"4644b219388ff82b91ee135fb5f1f71baf68dc2d5979e8716c2b22ffa8a79761\"; end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; ms=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; raw=ms[0]; assert hashlib.sha256(raw.encode()).hexdigest()==\"7da58c739598fa7fc149953ba9474f50bcd8dd9bce289ca30ee9ceb639c2a442\"; c=json.loads(raw); assert c[\"task_id\"]==\"S33-MCP-02\" and c[\"tdd_mode\"]==\"red_first\"; assert c[\"verification_policy\"]=={\"requires_tests\":True,\"requires_red_evidence\":True,\"requires_seeded_evidence\":True}; ids=[\"AC-1\",\"AC-2\",\"AC-3\",\"AC-4\",\"TC-1\",\"TC-2\",\"TC-3\",\"TC-4\",\"TC-5\",\"TC-6\"]; assert [r[\"id\"] for r in c[\"requirements\"]]==ids; live=\"PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts\"; closed=\"PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts\"; manifest=\"pnpm test:integration tests/integration/mcp-verify-manifest.test.ts tests/integration/mcp-manifest-negative-controls.test.ts\"; expected_verify={\"AC-1\":live,\"AC-2\":closed,\"AC-3\":closed,\"AC-4\":live,\"TC-1\":live,\"TC-2\":live,\"TC-3\":closed,\"TC-4\":closed,\"TC-5\":live,\"TC-6\":manifest}; req={r[\"id\"]:r for r in c[\"requirements\"]}; assert {i:req[i][\"verify\"] for i in ids}==expected_verify; human_ac=dict(re.findall(r\"^### (AC-\\d+) [^\\n]*\\n(?:(?!^### |^## )[\\s\\S])*?^- \\*\\*Verify:\\*\\* `(.*?)`$\",t,re.M)); human_tc={i:v for i,v in re.findall(r\"^\\| (TC-\\d+) \\|.*?\\| AC-\\d+ \\| `(.*?)` \\|$\",t,re.M)}; assert human_ac=={i:expected_verify[i] for i in ids[:4]}; assert human_tc=={i:expected_verify[i] for i in ids[4:]}; lint=\"pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/mcp/executor.ts services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts\"; expected_rows=[(\"lint\",lint,\"Exit 0\"),(\"typecheck\",\"pnpm tsgo --noEmit\",\"Exit 0\"),(\"unit\",\"pnpm test:unit\",\"Exit 0\"),(\"integration-real-service\",live,\"Exit 0\"),(\"manifest\",manifest,\"Exit 0\"),(\"prd-consistency\",\"pnpm prd:consistency\",\"Exit 0\")]; rows=re.findall(r\"^\\| ([^|]+) \\| `(.*?)` \\| (Exit 0) \\|$\",gates,re.M); assert rows==expected_rows; assert not any(cmd==\"pnpm test:integration\" for _,cmd,_ in rows); [subprocess.run([\"bash\",\"-n\",\"-c\",cmd],check=True) for cmd in [r[\"verify\"] for r in c[\"requirements\"]]+[cmd for _,cmd,_ in rows]]; v=subprocess.run([\"python3\",\"/Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py\"],input=json.dumps(c).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE); assert v.returncode==0,(v.stdout+v.stderr).decode(); assert json.loads(v.stdout)=={\"ok\":True,\"scenario_count\":4,\"violations\":[]}; got=subprocess.check_output([\"git\",\"diff\",\"--name-only\",\"5e9e6af796223c16d6f29fc2e3a7575d2464f317\",\"--\"],text=True).splitlines(); allowed={sys.argv[1],sys.argv[2]}; assert len(got)==2 and set(got)==allowed; print(json.dumps({\"ok\":True,\"target\":\"S33-MCP-02\",\"preserved_requirement_count\":10,\"gate_count\":6,\"focused_real_service_gates\":2,\"scenario_count\":4,\"scope_file_count\":2,\"bare_broad_gate_count\":0}))' \"$task\" \"$repair\"",
      "scenario": {
        "id": "SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "local task-contract parser + Bash grammar + canonical Scenario Contract validator + Git diff",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the target contract is stubbed, empty, or changed outside the gate table",
            "the gate table is static but still contains bare pnpm test:integration",
            "either focused proof is disconnected from the existing formal verifier",
            "the diff includes any unauthorized file"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "broad-s33-mcp02-integration-gate",
            "action": {
              "actor": "planner",
              "steps": [
                "replace only the bare integration Verification Gate with the existing focused real-service and manifest commands",
                "parse and hash-check the target contract and its non-gate regions",
                "check every formal and gate command with bash -n",
                "run canonical target scenario validation and compare the Git diff to the exact two-file allowlist"
              ]
            },
            "end_state": {
              "must_observe": [
                "preserved_requirement_count=10",
                "gate_count=6",
                "focused_real_service_gates=2",
                "scenario_count=4",
                "scope_file_count=2",
                "bare_broad_gate_count=0"
              ],
              "must_not_observe": [
                "gate command equals 'pnpm test:integration'",
                "preserved_requirement_count=9",
                "focused_real_service_gates=1",
                "scenario_count=0",
                "scope_file_count=3"
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
      "description": "The repair is uniquely extractable with exact skipped-TDD policy, AC-1 and TC-1 only, shell-valid static verifiers, and one canonical scenario with zero violations.",
      "verify": "repair=.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE.md; python3 -c 'import json,re,subprocess,sys; t=open(sys.argv[1],encoding=\"utf-8\").read(); end=\"--\"+\">\"; marker=\"<!-- REQUIREMENT-CONTRACT v1 \"+end; ms=re.findall(re.escape(marker)+r\"\\s*<!--\\s*(\\{.*?\\})\\s*\"+re.escape(end),t,re.S); assert len(ms)==1 and t.count(end)==2; c=json.loads(ms[0]); assert c[\"task_id\"]==\"SPEC-REPAIR-S33-MCP-02-INTEGRATION-GATE\" and c[\"tdd_mode\"]==\"skipped\"; assert c[\"verification_policy\"]=={\"requires_tests\":True,\"requires_red_evidence\":False,\"requires_seeded_evidence\":False,\"tdd_lineage_required\":False}; assert [r[\"id\"] for r in c[\"requirements\"]]==[\"AC-1\",\"TC-1\"] and c[\"requirements\"][1][\"maps_to_ac\"]==\"AC-1\"; [subprocess.run([\"bash\",\"-n\",\"-c\",r[\"verify\"]],check=True) for r in c[\"requirements\"]]; print(json.dumps(c))' \"$repair\" | python3 /Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py"
    }
  ]
}
-->
