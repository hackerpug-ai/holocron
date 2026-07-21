# S-CONTRACT-01: Inventory every legacy Convex hook/action call site in the RN app

- **Sprint:** [Sprint 21: Client Data Contract](./SPRINT.md)
- **Task Type:** `INFRA`
- **Status:** `completed`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `120 minutes`
- **Agent:** `react-native-ui-implementer` — Owns React Native state and network migration and can distinguish route-level Convex hooks, actions, generated API references, and test-only imports.
- **Reviewer:** `react-native-ui-reviewer` — Verifies that the inventory covers the complete RN surface, preserves source locations, and does not omit provider or generated-API dependencies needed by the rewrite.
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
Produce a deterministic, line-addressed inventory artifact containing every legacy Convex provider, useQuery, useMutation, useAction, useConvex, and generated API call site in the approved RN source roots.

## Background
The roadmap gate requires the 47-file RN legacy inventory to account for 105 Convex hook/action call sites before any mapping is authored. The current app still imports Convex in app/_layout.tsx and across route, component, hook, screen, and story surfaces, while the Zero schema currently exposes only the Sprint 20 thin chat surface.

## Specification
- **Objective:** Implement holo inventory:convex-callsites and emit a deterministic JSON inventory for the approved RN source roots.
- **Success state:** The command reports exactly 47 source files and 105 call sites, gives every row a stable ID and source location, and produces byte-stable output on repeated runs without scanning generated or dependency directories.

## Critical Constraints
### MUST
- MUST scan app/, components/, hooks/, and screens/ using real repository files and preserve relative path, line, column, hook kind, and Convex reference.
- MUST count provider and hook/action call sites according to one documented counting rule so the reported 47 files and 105 call sites are reproducible.
- MUST emit JSON that is deterministic across two executions against the same checkout.
### NEVER
- NEVER scan node_modules, .git, .spec task outputs, generated dependency code, or test fixtures as production RN call sites.
- NEVER collapse multiple hook/action invocations in one file into one record.
- NEVER infer a target mapping in the inventory task; target selection belongs to S-CONTRACT-02.
### STRICTLY
- STRICTLY keep inventory semantics independent from the future Zero implementation.
- STRICTLY fail with a nonzero exit when a source file cannot be parsed or a required source location cannot be recorded.

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01
**Provides:**
- convex-callsite-inventory-json
- stable-callsite-identifiers
- inventory-command
**Consumes:**
- current RN source tree
- legacy Convex generated API references
**Boundary contracts:**
- RN source tree to migration inventory
- legacy hook/action call site to stable source-location identity
- inventory artifact to client-data-contract authoring

## Acceptance Criteria
### AC-1: Complete legacy inventory
- **GIVEN:** The repository contains the approved RN source roots and the legacy Convex imports described by UC-SYNC-01.
- **WHEN:** An operator runs the inventory command against the repository root.
- **THEN:** The command exits 0 and reports file_count=47, call_site_count=105, and an inventory artifact containing 105 call-site records.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+filesystem`
- **Verify:** `bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `file_artifact`
  - Negative control: the scanner disconnects from the repository filesystem; the implementation returns a static 47/105 result; the scanner silently omits a legacy call site; the output artifact is empty
  - Cases:
    - Start: `rn_legacy_tree`
      Action: run bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json; read the emitted JSON summary and records
      Must observe: file_count=47; call_site_count=105; JSON records length=105; artifact file size > 0 bytes
      Must not observe: file_count=0; call_site_count=0; empty inventory artifact; static or hardcoded summary with no source paths

### AC-2: Line-addressed stable records
- **GIVEN:** The inventory has discovered 105 legacy call sites across the RN roots.
- **WHEN:** An operator inspects the emitted records.
- **THEN:** Every record has a unique call_site_id, source_path, line, column, hook_kind, and legacy_ref, and no two records share the same source location.
- **Test tier:** `integration`
- **Verification service:** `python3+inventory-artifact`
- **Verify:** `python3 -c "import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); r=p['call_sites']; assert len(r)==105; assert len({x['call_site_id'] for x in r})==105; assert all(x['source_path'] and x['line']>0 and x['column']>0 and x['hook_kind'] and x['legacy_ref'] for x in r); assert len({(x['source_path'],x['line'],x['column']) for x in r})==105"`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `db_query`
  - Negative control: the parser emits duplicate call_site_id values; source locations are omitted; the inventory uses an empty static record list
  - Cases:
    - Start: `rn_legacy_tree`
      Action: run the inventory command; run the JSON uniqueness and required-field assertion
      Must observe: 105 unique call_site_id values; 105 unique source_path/line/column tuples; 105 records with line > 0 and column > 0
      Must not observe: duplicate call_site_id; missing source_path; line=0; empty record list

