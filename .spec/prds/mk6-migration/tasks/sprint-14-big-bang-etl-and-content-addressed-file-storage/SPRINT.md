---
sprint: 14
title: Big-Bang ETL and Content-Addressed File Storage
sequence: 14
timeline: Phase 3 — Migration Engine and Services
status: In Progress
prd: ../../README.md
planned_from_roadmap_sha: 12237528ec9c1565ae28bfb71e3f74afb91fcdb07abca00419c78d631881f77c
planned_from_source_sha: 979baeb8d84505818784b30fb5c937e2e7293561
source_kind: git-head
planned_at: 2026-07-18T07:20:00Z
---

# Sprint 14: Big-Bang ETL and Content-Addressed File Storage

**Sequence:** 14  
**Timeline:** Phase 3 — Migration Engine and Services  
**Status:** In Progress  
**Proposed by:** mastra-planner (specialist dispatch unavailable; fallback plan recorded)  
**Branch:** `mk6-etl`

## Scope

Implement the one-time Convex-export-to-Postgres migration substrate and content-addressed file lifecycle. The source catalog is authoritative: every source relation, field, storage reference, disposition, expected-target formula, checksum/sample, and approved exception must be represented. Load is staged from a real immutable Convex export archive, builds the complete `_id`→UUIDv7 map before FK writes, loads in dependency order, canonicalizes statuses, retains indexed `legacy_convex_id` through soak, regenerates vectors through the real fleet, and is safely re-runnable without duplicate rows/blobs.

## Human Testing Gate

**Gate:** Running `holo etl:run` against a real `convex export` loads the graph into real Postgres and `holo etl:reconcile` reports zero unexplained variance with a NULL-FK audit of 0 orphans.

## Test Steps

1. Run `holo etl:run --export ./export` against real Postgres — loads the real immutable archive in FK-dependency order, builds the UUIDv7 map, retains `legacy_convex_id`, and normalizes status.
2. Run `holo etl:reconcile` — every catalog expected-target formula matches with zero unexplained variance.
3. Run `holo etl:fk-audit` — constraints are clean and NULL-FK audit returns 0 orphans.
4. Run `holo etl:vectors` — every regenerated passage vector is 1024-dimensional and non-null.
5. Run `holo blob:verify` against the complete retained-object manifest — every retained object or approved exception has SHA-256/byte-length/MIME parity; Range reads return exact bytes for representative media.
6. Re-run `holo etl:run` from immutable archive — no duplicate rows/blobs and `convex_id_map` is stable.
7. Run `holo upload:init/put/finalize` for image and voice artifacts — hash verified, idempotent attach, no orphan row/object.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| etl-1 | ETL pipeline: export → stage-jsonb → whole-graph `_id`→UUIDv7 map → FK-ordered load → status canonicalization | mastra-implementer | 360 min |
| etl-2 | Vector regeneration + catalog-derived reconciliation report + NULL-FK audit gates | mastra-implementer | 210 min |
| etl-3 | Content-addressed BlobStore + retained-object migration + tailnet Range reads | mastra-implementer | 240 min |
| etl-4 | Authoritative Hono upload lifecycle: init/PUT/finalize, hash verification, idempotent attach, no orphan | mastra-implementer | 180 min |
| etl-5 | RED tests: variance, NULL-FK, vector dimension, blob parity, idempotent rerun, upload no-orphan | red-test-generator | 240 min |
| etl-6 | Verify export completeness (convex) + target migration integrity (mastra) | convex-reviewer + mastra-reviewer | 150 min |

## Task Detail Files

- `etl-1-etl-pipeline-export-stage-id-map-fk-load-status.md`
- `etl-2-vectors-reconciliation-null-fk-audit.md`
- `etl-3-content-addressed-blobstore-retained-objects-range.md`
- `etl-4-authoritative-upload-lifecycle.md`
- `etl-5-red-tests-etl-integrity-and-upload-gates.md`
- `etl-6-verify-export-completeness-and-migration-integrity.md`

**Dependency order:** etl-5 RED ∥ etl-1; etl-1 → etl-2/etl-3; etl-3 → etl-4; etl-1..etl-4 → etl-5 GREEN; etl-1..etl-5 → etl-6 dual review.

## Source Coverage

- T-DATA-016, T-DATA-017, T-DATA-018, T-DATA-019, T-DATA-021 (backend prerequisite; RN e2e closure remains Sprint 26)
- CAP-MIG-01 and CAP-EMB-01
- `10-technical-requirements/03-data-schema.md` ETL/vector invariants
- `10-technical-requirements/09-capability-chains.md` CAP-MIG-01/CAP-EMB-01
- `10-technical-requirements/12-migration-contract-artifacts.md`
- `10-technical-requirements/12-convex-source-catalog.yaml`
- `10-technical-requirements/04-api-design.md` upload routes
- `11-e2e-testing-criteria.md` UC-DATA-05

## Dependencies and Boundaries

Depends on Sprints 02, 04, 05, 07, and 10. Sprint 14 proves the authoritative Hono upload API prerequisite; Sprint 26 owns the RN end-to-end T-DATA-021 flow. Blocks Sprints 16, 26, and 29. Do not implement public article routes, client migration, cutover/write-freeze, or Sprint 15 mission workflows here. A real immutable Convex export archive and real Postgres/fleet/blob substrate are mandatory for integration-tier acceptance; mocks may only exercise pure parsers with an explicit negative control.

<!-- PLANNING-FALLBACK: configured specialist dispatches initially failed because the provider had no usable API key. A read-only OpenAI planning proposal is retained at .tmp/sprint-14-plan/openai-proposal.md and the out-of-band red-hat review at .tmp/sprint-14-plan/sprint14-redhat-review.md. Blocking findings were folded into this plan before implementation. -->
