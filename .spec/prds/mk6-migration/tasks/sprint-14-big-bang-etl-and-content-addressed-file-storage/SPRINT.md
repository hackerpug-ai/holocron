---
sprint: 14
title: Big-Bang ETL and Content-Addressed File Storage
sequence: 14
timeline: Phase 3 — Migration Engine and Services
status: Planned
prd: ../../README.md
planned_from_roadmap_sha: 12237528ec9c1565ae28bfb71e3f74afb91fcdb07abca00419c78d631881f77c
planned_from_source_sha: 979baeb8d84505818784b30fb5c937e2e7293561
source_kind: git-head
planned_at: 2026-07-18T07:20:00Z
---

# Sprint 14: Big-Bang ETL and Content-Addressed File Storage

**Sequence:** 14  
**Timeline:** Phase 3 — Migration Engine and Services  
**Status:** Planned  
**Proposed by:** mastra-planner (specialist dispatch unavailable; fallback plan recorded)  
**Branch:** `mk6-etl`

## Scope

Implement the one-time Convex-export-to-Postgres migration substrate and content-addressed file lifecycle. The source catalog is authoritative: every source relation, field, storage reference, disposition, expected-target formula, checksum/sample, and approved exception must be represented. Load is staged from an immutable archive, builds the complete `_id`→UUIDv7 map before FK writes, loads in dependency order, canonicalizes statuses, regenerates vectors through the real fleet, and is safely re-runnable without duplicate rows/blobs.

## Human Testing Gate

**Gate:** Running `holo etl:run` against a real `convex export` loads the graph into real Postgres and `holo etl:reconcile` reports zero unexplained variance with a NULL-FK audit of 0 orphans.

## Test Steps

1. Run `holo etl:run --export ./export` against real Postgres — loads all tables in FK-dependency order with status normalized.
2. Run `holo etl:reconcile` — every catalog expected-target formula matches with zero unexplained variance.
3. Run `holo etl:fk-audit` — constraints are clean and NULL-FK audit returns 0 orphans.
4. Run `holo etl:vectors` — every regenerated passage vector is 1024-dimensional and non-null.
5. Migrate a narration MP3 and file object, run `holo blob:verify` — SHA-256/byte-length/MIME match and Range reads return exact bytes.
6. Re-run `holo etl:run` from immutable archive — no duplicate rows/blobs and `convex_id_map` is stable.
7. Run `holo upload:init/put/finalize` for image and voice artifacts — hash verified, idempotent attach, no orphan row/object.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| etl-1 | ETL pipeline: export → stage-jsonb → whole-graph ID map → FK-ordered load → status canonicalization | mastra-implementer | 360 min |
| etl-2 | Vector regeneration + catalog-derived reconciliation + NULL-FK audit gates | mastra-implementer | 210 min |
| etl-3 | Content-addressed BlobStore + retained-object migration + tailnet Range reads | mastra-implementer | 240 min |
| etl-4 | Authoritative Hono upload lifecycle: init/PUT/finalize, hash verification, idempotent attach | mastra-implementer | 180 min |
| etl-5 | RED tests: variance, NULL-FK, vector dimension, blob parity, idempotent rerun, upload no-orphan | red-test-generator | 240 min |
| etl-6 | Verify ETL export completeness and review migration integrity | convex-reviewer | 150 min |

## Source Coverage

- T-DATA-016, T-DATA-017, T-DATA-018, T-DATA-019, T-DATA-021, T-DATA-022
- CAP-MIG-01 and CAP-EMB-01
- `10-technical-requirements/03-data-schema.md` ETL/vector invariants
- `10-technical-requirements/09-capability-chains.md` CAP-MIG-01/CAP-EMB-01
- `10-technical-requirements/12-migration-contract-artifacts.md`
- `10-technical-requirements/12-convex-source-catalog.yaml`
- `10-technical-requirements/04-api-design.md` upload routes
- `11-e2e-testing-criteria.md` UC-DATA-05

## Dependencies and Boundaries

Depends on Sprints 02, 04, 07, and 10. Blocks Sprints 16, 26, and 29. Do not implement public article routes, client migration, cutover/write-freeze, or Sprint 15 mission workflows here. Real Convex export fixtures and real Postgres/fleet/blob substrate are mandatory for integration-tier acceptance; mocks may only exercise pure parsers with an explicit negative control.

<!-- PLANNING-FALLBACK: mastra-planner and convex-planner specialist dispatches failed because the configured provider had no usable API key. This artifact was synthesized from the authoritative ROADMAP and technical requirements; it must receive an out-of-band red-hat review before implementation. -->