### AC-3: Deterministic rerun
- **GIVEN:** The source checkout is unchanged after a successful inventory run.
- **WHEN:** The operator runs the command twice and hashes both artifacts.
- **THEN:** Both runs report 47 files and 105 call sites and produce the same SHA-256 digest.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+shasum`
- **Verify:** `rm -rf .tmp/client-contract/rerun && mkdir -p .tmp/client-contract/rerun && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/one.json && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/two.json && test "$(shasum -a 256 .tmp/client-contract/rerun/one.json | cut -d' ' -f1)" = "$(shasum -a 256 .tmp/client-contract/rerun/two.json | cut -d' ' -f1)"`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: record ordering changes between runs; the command uses a timestamp or random identifier; the second artifact is empty
  - Cases:
    - Start: `rn_legacy_tree`
      Action: run the inventory command twice against the unchanged checkout; compute SHA-256 for both JSON artifacts
      Must observe: run count=2; both summaries report 47 files; both summaries report 105 call sites; SHA-256 digest equality
      Must not observe: different artifact digests; timestamp-only output; empty second artifact

### AC-4: Approved source-root boundary
- **GIVEN:** The repository contains production RN files, generated Convex code, dependencies, and tests.
- **WHEN:** The inventory command completes with its default source-root policy.
- **THEN:** The artifact records the four approved roots app/, components/, hooks/, and screens/ and excludes node_modules, convex/_generated, and test-only files.
- **Test tier:** `integration`
- **Verification service:** `python3+inventory-artifact`
- **Verify:** `python3 -c "import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); assert p['source_roots']==['app','components','hooks','screens']; paths=[x['source_path'] for x in p['call_sites']]; assert not any(x.startswith(('node_modules/','convex/_generated/')) or x.endswith(('.test.ts','.test.tsx')) for x in paths)"`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: the scanner includes dependency code; the scanner includes generated code; the scanner scans an empty source-root set
  - Cases:
    - Start: `rn_legacy_tree`
      Action: run the inventory command with default roots; assert the source_roots and path exclusions in the JSON artifact
      Must observe: source root count=4; app/ is listed; components/ is listed; hooks/ is listed; screens/ is listed
      Must not observe: node_modules/ in call-site paths; convex/_generated/ in call-site paths; test-only source path in call-site paths; source root count=0

## Test Criteria
| ID | Maps to | Statement | Verify |
|---|---|---|---|
| TC-1 | AC-1 | Inventory command reports 47 source files and 105 call sites when run against the checked-out RN source tree | `bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json` |
| TC-2 | AC-2 | Inventory artifact contains 105 unique line-addressed records | `python3 -c "import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); r=p['call_sites']; assert len(r)==105 and len({x['call_site_id'] for x in r})==105 and all(x['line']>0 and x['column']>0 for x in r)"` |
| TC-3 | AC-3 | Two unchanged inventory runs produce the same SHA-256 digest | `rm -rf .tmp/client-contract/rerun && mkdir -p .tmp/client-contract/rerun && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/one.json && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/two.json && test "$(shasum -a 256 .tmp/client-contract/rerun/one.json | cut -d' ' -f1)" = "$(shasum -a 256 .tmp/client-contract/rerun/two.json | cut -d' ' -f1)"` |
| TC-4 | AC-4 | Inventory artifact contains exactly four approved source roots | `python3 -c "import json; assert json.load(open('.tmp/client-contract/convex-callsite-inventory.json'))['source_roots']==['app','components','hooks','screens']"` |

## Reading List
| Path | Lines | Focus |
|---|---|---|
| `.spec/prds/mk6-migration/ROADMAP.md` | 1190-1235 | Sprint 21 gate, 47-file/105-call-site inventory, task dependency and capability coverage |
| `.spec/prds/mk6-migration/08-uc-sync.md` | 20-30 | UC-SYNC-01 migration contract and one-mapping-per-call-site requirement |
| `.spec/prds/mk6-migration/10-technical-requirements/07-ui-infrastructure.md` | 8-38 | RN source roots, current Convex/Zero split, and 105 call-site scope |
| `app/_layout.tsx` | 1-19,37-49,132-166 | ConvexProvider, ConvexReactClient, and ZeroProvider boot surfaces |
| `app/articles.tsx` | 1-75 | Representative useQuery/useAction call-site shape |
| `hooks/use-voice-session.ts` | 17-20,100-115 | Representative useAction/useMutation/useConvex call-site shape |
| `services/platform/src/cli/holo.ts` | 1-150,684-700 | CLI command conventions, help output, parser, and dispatch switch |
| `/Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` | 1-260 | Valid scenario fields, real seed methods, concrete observations, negative controls, and evidence |

## Guardrails
**WRITE-ALLOWED**
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/src/sync/client-callsite-inventory.ts (NEW)
- services/platform/src/cli/__tests__/client-callsite-inventory.test.ts (NEW)
- .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json (NEW)
- .tmp/client-contract/** (NEW verification artifacts)
**WRITE-PROHIBITED**
- app/** - inventory only; do not rewrite RN surfaces
- components/** - inventory only; do not rewrite components
- hooks/** - inventory only; do not rewrite hooks
- screens/** - inventory only; do not rewrite screens
- app/zero/schema.ts - Zero schema authoring belongs to later rewrite work
- .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml - authored by S-CONTRACT-02

## Design / Client Semantics
- **Design specialist:** `frontend-designer`
- **Severity:** `n/a`
**References:**
- app/_layout.tsx:1-7,23-39,138-166
- app/(drawer)/_layout.tsx:1-59,246-247
- app/(drawer)/chat/[conversationId].tsx:1-75
- app/articles.tsx:1-70
- app/document/[id].tsx:1-76,102-176,294-296
- hooks/use-chat-history.ts:10-43
- hooks/use-notifications.ts:20-44
- hooks/use-voice-session.ts:17-18,103-109
- components/notifications/NotificationToastProvider.tsx:21,52-56
- components/subscriptions/SubscriptionFeedScreen.tsx:10,109-110
- components/ResearchProgressWithConvex.tsx:1-2,51-52
- screens/subscriptions-screen.tsx:1,59-70

**Specialist design notes:**
- The RN tree is a mixed migration surface: app/_layout.tsx already mounts ZeroProvider but still nests ConvexProvider, and the legacy import inventory spans 46 files under app/components/hooks/screens/lib (including tests and a Storybook file). A raw lexical scan finds 152 hook/action lines, while the PRD gate promises a normalized 47-file/105-call-site inventory; S-CONTRACT-01 must define exclusions and deduplication rather than silently asserting the PRD number.
- Inventory each hook/action as a rendered consumer, not just a function name: record screen/component, loading/empty/error state, ordering, pagination, and whether an operation feeds a list, detail, card, notification badge, chat stream, research progress view, upload flow, audio status, or settings form. The visual contract should preserve stale/offline presentation and explicit retry/blocked states. Examples include chat history (hooks/use-chat-history.ts), notification unread/read state (hooks/use-notifications.ts), subscription feed (components/subscriptions/SubscriptionFeedScreen.tsx), article/audio detail (app/document/[id].tsx), and the dual Conversation drawer queries/mutations (app/(drawer)/_layout.tsx).
**Offline / optimistic / conflict / error / identifier semantics:**
- **Offline Semantics:** Current Convex hooks assume a live provider and do not declare airplane behavior. Planned Zero reads may render the last locally cached projection; every write inventory entry must explicitly say queueable or authoritative-online-only. Chat, mission control, upload initiation/finalization, and audio generation should be marked online-authoritative unless a contract entry supplies an idempotent queue and visible pending state; simple CRUD may queue through a registered Zero mutator.
- **Optimistic Semantics:** Current source has no per-call optimistic contract. Mark simple CRUD mutations as eligible only where a deterministic local projection can be rendered and rolled back; mark chat send, mission start/verdict/steer, upload finalize, audio generation, and search actions as non-optimistic command states. UI must distinguish pending/queued from committed Zero rows so a card or list never presents an authoritative command as durable success.
- **Conflict Semantics:** Inventory version/conflict behavior per consumer. Server-mutator CRUD conflicts must identify the stale row/version and reconcile from Zero; chat uses request replay; mission steer/verdict uses request keys and server ordering; settings/subscription/improvement edits need an explicit last-write or rejection policy. Current Convex calls such as improvements/[requestId].tsx:35-39 cast route IDs to any, so conflict identity cannot be inferred safely from the current UI types.
- **Error Semantics:** Capture existing UI error branches and map them to typed terminal states. Current route consumers mostly infer loading from undefined (for example app/(drawer)/improvements.tsx:28-31 and app/(drawer)/toolbelt.tsx:16-17), so the inventory must flag absent/error rendering rather than treating undefined as an empty result. Planned Hono errors are structured and visible; blocked, validation, offline, unauthorized, migration_read_only, and conflict states need consumer-specific copy and retry affordances.
- **Identifier Semantics:** Record the legacy Convex function/ref and every ID type used by the component, then declare target UUIDv7/alias handling. Backend schema uses UUID-like string IDs and retains legacy_convex_id; exposed legacy IDs are allowed only with an explicit catalog alias/expiry. Route params (document/[id], conversationId, sessionId, requestId) must not be silently reinterpreted as UUIDs, and current `as any` casts are HIGH findings.

**Blocker/high findings:**
- BLOCKER: app/_layout.tsx has both ZeroProvider and ConvexProvider, so the desired zero-convex/react rewrite cannot be proven from the current boot surface.
- BLOCKER: current inventory evidence is 46 importing files / 152 lexical hook lines, not the roadmap's normalized 47 files / 105 calls; the command must publish its counting rules and fixture output.
- HIGH: app/ and components/ include Convex-backed Storybook/test consumers, and `AgentPlanCardWithConvex`/`ResearchProgressWithConvex` preserve explicitly named legacy variants; classify whether these count toward the production gate or are separately gated.
- HIGH: several consumers use undefined as loading and do not expose a typed error path, making offline/server-rejection visuals impossible to preserve without contract metadata.

**Unresolved live-vs-PRD target surfaces:**
- Live: app/zero/schema.ts currently publishes only conversations and chat_messages; PRD target: all discovered reads map to the published zero_pub subset.
- Live: app/zero/queries.ts exposes only chatMessages.byConversation and no Zero mutator; PRD target: registered Zero queries/mutators cover simple client CRUD.
- Live: legacy Convex hooks remain throughout RN; PRD target: zero `convex/react` hooks in app/components/hooks/screens and a provider boot without Convex URL.
- Live: no contract inventory artifact or verifier was found; PRD target: one mapping for each normalized call site linked to a T-SYNC criterion.

## Verification Gates
| Gate | Command | Expected |
|---|---|---|
| Complete inventory | `bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json` | Exit 0; stdout reports file_count=47 and call_site_count=105. |
| Inventory artifact schema | `python3 -c "import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); assert len(p['call_sites'])==105 and all(x['source_path'] and x['line']>0 and x['column']>0 for x in p['call_sites'])"` | Exit 0. |
| Determinism | `rm -rf .tmp/client-contract/rerun && mkdir -p .tmp/client-contract/rerun && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/one.json && bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/rerun/two.json && test "$(shasum -a 256 .tmp/client-contract/rerun/one.json | cut -d' ' -f1)" = "$(shasum -a 256 .tmp/client-contract/rerun/two.json | cut -d' ' -f1)"` | Exit 0. |
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < .tmp/client-contract/s-contract-01-scenarios.json` | Exit 0 with zero CRITICAL or HIGH violations. |
| Typecheck and lint | `pnpm tsgo --noEmit && pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/sync/client-callsite-inventory.ts` | Both commands exit 0. |

