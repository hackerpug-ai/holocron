```json
{
  "design_enrichments": [
    {
      "task_id": "S-CONTRACT-01",
      "proposed_by": "frontend-designer",
      "references": [
        "app/_layout.tsx:1-7,23-39,138-166",
        "app/(drawer)/_layout.tsx:1-59,246-247",
        "app/(drawer)/chat/[conversationId].tsx:1-75",
        "app/articles.tsx:1-70",
        "app/document/[id].tsx:1-76,102-176,294-296",
        "hooks/use-chat-history.ts:10-43",
        "hooks/use-notifications.ts:20-44",
        "hooks/use-voice-session.ts:17-18,103-109",
        "components/notifications/NotificationToastProvider.tsx:21,52-56",
        "components/subscriptions/SubscriptionFeedScreen.tsx:10,109-110",
        "components/ResearchProgressWithConvex.tsx:1-2,51-52",
        "screens/subscriptions-screen.tsx:1,59-70"
      ],
      "current_state": "The RN tree is a mixed migration surface: app/_layout.tsx already mounts ZeroProvider but still nests ConvexProvider, and the legacy import inventory spans 46 files under app/components/hooks/screens/lib (including tests and a Storybook file). A raw lexical scan finds 152 hook/action lines, while the PRD gate promises a normalized 47-file/105-call-site inventory; S-CONTRACT-01 must define exclusions and deduplication rather than silently asserting the PRD number.",
      "consumer_data_contract_notes": "Inventory each hook/action as a rendered consumer, not just a function name: record screen/component, loading/empty/error state, ordering, pagination, and whether an operation feeds a list, detail, card, notification badge, chat stream, research progress view, upload flow, audio status, or settings form. The visual contract should preserve stale/offline presentation and explicit retry/blocked states. Examples include chat history (hooks/use-chat-history.ts), notification unread/read state (hooks/use-notifications.ts), subscription feed (components/subscriptions/SubscriptionFeedScreen.tsx), article/audio detail (app/document/[id].tsx), and the dual Conversation drawer queries/mutations (app/(drawer)/_layout.tsx).",
      "offline_semantics": "Current Convex hooks assume a live provider and do not declare airplane behavior. Planned Zero reads may render the last locally cached projection; every write inventory entry must explicitly say queueable or authoritative-online-only. Chat, mission control, upload initiation/finalization, and audio generation should be marked online-authoritative unless a contract entry supplies an idempotent queue and visible pending state; simple CRUD may queue through a registered Zero mutator.",
      "optimistic_semantics": "Current source has no per-call optimistic contract. Mark simple CRUD mutations as eligible only where a deterministic local projection can be rendered and rolled back; mark chat send, mission start/verdict/steer, upload finalize, audio generation, and search actions as non-optimistic command states. UI must distinguish pending/queued from committed Zero rows so a card or list never presents an authoritative command as durable success.",
      "conflict_semantics": "Inventory version/conflict behavior per consumer. Server-mutator CRUD conflicts must identify the stale row/version and reconcile from Zero; chat uses request replay; mission steer/verdict uses request keys and server ordering; settings/subscription/improvement edits need an explicit last-write or rejection policy. Current Convex calls such as improvements/[requestId].tsx:35-39 cast route IDs to any, so conflict identity cannot be inferred safely from the current UI types.",
      "error_semantics": "Capture existing UI error branches and map them to typed terminal states. Current route consumers mostly infer loading from undefined (for example app/(drawer)/improvements.tsx:28-31 and app/(drawer)/toolbelt.tsx:16-17), so the inventory must flag absent/error rendering rather than treating undefined as an empty result. Planned Hono errors are structured and visible; blocked, validation, offline, unauthorized, migration_read_only, and conflict states need consumer-specific copy and retry affordances.",
      "identifier_semantics": "Record the legacy Convex function/ref and every ID type used by the component, then declare target UUIDv7/alias handling. Backend schema uses UUID-like string IDs and retains legacy_convex_id; exposed legacy IDs are allowed only with an explicit catalog alias/expiry. Route params (document/[id], conversationId, sessionId, requestId) must not be silently reinterpreted as UUIDs, and current `as any` casts are HIGH findings.",
      "blocker_high_findings": [
        "BLOCKER: app/_layout.tsx has both ZeroProvider and ConvexProvider, so the desired zero-convex/react rewrite cannot be proven from the current boot surface.",
        "BLOCKER: current inventory evidence is 46 importing files / 152 lexical hook lines, not the roadmap's normalized 47 files / 105 calls; the command must publish its counting rules and fixture output.",
        "HIGH: app/ and components/ include Convex-backed Storybook/test consumers, and `AgentPlanCardWithConvex`/`ResearchProgressWithConvex` preserve explicitly named legacy variants; classify whether these count toward the production gate or are separately gated.",
        "HIGH: several consumers use undefined as loading and do not expose a typed error path, making offline/server-rejection visuals impossible to preserve without contract metadata."
      ],
      "unresolved_live_vs_prd_target_surfaces": [
        "Live: app/zero/schema.ts currently publishes only conversations and chat_messages; PRD target: all discovered reads map to the published zero_pub subset.",
        "Live: app/zero/queries.ts exposes only chatMessages.byConversation and no Zero mutator; PRD target: registered Zero queries/mutators cover simple client CRUD.",
        "Live: legacy Convex hooks remain throughout RN; PRD target: zero `convex/react` hooks in app/components/hooks/screens and a provider boot without Convex URL.",
        "Live: no contract inventory artifact or verifier was found; PRD target: one mapping for each normalized call site linked to a T-SYNC criterion."
      ]
    },
    {
      "task_id": "S-CONTRACT-02",
      "proposed_by": "frontend-designer",
      "references": [
        ".spec/prds/mk6-migration/10-technical-requirements/04-api-design.md:1-49",
        ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:20-27",
        "app/zero/schema.ts:1-51",
        "app/zero/queries.ts:1-13",
        "services/platform/src/db/schema/zero-pub.ts:1-151",
        "services/platform/src/db/migrations/0002_zero_pub.sql:1-156",
        "services/platform/src/http/hono-app.ts:105-141,201-390",
        "services/platform/src/http/chat-runs.ts:18-87,129-260",
        "services/platform/src/http/missions.ts:330-440",
        "services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts:1-70"
      ],
      "current_state": "The live client contract is only a thin Sprint-20 chat slice: app/zero/schema.ts has conversations/chat_messages and app/zero/queries.ts has one byConversation query. The live Hono app implements chat runs/events, uploads, missions, and scoped auth routes, while the documented `/api/zero/query` and `/api/zero/mutate` endpoints are not present in the inspected route surface. Sprint20's real integration test proves POST /api/chat-runs persists a user message and replays the same request, but it does not prove a complete client mapping.",
      "consumer_data_contract_notes": "Each YAML entry should name the exact rendered consumer and target projection, not only a backend route. For Zero queries include table columns, relationship/key, stable sort/cursor, nullability, and stale-cache rendering. For Zero mutators include the local projection and rollback payload. For Hono commands include request/response schemas, durable row IDs, status transitions, and the final Zero row/event that updates the screen. Map chat history to chat_messages.byConversation; conversation drawer/search, documents/feed/research/subscriptions/improvements/notifications/settings/audio/voice/toolbelt to either a published relation or an explicit unresolved target rather than an invented query.",
      "offline_semantics": "Use the API constitution's split: Zero reactive reads can use local cache; registered simple CRUD mutators may queue/retry offline; chat run creation, mission start/verdict/steer, upload init/PUT/finalize, and other authoritative commands must be online-only unless their entry defines queue persistence and replay. The contract must say what the UI renders while queued and on reconnect, and link airplane-mode coverage to T-SYNC-019.",
      "optimistic_semantics": "The API design explicitly says simple client-visible CRUD uses a registered Zero mutator, but chat, mission start/verdict/steer, and upload initiation/finalization are authoritative Hono commands and never optimistic database mutators. Encode that distinction per entry: optimistic projected row with rollback for CRUD; pending command/stream state with no durable-success styling for authoritative commands; final reconciliation comes from Zero or the durable chat message.",
      "conflict_semantics": "Use requestId replay for chat (same runId and durable message ID), idempotencyKey plus conflict response for mission creation, and requestKey for mission steering/verdict. Zero mutator conflicts must return structured rejection/version information and then reconcile the authoritative row. `migration_read_only` is terminal and visibly rejects writes during soak; do not classify it as a retryable offline error.",
      "error_semantics": "Hono currently returns structured JSON for route failures: chat wraps failures as `chat_run_error`/422, mission handlers call missionHttpErrorFromUnknown, and auth middleware supplies 401/403. Contract entries must preserve error code/data and distinguish validation (422), not-found (404), unauthorized (401/403), blocked/failed terminal chat events, conflict, and migration_read_only. UI consumers need an explicit retry or recovery action and must not turn a rejected command into an optimistic success.",
      "identifier_semantics": "The target contract should use UUIDv7 IDs for new rows, preserve legacy_convex_id only as a declared boundary alias, and carry idempotency/request keys separately. Zero's current schema uses string IDs and optional foreign-key strings; chat backend uses UUID casts and a durable_message_id. Each mapping must declare whether a route param is a target UUID, legacy alias, request key, share token, or idempotency key, with no `as any` conversion.",
      "blocker_high_findings": [
        "BLOCKER: app/zero/queries.ts has no mutation registry and only one query, so most planned targets cannot resolve live.",
        "BLOCKER: the Hono route surface inspected has no `/api/zero/query` or `/api/zero/mutate` handler despite those being constitution targets; `--targets` cannot pass against an unimplemented manifest.",
        "HIGH: zero_pub publishes many backend relations but the RN schema mirrors only two; publication membership alone is not a client-readable contract.",
        "HIGH: current chat SSE emits numeric event IDs (`String(event.seq)`) while the API constitution specifies `runId:sequence` envelopes; the contract must resolve this live-vs-PRD mismatch before consumers implement duplicate suppression.",
        "HIGH: Sprint20 proves Postgres persistence/replay but not cache sync, final Zero reconciliation, or offline/optimistic/conflict behavior."
      ],
      "unresolved_live_vs_prd_target_surfaces": [
        "Live: two-table RN schema and one query; PRD: all zero_pub reactive app surfaces and shared client query/mutator schemas.",
        "Live: Hono chat/missions/uploads routes; PRD: Zero query/mutate endpoints, complete command manifest, and every call-site target resolution.",
        "Live: zero-cache launchd unit is documented as disabled/placeholder in services/platform/deploy/launchd/holocron-zerocache.plist:4-30; PRD: live zero-cache/zero_pub target required by `--targets`.",
        "Live: chat event route uses Last-Event-ID and numeric SSE IDs; PRD: resumable `{runId:sequence}` envelope plus final durable-message reconciliation.",
        "Live: zero_pub excludes mission engine, evidence, uploads/media, voice, and user preference relations; PRD: every legacy consumer still needs a target, which may require authoritative Hono commands or an explicit non-reactive design."
      ]
    },
    {
      "task_id": "S-CONTRACT-03",
      "proposed_by": "frontend-designer",
      "references": [
        ".spec/prds/mk6-migration/ROADMAP.md:1190-1229",
        ".spec/prds/mk6-migration/11-e2e-testing-criteria.md:262-294",
        ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:20-27",
        "services/platform/src/cli/holo.ts:150-233",
        "services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts:1-70",
        "app/_layout.tsx:138-166",
        "app/zero/schema.ts:1-51",
        "app/zero/queries.ts:1-13"
      ],
      "current_state": "No `verify:client-contract`, `inventory:convex-callsites`, or client-contract implementation was found in the platform CLI/help or services source inspected. Existing CLI gates cover other migration artifacts, and the Sprint20 integration test is a useful real-Hono/Postgres pattern, but there is no current gate that inventories RN consumers, resolves Zero/Hono targets, validates schema fields, or links T-SYNC criteria.",
      "consumer_data_contract_notes": "The gate output should be actionable for rendered consumers: stable call-site ID, source path/line, hook/action kind, consumer surface, target kind/name, projection columns, loading/empty/error state, ordering, and linked E2E criterion. A target that exists in backend code but cannot supply the card/list/detail fields or terminal visual states should fail schema validation, not merely pass name resolution. Include a machine-readable summary and human-readable diagnostics naming the affected screen/component.",
      "offline_semantics": "`--schema` must require offline policy on every entry and reject omitted values. Valid values should distinguish cached read, queueable Zero mutator, online-only Hono command, and explicitly unsupported. The gate should ensure each queueable entry has replay/dedup and visible queued/rejected UI semantics, while authoritative entries explicitly link the online/unavailable state; this is essential for T-SYNC-019 airplane and reconnect scenarios.",
      "optimistic_semantics": "Require an explicit optimistic policy (`none`, deterministic projection, or command-pending—not a fake row) plus rollback/reconciliation metadata. Reject an entry that calls an authoritative Hono command optimistic. Verify that Zero mutator entries identify the projected relation/fields and Hono chat/mission/upload entries identify the durable row/event that clears pending state.",
      "conflict_semantics": "`--schema` should require conflict policy and dedup key: row/version rejection for Zero mutations, requestId for chat, idempotencyKey/requestKey for mission commands and uploads, or `not_applicable` only for reads. `--e2e-links` must require a criterion that exercises the declared conflict/replay path, not merely a generic screen test. Treat migration_read_only as terminal rejection in the artifact schema.",
      "error_semantics": "The gate should validate structured error mappings (code/status/data), terminal versus retryable classification, and consumer recovery behavior. It should resolve the Hono route manifest and reject entries that only name a legacy Convex function. Diagnostics should separately report missing target, missing projection, missing offline/optimistic/conflict/error/identifier field, missing E2E link, and target present but not live.",
      "identifier_semantics": "Require a stable inventory key derived from normalized source path + source line + legacy function kind/ref, while retaining the legacy Convex ref for audit. Validate target identifier class (UUIDv7, legacy alias, requestId, idempotency key, share token) and reject wildcard/`any` mappings. The current `as any` route-ID usage in app/(drawer)/improvements/[requestId].tsx:35 is a concrete fixture the gate should flag HIGH.",
      "blocker_high_findings": [
        "BLOCKER: the required CLI commands and artifact are currently absent, so Sprint21's human gate cannot run or fail closed.",
        "BLOCKER: live Zero schema/query surface is incomplete; a verifier must not report 105/105 by checking only YAML names or backend publication constants.",
        "HIGH: current source count and lexical call count differ from PRD counts; inventory normalization and exclusions must be frozen in fixtures before CI assertions.",
        "HIGH: no existing test proves that a missing consumer projection or missing visual error/offline state fails the contract; a target-only check would accept unusable mappings.",
        "HIGH: app root still wraps Zero inside ConvexProvider, so CI needs a separate production-path grep/boot assertion and must not treat the presence of ZeroProvider as completion."
      ],
      "unresolved_live_vs_prd_target_surfaces": [
        "Live: CLI help has catalog/MCP/PRD consistency gates but no client-contract commands; PRD: inventory, verify, --targets, --schema, and --e2e-links commands.",
        "Live: Sprint20 real boundary test validates one chat persistence path; PRD: T-SYNC-019 covers all call sites plus airplane reads, queued writes, rejection rollback, duplicate replay, concurrent edit, and identifier semantics.",
        "Live: app/zero/schema.ts and queries.ts expose two tables/one query; PRD: verifier resolves every mapping against live zero_pub or Hono command manifest.",
        "Live: zero-cache is still disabled/placeholder in deployment docs; PRD: a live cache and published target are prerequisites for target verification.",
        "Live: no 13-client-data-contract.yaml exists under the migration technical requirements; PRD: machine-readable artifact is mandatory and must link every entry to a T-SYNC criterion."
      ]
    }
  ],
  "design_tasks": []
}
```