---
sprint: 4
title: Provision Postgres and Domain Schema
sequence: 4
timeline: Phase 1 — Platform Foundation
status: Completed
prd: ../../README.md
capability_coverage: [CAP-SYNC-01]
---

# Sprint 4: Provision Postgres and Domain Schema

**Sequence:** 4
**Timeline:** Phase 1 — Platform Foundation
**Status:** Completed
**Proposed by:** mastra-planner
**Branch:** `mk6-postgres-schema`

---

## Overview

This is the first Phase-1 sprint: it stands up the **sole datastore** — a single Postgres 18 instance with `pgvector` and native full-text search, on the tailnet mini, reachable over Tailscale — and authors the complete Drizzle domain schema that every later DATA/SVC/INFER/SYNC sprint writes into. Per Architecture Posture AP-1, Postgres is the single source of truth and the single durable ledger: there is no SQLite, no second store. This sprint produces all ~55 domain tables (collapsing the four near-identical business pipelines 12→3 and the two overlapping research systems 5→3), the `uuidv7` primary keys, `timestamptz` throughout, polymorphic columns as typed `jsonb`, and the normalized status vocabulary (`text` + `CHECK` + shared Zod enums).

It also lays the two substrate layers the rest of the migration depends on: the **index substrate** (`vector(1024)` HNSW for passage embeddings, generated `search_vector tsvector` + GIN for FTS, plus btree/GIN covering indexes) and the **logical-replication substrate** for Zero — `wal_level=logical`, a `zero_pub` publication over the reactive UI subset only (vectors, `passages`/evidence, citations, telemetry, rate-limit, and server-only jsonb excluded), and single-column uuid PK `REPLICA IDENTITY DEFAULT` on every published table (Zero's requirement). Keeping vectors in `passages` (not on `documents`) is what makes the Zero split clean.

A gate is only real if it fails when the behavior is absent. The RED suite proves the schema is grounded: `holo db:migrate` reports 0 errors only against real Postgres 18; a raw out-of-vocabulary status (`in-progress`) is rejected by the CHECK constraint while the normalized value (`in_progress`) is accepted; a polymorphic `jsonb` payload round-trips with structural equality; the business/research merges collapse to one trio each with no per-domain shells; and `holo repl:status` confirms the publication excludes the vector surface and every published table carries replica identity. The RED evidence is captured against the absent/broken start before the full schema goes green.

The field-level schema is produced by `mastra-planner` → Drizzle against `03-data-schema.md`, which fixes the shape and the invariants (table groups, merges, evidence-graph substrate, vectors/search, Zero publication split, ETL `_id`→uuidv7 remap). The approved per-table/field disposition lives in the committed source catalog `12-convex-source-catalog.yaml` (Sprint 02); this sprint's schema must satisfy it.

---

## Human Test Deliverable

An operator can prove — against a fresh, real Postgres 18 instance on the mini — that `holo db:migrate` applies every Drizzle migration with zero errors producing all ~55 domain tables (with their btree/GIN/HNSW indexes and normalized status CHECK constraints), that `holo db:verify --merges` reports the collapsed analysis/research trios with no per-domain shells, that a polymorphic `jsonb` payload round-trips, that the status CHECK rejects out-of-vocabulary values, and that logical replication is ready for Zero (`wal_level=logical`, `zero_pub` covers the reactive subset only, single-column uuid PK replica identity confirmed).

**Test Steps:**
1. Run `holo db:migrate` against a fresh Postgres 18 — applies all migrations, reports 0 errors and ≥55 tables created.
2. Run `holo db:verify --indexes` — every declared btree/GIN/HNSW index exists on its table.
3. Run `holo db:verify --merges` — reports one `analysis_*` trio and one `research_*` trio, no per-domain shells.
4. Run `holo db:probe --jsonb cardData` — writes and reads a polymorphic payload back with structural equality.
5. Insert status `in-progress` via `holo db:probe --status` — rejected by CHECK; insert `in_progress` — accepted.
6. Run `holo repl:status` — `wal_level=logical`, `zero_pub` covers the reactive subset only, uuid PK replica identity confirmed.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| schema-1 | Provision Postgres 18 + pgvector + FTS + wal_level=logical, reachable over Tailscale | mastra-implementer | 180 min |
| schema-2 | Drizzle domain schema — all domains → ~55 tables with merges, typed jsonb, status CHECK, uuidv7 PKs | mastra-implementer | 360 min |
| schema-3 | HNSW + GIN + btree indexes incl. generated search_vector tsvector | mastra-implementer | 150 min |
| schema-4 | Logical replication + zero_pub publication (reactive subset, vectors excluded) + replica identity | mastra-implementer | 150 min |
| schema-5 | RED tests: 0-error migrate, status CHECK, jsonb round-trip, merges collapsed, replication readiness | red-test-generator | 150 min |
| schema-6 | Review schema vs source catalog + Zero split | mastra-reviewer | 90 min |

---

## Human Testing Gate

**Gate:** Running `holo db:migrate` against a fresh real Postgres 18 applies every Drizzle migration with zero errors, producing all ~55 domain tables with their btree/GIN/HNSW indexes and normalized status CHECK constraints.

---

## Source Coverage

- UC-PLAT-01 (Provision Postgres on the mini) — AC-2 (all Drizzle migrations apply clean) + AC-3 (logical replication ready for Zero: `wal_level=logical`, `zero_pub` reactive-subset-only, uuid PK replica identity)
- UC-DATA-01 (Postgres domain schema) — all five ACs (materialize full schema with merges; typed `jsonb` round-trip; normalized status CHECK; collapsed analysis/research trios; every legacy surface has an approved catalog disposition)
- `10-technical-requirements/03-data-schema.md` — the schema shape + invariants (table groups, merges 12→3 + 5→3, evidence-graph substrate, `vector(1024)` HNSW, generated `search_vector tsvector` + GIN, RRF, Zero publication split, ETL `_id`→uuidv7)
- `10-technical-requirements/01-architecture-posture.md` AP-1 (Postgres only, no SQLite) + AP-7 (tailnet trust boundary; no RLS)
- `10-technical-requirements/09-capability-chains.md` CAP-SYNC-01 (Zero reactive sync boundary contracts)
- `10-technical-requirements/12-convex-source-catalog.yaml` — the approved per-table/field/object disposition the schema must satisfy
- T-PLAT-002 (all Drizzle migrations apply clean) · T-PLAT-003 (logical replication ready for Zero)
- T-DATA-001 (full schema materializes) · T-DATA-002 (jsonb round-trips typed) · T-DATA-003 (status CHECK rejects out-of-vocab) · T-DATA-004 (merges collapsed)

## Capability Coverage

- CAP-SYNC-01: the `zero_pub` publication + single-column uuid replica identity the RN client reactively syncs (vectors / passages / evidence excluded) — the replication substrate this sprint stands up

---

## Blocks

- Sprint 05 (Mastra Service and Scoped-Key Auth — boots against this schema's Postgres)
- Sprint 07 (Evidence-Graph Substrate and Ledger Immutability — loads into the evidence tables this sprint creates)
- Sprint 10 (Local Re-embedding and Hybrid RRF Search — writes the `passages` HNSW index + FTS search_vector this sprint defines)
- Sprint 11 (Scheduler and Durable Queue — durable queue tables on this Postgres)
- Sprint 12 (Observability, Telemetry and Eval Gate — telemetry tables on this Postgres)
- Sprint 14 (Big-Bang ETL — loads the whole graph into this schema in FK-dependency order)
- Sprint 15 (Mission Engine — run-state tables on this Postgres)
- Sprint 16 (Public /article/ Endpoint — `documents` share-token column on this schema)
- Sprint 18 (Chat Redesign — chat run tables on this schema)
- Sprint 19 (MCP Gateway Rehost — reads/writes the 44 tools' tables on this Postgres)
- Sprint 21 (Client Data Contract — every target resolves in this live `zero_pub` schema)
- Sprint 27 (Standing Backup Pipeline — backs up this Postgres)

**Dependent on:** Sprint 01 (the `holo` operator CLI + the compatibility-locked Mastra/Bun runtime posture from compat-1) · Sprint 02 (the committed source catalog `12-convex-source-catalog.yaml` whose dispositions this schema must satisfy)

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-14 (proposed by: mastra-planner [schema-1, schema-2, schema-3, schema-4, schema-5, schema-6])
Avg quality score: 100/115 (115-point rubric, min 80). Fakeability audit: 0 fakeable scenarios (`validate_scenario` clean on every behavioral AC).
Topological order: schema-1 → schema-2 → schema-3 ‖ schema-4 → schema-5 → schema-6 (provision PG → Drizzle schema → indexes ‖ replication → RED suite → review)

- schema-1-provision-postgres-pgvector-fts-wal.md
- schema-2-drizzle-domain-schema-55-tables.md
- schema-3-hnsw-gin-btree-indexes-search-vector.md
- schema-4-logical-replication-zero-pub-publication.md
- schema-5-red-tests-negative-controls.md
- schema-6-review-schema-vs-source-catalog-zero-split.md