## Coding Standards
- RULES.md#react--react-native-rules
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md
- /Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md

## Review Criteria
- All AC and TC IDs remain stable and every behavioral AC has a scenario.
- No fake/static/empty success path; negative controls fail against disconnected, missing, stale, or malformed inputs.
- Every target is resolved against live repository/service surfaces rather than PRD text alone.
- All writes stay within WRITE-ALLOWED and verification gates produce captured evidence.

## Dependencies
- **Depends on:** Sprint 04, Sprint 05, Sprint 18
- **Blocks:** S-CONTRACT-02

## Agent Instructions
Follow RED → GREEN → REFACTOR where `tdd_mode` is `red_first`; for INFRA/CONFIG tasks, use the stated integration and seeded-evidence gates. Do not hand-wave unavailable target surfaces: preserve fail-closed diagnostics and the specialist findings above.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-CONTRACT-01",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "rn_legacy_tree": {
      "description": "The checked-out Holocron RN source tree containing the roadmap's 47 legacy-call-site files and 105 Convex hook/action call sites.",
      "seed_method": "cli",
      "records": [
        "app/_layout.tsx",
        "app/articles.tsx",
        "app/document/[id].tsx",
        "app/(drawer)/_layout.tsx",
        "app/(drawer)/chat/[conversationId].tsx",
        "hooks/use-chat-history.ts",
        "hooks/useResearchSession.ts",
        "hooks/use-voice-session.ts",
        "components/chat/MessageBubble.tsx",
        "components/notifications/NotificationToastProvider.tsx",
        "screens/article-detail.tsx",
        "screens/settings-screen.tsx"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN the approved RN source roots WHEN the inventory command runs THEN it reports 47 files and 105 call sites and emits a non-empty artifact.",
      "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the scanner disconnects from the repository filesystem",
            "the implementation returns a static 47/105 result",
            "the scanner silently omits a legacy call site",
            "the output artifact is empty"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rn_legacy_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json",
                "read the emitted JSON summary and records"
              ]
            },
            "end_state": {
              "must_observe": [
                "file_count=47",
                "call_site_count=105",
                "JSON records length=105",
                "artifact file size > 0 bytes"
              ],
              "must_not_observe": [
                "file_count=0",
                "call_site_count=0",
                "empty inventory artifact",
                "static or hardcoded summary with no source paths"
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
      "description": "GIVEN 105 discovered call sites WHEN records are inspected THEN each has a unique stable ID and line-addressed source location.",
      "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); r=p['call_sites']; assert len(r)==105 and len({x['call_site_id'] for x in r})==105\"",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "python3+inventory-artifact",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the parser emits duplicate call_site_id values",
            "source locations are omitted",
            "the inventory uses an empty static record list"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rn_legacy_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the inventory command",
                "run the JSON uniqueness and required-field assertion"
              ]
            },
            "end_state": {
              "must_observe": [
                "105 unique call_site_id values",
                "105 unique source_path/line/column tuples",
                "105 records with line > 0 and column > 0"
              ],
              "must_not_observe": [
                "duplicate call_site_id",
                "missing source_path",
                "line=0",
                "empty record list"
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
      "description": "GIVEN an unchanged checkout WHEN inventory runs twice THEN both artifacts have equal SHA-256 digests.",
      "verify": "shasum -a 256 .tmp/client-contract/rerun/one.json .tmp/client-contract/rerun/two.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+shasum",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "record ordering changes between runs",
            "the command uses a timestamp or random identifier",
            "the second artifact is empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rn_legacy_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the inventory command twice against the unchanged checkout",
                "compute SHA-256 for both JSON artifacts"
              ]
            },
            "end_state": {
              "must_observe": [
                "run count=2",
                "both summaries report 47 files",
                "both summaries report 105 call sites",
                "SHA-256 digest equality"
              ],
              "must_not_observe": [
                "different artifact digests",
                "timestamp-only output",
                "empty second artifact"
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
      "description": "GIVEN production RN files and dependency/generated/test files WHEN the default scan runs THEN only four approved source roots are included.",
      "verify": "python3 -c \"import json; assert json.load(open('.tmp/client-contract/convex-callsite-inventory.json'))['source_roots']==['app','components','hooks','screens']\"",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "python3+inventory-artifact",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the scanner includes dependency code",
            "the scanner includes generated code",
            "the scanner scans an empty source-root set"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rn_legacy_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the inventory command with default roots",
                "assert the source_roots and path exclusions in the JSON artifact"
              ]
            },
            "end_state": {
              "must_observe": [
                "source root count=4",
                "app/ is listed (literal \"app/\")",
                "components/ is listed (literal \"components/\")",
                "hooks/ is listed (literal \"hooks/\")",
                "screens/ is listed (literal \"screens/\")"
              ],
              "must_not_observe": [
                "node_modules/ in call-site paths",
                "convex/_generated/ in call-site paths",
                "test-only source path in call-site paths",
                "source root count=0"
              ]
            }
          }
        ],
        "id": "AC-4"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Inventory command reports 47 source files and 105 call sites when run against the checked-out RN source tree.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites --root . --json --output .tmp/client-contract/convex-callsite-inventory.json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Inventory artifact contains 105 unique line-addressed records.",
      "maps_to_ac": "AC-2",
      "verify": "python3 -c \"import json; p=json.load(open('.tmp/client-contract/convex-callsite-inventory.json')); assert len(p['call_sites'])==105\""
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Two unchanged inventory runs produce the same SHA-256 digest.",
      "maps_to_ac": "AC-3",
      "verify": "shasum -a 256 .tmp/client-contract/rerun/one.json .tmp/client-contract/rerun/two.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Inventory artifact contains exactly four approved source roots.",
      "maps_to_ac": "AC-4",
      "verify": "python3 -c \"import json; assert len(json.load(open('.tmp/client-contract/convex-callsite-inventory.json'))['source_roots'])==4\""
    }
  ]
}
-->
