---
sequence: 29
timeline: Phase 7 — Cutover and Decommission
status: In Progress
planned_from_roadmap_sha: 7d4a01d8dd1ab646c021f97e45df3ad1a5ea4a50a1d651a52f6cdb0c7dffa402
planned_from_source_sha: c787337843cc4f0066795a6a28b28cffd01dd253
source_kind: git-head
planned_at: 2026-08-01T00:26:19Z
capability_coverage: [CAP-CUT-01, CAP-MIG-01]
---

# Sprint 29: Cutover — Write Freeze, ETL and Read-Only Soak Flip

**Sequence:** 29
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** In Progress
> Progress: 1/5 tasks completed · updated 2026-08-01T22:59:57Z
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-29`)
**Branch:** `mk6-cutover`
**PR:** —

> Strictly last-phase. Depends on **every** DATA/SVC/INFER feature sprint plus the full SYNC client rewrite being complete, and on both harness sprints (13, 20) for the pre-cutover go/no-go.

## Overview

Sprint 29 is **the cutover** — the one irreversible-in-practice sequence where production stops being served by Convex and starts being served by Postgres + Mastra. It implements **UC-SYNC-03 (Big-bang cutover)** as the ordered chain the PRD specifies: *parallel-build → freeze → drain → ETL → flip → verify → read-only soak*, with a rollback path preserved throughout the soak (UC-SYNC-04 owns the rollback drill itself in Sprint 30).

**What the PRD requires of this sprint** (`08-uc-sync.md` §UC-SYNC-03, AC-1 through AC-4):
1. Stand up and validate the entire new stack (Postgres + Mastra + Zero + fleet) against a real integration suite **while Convex still serves production untouched** — the go/no-go (`T-SYNC-008`).
2. Durably fence Convex mutations/actions/uploads/webhooks, disable and drain all scheduled work, observe a declared quiet interval, capture an export watermark plus final-write audit, run the one-time ETL, and produce a source-catalog reconciliation report with **zero unexplained variance** (`T-SYNC-009`, human-gate tier).
3. Serve the app + MCP entirely from the new backend in a **read-only rollbackable soak**, verified end-to-end across reads, all 44 MCP tools, the `/article/` endpoint, and every migrated cron against real services, **while every production write path returns `migration_read_only`** (`T-SYNC-010`, e2e-automated).
4. Prove all 44 MCP tools return Postgres-backed results post-flip with `src/convex/client.ts` no longer importing `convex/browser`.

**What already exists at the planning SHA (`c7873378`).** The ETL machinery is built and exercised (Sprint 14): `services/platform/src/etl/{run,transform,reconcile,fk-audit,metadata,archive,vectors,deterministic-uuidv7,latest-run}.ts`. The MCP rehost is built (Sprint 19): `services/platform/src/mcp/{gateway,executor,manifest-loader,manifest-replay,verify-manifest,verify-rehost}.ts`. The client-data contract and its CI gate are built (Sprint 21): `services/platform/src/sync/{client-callsite-inventory,client-data-contract-author,client-data-contract-verify}.ts`, plus `holo verify:no-convex-client` and `holo verify-no-convex-env`. The integration lanes exist (Sprint 13): `pnpm test:integration` / `test:live` / `test:lanes` over the Vitest project split.

**What does not exist yet — the actual build surface of this sprint.** `migration_read_only` currently appears **only inside the client-data-contract authoring/verification modules** (`services/platform/src/sync/client-data-contract-{author,verify}.ts`) as a declared contract token — there is **no runtime write fence enforcing it**, on either the Convex side or the new backend. There is no drain/quiet-interval command, no export-watermark capture, no soak-flip configuration surface, and no post-flip verification gate binding reads + 44 tools + `/article/` + crons into one pass/fail. The `convex/` tree is still fully live. Sprint 29 builds exactly those five things (D06-01 … D06-05).

**The gate is one un-fakeable operator outcome:** after the freeze-drain-ETL sequence, the app plus all 44 MCP tools serve reads from Postgres, and **every** production write path — app mutation, MCP tool write, upload, job, mission — visibly returns `migration_read_only` rather than succeeding or hanging. The negative control is the inverse: a write path that still succeeds post-flip, or a fence that reports "frozen" while a mutation lands, fails the gate.

> **Dependency caveat (advisory, non-blocking).** This sprint was expanded via explicit `--sprint 29` selection. At planning time Sprint 20 (E2E Maestro harness) and Sprint 24 (RN app rewrite) are 🟠 In flight and Sprint 26 (uploads) is ⚪ Deferred with an incomplete runtime gate. The go/no-go task (D06-02) is exactly the gate that must catch that state — it is expected to **fail closed** until those sprints land. If the Sprint 24 provider wiring or the Sprint 26 upload path changes shape, re-run `/kb-sprint-tasks-plan 29 --only D06-02,D06-05 --overwrite` to refresh those tasks.

## Human Testing Gate

**Gate:** An operator executing the freeze-drain-ETL sequence gets the app plus all 44 MCP tools serving reads from Postgres, with every production write path returning `migration_read_only`.

**Dispatcher (required):** `bun services/platform/src/cli/holo.ts` — do not use a PATH `holo` stub.

## Human Test Deliverable

**Test Steps:**
1. Run the full harness suite against the new stack — green, while Convex still serves production.
2. Trigger the write fence — Convex mutations/actions/uploads/webhooks all reject with a fenced error.
3. Drain crons and queues, observe the quiet interval — zero in-flight writes remain.
4. Run the one-time ETL — reconciliation report shows zero unexplained variance.
5. Flip app plus MCP to the new backend — reads pass, all 44 tools pass, `/article/` byte-matches.
6. Attempt a write on any surface during soak — every path returns `migration_read_only`.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D06-01 | RED: every write path returns migration_read_only during soak | red-test-generator | 90 min |
| D06-02 | Pre-cutover go/no-go: full harness suite green against the new stack | devops-engineer | 90 min |
| D06-03 | Durable write-fence + cron/queue drain + quiet interval | devops-engineer | 150 min |
| D06-04 | Capture export watermark + orchestrate the one-time ETL run | devops-engineer | 120 min |
| D06-05 | Flip app plus MCP into rollbackable read-only soak, run verification gates | devops-engineer | 150 min |

## Source Coverage

- UC-SYNC-03; T-SYNC-008, T-SYNC-009, T-SYNC-010
- `.spec/prds/mk6-migration/08-uc-sync.md` (UC-SYNC-03 lines 44–53; UC-SYNC-04 rollback boundary lines 56–59)
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` (lines 210–212 — tier + real-service bindings)
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` (CAP-CUT-01, CAP-MIG-01)
- `.spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md`
- `.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md`

## Capability Coverage

- CAP-CUT-01: freeze → drain → flip → read-only soak with every write path returning `migration_read_only`
- CAP-MIG-01: the operator-orchestrated one-time ETL run + reconciliation gate

## Blocks

- Blocks: Sprint 30
- Depends on: Sprint 06, Sprint 13, Sprint 14, Sprint 19, Sprint 20, Sprint 22, Sprint 23, Sprint 24, Sprint 25, Sprint 26

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-08-01T01:10:00Z. Specialist proposals: **red-test-generator** (D06-01), **devops-engineer** (D06-02…D06-05). `convex-planner` and `mastra-planner` contributed the domain analysis that reshaped D06-03/D06-04/D06-05 (Convex fence mechanism, watermark definition, MCP/article verification); their full expansions are retained as planning evidence.

**Fakeability audit (real tool, not hand-audited):** `validate_scenario.py` (`~/Projects/brain/tools/validate-scenario/`) run on every behavioral AC of all 5 tasks → **0 CRITICAL, 0 HIGH**, with non-zero `scenario_count` verified per task (an exit-0 on a contract carrying zero scenarios validates vacuously — that trap produced one false CLEAN during this expansion and is called out here so it is checked, not assumed).

- D06-01-red-every-write-path-returns-migration-read-only-during-soak.md
- D06-02-pre-cutover-go-no-go-full-harness-suite-green-against-the-new-stack.md
- D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md
- D06-04-capture-export-watermark-orchestrate-the-one-time-etl-run.md
- D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md

### Planner-flagged discrepancies (NOT silently applied — human owns the re-scope)

- **D06-03** roadmap estimate 150 min; `convex-planner` estimates **240–300 min** (≈346 write-capable exports across ≈113 modules, plus a 900 s quiet window and a 300 s cron window of wall-clock in the integration suite).
- **D06-05** roadmap estimate 150 min; `mastra-planner` estimates **300–360 min** (six enforcement seams, a migration, two CLI verbs, a six-section gate, plus reimplementing the `/article/` renderer at convex/http.ts:58-209 — not a proxy pass-through).

### Live risk found in shipped code during planning (not a Sprint 29 artifact)

`services/platform/src/etl/reconcile.ts:158` computes `variance = loadedCount - expectedTarget`, with `expectedTarget` derived from `count(source)` over archive rows (:136). Against a zero-row export every term is `0`, every per-table variance is `0`, and `ok` is `true` (:275-279) — the reconciliation reports green when **no data moved at all**. This affects any prior sprint that recorded a green `etl:reconcile` as evidence, not only Sprint 29. D06-04 gates *around* it (non-emptiness + live-parity preconditions) rather than editing it mid-cutover; the underlying hole needs its own remediation item.

Related: `holo article:compat` (holo.ts:5311-5333) returns a static payload with no fetch and no comparand, so the gate's `/article/` byte-match is unfalsifiable as written — D06-03 replaces or deletes it and captures a real baseline.
