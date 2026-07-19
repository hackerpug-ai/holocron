# S-CONTRACT-02: Author 13-client-data-contract.yaml mapping every call site to its target

- **Sprint:** [Sprint 21: Client Data Contract](./SPRINT.md)
- **Task Type:** `CONFIG`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `XL`
- **Estimate:** `300 minutes`
- **Agent:** `react-native-ui-implementer` — Owns the client-side migration semantics and can map Convex reads/writes to Zero projections, Zero mutators, and authoritative Hono commands without changing UI behavior.
- **Reviewer:** `react-native-ui-reviewer` — Reviews each mapping for route ownership, identifier compatibility, offline behavior, optimistic rollback, conflict semantics, and alignment with the RN rewrite.
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
Author the machine-readable client data contract from the completed 105-row inventory and the live zero_pub/Hono surfaces.

## Background
The migration constitution requires 13-client-data-contract.yaml to map every legacy Convex hook/action call site to one published Zero query, Zero mutator, or authoritative Hono command. Each mapping must declare projection, response/error shape, ordering/cursor behavior, optimistic behavior, conflict/rejection behavior, offline policy, identifier compatibility, and a linked T-SYNC criterion.

## Specification
- **Objective:** Create 10-technical-requirements/13-client-data-contract.yaml with exactly one complete mapping for each inventory call site.
- **Success state:** The contract contains 105 unique call-site mappings, every mapping has all required semantic fields, every target resolves to the published Zero surface or Hono route, and every entry links a valid T-SYNC criterion.

## Critical Constraints
### MUST
- MUST preserve every inventory call_site_id exactly once and retain its consuming route and source location.
- MUST declare target kind, target name, projection, response/error shape, ordering/cursor behavior, optimistic behavior, conflict behavior, rejection behavior, offline policy, identifier compatibility, and linked E2E criterion for every entry.
- MUST use Zero reactive queries for published reads, registered Zero mutators for simple client-visible CRUD, and authoritative Hono commands for chat, mission, and upload operations.
### NEVER
- NEVER invent a target absent from zero_pub or the Hono command surface.
- NEVER mark authoritative Hono commands as optimistically applied database mutators.
- NEVER use a blanket offline policy or omit rejection/conflict semantics to make entries pass validation.
### STRICTLY
- STRICTLY keep one mapping per call_site_id; duplicate mappings and orphaned inventory rows are errors.
- STRICTLY preserve legacy IDs only through an explicit alias and expiry declaration.
- STRICTLY link each entry to T-SYNC-019 or another criterion present in 11-e2e-testing-criteria.md.

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01
**Provides:**
- 13-client-data-contract.yaml
- per-call-site-target-mappings
- offline-optimistic-conflict-rejection-contract
**Consumes:**
- 13-client-callsite-inventory.json
- services/platform/src/db/schema/zero-pub.ts
- app/zero/schema.ts
- services/platform/src/http/hono-app.ts
- T-SYNC-004
- T-SYNC-019
**Boundary contracts:**
- legacy call-site identity to exactly one client contract entry
- contract target to live zero_pub table or Hono route
- client operation to offline/optimistic/conflict/rejection/identifier semantics
- contract entry to linked E2E criterion

## Acceptance Criteria
### AC-1: One complete entry per call site
- **GIVEN:** The S-CONTRACT-01 inventory contains 105 unique call_site_id values.
- **WHEN:** The contract authoring command consumes the inventory and writes 13-client-data-contract.yaml.
- **THEN:** The artifact contains exactly 105 unique entries and every inventory call_site_id appears exactly once.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+yaml+inventory`
- **Verify:** `bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `file_artifact`
  - Negative control: the authoring command disconnects from the inventory; one mapping is silently omitted; the YAML contains duplicate call_site_id values; the generated contract is empty
  - Cases:
    - Start: `contract_inputs`
      Action: run bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml; parse the emitted YAML entry list and compare IDs with the inventory
      Must observe: contract entry count=105; unique call_site_id count=105; inventory-to-contract difference count=0; YAML artifact size > 0 bytes
      Must not observe: entry count=0; duplicate call_site_id; orphaned inventory call site; empty YAML artifact

