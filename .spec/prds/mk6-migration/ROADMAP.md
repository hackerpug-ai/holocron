---
roadmap: 1
project: MK-VI Platform Migration (Convex → Mastra + Postgres)
generated: 2026-07-14T01:46:20Z
prd: .spec/prds/mk6-migration/README.md
sprint_count: 31
pr_sequencing: true
---

# Sprint Roadmap: MK-VI Platform Migration (Convex → Mastra + Postgres)

## Overview

**Sprints:** 31
**Total Tasks:** 166
**Current Sprint:** 15 — Mission Engine — Durable Resumable Templates (sprints 1–14 closed)

A complete, decisive migration of holocron off Convex — cloud database and all services — onto a Mastra (Bun) + Postgres platform on the tailnet mini, with the RN app resyncing via Zero and all reasoning on the local inference fleet. Sequencing follows the PRD mandate: a **leading INFRA phase** (runtime compatibility lock + real-service e2e harness + machine-readable migration-contract artifacts) gates all feature work, then **PLAT → DATA → SVC/INFER → SYNC**, with the **big-bang cutover, rollback, and Convex decommission last**. Standing remote backup & disaster recovery (CAP-BAK-01) runs in parallel and outlasts the cutover.

> **PR sequencing enabled.** Lifecycle: 🔵 Planned → 🟠 In flight → 🟣 In review → ✅ Completed → 🔴 Blocked. A PR cell is required once work is published through a PR; locally verified closure may use committed source-head and gate evidence until publication. See [`~/Projects/brain/docs/PR-SEQUENCING.md`](~/Projects/brain/docs/PR-SEQUENCING.md) for the full convention.

This roadmap is a **consolidation** of proposals from the project's dispatched planning-specialist SET — `mastra-planner`, `mcp-planner`, `react-native-ui-planner`, and `devops-engineer`. Every sprint's `**Proposed by:**` line records its authoring specialist(s); the orchestrator merged, deduped, sequenced, and validated but did not author sprint content.

## Sprint Sequence

