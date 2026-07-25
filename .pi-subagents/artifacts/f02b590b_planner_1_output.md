```json
{
  "design_enrichments": [
    {
      "task_id": "S-CONTRACT-01",
      "proposed_by": "frontend-designer",
      "severity": "blocker",
      "file_references": [
        "app/_layout.tsx:7-38",
        "app/zero/schema.ts:8-40",
        "hooks/use-chat-history.ts:37-71",
        "app/document/[id].tsx:73-105",
        "components/notifications/NotificationListSheet.tsx:130-132",
        "app/(drawer)/toolbelt.tsx:1-17"
      ],
      "client_data_contract_notes": [
        "The repository audit finds 46 files and 106 hook-like calls, while ROADMAP.md:1204-1208 requires 47 files and 105 calls. Define whether provider-only Storybook files and tests count, and assign stable call-site IDs using relative path, export/component, hook kind, and source location.",
        "Inventory useQuery, useMutation, useAction, and useConvex separately; record query arguments, skip semantics, ordering, pagination, result transformation, and every legacy Id boundary.",
        "Cluster call sites by consumer surface: chat/conversations, documents/audio, subscriptions/feed, whats-new, research, assimilation, improvements, toolbelt, notifications/settings, agent plans, and voice."
      ],
      "offline_optimistic_conflict_error_identifier_concerns": [
        "Reads must declare local Zero-cache behavior when offline, including stale snapshot versus empty/loading state.",
        "CRUD writes must declare queueability, optimistic projection, rejection rollback, replay deduplication, and concurrent-edit policy; authoritative chat, mission, upload, search, and generation calls must not be treated as optimistic Zero writes.",
        "Legacy Convex IDs are not interchangeable with target UUIDv7 IDs. Preserve explicit legacy_convex_id lookup only where declared; route parameters such as app/document/[id].tsx must state whether they accept canonical UUIDv7, legacy alias, or both."
      ],
      "review_findings": [
        "blocker: app/zero/schema.ts:39-40 defines only conversations and chat_messages, so most of the audited call sites have no client schema target.",
        "high: the inventory count does not match the Sprint 21 acceptance count and must be resolved before generating the contract."
      ],
      "residual_risks": [
        "A provider import or test-only hook can be silently omitted or double-counted unless inventory scope is explicit.",
        "Call-site transformations currently use untyped any and Convex-specific Id casts, increasing identifier and nullability drift during migration."
      ]
    },
    {
      "task_id": "S-CONTRACT-02",
      "proposed_by": "frontend-designer",
      "severity": "blocker",
      "file_references": [
        ".spec/prds/mk6-migration/10-technical-requirements/04-api-design.md:22-44",
        ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:17-21",
        "app/zero/schema.ts:3-40",
        "app/zero/queries.ts:6-13",
        "services/platform/src/db/schema/zero-pub.ts:14-149",
        "services/platform/src/db/migrations/0002_zero_pub.sql:42-145",
        "services/platform/src/http/hono-app.ts:201-390",
        "services/platform/src/http/chat-runs.ts:9-15,62-78,247-289",
        "app/(drawer)/chat/reference.tsx:12-80"
      ],
      "client_data_contract_notes": [
        "Each entry must contain source call site, consumer route, target kind, exact Zero relation/query or Hono method/path, published projection, response shape, structured errors, ordering/cursor semantics, offline policy, optimistic projection, conflict rule, rejection rollback, retry/dedup rule, identifier compatibility, and T-SYNC link.",
        "The live publication contains chat, documents, research, feeds, subscriptions, improvements, audio, whats-new, analysis/shop/assimilation, plans, notifications, and settings tables, plus column-list projections for research, subscription_content, and improvement_requests. app/zero/schema.ts must not be treated as authoritative coverage until those projections exist.",
        "Do not invent targets for excluded relations. toolbelt_tools, imports, voice/session tables, file/upload intents, evidence, citations, and mission engine tables are excluded from zero_pub and require an existing authoritative Hono command or an explicit unmapped blocker.",
        "The API design declares /api/zero/query and /api/zero/mutate, but services/platform/src/http/hono-app.ts:201-390 currently exposes no /api/zero/* routes. Target verification must fail closed rather than accepting names from the PRD alone.",
        "Simple field CRUD can use a registered Zero mutator only after its schema, request key, transaction, and deduplication contract exists. Chat, mission start/verdict/steer, uploads, and generation actions remain authoritative Hono commands."
      ],
      "offline_optimistic_conflict_error_identifier_concerns": [
        "For Zero CRUD, specify UUIDv7 creation, mutation/idempotency key, offline queue behavior, optimistic row projection, server validation error, rollback, and final reactive reconciliation.",
        "For Hono commands, specify offline disabled or durable client queue, no optimistic durable-row claim unless explicitly temporary, retry only for transport/5xx, and replay behavior keyed by requestId/idempotencyKey.",
        "Conversation and document updates need an explicit version or updated_at conflict rule; the current schema has timestamps but no generic expected-version field.",
        "The chat contract must use durableMessageId as the authoritative reconciliation key. chat-runs already deduplicates by owner_scope plus requestId, while user/assistant chat_messages receive separate random UUIDs.",
        "The PRD specifies SSE IDs as runId:sequence, but services/platform/src/http/hono-app.ts:244-248 emits only numeric sequence IDs. The contract must either require the server correction or define the actual cursor format and duplicate suppression behavior.",
        "app/zero/queries.ts:8-12 orders only by created_at. Equal timestamps need a stable id tie-breaker and a declared cursor strategy to prevent reorder/duplicate rendering.",
        "The documents publication is declared full-table in 0002_zero_pub.sql:53-54 even though documents contains search_vector; verify the actual projection before allowing documents to target Zero, because the migration rules exclude tsvector and describe documents as metadata-only."
      ],
      "review_findings": [
        "blocker: app/zero/schema.ts:39-40 covers only two of the publication's many relations.",
        "blocker: services/platform/src/http/hono-app.ts:201-390 has no live Zero query or mutator endpoints despite the declared API target surface.",
        "high: app/(drawer)/toolbelt.tsx and components/articles/ArticleImportModal.tsx target toolbelt/import data that is excluded or absent from zero_pub/Hono routes.",
        "high: app/document/[id].tsx uses Convex document IDs and mutations while the target identifier and share-link compatibility contract is not defined."
      ],
      "residual_risks": [
        "Large JSON projections such as documents content, card_data, and feed payloads can cause oversized offline snapshots unless field-level projections are explicitly constrained.",
        "Without server-side expected-version checks, concurrent rename/status/read mutations can silently overwrite each other.",
        "A contract generated against PRD-only targets will pass static mapping while failing against the running Hono/Zero stack."
      ]
    },
    {
      "task_id": "S-CONTRACT-03",
      "proposed_by": "frontend-designer",
      "severity": "high",
      "file_references": [
        ".spec/prds/mk6-migration/ROADMAP.md:1202-1212",
        ".spec/prds/mk6-migration/11-e2e-testing-criteria.md:194-198",
        ".spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:19-21",
        "services/platform/src/cli/holo.ts:150-240",
        "services/platform/src/http/hono-app.ts:159-390",
        "services/platform/src/db/schema/zero-pub.ts:151-190"
      ],
      "client_data_contract_notes": [
        "The gate must compare the source inventory to the contract one-to-one, reject missing and duplicate call-site IDs, resolve every Zero target against the live schema/publication, and resolve every Hono target against the live route/command registry.",
        "Schema validation must reject entries missing target, projection, response/error, ordering/cursor, offline, optimistic, conflict, rejection, identifier, retry/dedup, or E2E fields.",
        "Negative controls must cover deleted mapping, stale target name, relation absent from zero_pub, excluded table incorrectly targeted as Zero, malformed projection, missing identifier policy, missing T-SYNC link, and stale inventory.",
        "The gate must treat migration_read_only as a terminal visible rejection and distinguish validation 4xx, conflict 409, not-found 404, transport retry, and server 5xx behavior.",
        "Run the gate against a deterministic seeded Postgres/Zero namespace and verify airplane-mode cached reads, reconnect replay, rejected optimistic rollback, duplicate command replay, and concurrent edit resolution."
      ],
      "offline_optimistic_conflict_error_identifier_concerns": [
        "Offline reads should assert the last locally synced snapshot remains queryable without network; no command should claim success merely because it entered a local queue.",
        "Queued mutations need durable request keys and exactly-once observable effects; retries must not create duplicate conversations, messages, uploads, feedback, or notification updates.",
        "Concurrent-edit tests must exercise the declared expected-version/updated_at policy and verify either deterministic last-write-wins or structured conflict rejection.",
        "Identifier tests must prove canonical UUIDv7 handling and any legacy_convex_id alias lifecycle, including rejection after alias expiry."
      ],
      "review_findings": [
        "blocker: no existing client-contract, inventory, or verify:client-contract implementation was found under services/platform/src.",
        "high: services/platform/src/cli/holo.ts contains no visible client-contract command registration in the inspected command surface.",
        "high: target verification cannot be green until the running Zero schema and Hono route registry expose the declared surfaces."
      ],
      "residual_risks": [
        "A grep-only gate can report completeness while missing dynamically referenced hooks or generated API bindings.",
        "A self-referential target manifest can make stale or nonexistent Hono commands appear valid unless targets are discovered from live route/schema registration."
      ]
    }
  ],
  "design_tasks": []
}
```