### AC-2: Required semantic contract fields
- **GIVEN:** The contract contains 105 call-site entries.
- **WHEN:** The schema verifier checks every entry.
- **THEN:** All 105 entries declare target, projection, response_error_shape, ordering_cursor, optimistic, conflict, rejection, offline, identifier, and e2e_criterion fields.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+yaml-schema`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: required schema fields are omitted; the verifier accepts an empty mapping; a static field-count result replaces per-entry validation
  - Cases:
    - Start: `contract_inputs`
      Action: run verify:client-contract --schema against the authored contract; capture the per-field and per-entry summary
      Must observe: schema entries checked=105; missing target fields=0; missing offline fields=0; missing optimistic fields=0; missing conflict fields=0; missing rejection fields=0; missing identifier fields=0
      Must not observe: schema entries checked=0; missing required field count > 0; empty verifier output; static pass without reading YAML

### AC-3: Live target resolution
- **GIVEN:** The current zero_pub table lists, RN Zero schema, and Hono route implementation are available in the checkout.
- **WHEN:** The target verifier resolves each contract target.
- **THEN:** All 105 targets resolve to a live published Zero table/query/mutator or Hono route and unresolved_target_count=0.
- **Test tier:** `integration`
- **Verification service:** `bun-cli+zero-pub+hono`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `stdout`
  - Negative control: a target is stale or disconnected from the live schema; the verifier accepts an invented route; zero_pub is replaced by an empty target registry
  - Cases:
    - Start: `contract_inputs`
      Action: run verify:client-contract --targets; capture target resolution counts and unresolved target names
      Must observe: targets checked=105; resolved target count=105; unresolved_target_count=0; zero_pub or Hono target names in the report
      Must not observe: targets checked=0; unresolved target count > 0; invented target name; empty target registry

### AC-4: Offline and E2E semantics
- **GIVEN:** Each entry has a declared operation class and linked E2E criterion.
- **WHEN:** The contract verifier runs its E2E-link and offline-behavior checks.
- **THEN:** All 105 entries link a valid criterion, and the report proves declared airplane-mode reads, queued writes/reconnect, server rejection rollback, duplicate replay, and concurrent-edit behavior are represented.
- **Test tier:** `e2e`
- **Verification service:** `bun-cli+contract-inventory`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
- **Scenario:**
  - Tier: `visible`; topology: `single-node`; evidence: `api_response`
  - Negative control: T-SYNC-019 is omitted from the contract; offline policies are all blank or static; duplicate replay and rejection rollback are not declared; the verifier does not read the E2E criteria file
  - Cases:
    - Start: `contract_inputs`
      Action: run verify:client-contract --e2e-links; inspect the linked criterion and offline-behavior summary; exercise the seeded read, queue/reconnect, rejection, duplicate, and concurrent-edit cases through the real app/Zero boundary
      Must observe: E2E links checked=105; invalid e2e link count=0; T-SYNC-019 linked entry count=105 or an explicit valid criterion for each entry; offline behavior case count=5
      Must not observe: E2E links checked=0; invalid e2e link count > 0; airplane-mode policy missing; duplicate replay policy missing; server rejection rollback policy missing

## Test Criteria
| ID | Maps to | Statement | Verify |
|---|---|---|---|
| TC-1 | AC-1 | Client data contract contains 105 unique mappings matching the inventory | `bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-2 | AC-2 | Every contract entry declares all required data-contract semantics | `bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-3 | AC-3 | Every contract target resolves to a live Zero or Hono surface | `bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-4 | AC-4 | Every contract entry links a valid E2E criterion and declares offline behavior | `bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |

## Reading List
| Path | Lines | Focus |
|---|---|---|
| `.spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md` | 17-26 | Required client-data-contract fields and inventory comparison rule |
| `.spec/prds/mk6-migration/10-technical-requirements/04-api-design.md` | 10-40 | Live Hono routes and Zero offline/mutator/authoritative-command semantics |
| `.spec/prds/mk6-migration/10-technical-requirements/07-ui-infrastructure.md` | 8-38 | Current Convex call-site categories and client migration scope |
| `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` | 73-94 | CAP-SYNC-01 and CAP-CUT-01 boundary contracts and real-service proof |
| `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` | 191-198 | T-SYNC-004 and T-SYNC-019 pass/fail criteria |
| `app/zero/schema.ts` | 1-41 | Current published RN Zero schema and table columns |
| `app/zero/queries.ts` | 1-18 | Current Zero query builder and ordering convention |
| `services/platform/src/db/schema/zero-pub.ts` | 1-180 | Live zero_pub table and excluded-table declarations |
| `services/platform/src/http/hono-app.ts` | 85-390 | Live Hono routes, command responses, and error surfaces |
| `/Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` | 1-260 | Scenario contract validation |

## Guardrails
**WRITE-ALLOWED**
- .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml (NEW)
- .tmp/client-contract/** (NEW verification artifacts)
- services/platform/src/cli/__tests__/client-data-contract-author.test.ts (NEW, only if needed for artifact validation)
**WRITE-PROHIBITED**
- app/** - full RN rewrite is Sprint 24
- components/** - full RN rewrite is Sprint 24
- hooks/** - full RN rewrite is Sprint 24
- screens/** - full RN rewrite is Sprint 24
- app/zero/schema.ts - schema expansion is outside this contract-authoring task
- services/platform/src/db/schema/zero-pub.ts - do not make stale targets appear live
- services/platform/src/http/hono-app.ts - route implementation belongs to service tasks
- .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json - read-only input from S-CONTRACT-01

## Design / Client Semantics
- **Design specialist:** `frontend-designer`
- **Severity:** `n/a`
**References:**
- .spec/prds/mk6-migration/10-technical-requirements/04-api-design.md:1-49
- .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:20-27
- app/zero/schema.ts:1-51
- app/zero/queries.ts:1-13
- services/platform/src/db/schema/zero-pub.ts:1-151
- services/platform/src/db/migrations/0002_zero_pub.sql:1-156
- services/platform/src/http/hono-app.ts:105-141,201-390
- services/platform/src/http/chat-runs.ts:18-87,129-260
- services/platform/src/http/missions.ts:330-440
- services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts:1-70

**Specialist design notes:**
- The live client contract is only a thin Sprint-20 chat slice: app/zero/schema.ts has conversations/chat_messages and app/zero/queries.ts has one byConversation query. The live Hono app implements chat runs/events, uploads, missions, and scoped auth routes, while the documented `/api/zero/query` and `/api/zero/mutate` endpoints are not present in the inspected route surface. Sprint20's real integration test proves POST /api/chat-runs persists a user message and replays the same request, but it does not prove a complete client mapping.
- Each YAML entry should name the exact rendered consumer and target projection, not only a backend route. For Zero queries include table columns, relationship/key, stable sort/cursor, nullability, and stale-cache rendering. For Zero mutators include the local projection and rollback payload. For Hono commands include request/response schemas, durable row IDs, status transitions, and the final Zero row/event that updates the screen. Map chat history to chat_messages.byConversation; conversation drawer/search, documents/feed/research/subscriptions/improvements/notifications/settings/audio/voice/toolbelt to either a published relation or an explicit unresolved target rather than an invented query.
**Offline / optimistic / conflict / error / identifier semantics:**
- **Offline Semantics:** Use the API constitution's split: Zero reactive reads can use local cache; registered simple CRUD mutators may queue/retry offline; chat run creation, mission start/verdict/steer, upload init/PUT/finalize, and other authoritative commands must be online-only unless their entry defines queue persistence and replay. The contract must say what the UI renders while queued and on reconnect, and link airplane-mode coverage to T-SYNC-019.
- **Optimistic Semantics:** The API design explicitly says simple client-visible CRUD uses a registered Zero mutator, but chat, mission start/verdict/steer, and upload initiation/finalization are authoritative Hono commands and never optimistic database mutators. Encode that distinction per entry: optimistic projected row with rollback for CRUD; pending command/stream state with no durable-success styling for authoritative commands; final reconciliation comes from Zero or the durable chat message.
- **Conflict Semantics:** Use requestId replay for chat (same runId and durable message ID), idempotencyKey plus conflict response for mission creation, and requestKey for mission steering/verdict. Zero mutator conflicts must return structured rejection/version information and then reconcile the authoritative row. `migration_read_only` is terminal and visibly rejects writes during soak; do not classify it as a retryable offline error.
- **Error Semantics:** Hono currently returns structured JSON for route failures: chat wraps failures as `chat_run_error`/422, mission handlers call missionHttpErrorFromUnknown, and auth middleware supplies 401/403. Contract entries must preserve error code/data and distinguish validation (422), not-found (404), unauthorized (401/403), blocked/failed terminal chat events, conflict, and migration_read_only. UI consumers need an explicit retry or recovery action and must not turn a rejected command into an optimistic success.
- **Identifier Semantics:** The target contract should use UUIDv7 IDs for new rows, preserve legacy_convex_id only as a declared boundary alias, and carry idempotency/request keys separately. Zero's current schema uses string IDs and optional foreign-key strings; chat backend uses UUID casts and a durable_message_id. Each mapping must declare whether a route param is a target UUID, legacy alias, request key, share token, or idempotency key, with no `as any` conversion.

**Blocker/high findings:**
- BLOCKER: app/zero/queries.ts has no mutation registry and only one query, so most planned targets cannot resolve live.
- BLOCKER: the Hono route surface inspected has no `/api/zero/query` or `/api/zero/mutate` handler despite those being constitution targets; `--targets` cannot pass against an unimplemented manifest.
- HIGH: zero_pub publishes many backend relations but the RN schema mirrors only two; publication membership alone is not a client-readable contract.
- HIGH: current chat SSE emits numeric event IDs (`String(event.seq)`) while the API constitution specifies `runId:sequence` envelopes; the contract must resolve this live-vs-PRD mismatch before consumers implement duplicate suppression.
- HIGH: Sprint20 proves Postgres persistence/replay but not cache sync, final Zero reconciliation, or offline/optimistic/conflict behavior.

**Unresolved live-vs-PRD target surfaces:**
- Live: two-table RN schema and one query; PRD: all zero_pub reactive app surfaces and shared client query/mutator schemas.
- Live: Hono chat/missions/uploads routes; PRD: Zero query/mutate endpoints, complete command manifest, and every call-site target resolution.
- Live: zero-cache launchd unit is documented as disabled/placeholder in services/platform/deploy/launchd/holocron-zerocache.plist:4-30; PRD: live zero-cache/zero_pub target required by `--targets`.
- Live: chat event route uses Last-Event-ID and numeric SSE IDs; PRD: resumable `{runId:sequence}` envelope plus final durable-message reconciliation.
- Live: zero_pub excludes mission engine, evidence, uploads/media, voice, and user preference relations; PRD: every legacy consumer still needs a target, which may require authoritative Hono commands or an explicit non-reactive design.

## Verification Gates
| Gate | Command | Expected |
|---|---|---|
| Author contract | `bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` | Exit 0; artifact contains 105 entries. |
| Schema completeness | `bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` | Exit 0; all required field omission counts are 0. |
| Target resolution | `bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` | Exit 0; resolved target count=105 and unresolved_target_count=0. |
| E2E links and offline semantics | `bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` | Exit 0; invalid E2E link count=0 and all five offline/replay/conflict behaviors represented. |
| Scenario validation | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py < .tmp/client-contract/s-contract-02-scenarios.json` | Exit 0 with zero CRITICAL or HIGH violations. |
| YAML and type quality | `pnpm tsgo --noEmit && pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cli/holo.ts services/platform/src/cli/__tests__/client-data-contract-author.test.ts` | Both commands exit 0. |

