---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Data Schema

Postgres (Drizzle ORM), `pgvector` + native FTS. `uuidv7` primary keys everywhere (time-ordered, replication-friendly), `timestamptz` throughout, polymorphic columns as typed `jsonb`, status vocab as `text` + CHECK + shared Zod enums. No SQLite anywhere (see Architecture Posture AP-1).

## Table groups (~55 tables across ~16 Drizzle schema files)

| Group | Key tables | Notes |
|-------|-----------|-------|
| `chat` | conversations, chat_messages, tool_calls, agent_plans, agent_plan_steps, agent_telemetry | 1:1 with Convex |
| `documents` | **documents**, **sources**★, **passages**★, imports, citations | passages carry the vectors; documents stays vector-free (Zero-syncable) |
| `research` | research_sessions, research_iterations, research_findings | **MERGE 5→3** (smart + deep unified via a `system` discriminator) |
| `analysis` | **analysis_sessions**, **analysis_items**, **analysis_evidence** | **MERGE 12→3** — the four business pipelines collapse into one trio (`kind` enum + `payload jsonb`) |
| `subscriptions` | subscription_sources/content/filters/links, creator_profiles, feed_items, feed_sessions | 1:1 |
| `media` | audio_segments, audio_jobs, video_transcripts, transcript_jobs, audio_transcripts, audio_transcript_jobs, **file_objects**★ | file_objects replaces Convex `_storage` |
| `evidence` (fulcrum) | **sources, passages, claims, entities, relations, beliefs** | bi-temporal; empty at cutover; the ledger |
| others | whats_new_*, toolbelt_tools, shop_*, assimilation_*, plans/tasks, improvements_*, voice_*, notifications, **app_settings**★, rate_limit_state | app_settings merges userPreferences+feedSettings |

★ = new. **Dropped:** `documentCounters` (Postgres `count(*)`), the per-request `rateLimits` event log (→ in-process token bucket).

## Evidence-graph substrate (the fulcrum ledger, in Postgres)

`sources → passages → claims → entities → relations → beliefs`, layered over `documents`:

- **`relations`** is the polymorphic edge table; `supports`/`contradicts`/`refines`/`derived_from`/`about` are `relation_type` values. **Bi-temporal**: `valid_from/valid_to` (world-truth window) + `tx_from/tx_to` (system-knowledge window). "Current" = `tx_to IS NULL` (partial index).
- **`beliefs`** are append-only with supersession: revising inserts a new row and stamps the prior row's `tx_to` (never UPDATE-in-place) → full audit + "what did we believe as-of X".
- **Immutability enforced at the DB** (triggers / `REVOKE UPDATE, DELETE`); `sources.content_hash` unique (exact dedup); idempotency keys on cycle commits.
- Internal docs become `sources (self_sourced)`; their retrieval chunks *are* the `passages` used for hybrid search — the evidence graph reads through the same indexes.

## Vectors & search

- **Embeddings: Qwen3-Embedding, `vector(1024)`, cosine.** 0.6B native-1024; MRL upgrade path to 4B-truncated-to-1024 keeps the column stable. `halfvec` is the escape hatch if native higher dims are ever wanted.
- **HNSW, not IVFFlat** — at ~15–40K passage vectors, HNSW wins (no `lists` training, no REINDEX on growth, incremental inserts). `USING hnsw (embedding vector_cosine_ops)`.
- **FTS:** generated `search_vector tsvector` + GIN; query via `websearch_to_tsquery`.
- **Hybrid = RRF** (rank-based, scale-invariant), one Postgres round-trip, replacing the fragile 0.7/0.3 normalize-by-max weighting; aggregate passage hits up to `document_id`.
- **6 Convex vector indexes → 1 `passages` HNSW + 5 inline HNSW columns** (research_findings, research_iterations, subscription_content, toolbelt_tools, improvement_requests).
- **Chunking (kills the 8K truncation):** structure-aware split → ~512-token packs, ~64 overlap; contextual situating header per chunk (local 35B-A3B); one `passages` row per chunk. Header generation is the one deferrable sub-step.

## Zero publication split (why passages are separate)

Zero's `zero_pub` publication includes only the **reactive UI subset** (conversations, chat_messages, tool_calls, agent_plans, tasks, documents *metadata only*, research/mission progress, notifications, feed_items, subscriptions display, improvements, audio jobs/segments, whats_new, analysis/shop/assimilation sessions, app_settings). It **excludes** every `vector`/`tsvector` column, the whole `passages`/evidence surface, citations, telemetry, rate-limit, and server-only jsonb — Zero cannot sync pgvector types and 1024-float arrays would explode the client. Keeping vectors in `passages` (not on `documents`) makes this split clean. Every published table has a single-column uuid PK (Zero requirement) with `REPLICA IDENTITY DEFAULT`.

## ETL (`_id` → uuidv7)

Whole-graph `convex_id_map(old_id, new_id, table)` built for *all* rows before any load, so FKs resolve regardless of order; `new_id = uuidv7` seeded by `_creationTime` to preserve ordering; nullable indexed `legacy_convex_id` kept through soak. FK-dependency-ordered load; status vocab canonicalized (`in-progress`→`in_progress`); vectors **regenerated, never copied** (model + dims change). See the migration/ETL detail in the DATA use cases and risks.

*Full field-level schema is produced at implementation time by `mastra-planner` → Drizzle; this section fixes the shape and the invariants.*