| # | Milestone | Sprint | Gate | Tasks | Dependencies | Status | Branch | PR |
|---|-----------|--------|------|-------|--------------|--------|--------|----|
| 1 | — | [Sprint 01: Mastra Compatibility Lock and Fleet Role Manifest](#sprint-01-mastra-compatibility-lock-and-fleet-role-manifest) | `holo compat:spike` green 5-cell matrix on real Postgres; fleet manifest resolves | 5 | — | ⚪ Closed (user-directed; gate unverified) | `mk6-compat-lock` | — |
| 2 | — | [Sprint 02: Convex Source Catalog and Asset Inventory](#sprint-02-convex-source-catalog-and-asset-inventory) | `holo catalog:verify` — 60/60 tables + every object have approved dispositions | 5 | — | ✅ Completed | `mk6-source-catalog` | [`cf93b3b`](https://github.com/hackerpug-ai/holocron-client/commit/cf93b3b) |
| 3 | — | [Sprint 03: MCP Compatibility Manifest and Frozen Fixtures](#sprint-03-mcp-compatibility-manifest-and-frozen-fixtures) | `holo mcp:verify-manifest` — 44/44 tools with frozen fixtures, both transports | 5 | 1 | ✅ Completed | `mk6-mcp-manifest` | [`63500b5`](https://github.com/hackerpug-ai/holocron-client/commit/63500b5) |
| 4 | — | [Sprint 04: Provision Postgres and Domain Schema](#sprint-04-provision-postgres-and-domain-schema) | `holo db:migrate` clean on real PG 18; ≥55 tables, indexes, replication ready | 6 | 1, 2 | ✅ Completed | `mk6-postgres-schema` | — |
| 5 | — | [Sprint 05: Mastra Service and Scoped-Key Auth](#sprint-05-mastra-service-and-scoped-key-auth) | Unkeyed mutation → 401; correctly-scoped key → 200 on the running service | 5 | 1, 4 | ✅ Completed | `mk6-mastra-service` | — |
| 6 | — | [Sprint 06: Headless Deployment and Dev/Prod Parity](#sprint-06-headless-deployment-and-devprod-parity) | `holo stack up` — Postgres/Mastra/scheduler/zero-cache healthy in 60s | 6 | 4, 5 | ✅ Completed | `mk6-deployment` | main |
| 7 | — | [Sprint 07: Evidence-Graph Substrate and Ledger Immutability](#sprint-07-evidence-graph-substrate-and-ledger-immutability) | Direct DML on `beliefs` rejected; authorized temporal revision atomic | 5 | 4 | ✅ Completed | `mk6-evidence-ledger` | — |
| 8 | — | [Sprint 08: Role Router, Local-First and Degraded Modes](#sprint-08-role-router-local-first-and-degraded-modes) | Normal mission routes every call to the fleet; zero Anthropic on default path | 5 | 1, 5 | ✅ Completed | `mk6-inference-router` | main |
| 9 | — | [Sprint 09: Structured Output on Local Models](#sprint-09-structured-output-on-local-models) | `holo extract` repairs or fails explicitly past cap — never silently accepts | 4 | 8 | Completed | `mk6-structured-output` | — |
| 10 | — | [Sprint 10: Local Re-embedding and Hybrid RRF Search](#sprint-10-local-re-embedding-and-hybrid-rrf-search) | Past-8K span retrievable via one-round-trip pgvector+FTS RRF fusion | 5 | 1, 4 | Completed | `mk6-local-search` | — |
| 11 | — | [Sprint 11: Scheduler and Durable Queue](#sprint-11-scheduler-and-durable-queue) | kill-9 at each boundary → exactly one observable effect + dedupe record | 5 | 1, 4, 5 | Completed | `mk6-scheduler-queue` | — |
| 12 | — | [Sprint 12: Observability, Telemetry and Eval Gate](#sprint-12-observability-telemetry-and-eval-gate) | `holo evals:ci` bad fixture fails threshold; known-good passes — gate has teeth | 5 | 4, 5, 8 | Completed | `mk6-observability` | — |
| 13 | — | [Sprint 13: Vitest Integration Harness and Real-Service CI Lanes](#sprint-13-vitest-integration-harness-and-real-service-ci-lanes) | `pnpm test:integration` green on real services; fails closed without Postgres/fleet | 7 | 4, 5, 6 | Completed | `mk6-integration-harness` | — |
| 14 | — | [Sprint 14: Big-Bang ETL and Content-Addressed File Storage](#sprint-14-big-bang-etl-and-content-addressed-file-storage) | `holo etl:run` + `holo etl:reconcile` — zero unexplained variance, 0 orphan FKs | 6 | 2, 4, 5, 7, 10 | ✅ Completed | `mk6-etl` | — |
| 15 | — | [Sprint 15: Mission Engine — Durable Resumable Templates](#sprint-15-mission-engine--durable-resumable-templates) | `holo mission run` produces typed output; idempotency replay returns stored result | 6 | 4, 5, 8, 11, 12 | ✅ Completed | `mk6-mission-engine` | — |
| 16 | — | [Sprint 16: Public /article/ Endpoint on Hono](#sprint-16-public-article-endpoint-on-hono) | `/article/{token}` returns byte-comparable HTML; non-public token → 404 | 4 | 4, 14 | 🔵 Planned | `mk6-public-article` | — |
| 17 | — | [Sprint 17: Deterministic pi-free Research Engine](#sprint-17-deterministic-pi-free-research-engine) | Research does NOT terminate on thin evidence; only on the pure-TS evidence gate | 4 | 7, 8, 9, 10, 15 | 🔵 Planned | `mk6-research-engine` | — |
| 18 | — | [Sprint 18: Chat Redesign — Native Tool Loop and Resumable SSE](#sprint-18-chat-redesign--native-tool-loop-and-resumable-sse) | `POST /api/chat-runs` streams sequenced tokens from a fleet specialist; replay idempotent | 5 | 4, 5, 8 | 🔵 Planned | `mk6-chat` | — |
| 19 | — | [Sprint 19: MCP Gateway Rehost — 44 Tools on Postgres](#sprint-19-mcp-gateway-rehost--44-tools-on-postgres) | All 44 MCP tools over stdio on seeded Postgres match manifest; zero Convex calls | 8 | 3, 4, 5 | 🔵 Planned | `mk6-mcp-rehost` | — |
| 20 | — | [Sprint 20: E2E Maestro Harness and Cold-Boot Reference Flow](#sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow) | Cold-boot chat round-trips fleet→Postgres→Zero-sync green on real Maestro harness | 10 | 4, 6, 13, 18 | 🔵 Planned | `mk6-reference-flow` | — |
| 21 | — | [Sprint 21: Client Data Contract](#sprint-21-client-data-contract) | `holo verify:client-contract` — all 105 call sites mapped to a live target | 3 | 4, 5, 18 | 🔵 Planned | `mk6-client-contract` | — |
| 22 | — | [Sprint 22: All Agentic Pipelines as Templates/Agents](#sprint-22-all-agentic-pipelines-as-templatesagents) | Each pipeline produces former output from a shared template; no per-domain shells | 5 | 8, 9, 10, 12, 15, 17 | 🔵 Planned | `mk6-pipelines` | — |
| 23 | — | [Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams](#sprint-23-deterministic-human-gate-steering-and-fulcrum-seams) | Verdicts deterministically reject uncited kill / 2nd WIP / unprobed advance | 5 | 7, 8, 15, 17 | 🔵 Planned | `mk6-human-gate` | — |
| 24 | — | [Sprint 24: Full RN App Rewrite off Convex onto Zero](#sprint-24-full-rn-app-rewrite-off-convex-onto-zero) | Rewritten app shows 3 seeded conversations via Zero; no Convex hook on the path | 6 | 4, 16, 20, 21 | 🔵 Planned | `mk6-app-rewrite` | — |
| 25 | — | [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](#sprint-25-reactive-surfaces--sse-streaming-mission-progress-degraded) | Disconnect mid-stream → reconciles to exactly one final message, no dup tokens | 5 | 8, 15, 18, 24 | 🔵 Planned | `mk6-reactive-surfaces` | — |
| 26 | — | [Sprint 26: Image and Voice Upload Lifecycle Client](#sprint-26-image-and-voice-upload-lifecycle-client) | Uploading the seeded image yields exactly one hash-matched `file_objects` row | 4 | 14, 24 | 🔵 Planned | `mk6-uploads` | — |
| 27 | — | [Sprint 27: Standing Off-Mini Backup Pipeline and Alerting](#sprint-27-standing-off-mini-backup-pipeline-and-alerting) | Induced backup failure fires an alert within 15 min, no dashboard-polling | 6 | 4, 6 | 🔵 Planned | `mk6-backup` | — |
| 28 | — | [Sprint 28: Point-in-Time Restore and Fresh-Hardware Fire Drill](#sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill) | Restore from R2 alone onto fresh machine — row counts + ledger chain match | 6 | 27 | 🔵 Planned | `mk6-restore-drill` | — |
| 29 | — | [Sprint 29: Cutover — Write Freeze, ETL and Read-Only Soak Flip](#sprint-29-cutover--write-freeze-etl-and-read-only-soak-flip) | App + 44 MCP tools serve reads from Postgres; every write returns `migration_read_only` | 5 | 13, 14, 19, 20, 22, 23, 24, 25, 26, 6 | 🔵 Planned | `mk6-cutover` | — |
| 30 | — | [Sprint 30: Cutover Rollback Drill and Data-Plane Point of No Return](#sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return) | Rollback during soak re-points to frozen Convex with zero accepted writes lost | 5 | 29 | 🔵 Planned | `mk6-rollback` | — |
| 31 | — | [Sprint 31: Convex Decommission — Code, Deps and Cloud Deletion](#sprint-31-convex-decommission--code-deps-and-cloud-deletion) | Convex deleted after fresh restore drill; zero Convex surface reachable | 5 | 28, 30 | 🔵 Planned | `mk6-decommission` | — |

The `Milestone` cell links to the GitHub Milestone titled `sprint-{NN}`; sprints not yet pushed show `—` and are backfilled after Milestone creation. `Branch` follows the `mk6-{slug}` convention (`~/Projects/brain/docs/PR-SEQUENCING.md`); `PR` is populated when a PR opens and is **required** once Status is ✅ Completed.

---

## Per-Sprint Details

### Sprint 01: Mastra Compatibility Lock and Fleet Role Manifest

**Sequence:** 1
**Timeline:** Phase 0 — Leading INFRA
**Status:** ⚪ Closed (user-directed; gate unverified)
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-01`)
**Branch:** `mk6-compat-lock`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo compat:spike` on the pinned lockfile against a real Postgres exits 0 with a green five-cell smoke matrix (agent, tool, workflow, MCP transport, OTel trace) and prints every pinned Bun/@mastra/@ai-sdk/Zod version with its release date.

**Closeout note:** Administrative close requested by the user on 2026-07-14. This status does not assert that the documented gate passed; the Sprint 1 task files retain the unverified acceptance state.

**Test Steps:**
1. Run `holo compat:spike` on the pinned lockfile against a running Postgres — exits 0, prints a green 5-cell matrix.
2. Run `holo compat:record` — names exact Bun, @mastra/core, @mastra/pg, @mastra/mcp, AI-SDK, Zod versions with release dates.
3. Run `holo compat:spike --print-trace` — emits one OTel trace with agent, tool, and workflow child spans.
4. Stop Postgres and re-run `holo compat:spike` — fails closed naming the unreachable store (proves no mock).
5. Run `holo manifest:validate` against the live fleet — resolves divergent, convergent, and embed roles to :4545 endpoints.
6. Remove one required role from the manifest and re-run `holo manifest:validate` — exits non-zero naming the missing capability.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| compat-1 | Real-Bun compatibility spike harness (agent+tool+workflow+MCP+OTel vs real Postgres) | mastra-implementer | 300 min |
| compat-2 | Pin the compatibility lockfile + machine-readable compatibility record | mastra-implementer | 120 min |
| compat-3 | Fleet Role Manifest schema, loader, resolveModel skeleton, fail-closed startup validation | mastra-implementer | 240 min |
| compat-4 | RED tests: smoke-matrix fails on disconnected Postgres; manifest fails on missing role | red-test-generator | 120 min |
| compat-5 | Review compatibility lock + fleet manifest | mastra-reviewer | 75 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-14 — SPRINT.md + 5 task files at [`tasks/sprint-01-mastra-compat-lock-fleet-manifest/`](tasks/sprint-01-mastra-compat-lock-fleet-manifest/))*
- compat-1-real-bun-compatibility-spike-harness.md
- compat-2-pin-compatibility-lockfile-and-record.md
- compat-3-fleet-role-manifest-and-resolvemodel.md
- compat-4-red-tests-negative-controls.md
- compat-5-review-compat-lock-and-fleet-manifest.md

#### Dependencies

- Blocks: Sprint 03, Sprint 04, Sprint 05, Sprint 08, Sprint 10, Sprint 11
- Dependent on: None

#### PRD Coverage

- UC-PLAT-02, UC-INFER-01
- T-PLAT-005, T-PLAT-008, T-INFER-017

#### Capability Coverage

- CAP-INF-01: Fleet Role Manifest resolution + fail-closed role routing skeleton

---

### Sprint 02: Convex Source Catalog and Asset Inventory

**Sequence:** 2
**Timeline:** Phase 0 — Leading INFRA
**Status:** ✅ Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-02`)
**Branch:** `mk6-source-catalog`
**PR:** merged via orchestration — [`cf93b3b`](https://github.com/hackerpug-ai/holocron-client/commit/cf93b3b) (no GitHub PR; `.spec` sprint executed via orchestration merge)

#### Human Testing Gate

**Gate:** Running `holo catalog:verify` against a real `convex export` and the committed `12-convex-source-catalog.yaml` reports all 60 legacy tables and every storage reference carry an approved disposition with a computable expected-target formula and zero unmapped surfaces.

**Test Steps:**
1. Run `holo catalog:verify` against a real `convex export` — reports 60/60 tables each with an approved disposition.
2. Run `holo catalog:coverage` — every field and storage reference maps to preserve/merge/drop/regenerate/archive with owner+approval.
3. Delete one table's entry and re-run `holo catalog:verify` — exits non-zero naming the unmapped table.
4. Run `holo catalog:reconcile --dry-run` — prints per-table expected-target count formulas and approved exceptions.
5. Run `holo catalog:assets` — lists every retained storage object with legacy-ID, SHA-256, byte-length, MIME, target, disposition.
6. Run `holo catalog:merges` — reports business 12→3 and research 5→3 collapses with no per-domain shells in the targets.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| catalog-1 | Author 12-convex-source-catalog.yaml — one approved entry per table/field/storage reference | mastra-implementer | 360 min |
| catalog-2 | Asset inventory + reconciliation report generator | mastra-implementer | 180 min |
| catalog-3 | `holo catalog:verify` coverage tool + build-gate | mastra-implementer | 120 min |
| catalog-4 | Verify export completeness against the real convex export | convex-reviewer | 150 min |
| catalog-5 | RED tests: unmapped-table fails, deleted-entry fails, variance≠0 fails | red-test-generator | 90 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-14 — SPRINT.md + 5 task files at [`tasks/sprint-02-convex-source-catalog-asset-inventory/`](tasks/sprint-02-convex-source-catalog-asset-inventory/))*
- catalog-1-author-source-catalog-yaml.md
- catalog-2-asset-inventory-reconciliation-report.md
- catalog-3-catalog-verify-coverage-gate.md
- catalog-4-verify-export-completeness.md
- catalog-5-red-tests-negative-controls.md

#### Dependencies

- Blocks: Sprint 04, Sprint 14
- Dependent on: None

#### PRD Coverage

- UC-DATA-01, UC-DATA-05
- T-DATA-020, T-DATA-016

#### Capability Coverage

- CAP-MIG-01: the approved source-catalog mapping + reconciliation report the ETL must satisfy

---

### Sprint 03: MCP Compatibility Manifest and Frozen Fixtures

**Sequence:** 3
**Timeline:** Phase 0 — Leading INFRA
**Status:** ✅ Completed
**Proposed by:** mcp-planner
**Milestone:** — (`sprint-03`)
**Branch:** `mk6-mcp-manifest`
**PR:** merged via direct-to-main commits — terminal [`63500b5`](https://github.com/hackerpug-ai/holocron-client/commit/63500b5) (no GitHub PR; `.spec` sprint executed via orchestration)

#### Human Testing Gate

**Gate:** Running `holo mcp:verify-manifest` exits 0 after confirming all 44 live-registered tool IDs resolve to manifest entries carrying frozen success/error fixtures.

**Test Steps:**
1. Run `holo mcp:verify-manifest` — exits 0 reporting '44/44 tools, both transports covered'.
2. Remove one tool's fixture block, re-run `holo mcp:verify-manifest` — exits 1 naming the uncovered tool.
3. Run `holo mcp:manifest-schema store_document` — prints its input/output JSON Schema plus default values.
4. Run `holo mcp:manifest-replay add_subscription` — returns the frozen idempotency key and stored replay result.
5. Run `holo mcp:verify-manifest --protocol` — reports pinned MCP protocol 2025-11-25 for both transports.
6. Run `holo mcp:list-mutations` — lists the mutating tools including `store_document`, each with a replay-contract entry.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| mcp-manifest-01 | Author the MCP manifest header: protocol, transports, 44-tool skeleton | mcp-implementer | 90 min |
| mcp-manifest-02 | Populate per-tool contract for all 44 tools (schemas, defaults, errors, pagination, idempotency) | mcp-implementer | 150 min |
| mcp-manifest-03 | Freeze success/error/mutation-replay fixtures for all 44 tools from current behavior | red-test-generator | 180 min |
| mcp-manifest-04 | Build `holo mcp:verify-manifest` completeness gate + operator inspection commands | mcp-implementer | 120 min |
| mcp-manifest-05 | Review manifest protocol compliance; prove the completeness gate is un-fakeable | mcp-reviewer | 75 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-14 — SPRINT.md + 5 task files at [`tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/`](tasks/sprint-03-mcp-compatibility-manifest-frozen-fixtures/))*
- mcp-manifest-01-author-mcp-manifest-header.md
- mcp-manifest-02-populate-per-tool-contracts.md
- mcp-manifest-03-freeze-fixtures-replay-contracts.md
- mcp-manifest-04-verify-manifest-completeness-gate.md
- mcp-manifest-05-review-protocol-compliance-unfakeable-gate.md
- REDHAT-FIX-01-replace-tautological-replay-fixture-assertions-with-behavioral-real-tool.md
- REDHAT-FIX-02-capture-and-validate-fixtures-from-real-tool-behavior.md
- REDHAT-FIX-03-make-holo-mcpverify-manifest-fail-closed-on-all-required.md

*(REDHAT-FIX tasks added 2026-07-14 from red-hat review `.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md`)*

#### Dependencies

- Blocks: Sprint 19
- Dependent on: Sprint 01

#### PRD Coverage

- UC-SVC-04 (AC-5), T-SVC-021

#### Capability Coverage

- CAP-CUT-01: the frozen 44-tool contract baseline the cutover flips to Postgres against

---

### Sprint 04: Provision Postgres and Domain Schema

**Sequence:** 4
**Timeline:** Phase 1 — Platform Foundation
**Status:** ✅ Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-04`)
**Branch:** `mk6-postgres-schema`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo db:migrate` against a fresh real Postgres 18 applies every Drizzle migration with zero errors, producing all ~55 domain tables with their btree/GIN/HNSW indexes and normalized status CHECK constraints.

**Test Steps:**
1. Run `holo db:migrate` against a fresh Postgres 18 — applies all migrations, reports 0 errors and ≥55 tables created.
2. Run `holo db:verify --indexes` — every declared btree/GIN/HNSW index exists on its table.
3. Run `holo db:verify --merges` — reports one `analysis_*` trio and one `research_*` trio, no per-domain shells.
4. Run `holo db:probe --jsonb cardData` — writes and reads a polymorphic payload back with structural equality.
5. Insert status `in-progress` via `holo db:probe --status` — rejected by CHECK; insert `in_progress` — accepted.
6. Run `holo repl:status` — `wal_level=logical`, `zero_pub` covers the reactive subset only, uuid PK replica identity confirmed.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| schema-1 | Provision Postgres 18 + pgvector + FTS + wal_level=logical, reachable over Tailscale | mastra-implementer | 180 min |
| schema-2 | Drizzle domain schema — all domains → ~55 tables with merges, typed jsonb, status CHECK, uuidv7 PKs | mastra-implementer | 360 min |
| schema-3 | HNSW + GIN + btree indexes incl. generated search_vector tsvector | mastra-implementer | 150 min |
| schema-4 | Logical replication + zero_pub publication (reactive subset, vectors excluded) + replica identity | mastra-implementer | 150 min |
| schema-5 | RED tests: 0-error migrate, status CHECK, jsonb round-trip, merges collapsed, replication readiness | red-test-generator | 150 min |
| schema-6 | Review schema vs source catalog + Zero split | mastra-reviewer | 90 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-14 — SPRINT.md + 6 task files at [`tasks/sprint-04-provision-postgres-and-domain-schema/`](tasks/sprint-04-provision-postgres-and-domain-schema/); avg 100/115, 0 fakeable scenarios)*
- schema-1-provision-postgres-pgvector-fts-wal.md
- schema-2-drizzle-domain-schema-55-tables.md
- schema-3-hnsw-gin-btree-indexes-search-vector.md
- schema-4-logical-replication-zero-pub-publication.md
- schema-5-red-tests-negative-controls.md
- schema-6-review-schema-vs-source-catalog-zero-split.md

#### Dependencies

- Blocks: Sprint 05, Sprint 07, Sprint 10, Sprint 11, Sprint 12, Sprint 14, Sprint 15, Sprint 16, Sprint 18, Sprint 19, Sprint 21, Sprint 27
- Dependent on: Sprint 01, Sprint 02

#### PRD Coverage

- UC-PLAT-01, UC-DATA-01
- T-PLAT-001, T-PLAT-002, T-PLAT-003, T-DATA-001, T-DATA-002, T-DATA-003, T-DATA-004

#### Capability Coverage

- CAP-SYNC-01: the `zero_pub` publication + uuid replica identity the RN client reactively syncs (vectors excluded)

---

### Sprint 05: Mastra Service and Scoped-Key Auth

**Sequence:** 5
**Timeline:** Phase 1 — Platform Foundation
**Status:** ✅ Completed — GATE-GOAL: ACHIEVED
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-05`)
**Branch:** `mk6-mastra-service`
**PR:** —

#### Human Testing Gate

**Gate:** With the compatibility-locked service booted on the mini, an unkeyed tailnet request to a verdict/steer/MCP-mutation route returns 401 while the same request with its correctly-scoped RN/MCP key returns 200.

**Test Steps:**
1. Run `holo service:up` on the mini and `curl https://mini/health` — returns 200 with DB/fleet/queue readiness.
2. `curl -X POST https://mini/api/missions/x/steer` with no key — returns 401.
3. Repeat with the correctly-scoped RN key — returns 200 (accepted).
4. `curl` an MCP mutation with the RN key (wrong scope) — returns 403 (scope mismatch).
5. Run `holo registry:probe searchTool` — the same Zod schema resolves for the agent, workflow, and MCP paths.
6. Run `holo verify:no-dup-validation` — reports the duplicate validation layer absent.
7. Run `holo manifest:resolve divergent` from inside the running service — returns the live fleet endpoint.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| service-1 | Mastra composition root + Hono HTTP/SSE surface + /health readiness | mastra-implementer | 240 min |
| service-2 | Single shared Tool + Zod schema registry (agents/workflows/MCP consume identically) | mastra-implementer | 210 min |
| service-3 | Scoped API-key middleware (RN/MCP/control scopes) + fleet resolution wired in | mastra-implementer | 210 min |
| service-4 | RED tests: unkeyed→401, wrong-scope→403, keyed→200, shared-schema identity, /health | red-test-generator | 120 min |
| service-5 | Review auth boundary + registry singularity | mastra-reviewer | 90 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-14 — SPRINT.md + 5 task files at [`tasks/sprint-05-mastra-service-and-scoped-key-auth/`](tasks/sprint-05-mastra-service-and-scoped-key-auth/); avg 100/115, 0 fakeable scenarios)*
- service-1-mastra-composition-root-hono-health.md
- service-2-shared-tool-zod-schema-registry.md
- service-3-scoped-key-middleware-and-fleet-resolution.md
- service-4-red-tests-unkeyed-wrong-scope-keyed-shared-schema-health.md
- service-5-review-auth-boundary-and-registry-singularity.md

#### Dependencies

- Blocks: Sprint 06, Sprint 08, Sprint 11, Sprint 12, Sprint 13, Sprint 15, Sprint 18, Sprint 19, Sprint 21
- Dependent on: Sprint 01, Sprint 04

#### PRD Coverage

- UC-PLAT-02
- T-PLAT-005, T-PLAT-006, T-PLAT-007, T-PLAT-008

#### Capability Coverage

- CAP-INF-01: in-service model-role resolution behind the scoped-key control plane

---

### Sprint 06: Headless Deployment and Dev/Prod Parity

**Sequence:** 6
**Timeline:** Phase 1 — Platform Foundation
**Status:** ✅ Completed
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-06`)
**Branch:** `mk6-deployment`
**PR:** —

#### Human Testing Gate

**Gate:** An operator running a single `holo stack up` command on the mini gets all four services — Postgres, Mastra, the scheduler, zero-cache — reporting healthy within 60 seconds, with zero manual per-service steps.

**Test Steps:**
1. Run `holo stack up` on the mini — Postgres, Mastra, scheduler, zero-cache healthy within 60s.
2. Run `holo stack down` on the mini — all four processes exit clean, zero orphaned PIDs.
3. Run `holo stack up` on the laptop — identical health result under the same config contract.
4. Run `holo secrets doctor` — every config value resolves, zero missing keys reported.
5. Run `holo verify-no-convex-env` — zero Convex env aliases found across the repo.
6. Kill Mastra mid-run, rerun `holo stack up` — service restarts, reports healthy, no manual cleanup.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D01-01 | RED: seeded tests for stack-up health and Convex-env-alias detection | red-test-generator | 60 min |
| D01-02 | launchd service definitions for Postgres/Mastra/scheduler/zero-cache | devops-engineer | 150 min |
| D01-03 | `holo stack up/down/status` operator CLI + laptop dev-parity supervisor | devops-engineer | 180 min |
| D01-04 | Consolidated secrets source + Convex-env-alias removal + `holo verify-no-convex-env` | devops-engineer | 150 min |
| D01-05 | Wire fleet embed-route health into stack status (CAP-EMB-01 shared) | devops-engineer | 60 min |
| D01-06 | Security review: consolidated secrets store | security-reviewer | 60 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-14 — SPRINT.md + 6 task files at [`tasks/sprint-06-headless-deployment-dev-prod-parity/`](tasks/sprint-06-headless-deployment-dev-prod-parity/); avg 100.8/115, 0 fakeable scenarios)*
- D01-01-red-seeded-tests-for-stack-up-health-and-convex-env-alias-detection.md
- D01-02-launchd-service-definitions-for-postgres-mastra-scheduler-zero-cache.md
- D01-03-holo-stack-up-down-status-operator-cli-laptop-dev-parity-supervisor.md
- D01-04-consolidated-secrets-source-convex-env-alias-removal-holo-verify-no-convex-env.md
- D01-05-wire-fleet-embed-route-health-into-stack-status-cap-emb-01-shared.md
- D01-06-security-review-consolidated-secrets-store.md

#### Dependencies

- Blocks: Sprint 13, Sprint 20, Sprint 27, Sprint 29
- Dependent on: Sprint 04, Sprint 05

#### PRD Coverage

- UC-PLAT-05
- T-PLAT-015, T-PLAT-016, T-PLAT-017

#### Capability Coverage

- CAP-EMB-01: operational embed-route health surfaced in `holo stack status` (ops-visibility share)

---

### Sprint 07: Evidence-Graph Substrate and Ledger Immutability

**Sequence:** 7
**Timeline:** Phase 1 — Platform Foundation
**Status:** ✅ Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-07`)
**Branch:** `mk6-evidence-ledger`
**PR:** —

#### Human Testing Gate

**Gate:** Against real Postgres, a direct `UPDATE`/`DELETE` on `beliefs` is rejected at the database while the authorized temporal-revision transaction atomically closes the predecessor's `tx_to`, inserts exactly one successor, and rejects a stale concurrent revision — preserving the full as-of audit chain.

**Test Steps:**
1. Run `holo evidence:seed` — inserts a claim with two contradicting passages.
2. Run `holo evidence:belief --as-of now` — returns the net current belief from validity-windowed edges.
3. Run `holo db:probe --raw "UPDATE beliefs SET ..."` — raises a permission error (direct DML denied).
4. Run `holo evidence:revise <belief> --actor op` — closes prior `tx_to`, inserts one successor, records actor/run/idempotency.
5. Fire two concurrent `holo evidence:revise` on the same row — exactly one commits, the stale one is rejected.
6. Run `holo evidence:belief --as-of <earlier-tx>` — still returns the pre-revision belief (audit chain intact).
7. Run `holo evidence:register-doc <id>` — its retrieval chunks are the same canonical `passages` rows (no duplicate corpus).

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| ledger-1 | Evidence-graph substrate tables (sources, passages, claims, entities, relations, beliefs) — bi-temporal | mastra-implementer | 300 min |
| ledger-2 | DB-enforced immutability: REVOKE UPDATE/DELETE + scoped temporal-revision function | mastra-implementer | 240 min |
| ledger-3 | Canonical corpus unification + net-support / as-of computation | mastra-implementer | 210 min |
| ledger-4 | RED tests: direct DML rejected, atomic supersession, stale-concurrent rejection, as-of chain | red-test-generator | 180 min |
| ledger-5 | Review immutability + bi-temporal correctness | mastra-reviewer | 90 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-15 — SPRINT.md + 5 task files at [`tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/`](tasks/sprint-07-evidence-graph-substrate-and-ledger-immutability/); avg ~100/115, 0 fakeable/CRITICAL scenarios. JIT note: the evidence-graph substrate tables already exist from Sprint 04 — ledger-1 was reframed from "create tables" to "audit/ensure immutability-readiness + `holo evidence:seed`"; the gate core is ledger-2's REVOKE + `revise_belief` SECURITY DEFINER function.)*
- ledger-1-evidence-graph-substrate-audit-seed-command-bi-temporal-readiness-confirmation.md
- ledger-2-db-enforced-immutability-revoke-update-delete-temporal-revision-security-definer.md
- ledger-3-canonical-corpus-unification-net-support-as-of-computation.md
- ledger-4-red-tests-immutability-supersession-as-of-chain.md
- ledger-5-review-immutability-bi-temporal-correctness.md

#### Dependencies

- Blocks: Sprint 14, Sprint 17, Sprint 23
- Dependent on: Sprint 04

#### PRD Coverage

- UC-DATA-02, UC-PLAT-01 (AC-4)
- T-DATA-005, T-DATA-006, T-DATA-007, T-DATA-008, T-DATA-022, T-PLAT-004

#### Capability Coverage

- N/A — the immutable ledger is the substrate CAP-MIG-01 loads into and CAP-INF-01's research writes to; no boundary-crossing chain is owned here.

---

### Sprint 08: Role Router, Local-First and Degraded Modes

**Sequence:** 8
**Timeline:** Phase 2 — Inference and Data
**Status:** ✅ Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-08`)
**Branch:** `mk6-inference-router`
**PR:** —

#### Human Testing Gate

**Gate:** Running a normal reasoning mission against the real fleet routes every call through `resolveModel(role)` to a live `:4545` endpoint and makes zero Anthropic requests, verified by fleet request logs plus a network assertion that fails if any call reaches cloud.

**Test Steps:**
1. Run `holo mission run triage --goal 'X'` with a network capture on — completes with N fleet calls to :4545.
2. Read the network capture — zero Anthropic requests on the default path.
3. Run `holo infer:call --role divergent` and `--role convergent` — resolve to the 35B-A3B and 27B fleet models.
4. Run `holo infer:call --escape --cost 999` — blocked by the budget pre-check, records `budget_exceeded`.
5. Run one real `holo infer:call --escape --highStakes` within budget — succeeds and logs reason/tokens/cost to the ledger.
6. Take the divergent endpoint down mid-run — the mission degrades to its declared mode (never cloud); bring it back — it resumes.
7. Run `holo verify:no-provider-refs` — reports zero direct provider references and no `claudeFlash/Pro/Ultra` factories.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| infer-1 | resolveModel(role,{allowEscape}) router over fleet + default-deny Claude escape | mastra-implementer | 240 min |
| infer-2 | Budget ledger + deterministic escape pre-check + per-escape telemetry | mastra-implementer | 210 min |
| infer-3 | Degraded-mode controller (fleet-down → defined reduced mode, auto-resume) | mastra-implementer | 180 min |
| infer-4 | RED tests: zero-Anthropic default path, over-budget escape blocked, degraded-not-cloud | red-test-generator | 180 min |
| infer-5 | Review local-first structural integrity + escape leakage | mastra-reviewer | 90 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-15 — SPRINT.md + 5 task files at [`tasks/sprint-08-role-router-local-first-and-degraded-modes/`](tasks/sprint-08-role-router-local-first-and-degraded-modes/); avg ~115/115, 0 fakeable/CRITICAL scenarios — `validate_scenario` clean on every behavioral AC, independently re-verified on the rendered files. Topological order: infer-1 → infer-2 ∥ infer-3 → infer-4 → infer-5.)*
- infer-1-resolve-model-router-default-deny-claude-escape.md
- infer-2-budget-ledger-deterministic-escape-pre-check-telemetry.md
- infer-3-degraded-mode-controller-fleet-down-auto-resume.md
- infer-4-red-tests-zero-anthropic-over-budget-blocked-degraded-not-cloud.md
- infer-5-review-local-first-structural-integrity-escape-leakage.md

#### Dependencies

- Blocks: Sprint 09, Sprint 12, Sprint 17, Sprint 18, Sprint 22, Sprint 23, Sprint 25
- Dependent on: Sprint 01, Sprint 05

#### PRD Coverage

- UC-INFER-01, UC-INFER-04, UC-INFER-05
- T-INFER-001, T-INFER-002, T-INFER-003, T-INFER-011, T-INFER-012, T-INFER-013, T-INFER-014, T-INFER-015, T-INFER-016, T-INFER-017

#### Capability Coverage

- CAP-INF-01: role-routed local-first inference, budgeted escape, and fleet-down degraded mode

---

### Sprint 09: Structured Output on Local Models

**Sequence:** 9
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-09`)
**Branch:** `mk6-structured-output`
**PR:** —

#### Human Testing Gate

**Gate:** Given a local fleet model and a Zod extraction schema, `holo extract` either repairs a malformed generation to a schema-valid object or fails explicitly past its retry cap with a typed terminal outcome — never silently accepting invalid output.

**Test Steps:**
1. Run `holo probe:capabilities` — reports per-role json_schema support and selects constrained vs repair mode.
2. Run `holo extract --schema Foo --input good` against the fleet — returns a Zod-valid object.
3. Run `holo extract --fixture malformed-once` — the bounded repair loop yields a valid object.
4. Run `holo extract --fixture always-malformed` — fails explicitly past the cap with a typed terminal error.
5. Run `holo extract:status <id>` — reports `extraction_failed` with no committed row (no silent success).
6. Trip an output tripwire during extraction — emits a typed terminal `blocked` state; the tool is not dispatched.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| struct-1 | Structured-output pipeline: json_schema → constrained decode → Zod re-validate → bounded repair → explicit fail | mastra-implementer | 240 min |
| struct-2 | Boot-time per-role capability probe + typed terminal outcomes | mastra-implementer | 150 min |
| struct-3 | RED tests: malformed→repair→valid, always-malformed→explicit-fail, tripwire→blocked | red-test-generator | 150 min |
| struct-4 | Review extraction safety | mastra-reviewer | 75 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-16 — SPRINT.md + 4 task files at [`tasks/sprint-09-structured-output-on-local-models/`](tasks/sprint-09-structured-output-on-local-models/); avg ~108/115, 0 CRITICAL / 0 HIGH fakeable scenarios — `validate_scenario` clean on every behavioral AC, independently re-verified on the rendered files. Topological order: struct-3 (RED suite, written first) → struct-1 ∥ struct-2 → struct-4. Status remains 🔵 Planned — expanded and ready for `/kb-run-sprint`, not yet executing.)*
- struct-1-structured-output-pipeline-bounded-repair-explicit-fail.md
- struct-2-boot-time-capability-probe-typed-terminals.md
- struct-3-red-tests-repair-explicit-fail-tripwire-blocked.md
- struct-4-review-extraction-safety.md

#### Dependencies

- Blocks: Sprint 17, Sprint 22
- Dependent on: Sprint 08

#### PRD Coverage

- UC-INFER-03
- T-INFER-008, T-INFER-009, T-INFER-010

#### Capability Coverage

- CAP-INF-01: schema-valid-or-explicit-fail structuring on the local fleet (extraction segment)

---

### Sprint 10: Local Re-embedding and Hybrid RRF Search

**Sequence:** 10
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-10`)
**Branch:** `mk6-local-search`
**PR:** —

#### Human Testing Gate

**Gate:** After `holo embed:run` chunks and embeds a seeded document whose relevant span sits past character 8,000, `holo search '<span-query>'` returns that document in top-k via one-round-trip pgvector+FTS RRF fusion against real Postgres — impossible under the old 8K truncation.

**Test Steps:**
1. Run `holo embed:run` against the real `:4545` embed route — every non-empty doc gets ≥1 passage, all vectors 1024-dim non-null.
2. Run `holo embed:verify` — zero passages carry a null or wrong-dimension vector; norms are ~unit.
3. Seed a golden doc with the answer past char-8000 and run `holo search '<span query>'` — the doc ranks in top-k.
4. Run `holo search '<q>' --explain` — shows pgvector KNN + FTS fused with RRF in one round-trip.
5. Run `holo search:recall --golden set.json` — new recall ≥ the recorded Convex hybridSearch baseline.
6. Re-run `holo embed:run`, interrupt it, and resume — no duplicate passages (`WHERE embedding IS NULL`, `SKIP LOCKED`).
7. Run `holo search --surface research_findings '<q>'` — inline-HNSW semantic search returns results with no Cohere/cloud call.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| search-1 | Shared embed() helper (query/document prefix asymmetry) + passage chunking (~512 tok) | mastra-implementer | 240 min |
| search-2 | Idempotent resumable re-embed job + optional contextual header | mastra-implementer | 180 min |
| search-3 | RRF hybrid search helper (pgvector HNSW + FTS, one round-trip) + 5 inline-HNSW surfaces | mastra-implementer | 240 min |
| search-4 | RED tests: 0 null/wrong-dim vectors, past-8K retrieval, recall≥baseline, idempotent re-embed | red-test-generator | 180 min |
| search-5 | Review embedding + search parity | mastra-reviewer | 90 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-17 — SPRINT.md + 5 task files at [`tasks/sprint-10-local-re-embedding-and-hybrid-rrf-search/`](tasks/sprint-10-local-re-embedding-and-hybrid-rrf-search/); avg ~108/115, 0 fakeable scenarios — `validate_scenario` clean on every behavioral AC. Topological order: search-4 (RED suite, written first) → search-1 ∥ search-2 → search-3 → search-5. Status remains 🔵 Planned — expanded and ready for `/kb-run-sprint`, not yet executing.)*
- search-4-red-tests-0-nullwrong-dim-vectors-past-8k-retrieval-recallba.md
- search-1-shared-embed-helper-querydocument-prefix-asymmetry-passage-c.md
- search-2-idempotent-resumable-re-embed-job-where-embedding-is-null-fo.md
- search-3-rrf-hybrid-search-helper-pgvector-hnsw-fts-one-round-trip-5.md
- search-5-review-embedding-search-parity-vector-integrity-past-8k-reca.md

#### Dependencies

- Blocks: Sprint 14, Sprint 17, Sprint 22
- Dependent on: Sprint 04, Sprint 01

#### PRD Coverage

- UC-DATA-03, UC-DATA-04
- T-DATA-009, T-DATA-010, T-DATA-011, T-DATA-012, T-DATA-013, T-DATA-014, T-DATA-015

#### Capability Coverage

- CAP-EMB-01: local Qwen3 chunk+embed pass (query/doc asymmetry, idempotent resumable), consumed by hybrid search

---

### Sprint 11: Scheduler and Durable Queue

**Sequence:** 11
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-11`)
**Branch:** `mk6-scheduler-queue`
**PR:** —

#### Human Testing Gate

**Gate:** With the durable queue running, a kill-9 at each commit/dispatch/ack boundary of a seeded job yields exactly one observable side-effect plus one auditable outbox/inbox dedupe record — never zero and never two.

**Test Steps:**
1. Run `holo jobs:run-all` — all 16 migrated jobs fire; each former Convex side-effect is observed in Postgres.
2. Enqueue a seeded effect and kill-9 before commit, then re-run — produces exactly one effect (no partial).
3. Kill-9 after commit/before enqueue, then after dispatch/before ack — still exactly one observable effect.
4. Run `holo queue:audit <key>` — shows one outbox entry, one inbox dedupe outcome, fencing token recorded.
5. Load a background mission + an interactive chat job, then dequeue — the interactive job dequeues first.
6. Force a job to fail past retries — it lands in the dead-letter path, not silently dropped.
7. Run `holo jobs:list` — the 16 map to 7 janitor sweeps + 4 workflows + 1 consumer + 3→1 backfill + 1 digest.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| queue-1 | Mastra native schedule + pg-boss (graphile-worker fallback) leased queue — retries/backoff/DLQ/priority | mastra-implementer | 240 min |
| queue-2 | Transactional outbox/inbox + idempotency keys + fencing consumer (exactly-once observable effects) | mastra-implementer | 240 min |
| queue-3 | Migrate all 16 crons to the new scheduler/queue with observable side-effects + priority lanes | mastra-implementer | 300 min |
| queue-4 | RED tests: kill-9 at commit/dispatch/ack → exactly-once + dedupe, all-16-fire, priority, DLQ | red-test-generator | 210 min |
| queue-5 | Review durable-effect contract | mastra-reviewer | 90 min |

#### Next Sprint Tasks

Generated by /kb-sprint-tasks-plan on 2026-07-17T18:46:47Z.

- queue-1-mastra-native-schedule-pg-boss-graphile-worker-fallback-leased-queue-retries-backoff-dlq-priority.md
- queue-2-transactional-outbox-inbox-idempotency-keys-fencing-consumer-exactly-once-observable-effects.md
- queue-3-migrate-all-16-crons-to-the-new-scheduler-queue-with-observable-side-effects-priority-lanes.md
- queue-4-red-tests-kill-9-at-commit-dispatch-ack-to-exactly-once-dedupe-all-16-fire-priority-dlq.md
- queue-5-review-durable-effect-contract.md

#### Dependencies

- Blocks: Sprint 15
- Dependent on: Sprint 01, Sprint 04, Sprint 05

#### PRD Coverage

- UC-PLAT-03
- T-PLAT-009, T-PLAT-010, T-PLAT-011

#### Capability Coverage

- N/A — the outbox/inbox exactly-once contract underpins CAP-MIG-01/CAP-CUT-01 effects but owns no boundary-crossing chain itself.

---

### Sprint 12: Observability, Telemetry and Eval Gate

**Sequence:** 12
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-12`)
**Branch:** `mk6-observability`
**PR:** —

#### Human Testing Gate

**Gate:** Feeding a deliberately bad fixture to `holo evals:ci` fails the configured regression threshold and exits non-zero (blocking the lane), while a known-good sample scores at/above its versioned baseline — proving the gate has teeth.

**Test Steps:**
1. Run `holo mission run research --goal 'X'` — one OTel trace appears per-run in self-hosted Langfuse.
2. Run `holo telemetry:tail` — tokens/wall-ms/endpoint/role rows are written to Postgres for every model call.
3. Run `holo evals:run --sample known-good` — the local judge scores it against the versioned rubric/dataset/baseline; the score persists.
4. Run `holo evals:ci --fixture deliberately-bad` — fails the configured threshold and exits non-zero.
5. Run `holo evals:ci --fixture known-good` — passes; a deterministic-invariant regression also fails the lane.
6. Run `holo evals:drift` — longitudinal scores are tracked across runs with dataset/model/prompt versions recorded.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| obs-1 | Observability wiring — OTel exporter → self-hosted Langfuse (per-run traces) | mastra-evals-implementer | 210 min |
| obs-2 | Inference telemetry stream (tokens/wall-ms/endpoint/role) → Postgres per call | mastra-evals-implementer | 150 min |
| obs-3 | Eval scorers + versioned datasets/baselines per specialist/retrieval/gate + judge versions | mastra-evals-implementer | 300 min |
| obs-4 | Deterministic-invariant + threshold CI regression gate with bad-fixture proof | mastra-evals-implementer | 180 min |
| obs-5 | Review evals constitution | mastra-reviewer | 90 min |

#### Next Sprint Tasks

Generated by /kb-sprint-tasks-plan on 2026-07-17T22:54:26Z.

- obs-1-observability-wiring-otel-exporter-self-hosted-langfuse-per-run-traces.md
- obs-2-inference-telemetry-stream-tokens-wall-ms-endpoint-role-postgres-per-call.md
- obs-3-eval-scorers-versioned-datasets-baselines-per-specialist-retrieval-gate-judge-versions.md
- obs-4-deterministic-invariant-threshold-ci-regression-gate-with-bad-fixture-proof.md
- obs-5-review-evals-constitution.md

#### Dependencies

- Blocks: Sprint 22
- Dependent on: Sprint 04, Sprint 05, Sprint 08

#### PRD Coverage

- UC-PLAT-04
- T-PLAT-012, T-PLAT-013, T-PLAT-014, T-PLAT-018

#### Capability Coverage

- CAP-INF-01: per-call inference telemetry + budget-ledger visibility (detective-controls segment)

---

### Sprint 13: Vitest Integration Harness and Real-Service CI Lanes

**Sequence:** 13
**Timeline:** Phase 2 — Inference and Data
**Status:** ✅ Completed
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-13`)
**Branch:** `mk6-integration-harness`
**PR:** —

#### Human Testing Gate

**Gate:** An operator running `pnpm test:integration` gets a green run of the real-service suite against the dedicated nonprod Postgres namespace, with zero tests passing when Postgres or the fleet endpoint is unreachable.

**Test Steps:**
1. Run `pnpm test:integration` against the nonprod namespace — green run, real Postgres, real fleet.
2. Point the lane at an unreachable Postgres — suite fails closed, zero false-pass results.
3. Run `holo db seed --reset` — nonprod namespace reaches deterministic known state every time.
4. Open a PR touching `tests/` — fast lane runs on every commit, integration lane pre-merge.
5. Run the PRD-consistency check — passes against current PRD; fails on a seeded stale count.
6. Run `actionlint` on the new workflows — zero errors, all actions SHA-pinned.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D02-01 | RED: integration lane fails closed without real Postgres/fleet | red-test-generator | 60 min |
| D02-02 | Provision dedicated nonprod Postgres/Zero namespace + deterministic seed/reset | devops-engineer | 150 min |
| D02-03 | Register self-hosted GitHub Actions runner on the tailnet | devops-engineer | 120 min |
| D02-04 | Design fast/integration/e2e CI lane architecture | ghactions-planner | 90 min |
| D02-05 | Implement fast + integration GitHub Actions workflows | ghactions-implementer | 150 min |
| D02-06 | Adversarial review of CI workflows | ghactions-reviewer | 90 min |
| D02-07 | PRD-consistency build gate (T-PLAT-020) | devops-engineer | 120 min |

**Next Sprint Tasks:** *(expanded by kb-sprint-tasks-plan on 2026-07-18T06:18:48Z — SPRINT.md + 7 task files at [`tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/`](tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/))*
- D02-01-red-integration-lane-fails-closed-without-real-postgres-fleet.md
- D02-02-provision-dedicated-nonprod-postgres-zero-namespace-deterministic-seed-reset.md
- D02-03-register-self-hosted-github-actions-runner-on-the-tailnet.md
- D02-04-design-fast-integration-e2e-ci-lane-architecture.md
- D02-05-implement-fast-integration-github-actions-workflows.md
- D02-06-adversarial-review-of-ci-workflows.md
- D02-07-prd-consistency-build-gate-t-plat-020.md

#### Dependencies

- Blocks: Sprint 20, Sprint 29 (real-service closure of every DATA/SVC/INFER feature gate)
- Dependent on: Sprint 04, Sprint 05, Sprint 06

#### PRD Coverage

- T-PLAT-019 (runner substrate), T-PLAT-020

#### Capability Coverage

- N/A — the real-service harness is the acceptance substrate for every integration-tier chain but owns no chain itself.

---

### Sprint 14: Big-Bang ETL and Content-Addressed File Storage

**Sequence:** 14
**Timeline:** Phase 3 — Migration Engine and Services
**Status:** ✅ Completed
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-14`)
**Branch:** `mk6-etl`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo etl:run` against a real `convex export` loads the whole graph into real Postgres and `holo etl:reconcile` reports zero unexplained variance against the source catalog with a NULL-FK audit of 0 orphans.

**Test Steps:**
1. Run `holo etl:run --export ./export` against real Postgres — loads the real immutable archive in FK-dependency order, builds the `_id`→UUIDv7 map, retains indexed `legacy_convex_id`, and normalizes status.
2. Run `holo etl:reconcile` — emits source counts, expected-target formulas, approved exceptions, checksums/samples, retained-object results, and FK results; zero unexplained variance.
3. Run `holo etl:fk-audit` — all FK constraints enforce clean; the NULL-FK audit returns 0 orphans.
4. Run `holo etl:vectors` — every non-empty document has a regenerated, non-null 1024-dim unit-norm vector/passages, live fleet and past-8K retrieval checks pass.
5. Run `holo blob:verify` against the complete retained-object manifest — every retained object or approved exception has SHA-256/byte-length/MIME parity; representative Range reads return exact bytes.
6. Re-run `holo etl:run` from the immutable archive — no duplicate rows or blobs (convex_id_map stable).
7. Run the backend `holo upload:init/put/finalize` API for image + voice artifacts — hash verified, idempotent attach, no orphan row/object; Sprint 26 owns RN e2e closure for T-DATA-021.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| etl-1 | ETL pipeline: export→stage-jsonb→whole-graph _id→uuidv7 map→FK-ordered load→status canonicalize | mastra-implementer | 360 min |
| etl-2 | Vector regeneration + catalog-derived reconciliation report + NULL-FK audit gates | mastra-implementer | 210 min |
| etl-3 | Content-addressed BlobStore + retained-object migration + tailnet Range reads | mastra-implementer | 240 min |
| etl-4 | Authoritative Hono upload lifecycle (init/PUT/finalize, hash verify, idempotent attach, no orphan) | mastra-implementer | 180 min |
| etl-5 | RED tests: zero-variance, NULL-FK=0, vector dim, blob parity, idempotent re-run, upload no-orphan | red-test-generator | 240 min |
| etl-6 | Verify ETL export completeness + review integrity | convex-reviewer + mastra-reviewer | 150 min |

#### Expanded Task Files

- `tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/etl-1-etl-pipeline-export-stage-id-map-fk-load-status.md`
- `tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/etl-2-vectors-reconciliation-null-fk-audit.md`
- `tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/etl-3-content-addressed-blobstore-retained-objects-range.md`
- `tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/etl-4-authoritative-upload-lifecycle.md`
- `tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/etl-5-red-tests-etl-integrity-and-upload-gates.md`
- `tasks/sprint-14-big-bang-etl-and-content-addressed-file-storage/etl-6-verify-export-completeness-and-migration-integrity.md`

#### Dependencies

- Blocks: Sprint 16, Sprint 26, Sprint 29
- Dependent on: Sprint 02, Sprint 04, Sprint 05, Sprint 07, Sprint 10

#### PRD Coverage

- UC-DATA-05
- T-DATA-016, T-DATA-017, T-DATA-018, T-DATA-019, and the backend prerequisite for T-DATA-021 (RN e2e closure remains Sprint 26)

#### Capability Coverage

- CAP-MIG-01: the one-time big-bang `convex export`→Postgres load, FK integrity, reconciliation, and blob migration
- CAP-EMB-01: ETL-time vector regeneration on the fleet (never copied)

---

### Sprint 15: Mission Engine — Durable Resumable Templates

**Sequence:** 15
**Timeline:** Phase 3 — Migration Engine and Services
**Status:** ✅ Completed
**Proposed by:** mastra-planner + convex-planner
**Milestone:** — (`sprint-15`)
**Branch:** `mk6-mission-engine`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo mission run <template> --goal '…'` from a closed declarative contract row against real Postgres and a real fleet role probe produces typed output with exact template/compiler/registry/executor/schema/fleet provenance; authenticated RN control operations and replay/crash/budget behavior are proven without re-execution.

**Test Steps:**
1. Register the committed `test.echo` template and run it — its real fleet-probe stage resolves the pinned role/manifest and commits typed output with complete provenance.
2. Submit an arbitrary executable stage, serialized Zod/function, unknown stage, or incompatible schema — rejected before run creation.
3. Run `test.sigkill`, SIGKILL after a committed checkpoint, then resume — pinned executor resumes from the first uncommitted stage with no duplicate checkpoint.
4. Spawn a real child CLI with `HOLO_TEST_CRASH_AT=mission-commit/<named-boundary>` and SIGKILL at each COMMIT boundary — no partial rows; replay after removing the hook commits exactly once; a thrown error alone is not proof.
5. Replay the same idempotency key — stored result with `replay: true`, no stage or telemetry re-execution.
6. Exceed wall/token/step budget — terminal `budget_exceeded` with persisted usage and no silent non-commit.
7. Use the RN API key on mission status, steer, and verdict routes — real 200 responses and persisted control events; unkeyed/wrong-scope requests fail 401/403.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| mission-1 | Versioned mission contracts, closed DSL compiler, registry, schema/migration | mastra-implementer | 300 min |
| mission-2 | Durable run runtime, leases, checkpoints, pinned resume, SIGKILL recovery | mastra-implementer | 300 min |
| mission-3 | Atomic commit, idempotent replay, budgets, telemetry/provenance | mastra-implementer | 240 min |
| mission-4 | CLI/HTTP control surface and deterministic test templates | mastra-implementer | 180 min |
| mission-5 | RED tests for contracts/runtime/commit and real-service failure controls | red-test-generator | 180 min |
| mission-6 | Full real gate, adversarial durability review, and closure evidence | mastra-reviewer | 120 min |

#### Expanded Task Files

- `tasks/sprint-15-mission-engine-durable-resumable-templates/mission-1-contracts-closed-dsl-registry-schema.md`
- `tasks/sprint-15-mission-engine-durable-resumable-templates/mission-2-durable-runtime-checkpoints-pinned-resume.md`
- `tasks/sprint-15-mission-engine-durable-resumable-templates/mission-3-atomic-commit-idempotency-budgets-provenance.md`
- `tasks/sprint-15-mission-engine-durable-resumable-templates/mission-4-cli-http-control-surface-test-templates.md`
- `tasks/sprint-15-mission-engine-durable-resumable-templates/mission-5-red-tests-real-service-failure-controls.md`
- `tasks/sprint-15-mission-engine-durable-resumable-templates/mission-6-real-gate-adversarial-review-closure.md`

#### Dependencies

- Blocks: Sprint 17, Sprint 22, Sprint 23, Sprint 25
- Dependent on: Sprint 04, Sprint 05, Sprint 08, Sprint 11, Sprint 12
- Execution order: mission-5 RED → mission-1 → mission-2 → mission-3 → mission-4 → mission-6 review/closure

#### PRD Coverage

- UC-SVC-01
- T-SVC-001, T-SVC-002, T-SVC-003, T-SVC-004

#### Capability Coverage

- N/A — the engine is the substrate every pipeline/mission chain runs on; individual chains own their segments in later sprints.

---

### Sprint 16: Public /article/ Endpoint on Hono

**Sequence:** 16
**Timeline:** Phase 3 — Migration Engine and Services
**Status:** 🔵 Planned
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-16`)
**Branch:** `mk6-public-article`
**PR:** —

#### Human Testing Gate

**Gate:** Opening a real `/article/{shareToken}` link against the running Hono service returns byte-comparable HTML to the ported converter's Convex-era output, while a non-public or unshared token returns 404.

**Test Steps:**
1. `curl https://mini/article/<realToken>` — returns HTML byte-comparable to the Convex-era render on a sample.
2. Run `holo article:compat <token>` — the path + token shape are compatible with the pre-migration URL, so existing links survive.
3. `curl /article/<token>/assets/<fileObjectId>` — the linked asset loads only through the article-scoped route.
4. Unshare the document, then `curl /article/<token>` — returns 404 (a non-public doc never renders).
5. `curl /article/<token>/assets/<id>` after revocation — returns 404.
6. `curl /article/<privateToken>` for a never-public doc — returns 404.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| article-1 | Port markdown→HTML converter verbatim + Hono /article/:shareToken (WHERE share_token AND is_public) | mastra-implementer | 180 min |
| article-2 | Article-scoped asset capability route (revoked/unshared → 404) | mastra-implementer | 150 min |
| article-3 | RED tests: byte-compare fixture, non-public/revoked/private → 404 | red-test-generator | 120 min |
| article-4 | Review the one public door (+ security-reviewer lens) | mastra-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 24
- Dependent on: Sprint 04, Sprint 14

#### PRD Coverage

- UC-SVC-04 (AC-3), T-SVC-015

#### Capability Coverage

- CAP-PUB-01: the sole public egress — byte-compatible `/article/{shareToken}` + article-scoped asset route

---

### Sprint 17: Deterministic pi-free Research Engine

**Sequence:** 17
**Timeline:** Phase 3 — Migration Engine and Services
**Status:** 🔵 Planned
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-17`)
**Branch:** `mk6-research-engine`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo mission run research --goal '…'` against real Postgres+fleet does NOT terminate on a seeded high-confidence-thin-evidence case, terminating only when the pure-TS evidence gate's admitted claims cover the required components at grade-floor.

**Test Steps:**
1. Run `holo mission run research --goal 'X'` with a high-confidence-thin-evidence fixture — the mission does NOT terminate.
2. Add graded, independent, entailed evidence covering the required components — the mission terminates on the evidence gate.
3. Run `holo gate:eval --claims fixture` — admission is pure-TS (no model call) with a deterministic result.
4. Run `holo research:inspect <id>` — ASSAY and CHALLENGE ran on distinct model instances in the same cycle.
5. Run `holo gate:eval --refuting fixture` — refuting claims pass the identical admission gate as supporting ones.
6. Run `holo research:trace <id> --processes` — only fleet + tool calls; zero pi/external-harness dependency.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| research-1 | Pure-TS Evidence Gate (grading, provenance independence, entailment, disconfirmation scoring) | mastra-implementer | 300 min |
| research-2 | Research mission template — PLAN→RETRIEVE→EXTRACT→GATE→CHALLENGE→COMMIT with ASSAY≠CHALLENGE | mastra-implementer | 300 min |
| research-3 | RED tests: thin-evidence NOT terminate, pure-TS admission, ASSAY≠CHALLENGE, refuting-same-gate, zero-pi | red-test-generator | 210 min |
| research-4 | Review determinism seam | mastra-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 22, Sprint 23
- Dependent on: Sprint 07, Sprint 08, Sprint 09, Sprint 10, Sprint 15

#### PRD Coverage

- UC-INFER-02
- T-INFER-004, T-INFER-005, T-INFER-006, T-INFER-007

#### Capability Coverage

- CAP-INF-01: deterministic evidence-gated research on the fleet with ASSAY≠CHALLENGE instances (a fulcrum seam)

---

### Sprint 18: Chat Redesign — Native Tool Loop and Resumable SSE

**Sequence:** 18
**Timeline:** Phase 3 — Migration Engine and Services
**Status:** 🔵 Planned
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-18`)
**Branch:** `mk6-chat`
**PR:** —

#### Human Testing Gate

**Gate:** Sending `POST /api/chat-runs` with a requestId and consuming its SSE stream returns a sequenced token response from a specialist running on the fleet, and replaying the same requestId returns the identical immutable runId and its monotonic persisted event sequence.

**Test Steps:**
1. `curl -X POST /api/chat-runs -d '{requestId,msg}'` — returns a runId and durable-message id.
2. Consume `GET /api/chat-runs/:id/events` — sequenced SSE tokens stream from a fleet specialist.
3. Replay the same requestId — returns the identical runId and one monotonic event sequence (idempotent).
4. Reconnect with `Last-Event-ID` after a delta — replays only unobserved events; duplicates suppressed; final text once.
5. Run `holo chat:trace <id>` — the agentic tool loop is bounded by maxSteps/budget with no `runAfter`/23-switch.
6. Trip a processor/tripwire — emits a typed terminal `blocked` SSE event; no unsafe persist or tool dispatch.
7. Run `holo chat:route <id>` — triage on `divergent`, the specialist on its bound role, least-privilege tool grants.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| chat-1 | Chat run model — idempotent POST /api/chat-runs + monotonic persisted event sequence | mastra-implementer | 240 min |
| chat-2 | Resumable SSE (Last-Event-ID, gap-fill then Zero reconciliation, durable message authoritative) | mastra-implementer | 240 min |
| chat-3 | Native in-SDK agentic tool loop + triage→10 specialists routing with least-privilege grants | mastra-implementer | 300 min |
| chat-4 | RED tests: idempotent runId+sequence, Last-Event-ID replay-once, native-loop, blocked-no-unsafe-commit | red-test-generator | 210 min |
| chat-5 | Review chat SSE + tool-loop safety | mastra-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 20, Sprint 21, Sprint 25
- Dependent on: Sprint 04, Sprint 05, Sprint 08

#### PRD Coverage

- UC-SVC-03
- T-SVC-009, T-SVC-010, T-SVC-011, T-SVC-012, T-SVC-022

#### Capability Coverage

- CAP-INF-01: role-routed chat specialists (triage on divergent, least-privilege tool grants, tripwire outcomes)

---

### Sprint 19: MCP Gateway Rehost — 44 Tools on Postgres

**Sequence:** 19
**Timeline:** Phase 3 — Migration Engine and Services
**Status:** 🔵 Planned
**Proposed by:** mcp-planner
**Milestone:** — (`sprint-19`)
**Branch:** `mk6-mcp-rehost`
**PR:** —

#### Human Testing Gate

**Gate:** An Agent Client invoking all 44 MCP tools over stdio against a seeded Postgres receives manifest-matching results with zero Convex calls.

**Test Steps:**
1. Invoke all 44 tools over stdio on seeded Postgres — each result matches its manifest fixture.
2. Call `hybrid_search` for a seeded doc — returns the expected top-ranked Postgres passage.
3. Invoke the 44 tools over the Streamable HTTP `/mcp` mount — registrations equal manifest IDs.
4. Send a foreign-Origin request to `/mcp` — returns 403; an unkeyed request returns 401.
5. Cancel an in-flight `shop_products` HTTP call — mount honors cancellation, issues no server sampling.
6. Replay `add_subscription` with one idempotency key — no duplicate row, stored result returned.
7. Run `holo mcp:verify-rehost` — exits 0 reporting zero `convex/browser` imports, dup Zod layer gone.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| mcp-rehost-01 | Rehome the MCP entrypoint config off Convex env onto the consolidated source | mcp-implementer | 60 min |
| mcp-rehost-02 | In-process Mastra tool-registry binding replacing the Convex client seam | mcp-implementer | 120 min |
| mcp-rehost-03 | Rewire read-only tools to in-process Postgres queries with ordering/pagination parity | mastra-implementer | 180 min |
| mcp-rehost-04 | Rewire mutation/side-effecting tools to Postgres with idempotency/replay parity | mastra-implementer | 210 min |
| mcp-rehost-05 | Delete Convex client, duplicate Zod layer, streaming layer; wire `holo mcp:verify-rehost` | mcp-implementer | 120 min |
| mcp-rehost-06 | Add and harden the Streamable HTTP `/mcp` transport (MCP 2025-11-25, stateless) beside stdio | mcp-implementer | 150 min |
| mcp-rehost-07 | Generate both-transport parity + mutation-replay contract tests against seeded Postgres | red-test-generator | 180 min |
| mcp-rehost-08 | Review MCP protocol compliance, both-transport policy, zero-Convex parity | mcp-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 29
- Dependent on: Sprint 03, Sprint 04, Sprint 05

#### PRD Coverage

- UC-SVC-04 (AC-1, AC-2, AC-4)
- T-SVC-013, T-SVC-014, T-SVC-016, T-SYNC-011, T-PLAT-017

#### Capability Coverage

- CAP-CUT-01: the "all 44 MCP tools" cutover boundary served entirely from Postgres over both transports

---

### Sprint 20: E2E Maestro Harness and Cold-Boot Reference Flow

**Sequence:** 20
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** 🔵 Planned
**Proposed by:** react-native-ui-planner + devops-engineer
**Milestone:** — (`sprint-20`)
**Branch:** `mk6-reference-flow`
**PR:** —

> **The proven-reference-flow gate.** Per the E2E Harness Constitution, the deep feature/client build (Sprints 22–26) and the cutover (Sprint 29) do not proceed until this thin cold-boot vertical is green on the real Maestro harness. It merges the RN journey/thin-chat half (react-native-ui-planner) with the Maestro runner/CI/go-no-go half (devops-engineer).

#### Human Testing Gate

**Gate:** An operator running the Maestro reference flow on a named iOS Simulator gets a cold-boot chat message that round-trips through the fleet to Postgres, syncs back via Zero, with a passing JUnit result plus screenshot/video artifacts.

**Test Steps:**
1. Run the Maestro reference flow on the named iOS Simulator — cold boot completes, app opens.
2. Send a chat message in the flow — specialist runs on the fleet, tool call hits Postgres.
3. Observe the reply — durable message syncs to the app via Zero, screenshot captures it.
4. Check CI artifacts — JUnit result, log, video all attached to the e2e run.
5. Point the runner at a missing Expo dev build — harness fails closed, not a false pass.
6. Run `holo namespace reset` before the flow — nonprod Postgres/Zero namespace reaches known seed.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-COLDBOOT-01 | Swap ConvexProvider for the Zero provider in app/_layout.tsx; boot without CONVEX_URL | react-native-ui-implementer | 120 min |
| S-COLDBOOT-02 | Thin chat vertical: send via Hono command, read durable message via Zero | react-native-ui-implementer | 210 min |
| S-COLDBOOT-03 | Maestro cold-boot journey + testID audit + deterministic seed content | red-test-generator | 240 min |
| D03-01 | RED: Maestro harness fails closed without simulator/build/backend | red-test-generator | 60 min |
| D03-02 | Provision self-hosted macOS runner: named iOS Simulator + Expo dev build pipeline | devops-engineer | 180 min |
| D03-03 | Build Maestro runner harness (boot, install, execute, capture artifacts) | devops-engineer | 180 min |
| D03-04 | Extend deterministic seed/reset to the Zero-synced namespace | devops-engineer | 90 min |
| D03-05 | Implement e2e GitHub Actions workflow for the Maestro lane | ghactions-implementer | 120 min |
| D03-06 | Review e2e workflow + macOS runner trust boundary | ghactions-reviewer | 60 min |
| D03-07 | Prove the cold-boot reference flow green on the harness (go/no-go capstone) | devops-engineer | 90 min |

#### Dependencies

- Blocks: Sprint 24, Sprint 25, Sprint 26, Sprint 29 (the go/no-go before the deep client build + cutover)
- Dependent on: Sprint 04, Sprint 06, Sprint 13, Sprint 18

#### PRD Coverage

- UC-SYNC-01, UC-SYNC-02
- T-PLAT-019, T-SYNC-001, T-SYNC-003

#### Capability Coverage

- CAP-SYNC-01: the cold-boot proof that a committed Postgres write reaches the RN client via Zero
- CAP-CUT-01: the thin client-flip vertical (provider swap, boot without `EXPO_PUBLIC_CONVEX_URL`)

---

### Sprint 21: Client Data Contract

**Sequence:** 21
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** 🔵 Planned
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-21`)
**Branch:** `mk6-client-contract`
**PR:** —

> Leading migration-contract artifact for the SYNC client. Its `--targets` verification requires the live `zero_pub` schema + Hono command surface, so it lands after those surfaces exist and gates the full app rewrite (Sprint 24).

#### Human Testing Gate

**Gate:** Running `holo verify:client-contract` against the 47-file legacy call-site inventory reports all 105 call sites mapped to a live Zero query, Zero mutator, or Hono command target with zero unmapped surfaces.

**Test Steps:**
1. Run `holo inventory:convex-callsites` — enumerates 47 files and 105 `convex/react` call sites.
2. Run `holo verify:client-contract` — exits 0 reporting 105/105 call sites mapped.
3. Delete one mapping from `13-client-data-contract.yaml`, re-run — exits non-zero naming the orphaned call site.
4. Run `holo verify:client-contract --targets` — every target resolves in the live `zero_pub` schema or Hono manifest.
5. Run `holo verify:client-contract --schema` — every entry declares offline, optimistic, conflict, rejection, identifier fields.
6. Run `holo verify:client-contract --e2e-links` — every entry links a T-SYNC-* criterion, exits 0.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-CONTRACT-01 | Inventory every legacy Convex hook/action call site in the RN app | react-native-ui-implementer | 120 min |
| S-CONTRACT-02 | Author 13-client-data-contract.yaml mapping every call site to its target | react-native-ui-implementer | 300 min |
| S-CONTRACT-03 | CI contract-inventory gate: `holo verify:client-contract` | red-test-generator | 120 min |

#### Dependencies

- Blocks: Sprint 24
- Dependent on: Sprint 04, Sprint 05, Sprint 18

#### PRD Coverage

- UC-SYNC-01
- T-SYNC-019, T-SYNC-004

#### Capability Coverage

- CAP-SYNC-01: the approved per-call-site mapping to Zero queries/mutators/Hono commands (offline/conflict/identifier contract)
- CAP-CUT-01: the client-flip inventory that must be zero-unmapped before the rewrite

---

### Sprint 22: All Agentic Pipelines as Templates/Agents

**Sequence:** 22
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** 🔵 Planned
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-22`)
**Branch:** `mk6-pipelines`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo mission run <pipeline>` for each of research/whatsNew/assimilate/shop/subscriptions against real Postgres+fleet produces that pipeline's former output shape from a shared template, with no per-domain copy-pasted module remaining.

**Test Steps:**
1. Run `holo mission run whatsNew` — produces the former daily-briefing document shape on real Postgres.
2. Run `holo mission run assimilate --target <repo>` and `holo mission run shop --query X` — each yields its former output.
3. Run `holo mission run report --kind revenue-validation` (and competitive/ai-roi/flights) — one template covers all four, reasoning on the fleet.
4. Run `holo verify:no-shells` — reports the per-domain copy-pasted pipeline modules are gone.
5. Run a standing subscriptions mission — it invokes the shared research template as a sub-workflow and publishes a document.
6. Run `holo infer:trace <id>` on a business report — reasoning ran server-side on the fleet (no client-side Claude skill).

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| pipes-1 | Shared evidence-research core template (research/deepResearch/subscriptions-research/fulcrum share it) | mastra-implementer | 240 min |
| pipes-2 | One parameterized business-report template (4 kinds), reasoning on the fleet | mastra-implementer | 240 min |
| pipes-3 | whatsNew/assimilate/shop/subscriptions as templates/agents + standing sub-workflow publish | mastra-implementer | 300 min |
| pipes-4 | RED tests: each pipeline former-output, one-report-4-kinds, no-shells, sub-workflow-publish | red-test-generator | 210 min |
| pipes-5 | Review DRY collapse | mastra-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 29
- Dependent on: Sprint 08, Sprint 09, Sprint 10, Sprint 12, Sprint 15, Sprint 17

#### PRD Coverage

- UC-SVC-02
- T-SVC-005, T-SVC-006, T-SVC-007, T-SVC-008

#### Capability Coverage

- N/A — pipelines compose CAP-INF-01 (fleet reasoning) and CAP-EMB-01 (retrieval); the standing-mission publish path is a fulcrum seam owned in Sprint 23.

---

### Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams

**Sequence:** 23
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** 🔵 Planned
**Proposed by:** mastra-planner
**Milestone:** — (`sprint-23`)
**Branch:** `mk6-human-gate`
**PR:** —

#### Human Testing Gate

**Gate:** Against the real append-only ledger, `POST /api/missions/:id/verdicts` deterministically rejects an uncited kill, refuses a second concurrent build (WIP=1), and refuses `advance→validated` without a recorded probe — enforced in Postgres-writing handlers, not by model choice.

**Test Steps:**
1. `POST /api/missions/:id/verdicts {kill, no-citation}` — rejected deterministically by the handler.
2. Start a second concurrent build on the same subject — refused (WIP=1).
3. `POST verdicts {advance→validated}` with no recorded probe — refused; add a probe — accepted.
4. `POST /api/missions/:id/steer` mid-run — the steering row takes effect on the following cycle without a restart.
5. Run `holo mission:cycle <id>` — the CHALLENGE instance differs from ASSAY; refuting claims pass the identical admission gate.
6. Run `holo fulcrum:authorable-check` — a fulcrum template compiles against contract+ledger+gate+role-bindings+publish seams with zero new platform code.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| gate-1 | Deterministic human-gate handlers — verdicts, WIP=1, cited-kill, probe-gated advance | mastra-implementer | 240 min |
| gate-2 | Mid-run steering + ASSAY≠CHALLENGE enforcement within a cycle | mastra-implementer | 210 min |
| gate-3 | Fulcrum-seams capstone — assert seams suffice to author fulcrum with no new platform code | mastra-implementer | 180 min |
| gate-4 | RED tests: uncited-kill rejected, WIP=1, unprobed-advance refused, steering-next-cycle, ASSAY≠CHALLENGE | red-test-generator | 180 min |
| gate-5 | Review seam sufficiency | mastra-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 29
- Dependent on: Sprint 07, Sprint 08, Sprint 15, Sprint 17

#### PRD Coverage

- UC-SVC-05
- T-SVC-017, T-SVC-018, T-SVC-019, T-SVC-020

#### Capability Coverage

- CAP-INF-01: ASSAY≠CHALLENGE distinct-instance enforcement + refuting-claim admission parity (the fulcrum-seam capstone)

---

### Sprint 24: Full RN App Rewrite off Convex onto Zero

**Sequence:** 24
**Timeline:** Phase 5 — Client Rewrite
**Status:** 🔵 Planned
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-24`)
**Branch:** `mk6-app-rewrite`
**PR:** —

#### Human Testing Gate

**Gate:** Opening the rewritten app against a seeded Postgres shows the 3 seeded conversations loading via Zero with no Convex client hook remaining on the path.

**Test Steps:**
1. Run `holo seed:e2e --reset` — seeds 3 conversations, 12 documents, 5 feed items.
2. Cold-boot the app — the drawer chat list shows the 3 seeded conversations via Zero.
3. Open Articles — the 12 seeded documents load via Zero grouped by category.
4. Open the What's New feed — the 5 seeded feed items appear via Zero.
5. Rename a conversation from the drawer — the new title reflects within the 5s SLO via Zero.
6. Run `holo verify:no-convex-client` — exits 0 with zero convex/react hooks in app/components/hooks/screens.
7. Share a seeded public document — the URL points at the Mastra `/article/` host, not `.convex.site`.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-REWRITE-01 | Rewire Chat + conversations cluster to Zero/Hono | react-native-ui-implementer | 300 min |
| S-REWRITE-02 | Rewire Documents + articles + narration cluster; re-point share URL | react-native-ui-implementer | 360 min |
| S-REWRITE-03 | Rewire Subscriptions + feed + whats-new + settings cluster to Zero | react-native-ui-implementer | 300 min |
| S-REWRITE-04 | Rewire Research + assimilate + improvements + toolbelt + notifications cluster | react-native-ui-implementer | 300 min |
| S-REWRITE-05 | `holo verify:no-convex-client` gate (grep-verified, wired to CI) | red-test-generator | 90 min |
| S-REWRITE-06 | Reviewer pass: theme/a11y/contract compliance across rewired surfaces | react-native-ui-reviewer | 150 min |

#### Dependencies

- Blocks: Sprint 25, Sprint 26, Sprint 29
- Dependent on: Sprint 04, Sprint 16, Sprint 20, Sprint 21

#### PRD Coverage

- UC-SYNC-01
- T-SYNC-001, T-SYNC-002, T-SYNC-004, T-SYNC-019

#### Capability Coverage

- CAP-SYNC-01: every app read/write off Convex hooks onto Zero queries/mutators/Hono commands
- CAP-CUT-01: the client half of the flip (no `convex/react` remaining)
- CAP-PUB-01: the share-URL builder re-pointed to the Mastra `/article/` host

---

### Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded

**Sequence:** 25
**Timeline:** Phase 5 — Client Rewrite
**Status:** 🔵 Planned
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-25`)
**Branch:** `mk6-reactive-surfaces`
**PR:** —

#### Human Testing Gate

**Gate:** After disconnecting mid-stream and reconnecting, a streamed chat reply reconciles to exactly one final assistant message matching its Zero-synced row with no duplicated tokens.

**Test Steps:**
1. Run `holo seed:e2e --reset` — seeds the 'Streaming' conversation.
2. Send 'Summarize the seeded doc' — the assistant reply streams token-by-token.
3. Toggle airplane mode mid-stream for 3s then restore — the stream resumes without duplicated tokens.
4. Wait for completion — the thread shows exactly one final assistant message matching the Zero row.
5. Start a research mission — the progress bar advances live as the workflow reaches iteration 3/5.
6. Update a seeded doc via the MCP gateway — the app reflects the new title within 5s via Zero.
7. Stop the local fleet then send a message — chat shows 'local fleet unavailable', not a spinner hang.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-REACTIVE-01 | Resumable SSE chat streaming client with exactly-once durable reconciliation | react-native-ui-implementer | 360 min |
| S-REACTIVE-02 | Live mission/research progress via Zero-synced Postgres rows | react-native-ui-implementer | 150 min |
| S-REACTIVE-03 | Cross-surface p95 journey: MCP doc update reflects on app within 5s | red-test-generator | 150 min |
| S-REACTIVE-04 | Degraded 'local fleet unavailable' state in chat (no hang) | react-native-ui-implementer | 120 min |
| S-REACTIVE-05 | Reviewer pass: streaming/reconciliation/degraded correctness + a11y | react-native-ui-reviewer | 120 min |

#### Dependencies

- Blocks: Sprint 29
- Dependent on: Sprint 08, Sprint 15, Sprint 18, Sprint 24

#### PRD Coverage

- UC-SYNC-02
- T-SYNC-005, T-SYNC-006, T-SYNC-007, T-INFER-015

#### Capability Coverage

- CAP-SYNC-01: resumable SSE + Zero-durable reconciliation, live mission progress, p95 ≤ 5s cross-surface propagation

---

### Sprint 26: Image and Voice Upload Lifecycle Client

**Sequence:** 26
**Timeline:** Phase 5 — Client Rewrite
**Status:** 🔵 Planned
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-26`)
**Branch:** `mk6-uploads`
**PR:** —

#### Human Testing Gate

**Gate:** Uploading the seeded `test-fixture.jpg` through the improvements sheet against real Hono and blob storage produces exactly one `file_objects` row whose SHA-256 matches the fixture with zero orphan rows.

**Test Steps:**
1. Run `holo seed:e2e --reset` — clears `file_objects` in the nonproduction namespace.
2. Open the improvements sheet and attach the seeded `test-fixture.jpg` — the preview thumbnail appears.
3. Submit the report — upload-init, PUT, finalize complete and the sheet shows success.
4. Run `holo verify:blob --last` — exactly one `file_objects` row with SHA-256 matching the fixture.
5. Re-submit the identical image — the attach is idempotent, still one `file_objects` row.
6. Start then cancel a voice recording — `holo verify:blob --orphans` reports zero orphan rows.
7. Run the Maestro `upload.yaml` journey — passes and emits artifacts.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-UPLOAD-01 | Image upload lifecycle client (improvements) on content-addressed Hono | react-native-ui-implementer | 180 min |
| S-UPLOAD-02 | Voice audio upload + imperative dispatcher rewire off Convex | react-native-ui-implementer | 360 min |
| S-UPLOAD-03 | Maestro upload journey + blob verification helper | red-test-generator | 150 min |
| S-UPLOAD-04 | Reviewer pass: upload idempotency, orphan-safety, no-convex-final | react-native-ui-reviewer | 90 min |

#### Dependencies

- Blocks: Sprint 29
- Dependent on: Sprint 14, Sprint 24

#### PRD Coverage

- T-DATA-021, UC-SYNC-01

#### Capability Coverage

- CAP-SYNC-01: authoritative image/voice upload via the Hono content-addressed lifecycle (hash-verified, idempotent, orphan-safe)
- CAP-CUT-01: removes the last `convex/react` client dependency (voice session dispatcher)

---

### Sprint 27: Standing Off-Mini Backup Pipeline and Alerting

**Sequence:** 27
**Timeline:** Phase 6 — Standing Backup and Disaster Recovery
**Status:** 🔵 Planned
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-27`)
**Branch:** `mk6-backup`
**PR:** —

> Standing platform capability (CAP-BAK-01) that runs in parallel with feature work and **outlasts** the migration — it is not a cutover-only safety net. It gates the final decommission (Sprint 31), not the feature build.

#### Human Testing Gate

**Gate:** An operator who induces a backup-job failure gets an alert firing within 15 minutes, with zero dashboard-polling required.

**Test Steps:**
1. Run a live Postgres write burst — WAL archives to R2 continuously, zero continuity gaps.
2. Run the scheduled base-backup job — full backup lands in the R2 bucket, verified by manifest.
3. Run the restic blob-mirror job — every local/remote object SHA-256 matches.
4. Kill the backup job mid-archive — alert fires within 15 minutes, no dashboard-polling needed.
5. Let the bucket credential expire in a test fixture — alert fires, not a silent failure.
6. Remove the backup config entirely — the alert still fires as overdue, never a false-healthy state.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D04-01 | RED: induced backup failure must alert, healthy run must stay silent | red-test-generator | 75 min |
| D04-02 | Provision encrypted R2 bucket + scoped credentials + pgBackRest repo config | devops-engineer | 120 min |
| D04-03 | Configure continuous WAL archiving + scheduled base backups | devops-engineer | 150 min |
| D04-04 | Configure scheduled restic blob mirror with SHA-256 parity | devops-engineer | 120 min |
| D04-05 | Backup failure/overdue alerting (webhook/push, no dashboard-polling) | devops-engineer | 120 min |
| D04-06 | Security review: R2 bucket credentials + encryption | security-reviewer | 75 min |

#### Dependencies

- Blocks: Sprint 28, Sprint 31
- Dependent on: Sprint 04, Sprint 06

#### PRD Coverage

- UC-PLAT-06
- T-PLAT-021, T-PLAT-023, T-PLAT-024

#### Capability Coverage

- CAP-BAK-01: continuous off-mini WAL archiving + base backups (pgBackRest→R2) + blob mirror (restic) + failure/overdue alerting

---

### Sprint 28: Point-in-Time Restore and Fresh-Hardware Fire Drill

**Sequence:** 28
**Timeline:** Phase 6 — Standing Backup and Disaster Recovery
**Status:** 🔵 Planned
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-28`)
**Branch:** `mk6-restore-drill`
**PR:** —

#### Human Testing Gate

**Gate:** An operator restoring Postgres/blob storage from the R2 bucket alone onto a freshly provisioned machine gets a queryable database whose row counts plus evidence-ledger chain match the pre-failure snapshot, with zero access to the original mini.

**Test Steps:**
1. Run `holo restore --pitr <timestamp>` against a scratch DB — restores to the named point exactly.
2. Provision a fresh VM with zero mini access — restore Postgres from R2 alone, DB queryable.
3. Compare row counts pre/post-restore — exact match against the pre-failure snapshot.
4. Compare the evidence-ledger chain pre/post-restore — as-of chain matches exactly.
5. Restore blob storage on the fresh VM — every object SHA-256 matches the source.
6. Point the restore at an empty/corrupted backup chain — restore fails closed, no fake success.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D05-01 | RED: restore fails closed on empty/corrupted backup chain | red-test-generator | 60 min |
| D05-02 | `holo restore --pitr <timestamp>` operator command | devops-engineer | 150 min |
| D05-03 | Provision a genuinely fresh restore target (zero access to the original mini) | devops-engineer | 120 min |
| D05-04 | Run the full fire-drill restore (Postgres + blob) end-to-end | devops-engineer | 150 min |
| D05-05 | Schedule the fire drill as a periodic mission + author the runbook | devops-engineer | 90 min |
| D05-06 | Security review: fresh-restore-target trust boundary | security-reviewer | 60 min |

#### Dependencies

- Blocks: Sprint 31
- Dependent on: Sprint 27

#### PRD Coverage

- T-PLAT-022, T-PLAT-025

#### Capability Coverage

- CAP-BAK-01: PITR + fresh-hardware fire-drill restore from the remote bucket alone (row-count + ledger-chain + blob parity), scheduled monthly

---

### Sprint 29: Cutover — Write Freeze, ETL and Read-Only Soak Flip

**Sequence:** 29
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** 🔵 Planned
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-29`)
**Branch:** `mk6-cutover`
**PR:** —

> Strictly last-phase. Depends on **every** DATA/SVC/INFER feature sprint plus the full SYNC client rewrite being complete, and on both harness sprints (13, 20) for the pre-cutover go/no-go.

#### Human Testing Gate

**Gate:** An operator executing the freeze-drain-ETL sequence gets the app plus all 44 MCP tools serving reads from Postgres, with every production write path returning `migration_read_only`.

**Test Steps:**
1. Run the full harness suite against the new stack — green, while Convex still serves production.
2. Trigger the write fence — Convex mutations/actions/uploads/webhooks all reject with a fenced error.
3. Drain crons and queues, observe the quiet interval — zero in-flight writes remain.
4. Run the one-time ETL — reconciliation report shows zero unexplained variance.
5. Flip app plus MCP to the new backend — reads pass, all 44 tools pass, `/article/` byte-matches.
6. Attempt a write on any surface during soak — every path returns `migration_read_only`.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D06-01 | RED: every write path returns migration_read_only during soak | red-test-generator | 90 min |
| D06-02 | Pre-cutover go/no-go: full harness suite green against the new stack | devops-engineer | 90 min |
| D06-03 | Durable write-fence + cron/queue drain + quiet interval | devops-engineer | 150 min |
| D06-04 | Capture export watermark + orchestrate the one-time ETL run | devops-engineer | 120 min |
| D06-05 | Flip app plus MCP into rollbackable read-only soak, run verification gates | devops-engineer | 150 min |

#### Dependencies

- Blocks: Sprint 30
- Dependent on: Sprint 06, Sprint 13, Sprint 14, Sprint 19, Sprint 20, Sprint 22, Sprint 23, Sprint 24, Sprint 25, Sprint 26

#### PRD Coverage

- UC-SYNC-03
- T-SYNC-008, T-SYNC-009, T-SYNC-010

#### Capability Coverage

- CAP-CUT-01: freeze → drain → flip → read-only soak with every write path returning `migration_read_only`
- CAP-MIG-01: the operator-orchestrated one-time ETL run + reconciliation gate

---

### Sprint 30: Cutover Rollback Drill and Data-Plane Point of No Return

**Sequence:** 30
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** 🔵 Planned
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-30`)
**Branch:** `mk6-rollback`
**PR:** —

#### Human Testing Gate

**Gate:** An operator triggering rollback during the read-only soak gets the data plane re-pointed to frozen Convex, with zero accepted post-export production writes lost.

**Test Steps:**
1. Trigger a seeded Sev-1 gate failure during soak — rollback re-points config to frozen Convex.
2. Count accepted post-export production writes after rollback — exactly zero lost.
3. Confirm the pinned Convex-pointing app build still boots — fallback path works end-to-end.
4. Enable the first Postgres production write — event logs immutably as the data-plane PONR.
5. Attempt a config rollback after the PONR write — rejected, rollback path is closed.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D07-01 | RED: rollback recovers zero-loss, PONR write closes rollback path | red-test-generator | 75 min |
| D07-02 | Keep Convex live + pin the Convex-pointing fallback app build through soak | devops-engineer | 90 min |
| D07-03 | Run the rollback drill — Sev-1 trigger, config re-point, zero-loss verification | devops-engineer | 120 min |
| D07-04 | Record the data-plane point of no return (first accepted Postgres write) | devops-engineer | 90 min |
| D07-05 | Security review: rollback config switch + PONR immutability | security-reviewer | 60 min |

#### Dependencies

- Blocks: Sprint 31
- Dependent on: Sprint 29

#### PRD Coverage

- UC-SYNC-04
- T-SYNC-012, T-SYNC-013, T-SYNC-014

#### Capability Coverage

- CAP-CUT-01: config-reversible rollback during read-only soak + the immutable data-plane point-of-no-return record

---

### Sprint 31: Convex Decommission — Code, Deps and Cloud Deletion

**Sequence:** 31
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** 🔵 Planned
**Proposed by:** devops-engineer + integrator
**Milestone:** — (`sprint-31`)
**Branch:** `mk6-decommission`
**PR:** —

#### Human Testing Gate

**Gate:** An operator deleting the Convex cloud deployment after a fresh restore drill gets zero Convex surface reachable, with the decommission verify command reporting zero Convex references across app/MCP source.

**Test Steps:**
1. Run `holo verify:no-convex` over app/components/hooks/screens/lib/holocron-mcp/src and both package.json — zero hits.
2. Build the app, start the MCP server — both succeed with Convex/Cohere deps removed.
3. Check `python/` and `cli/` — both deleted; `ratatui-playground/` archived out of the repo.
4. Re-run the fresh-hardware fire-drill restore — passes as the final pre-deletion gate.
5. Delete the Convex cloud deployment — confirm zero Convex surface reachable afterward.

#### Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D08-01 | RED: grep-clean + build-without-Convex-deps is the acceptance oracle | red-test-generator | 60 min |
| D08-02 | Remove Convex code/deps, delete dead clients, archive ratatui-playground | integrator | 180 min |
| D08-03 | Re-run the fresh-hardware fire-drill restore as the final pre-deletion gate | devops-engineer | 90 min |
| D08-04 | Author the decommission runbook (ordered, gated checklist) | devops-engineer | 60 min |
| D08-05 | Delete the Convex cloud deployment (Operator-executed, irreversible) | devops-engineer | 45 min |

#### Dependencies

- Blocks: None (final sprint — migration complete; fulcrum re-plans onto this platform next)
- Dependent on: Sprint 28, Sprint 30

#### PRD Coverage

- UC-SYNC-05
- T-SYNC-015, T-SYNC-016, T-SYNC-017, T-SYNC-018

#### Capability Coverage

- CAP-CUT-01: irreversible source-destruction (code + deps + cloud deployment) after recovery proof
- CAP-BAK-01: the final pre-deletion fresh restore drill re-run against post-PONR data

---

## Consolidation Notes

- **Provenance.** Every sprint carries `**Proposed by:**` naming its dispatching specialist(s). This roadmap was consolidated — not authored — by the orchestrator from the four dispatched planners (`mastra-planner`, `mcp-planner`, `react-native-ui-planner`, `devops-engineer`).
- **One merge.** rn's cold-boot reference-flow and devops's Maestro e2e runner describe the same milestone from two sides; they are merged into **Sprint 20** (react-native-ui-planner + devops-engineer). All other specialist sprint boundaries are preserved (each is a single un-fakeable outcome; merging further would create compound gates).
- **Leading INFRA.** Sprints 1–3 (runtime lock + source-catalog + MCP manifest) and 13/20 (real-service harness + reference flow) are the leading INFRA that gates feature closure per the E2E Harness Constitution. The client-data-contract (Sprint 21) is the SYNC-side leading artifact; it lands after the live Zero/Hono surfaces so its `--targets` check is real.
- **Capability chains.** All 7 chains trace to sprint tasks with owners + proof gates: CAP-MIG-01 (2, 14, 29) · CAP-CUT-01 (19, 20, 24, 26, 29, 30, 31) · CAP-EMB-01 (6, 10, 14) · CAP-INF-01 (1, 5, 8, 9, 12, 17, 18, 23) · CAP-SYNC-01 (4, 20, 21, 24, 25, 26) · CAP-BAK-01 (27, 28, 31) · CAP-PUB-01 (16, 24).
- **Test-step normalization.** Sprint 31's decommission gate/step 1 is rendered as the operator wrapper command (`holo verify:no-convex`) the sprint's own tasks build, rather than a raw `grep` invocation, matching the wrapper convention used across the roadmap and the TEST-STEPS field guide.
