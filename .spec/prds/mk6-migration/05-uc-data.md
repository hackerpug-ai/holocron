---
stability: FEATURE_SPEC
last_validated: 2026-07-13
prd_version: 2.0.0
functional_group: DATA
---

# Use Cases: Data Layer & ETL Migration (DATA)

| ID | Title | Description |
|----|-------|-------------|
| UC-DATA-01 | Postgres domain schema | The Drizzle schema for all current domains, collapsing known duplication (business 12→3, research 5→3) and dropping Convex-only crutches. |
| UC-DATA-02 | Evidence-graph substrate | The bi-temporal sources→passages→claims→entities→relations→beliefs tables, created now as fulcrum's ledger. |
| UC-DATA-03 | Local re-embedding & chunking | Passage-level chunking + contextual embeddings via the local Qwen3 embedder through one shared `embed()` helper — killing the 8K truncation. |
| UC-DATA-04 | Hybrid search on Postgres | pgvector HNSW + FTS fused with RRF, replacing Convex `hybridSearch`. |
| UC-DATA-05 | Big-bang ETL & file storage | The one-time `convex export`→Postgres load with validation gates, plus MP3/share-token blob migration off Convex file storage. |

---

## UC-DATA-01: Postgres domain schema

A Drizzle/Postgres schema replaces all 60 Convex tables, consolidating the four near-identical business pipelines (12 tables → `analysis_sessions`/`analysis_items`/`analysis_evidence`), the two overlapping research systems (5 → 3 with a `system` discriminator), and dropping Convex-only crutches (`documentCounters`). Polymorphic columns become typed `jsonb`; timestamps become `timestamptz`; status vocab is normalized behind CHECK constraints + shared Zod enums. The machine-readable source catalog is the approved mapping for every legacy table, field, and storage reference.

**Acceptance Criteria**
- ☐ System can materialize the full schema (all domain groups + merges) against real Postgres via Drizzle migrations with zero errors.
- ☐ System can store every polymorphic payload (cardData, configJson, metadataJson, plan, result) as typed `jsonb` and read it back with structural equality through the Drizzle/Zod types.
- ☐ System can enforce normalized status vocab (`in-progress`→`in_progress`, unified research/job states) via CHECK constraints, rejecting any out-of-vocabulary value.
- ☐ A reviewer can confirm the four business pipelines resolve to one `analysis_*` table trio and the two research systems to one `research_*` trio (no duplicated per-domain shells remain).
- ☐ System can prove every legacy table, field, and storage reference has one approved `preserve`, `merge`, `drop`, `regenerate`, or `archive` disposition in the source catalog, with no unmapped loss.

---

## UC-DATA-02: Evidence-graph substrate

The `sources → passages → claims → entities → relations → beliefs` substrate exists now — shape-complete, constraint-valid, and empty of fulcrum data — with bi-temporal validity (valid-time + transaction-time), supports/contradicts edges, and append-only supersession. `sources` and `passages` are the one canonical physical corpus shared by documents and the evidence graph; `documents` is a Zero-published metadata relation, not a second chunk store.

**Acceptance Criteria**
- ☐ System can insert a claim plus two contradicting evidence passages and query the current belief as-of a given transaction time against real Postgres.
- ☐ System can revise a belief only through the authorized temporal-revision transaction, which atomically closes the prior row's `tx_to`, inserts a successor, rejects stale concurrent revisions, and preserves the full audit chain.
- ☐ System can register an internal holocron document as a canonical `source` (self-sourced) whose retrieval chunks are the same canonical `passages` rows used for search and as claim evidence.
- ☐ A reviewer can confirm `supports`/`contradicts` are edges on the bi-temporal `relations` table and that a claim's net support is computable from validity-windowed edges.

---

## UC-DATA-03: Local re-embedding & chunking

Every document is chunked into ~512-token passages (with contextual situating headers) and embedded to 1024-dim Qwen3 vectors on the fleet, through one shared `embed()` helper that replaces ~14 duplicated call sites and handles Qwen3's query/document prefix asymmetry. This kills the current 8,000-char whole-document truncation.

**Acceptance Criteria**
- ☐ System can chunk every document into passages and produce a non-null 1024-dim Qwen3 embedding per passage from the real fleet endpoint (`:4545`), with zero passages carrying a null or wrong-dimension vector.
- ☐ A reviewer can retrieve content located beyond character 8,000 of a document via hybrid search (impossible under the old truncation), verified by a golden set whose relevant span sits past 8K ranking in top-k.
- ☐ System can produce embeddings for both query mode (instruction-prefixed) and document mode (raw) through the single `embed()` helper, verified against the live endpoint.
- ☐ System can re-run the re-embed job idempotently (`WHERE embedding IS NULL`, `SKIP LOCKED`) and resume after interruption without duplicating passages.

---

## UC-DATA-04: Hybrid search on Postgres

Hybrid search runs as one Postgres round-trip: pgvector HNSW KNN + `websearch_to_tsquery` FTS fused with Reciprocal Rank Fusion (scale-invariant, replacing the fragile 0.7/0.3 normalize-by-max weighting), aggregated up to the document for display. The 6 Convex vector indexes become one `passages` HNSW index plus 5 inline HNSW columns.

**Acceptance Criteria**
- ☐ System can execute a hybrid search (pgvector KNN + FTS fused with RRF) and return ranked results in a single request against real Postgres + pgvector, replacing Convex `hybridSearch`.
- ☐ A reviewer can confirm retrieval recall on a golden query set is greater than or equal to the old Convex hybrid search.
- ☐ System can serve semantic search over the 5 short-text surfaces (research findings, subscription content, toolbelt tools, improvements) via inline HNSW columns with no Cohere/cloud dependency.

---

## UC-DATA-05: Big-bang ETL & file storage

A one-time ETL (`convex export` → stage → whole-graph `_id`→uuidv7 remap → FK-ordered load → vector regeneration → validation gates) migrates all data with referential integrity. Every retained Convex-storage object—not only narration MP3s—moves to content-addressed blob storage on the mini with a legacy-ID, owner/link, SHA-256, byte-length, MIME-type, and retention/disposition manifest. New image and voice uploads use authoritative Hono upload-init/finalize commands, not Zero mutators.

**Acceptance Criteria**
- ☐ System can load a full `convex export` into Postgres with source-catalog-derived reconciliation (source count, expected target formula, approved merge/drop/regenerate exceptions, samples/checksums), verified against a real export with zero unexplained variance.
- ☐ System can remap every Convex `_id` to a uuidv7 and resolve 100% of foreign keys with zero orphans, verified by applying all FK constraints plus a NULL-FK audit returning zero.
- ☐ System can resolve every retained legacy object or an approved exception, verify its SHA-256/byte length/MIME type on readback, and serve migrated media with correct Range behavior from the real blob store.
- ☐ System can re-run the entire ETL idempotently from the immutable export archive without duplicating rows or blobs.
- ☐ User can upload and finalize an improvement image and a voice artifact through the Hono upload lifecycle, with hash verification, idempotent attach, and no orphan object/row pair.