## Coding Standards
- RULES.md#react--react-native-rules
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- /Users/inference1/Projects/brain/docs/REQUIREMENT-TRACKING.md
- /Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md

## Review Criteria
- All AC and TC IDs remain stable and every behavioral AC has a scenario.
- No fake/static/empty success path; negative controls fail against disconnected, missing, stale, or malformed inputs.
- Every target is resolved against live repository/service surfaces rather than PRD text alone.
- All writes stay within WRITE-ALLOWED and verification gates produce captured evidence.

## Dependencies
- **Depends on:** S-CONTRACT-01, Sprint 04, Sprint 05, Sprint 18
- **Blocks:** S-CONTRACT-03, Sprint 24

## Agent Instructions
Follow RED → GREEN → REFACTOR where `tdd_mode` is `red_first`; for INFRA/CONFIG tasks, use the stated integration and seeded-evidence gates. Do not hand-wave unavailable target surfaces: preserve fail-closed diagnostics and the specialist findings above.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-CONTRACT-02",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "contract_inputs": {
      "description": "A completed 105-row legacy inventory plus the current Zero publication and Hono route surfaces used to author the contract.",
      "seed_method": "cli",
      "records": [
        ".spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
        "app/zero/schema.ts",
        "services/platform/src/db/schema/zero-pub.ts",
        "services/platform/src/http/hono-app.ts",
        "services/platform/src/http/chat-runs.ts",
        "T-SYNC-004",
        "T-SYNC-019"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a 105-row inventory WHEN the contract authoring command runs THEN exactly 105 unique mappings are written.",
      "verify": "bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+yaml+inventory",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the authoring command disconnects from the inventory",
            "one mapping is silently omitted",
            "the YAML contains duplicate call_site_id values",
            "the generated contract is empty"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "contract_inputs",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run bun services/platform/src/cli/holo.ts client-contract:author --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json --output .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
                "parse the emitted YAML entry list and compare IDs with the inventory"
              ]
            },
            "end_state": {
              "must_observe": [
                "contract entry count=105",
                "unique call_site_id count=105",
                "inventory-to-contract difference count=0",
                "YAML artifact size > 0 bytes"
              ],
              "must_not_observe": [
                "entry count=0",
                "duplicate call_site_id",
                "orphaned inventory call site",
                "empty YAML artifact"
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
      "description": "GIVEN 105 contract entries WHEN schema validation runs THEN all required semantic fields exist on every entry.",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+yaml-schema",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "required schema fields are omitted",
            "the verifier accepts an empty mapping",
            "a static field-count result replaces per-entry validation"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "contract_inputs",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run verify:client-contract --schema against the authored contract",
                "capture the per-field and per-entry summary"
              ]
            },
            "end_state": {
              "must_observe": [
                "schema entries checked=105",
                "missing target fields=0",
                "missing offline fields=0",
                "missing optimistic fields=0",
                "missing conflict fields=0",
                "missing rejection fields=0",
                "missing identifier fields=0"
              ],
              "must_not_observe": [
                "schema entries checked=0",
                "missing required field count > 0",
                "empty verifier output",
                "static pass without reading YAML"
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
      "description": "GIVEN live zero_pub and Hono surfaces WHEN target resolution runs THEN all 105 targets resolve.",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bun-cli+zero-pub+hono",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "a target is stale or disconnected from the live schema",
            "the verifier accepts an invented route",
            "zero_pub is replaced by an empty target registry"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "contract_inputs",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run verify:client-contract --targets",
                "capture target resolution counts and unresolved target names"
              ]
            },
            "end_state": {
              "must_observe": [
                "targets checked=105",
                "resolved target count=105",
                "unresolved_target_count=0",
                "zero_pub or Hono target names in the report (target_count=105)"
              ],
              "must_not_observe": [
                "targets checked=0",
                "unresolved target count > 0",
                "invented target name",
                "empty target registry"
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
      "description": "GIVEN operation semantics and E2E criteria WHEN link/offline validation runs THEN all entries link valid criteria and represent five required offline/replay/conflict cases.",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "bun-cli+contract-inventory",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "T-SYNC-019 is omitted from the contract",
            "offline policies are all blank or static",
            "duplicate replay and rejection rollback are not declared",
            "the verifier does not read the E2E criteria file"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "contract_inputs",
            "action": {
              "actor": "maestro_operator",
              "steps": [
                "run verify:client-contract --e2e-links",
                "inspect the linked criterion and offline-behavior summary",
                "exercise the seeded read, queue/reconnect, rejection, duplicate, and concurrent-edit cases through the real app/Zero boundary"
              ]
            },
            "end_state": {
              "must_observe": [
                "E2E links checked=105",
                "invalid e2e link count=0",
                "T-SYNC-019 linked entry count=105 or an explicit valid criterion for each entry",
                "offline behavior case count=5"
              ],
              "must_not_observe": [
                "E2E links checked=0",
                "invalid e2e link count > 0",
                "airplane-mode policy missing",
                "duplicate replay policy missing",
                "server rejection rollback policy missing"
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
      "description": "Client data contract contains 105 unique mappings matching the inventory.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Every contract entry declares all required data-contract semantics.",
      "maps_to_ac": "AC-2",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --schema --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Every contract target resolves to a live Zero or Hono surface.",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --targets --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Every contract entry links a valid E2E criterion and declares offline behavior.",
      "maps_to_ac": "AC-4",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract --e2e-links --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json"
    }
  ]
}
-->
