# S-CONTRACT-03: CI contract-inventory gate: `holo verify:client-contract`

- **Sprint:** [Sprint 21: Client Data Contract](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `120 minutes`
- **Agent:** `red-test-generator` — Owns fail-closed RED tests and CI gate behavior, including proving that deleted mappings, stale targets, malformed schema fields, and stale inventories cannot pass.
- **Reviewer:** `mastra-reviewer` — Verifies the platform CLI gate reads real inventory/YAML/schema surfaces, exits correctly, and is wired into CI without a fake or mock-only proof.
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Implement the fail-closed client-contract verifier, its RED/GREEN test suite, and the CI invocation.

## Background
The Sprint 21 human gate requires an operator command that compares the legacy inventory to 13-client-data-contract.yaml, resolves targets against zero_pub/Hono, validates required semantics, and links every entry to E2E criteria. The current services/platform/src/cli/holo.ts help and dispatcher do not yet expose verify:client-contract or inventory:convex-callsites.

## Specification
- **Objective:** Add holo verify:client-contract and wire its full gate into CI so every missing, duplicate, stale, malformed, or unmapped call site fails closed.
- **Success state:** A valid 105-entry contract exits 0 and reports 105/105 mapped; deleting one mapping, changing one target, removing one required field, or using a stale inventory exits nonzero and names the offending record.

## Critical Constraints
### MUST
- MUST run against real repository artifacts and live source registries; tests must not mock YAML parsing, filesystem reads, Zero schema, Hono routes, or process exit.
- MUST fail closed with nonzero exit and an actionable call_site_id/path for an orphaned mapping, duplicate mapping, stale target, missing required field, or stale inventory.
- MUST provide the default gate plus --targets, --schema, and --e2e-links modes and report machine-readable JSON when --json is supplied.
### NEVER
- NEVER treat a missing contract, empty inventory, malformed YAML, or unresolved target as a warning-only condition.
- NEVER use a hardcoded 105/105 success path or a static fixture that bypasses the actual artifacts.
- NEVER wire a CI step that ignores the command exit code or permits missing nonproduction contract files.
### STRICTLY
- STRICTLY preserve the roadmap command spelling verify:client-contract and the inventory command spelling inventory:convex-callsites.
- STRICTLY keep negative controls in the test suite for deleted mappings, stale targets, missing fields, and stale inventory.
- STRICTLY run the gate before the general unit lane in CI so contract drift is visible as a dedicated failure.

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01
**Provides:**
- verify:client-contract CLI gate
- contract-inventory RED tests
- ci-fast contract gate
**Consumes:**
- 13-client-callsite-inventory.json
- 13-client-data-contract.yaml
- services/platform/src/db/schema/zero-pub.ts
- app/zero/schema.ts
- services/platform/src/http/hono-app.ts
- 11-e2e-testing-criteria.md
**Boundary contracts:**
- inventory and contract set equality
- contract target to live Zero/Hono surface
- contract schema to required semantic fields
- contract entry to T-SYNC criterion
- CLI exit status to CI pass/fail

## Acceptance Criteria
### AC-1: Valid contract passes
- **GIVEN:** The checked-out repository contains a valid 105-row inventory and matching complete contract.
- **WHEN:** An operator runs holo verify:client-contract.
- **THEN:** The command exits 0 and reports 105/105 call sites mapped with zero errors.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+filesystem+live-source`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: the verifier disconnects from the contract artifact; the verifier returns a static 105/105 result; the valid contract is treated as empty; the CLI is a no-op stub
  - Cases:
    - Start: `valid_contract`
      Action: run bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; capture stdout and the process exit code
      Must observe: exit code 0; mapped call sites=105/105; error count=0; JSON field ok=true
      Must not observe: exit code 1; mapped call sites=0/105; missing contract artifact; no-op or static output

### AC-2: Verification modes cover targets schema and E2E links
- **GIVEN:** The valid contract references the current Zero and Hono surfaces and T-SYNC criteria.
- **WHEN:** The operator runs --targets, --schema, and --e2e-links modes.
- **THEN:** Each mode exits 0 and reports 105 checked entries with zero failures in its respective dimension.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+zero-pub+hono+prd`
- **Verify:** `for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract "$flag" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: one verification mode is disconnected from the contract; the target registry is empty; the schema verifier accepts missing fields; the E2E criteria file is omitted
  - Cases:
    - Start: `valid_contract`
      Action: run verify:client-contract --targets; run verify:client-contract --schema; run verify:client-contract --e2e-links; capture each JSON report
      Must observe: mode count=3; targets checked=105; schema entries checked=105; E2E links checked=105; failure count=0 in all 3 reports
      Must not observe: mode count=0; targets checked=0; schema entries checked=0; E2E links checked=0; empty target registry

### AC-3: Deleted mapping fails closed
- **GIVEN:** A temporary copy of the valid contract has one of its 105 mappings removed.
- **WHEN:** The verifier runs against the modified contract and the unchanged inventory.
- **THEN:** The command exits nonzero and identifies the orphaned call_site_id and source path.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+negative-fixture`
- **Verify:** `rm -rf .tmp/client-contract/negative && mkdir -p .tmp/client-contract/negative && cp .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml .tmp/client-contract/negative/deleted.yaml && python3 -c "from pathlib import Path; p=Path('.tmp/client-contract/negative/deleted.yaml'); s=p.read_text(); p.write_text(s.replace('call_site_id: site-001', 'call_site_id: deleted-site-001', 1))" && ! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: a deleted mapping is ignored; the verifier returns a static success; the orphaned call site is not reported; the negative fixture is empty
  - Cases:
    - Start: `valid_contract`
      Action: copy the valid contract to a temporary negative fixture; delete one mapping from the temporary fixture; run verify:client-contract against the unchanged inventory
      Must observe: exit code=1; orphaned call_site_id reported; source path reported; error category=unmapped_call_site
      Must not observe: exit code 0; mapped call sites=105/105; empty diagnostic output; false green result

### AC-4: Malformed schema and stale target fail closed
- **GIVEN:** Temporary copies of the valid contract are modified once with a missing required field and once with a stale target.
- **WHEN:** The operator runs --schema and --targets against the modified artifacts.
- **THEN:** Both commands exit nonzero and identify the entry and specific failure category.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+negative-fixtures+zero-pub`
- **Verify:** `rm -rf .tmp/client-contract/negative/schema.yaml .tmp/client-contract/negative/target.yaml && cp .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml .tmp/client-contract/negative/schema.yaml && cp .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml .tmp/client-contract/negative/target.yaml && python3 -c "from pathlib import Path; p=Path('.tmp/client-contract/negative/schema.yaml'); s=p.read_text(); p.write_text(s.replace('offline:', 'offline_removed:', 1)); p=Path('.tmp/client-contract/negative/target.yaml'); s=p.read_text(); p.write_text(s.replace('target_name: conversations', 'target_name: stale_target', 1))" && ! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json && ! bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .tmp/client-contract/negative/target.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: missing schema fields are accepted; stale targets are accepted; the verifier uses a static target list; negative fixture files are empty
  - Cases:
    - Start: `valid_contract`
      Action: create one contract copy with the offline field removed; create one contract copy with a stale target name; run --schema on the first copy and --targets on the second copy
      Must observe: schema exit code=1; targets exit code=1; missing field diagnostic count=1; unresolved target diagnostic count=1
      Must not observe: schema exit code=0; targets exit code=0; stale_target reported as resolved; empty diagnostics

### AC-5: CI wiring
- **GIVEN:** The repository's fast CI workflow runs quality gates on push and pull request.
- **WHEN:** The client contract gate is added to the workflow and the workflow command is executed locally.
- **THEN:** ci-fast.yml contains the exact fail-closed command and the command exits 0 against the valid contract.
- **Test tier:** `integration`
- **Verification service:** `github-actions+ bun-cli`
- **Verify:** `grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml && bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `file_artifact`
  - Negative control: the CI workflow omits the contract command; the workflow ignores a nonzero verifier exit; the valid contract artifact is empty; the CI step is a static echo
  - Cases:
    - Start: `valid_contract`
      Action: read .github/workflows/ci-fast.yml for the exact contract command; run the same command locally against the valid artifacts; capture the command exit status
      Must observe: workflow command occurrence count=1; local verifier exit code=0; mapped call sites=105/105; CI step uses fail-closed shell semantics
      Must not observe: workflow command occurrence count=0; local verifier exit code=1; echo-only CI step; ignored verifier failure

## Test Criteria
| ID | Maps to | Statement | Verify |
|---|---|---|---|
| TC-1 | AC-1 | Valid 105-entry contract exits 0 with 105/105 mappings | `bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json` |
| TC-2 | AC-2 | Targets schema and E2E-link modes each check 105 entries with zero failures | `for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract "$flag" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done` |
| TC-3 | AC-3 | Deleted contract mapping exits nonzero and reports the orphaned call site | `test -f .tmp/client-contract/negative/deleted.yaml && ! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-4 | AC-4 | Missing required field and stale target each exit nonzero with diagnostic categories | `test -f .tmp/client-contract/negative/schema.yaml && test -f .tmp/client-contract/negative/target.yaml && ! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-5 | AC-5 | ci-fast.yml invokes the client contract verifier and preserves its exit status | `grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml` |

## Reading List
| Path | Lines | Focus |
|---|---|---|
| `.spec/prds/mk6-migration/ROADMAP.md` | 1202-1212 | Human gate commands and required negative controls |
| `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` | 191-198 | T-SYNC-004 and T-SYNC-019 pass/fail assertions |
| `services/platform/src/cli/holo.ts` | 1-150,684-700,3914-3964 | CLI help, argument parsing, dispatch conventions, and CI/status command patterns |
| `services/platform/src/db/schema/zero-pub.ts` | 1-180 | Live published and excluded relation registries |
| `app/zero/schema.ts` | 1-41 | RN Zero schema boundary |
| `services/platform/src/http/hono-app.ts` | 85-390 | Hono route surface and structured error behavior |
| `.github/workflows/ci-fast.yml` | 1-83 | Fast CI lane and fail-closed shell conventions |
| `services/platform/tests/integration/prd-consistency.test.ts` | 1-160 | Existing CLI test style and real filesystem assertions |
| `/Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` | 1-260 | Scenario validation and negative-control requirements |

## Guardrails
**WRITE-ALLOWED**
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/src/sync/client-contract.ts (NEW)
- services/platform/src/cli/__tests__/client-contract.test.ts (NEW)
- services/platform/tests/integration/client-contract.test.ts (NEW)
- .github/workflows/ci-fast.yml (MODIFY)
- .tmp/client-contract/** (NEW test artifacts)
**WRITE-PROHIBITED**
- app/** - rewrite is Sprint 24
- components/** - rewrite is Sprint 24
- hooks/** - rewrite is Sprint 24
- screens/** - rewrite is Sprint 24
- app/zero/schema.ts - do not expand the published client schema in the gate task
- services/platform/src/http/hono-app.ts - do not implement unrelated Hono routes
- .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml - read-only input after S-CONTRACT-02

## Design / Client Semantics
- **Design specialist:** `frontend-designer`
- **Severity:** `n/a`
**References:**
- .spec/prds/mk6-migration/ROADMAP.md:1190-1229
- .spec/prds/mk6-migration/11-e2e-testing-criteria.md:262-294
- .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:20-27
- services/platform/src/cli/holo.ts:150-233
- services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts:1-70
- app/_layout.tsx:138-166
- app/zero/schema.ts:1-51
- app/zero/queries.ts:1-13

**Specialist design notes:**
- No `verify:client-contract`, `inventory:convex-callsites`, or client-contract implementation was found in the platform CLI/help or services source inspected. Existing CLI gates cover other migration artifacts, and the Sprint20 integration test is a useful real-Hono/Postgres pattern, but there is no current gate that inventories RN consumers, resolves Zero/Hono targets, validates schema fields, or links T-SYNC criteria.
- The gate output should be actionable for rendered consumers: stable call-site ID, source path/line, hook/action kind, consumer surface, target kind/name, projection columns, loading/empty/error state, ordering, and linked E2E criterion. A target that exists in backend code but cannot supply the card/list/detail fields or terminal visual states should fail schema validation, not merely pass name resolution. Include a machine-readable summary and human-readable diagnostics naming the affected screen/component.
**Offline / optimistic / conflict / error / identifier semantics:**
- **Offline Semantics:** `--schema` must require offline policy on every entry and reject omitted values. Valid values should distinguish cached read, queueable Zero mutator, online-only Hono command, and explicitly unsupported. The gate should ensure each queueable entry has replay/dedup and visible queued/rejected UI semantics, while authoritative entries explicitly link the online/unavailable state; this is essential for T-SYNC-019 airplane and reconnect scenarios.
- **Optimistic Semantics:** Require an explicit optimistic policy (`none`, deterministic projection, or command-pending—not a fake row) plus rollback/reconciliation metadata. Reject an entry that calls an authoritative Hono command optimistic. Verify that Zero mutator entries identify the projected relation/fields and Hono chat/mission/upload entries identify the durable row/event that clears pending state.
- **Conflict Semantics:** `--schema` should require conflict policy and dedup key: row/version rejection for Zero mutations, requestId for chat, idempotencyKey/requestKey for mission commands and uploads, or `not_applicable` only for reads. `--e2e-links` must require a criterion that exercises the declared conflict/replay path, not merely a generic screen test. Treat migration_read_only as terminal rejection in the artifact schema.
- **Error Semantics:** The gate should validate structured error mappings (code/status/data), terminal versus retryable classification, and consumer recovery behavior. It should resolve the Hono route manifest and reject entries that only name a legacy Convex function. Diagnostics should separately report missing target, missing projection, missing offline/optimistic/conflict/error/identifier field, missing E2E link, and target present but not live.
- **Identifier Semantics:** Require a stable inventory key derived from normalized source path + source line + legacy function kind/ref, while retaining the legacy Convex ref for audit. Validate target identifier class (UUIDv7, legacy alias, requestId, idempotency key, share token) and reject wildcard/`any` mappings. The current `as any` route-ID usage in app/(drawer)/improvements/[requestId].tsx:35 is a concrete fixture the gate should flag HIGH.

**Blocker/high findings:**
- BLOCKER: the required CLI commands and artifact are currently absent, so Sprint21's human gate cannot run or fail closed.
- BLOCKER: live Zero schema/query surface is incomplete; a verifier must not report 105/105 by checking only YAML names or backend publication constants.
- HIGH: current source count and lexical call count differ from PRD counts; inventory normalization and exclusions must be frozen in fixtures before CI assertions.
- HIGH: no existing test proves that a missing consumer projection or missing visual error/offline state fails the contract; a target-only check would accept unusable mappings.
- HIGH: app root still wraps Zero inside ConvexProvider, so CI needs a separate production-path grep/boot assertion and must not treat the presence of ZeroProvider as completion.

**Unresolved live-vs-PRD target surfaces:**
- Live: CLI help has catalog/MCP/PRD consistency gates but no client-contract commands; PRD: inventory, verify, --targets, --schema, and --e2e-links commands.
- Live: Sprint20 real boundary test validates one chat persistence path; PRD: T-SYNC-019 covers all call sites plus airplane reads, queued writes, rejection rollback, duplicate replay, concurrent edit, and identifier semantics.
- Live: app/zero/schema.ts and queries.ts expose two tables/one query; PRD: verifier resolves every mapping against live zero_pub or Hono command manifest.
- Live: zero-cache is still disabled/placeholder in deployment docs; PRD: a live cache and published target are prerequisites for target verification.
- Live: no 13-client-data-contract.yaml exists under the migration technical requirements; PRD: machine-readable artifact is mandatory and must link every entry to a T-SYNC criterion.

## Verification Gates
| Gate | Command | Expected |
|---|---|---|
| RED then GREEN CLI tests | `pnpm vitest run services/platform/src/cli/__tests__/client-contract.test.ts` | RED before implementation and Exit 0 after implementation, including valid and negative fixtures. |
| Valid default gate | `bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json` | Exit 0; mapped call sites=105/105. |
| Negative controls | `pnpm vitest run services/platform/src/cli/__tests__/client-contract.test.ts services/platform/tests/integration/client-contract.test.ts` | Exit 0; deleted mapping, stale target, missing field, and stale inventory cases all assert nonzero verifier status. |
| CI wiring | `grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml` | Exit 0; workflow invokes the gate and does not ignore its status. |
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < .tmp/client-contract/s-contract-03-scenarios.json` | Exit 0 with zero CRITICAL or HIGH violations. |
| Project quality | `pnpm tsgo --noEmit && pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/sync/client-contract.ts services/platform/src/cli/__tests__/client-contract.test.ts services/platform/tests/integration/client-contract.test.ts` | Both commands exit 0. |

## Coding Standards
- RULES.md#pre-commit-hooks
- RULES.md#react--react-native-rules
- /Users/inference1/Projects/brain/docs/RED-FIRST-TEST-GATE.md
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md

## Review Criteria
- All AC and TC IDs remain stable and every behavioral AC has a scenario.
- No fake/static/empty success path; negative controls fail against disconnected, missing, stale, or malformed inputs.
- Every target is resolved against live repository/service surfaces rather than PRD text alone.
- All writes stay within WRITE-ALLOWED and verification gates produce captured evidence.

## Dependencies
- **Depends on:** S-CONTRACT-01, S-CONTRACT-02, Sprint 04, Sprint 05, Sprint 18
- **Blocks:** Sprint 24

## Agent Instructions
Follow RED → GREEN → REFACTOR where `tdd_mode` is `red_first`; for INFRA/CONFIG tasks, use the stated integration and seeded-evidence gates. Do not hand-wave unavailable target surfaces: preserve fail-closed diagnostics and the specialist findings above.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-CONTRACT-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "valid_contract": {
      "description": "A real 105-entry inventory and matching 13-client-data-contract.yaml generated from the checked-out repository.",
      "seed_method": "cli",
      "records": [
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
        "services/platform/src/db/schema/zero-pub.ts",
        "services/platform/src/http/hono-app.ts",
        "T-SYNC-004",
        "T-SYNC-019"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN valid 105-row inventory and contract WHEN the default verifier runs THEN it exits 0 with 105/105 mapped and zero errors.",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+filesystem+live-source",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the verifier disconnects from the contract artifact",
            "the verifier returns a static 105/105 result",
            "the valid contract is treated as empty",
            "the CLI is a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json",
                "capture stdout and the process exit code"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code 0",
                "mapped call sites=105/105",
                "error count=0",
                "JSON field ok=true (literal \"true\")"
              ],
              "must_not_observe": [
                "exit code 1",
                "mapped call sites=0/105",
                "missing contract artifact",
                "no-op or static output"
              ]
            }
          }
        ],
        "id": "AC-1"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN valid contract and live surfaces WHEN all verifier modes run THEN targets, schema, and E2E links each pass for 105 entries.",
      "verify": "for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract \"$flag\" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+zero-pub+hono+prd",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "one verification mode is disconnected from the contract",
            "the target registry is empty",
            "the schema verifier accepts missing fields",
            "the E2E criteria file is omitted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run verify:client-contract --targets",
                "run verify:client-contract --schema",
                "run verify:client-contract --e2e-links",
                "capture each JSON report"
              ]
            },
            "end_state": {
              "must_observe": [
                "mode count=3",
                "targets checked=105",
                "schema entries checked=105",
                "E2E links checked=105",
                "failure count=0 in all 3 reports"
              ],
              "must_not_observe": [
                "mode count=0",
                "targets checked=0",
                "schema entries checked=0",
                "E2E links checked=0",
                "empty target registry"
              ]
            }
          }
        ],
        "id": "AC-2"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN one mapping is deleted WHEN verification runs THEN it exits nonzero and names the orphaned call site.",
      "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+negative-fixture",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "a deleted mapping is ignored",
            "the verifier returns a static success",
            "the orphaned call site is not reported",
            "the negative fixture is empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "copy the valid contract to a temporary negative fixture",
                "delete one mapping from the temporary fixture",
                "run verify:client-contract against the unchanged inventory"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code=1",
                "orphaned call_site_id reported (count=1)",
                "source path reported (literal \"app/articles.tsx\")",
                "error category=unmapped_call_site (literal \"unmapped_call_site\")"
              ],
              "must_not_observe": [
                "exit code 0",
                "mapped call sites=105/105",
                "empty diagnostic output",
                "false green result"
              ]
            }
          }
        ],
        "id": "AC-3"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN one missing required field and one stale target WHEN schema and target modes run THEN both fail with diagnostics.",
      "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+negative-fixtures+zero-pub",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "missing schema fields are accepted",
            "stale targets are accepted",
            "the verifier uses a static target list",
            "negative fixture files are empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "create one contract copy with the offline field removed",
                "create one contract copy with a stale target name",
                "run --schema on the first copy and --targets on the second copy"
              ]
            },
            "end_state": {
              "must_observe": [
                "schema exit code=1",
                "targets exit code=1",
                "missing field diagnostic count=1",
                "unresolved target diagnostic count=1"
              ],
              "must_not_observe": [
                "schema exit code=0",
                "targets exit code=0",
                "stale_target reported as resolved",
                "empty diagnostics"
              ]
            }
          }
        ],
        "id": "AC-4"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN ci-fast.yml is the push and pull-request fast lane WHEN the workflow is inspected and command is run THEN the verifier is wired fail-closed.",
      "verify": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "github-actions+ bun-cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the CI workflow omits the contract command",
            "the workflow ignores a nonzero verifier exit",
            "the valid contract artifact is empty",
            "the CI step is a static echo"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "valid_contract",
            "action": {
              "actor": "ci_user",
              "steps": [
                "read .github/workflows/ci-fast.yml for the exact contract command",
                "run the same command locally against the valid artifacts",
                "capture the command exit status"
              ]
            },
            "end_state": {
              "must_observe": [
                "workflow command occurrence count=1",
                "local verifier exit code=0",
                "mapped call sites=105/105",
                "CI step uses fail-closed shell semantics (exit_code==1)"
              ],
              "must_not_observe": [
                "workflow command occurrence count=0",
                "local verifier exit code=1",
                "echo-only CI step",
                "ignored verifier failure"
              ]
            }
          }
        ],
        "id": "AC-5"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Valid 105-entry contract exits 0 with 105/105 mappings.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Targets schema and E2E-link modes each check 105 entries with zero failures.",
      "maps_to_ac": "AC-2",
      "verify": "for flag in --targets --schema --e2e-links; do bun services/platform/src/cli/holo.ts verify:client-contract \"$flag\" --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --json; done"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Deleted contract mapping exits nonzero and reports the orphaned call site.",
      "maps_to_ac": "AC-3",
      "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --contract .tmp/client-contract/negative/deleted.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Missing required field and stale target each exit nonzero with diagnostic categories.",
      "maps_to_ac": "AC-4",
      "verify": "! bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .tmp/client-contract/negative/schema.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "ci-fast.yml invokes the client contract verifier and preserves its exit status.",
      "maps_to_ac": "AC-5",
      "verify": "grep -Fq 'bun services/platform/src/cli/holo.ts verify:client-contract' .github/workflows/ci-fast.yml"
    }
  ]
}
-->
