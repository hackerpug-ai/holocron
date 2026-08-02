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
> Progress: 5/5 tasks completed · updated 2026-08-02T02:19:50Z
> Status-Note: post-remediation review blocked at cab5c071 — 4 CRITICAL, 4 HIGH; cycle-2 fixes required
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

**Authoritative plan:** `gate-plan.json` (remediated by REDHAT-FIX-S29-H03). Every step is a real cutover CLI action plus a conjunctive multi-field jq oracle — never jq-only peeks on pre-baked `.tmp` JSON, never any-of freeze fields, never `overall.ok` with null `toolsPassed`/`toolsTotal`.

**Oracle suite:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts`

**Freshness suite (REDHAT-FIX-S29-R2-H01):** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts`

**Re-run harness:** `bash scripts/run-sprint29-human-gate-rerun.sh` — executes all six `gate-plan.json` `literal_cmd` steps via real cutover CLI, writes `.gate-evidence/{new-run-id}/step{1..6}.log` + honest `gate-results.json`. Refuses historical false-pass run_id `20260802T004525Z` as current pass. Full **6/6 green may remain blocked** until sibling remediations land: **R2-C01..C04** (durable fence / drain / immutable catalog / control-plane rollback) and **R2-H02..H04** (deployed MCP identity / article comparator / cross-process arm fail-closed). Honest fail/partial is required — never forge 6/6 or copy stale results.

## Human Test Deliverable

**Test Steps** (1:1 with `gate-plan.json`; each action uses the dispatcher above):

1. **`cutover:go-no-go`** — Run the full harness suite against the new stack. Pass only when `overall.ok==true` and `failed_count==0` (and eight gates collected; never `gates|length==8` alone). Coordinates with REDHAT-FIX-S29-C01.
2. **`cutover:freeze`** — Arm the write fence. Pass only when `ok==true` **and** `env_value=="1"` **and** `fence_armed_at>0` (require-all; never any-of).
3. **`cutover:quiet-check`** — Drain crons/queues and observe the quiet interval. Pass only when `acceptedWriteCount==0` **and** `rejectedWriteCount>0` **and** `windowSeconds>=` declared window **and** `ok==true`.
4. **`cutover:run-etl`** — Run the one-time ETL (CAP-MIG-01). Pass only when `ok==true` **and** `unexplainedVariance==0` **and** non-empty source **and** `fkAudit.ok` **and** `vectors.ok` **and** `stages.nonEmpty==true`.
5. **`cutover:flip` + `cutover:verify-soak`** — Flip app plus MCP into read-only soak and verify. Pass only when `overall.ok==true` **and** non-null `toolsPassed==toolsTotal` with `toolsTotal>0` **and** `jobsAccounted==jobsTotal` **and** `article.ok` **and** `honoWrite.ok` **and** `reads.ok` **and** explicit `zeroWritePath`.
6. **Write probe (`migration_read_only`)** — Attempt a write on a real Hono surface during soak. Pass only when status is **423** and body `error`/`code` is `migration_read_only`. Residual until REDHAT-FIX-S29-C02: process-local env engagement cannot alone prove distributed flip propagation; the body oracle remains mandatory.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D06-01 | RED: every write path returns migration_read_only during soak | red-test-generator | 90 min |
| D06-02 | Pre-cutover go/no-go: full harness suite green against the new stack | devops-engineer | 90 min |
| D06-03 | Durable write-fence + cron/queue drain + quiet interval | devops-engineer | 150 min |
| D06-04 | Capture export watermark + orchestrate the one-time ETL run | devops-engineer | 120 min |
| D06-05 | Flip app plus MCP into rollbackable read-only soak, run verification gates | devops-engineer | 150 min |
| REDHAT-FIX-S29-C01 | Replace the false go/no-go oracle with real CLI execution and require failed_count=0 (C-01; gate-plan.json:11-20) | devops-engineer | 90 min |
| REDHAT-FIX-S29-C02 | Implement a durable distributed production write fence and reciprocal rollback repoint (C-02; soak-fence.ts:53-67,302-321) | devops-engineer | 150 min |
| REDHAT-FIX-S29-C03 | Implement real schedule disable/drain and measured post-drain quiet interval with write oracles (C-03; convex-fence-client.ts:307-401) | devops-engineer | 150 min |
| REDHAT-FIX-S29-H01 | Verify deployed network /mcp and /article endpoints with schema-valid Postgres-backed per-tool results (H-01; soak-fence.ts:554-590,769-782) | devops-engineer | 120 min |
| REDHAT-FIX-S29-H02 | Reconcile every migrated table against immutable export/catalog evidence without test-authored baselines (H-02; soak-fence.ts:624,671-706) | devops-engineer | 120 min |
| REDHAT-FIX-S29-H03 | Rebuild gate-plan predicates around concrete CLI actions and complete per-surface oracles (H-03; gate-plan.json:23-68) | devops-engineer | 120 min |
| REDHAT-FIX-S29-H04 | Make every unfenced mutation error fail and assert exact before/after side-effect counts (H-04; sprint29-write-fence-red.test.ts:414-477) | devops-engineer | 90 min |
| REDHAT-FIX-S29-H05 | Prove durable fence propagation before arm timestamp and add executable rollback repoint evidence (H-05; convex-fence-client.ts:199-237, 08-uc-sync.md:56-62) | devops-engineer | 120 min |
| REDHAT-FIX-S29-R2-C01 | Make authoritative fence lookup override boot-time env values and prove already-running service propagation (C-01; secrets.ts:252-261, soak-fence.ts:94-103) | devops-engineer | 150 min |
| REDHAT-FIX-S29-R2-C02 | Drain every scheduled surface to zero with pagination and fail closed on residual/error counts (C-02; migrationFence/drain.ts:23-205) | devops-engineer | 150 min |
| REDHAT-FIX-S29-R2-C03 | Bind parity to an immutable content-addressed export/catalog and reject truncated or caller-authored reports (C-03; soak-fence.ts:318-355,1226-1285) | devops-engineer | 150 min |
| REDHAT-FIX-S29-R2-C04 | Implement rollback through the serving control plane with live acknowledgements (C-04; rollback-repoint.ts:67-74,284-341) | devops-engineer | 150 min |
| REDHAT-FIX-S29-R2-H01 | Re-run all six human-gate steps against the remediated SHA with fresh deployed evidence (H-01; gate-results.json:7-14) | devops-engineer | 120 min |
| REDHAT-FIX-S29-R2-H02 | Require deployed endpoint identity and schema-valid non-sentinel Postgres-backed MCP/article results (H-02; sprint29-soak-flip.test.ts:159-173, soak-fence.ts:957-1004) | devops-engineer | 150 min |
| REDHAT-FIX-S29-R2-H03 | Compare article output to an immutable pre-freeze comparator, never a child authored from the SUT (H-03; sprint29-soak-flip.test.ts:157-213,863-894) | devops-engineer | 120 min |
| REDHAT-FIX-S29-R2-H04 | Make cross-process fence probe failure fail closed and block arm timestamp fallback (H-04; convex-fence-client.ts:341-382,442-465) | devops-engineer | 90 min |

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


### Red-hat remediation task detail files

Generated by /kb-sprint-tasks-plan on 2026-08-02T01:34:35Z (`--only` REDHAT-FIX-S29-C01…H05). Specialist proposals: **devops-engineer** (C01, H03, H04), **mastra-planner** (C02, H01, H02), **convex-planner** (C03, H05). Source findings preserved from `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` @ `2b966c7b`.

- REDHAT-FIX-S29-C01-replace-the-false-go-no-go-oracle-with-real-cli-execution-and-require-failed-count-0-c-01-gate.md
- REDHAT-FIX-S29-H03-rebuild-gate-plan-predicates-around-concrete-cli-actions-and-complete-per-surface-oracles-h.md
- REDHAT-FIX-S29-H04-make-every-unfenced-mutation-error-fail-and-assert-exact-before-after-side-effect-counts-h-04.md
- REDHAT-FIX-S29-C02-implement-a-durable-distributed-production-write-fence-and-reciprocal-rollback-repoint-c-02.md
- REDHAT-FIX-S29-H01-verify-deployed-network-mcp-and-article-endpoints-with-schema-valid-postgres-backed-per-tool.md
- REDHAT-FIX-S29-H02-reconcile-every-migrated-table-against-immutable-export-catalog-evidence-without-test-authored.md
- REDHAT-FIX-S29-C03-implement-real-schedule-disable-drain-and-measured-post-drain-quiet-interval-with-write-oracles.md
- REDHAT-FIX-S29-H05-prove-durable-fence-propagation-before-arm-timestamp-and-add-executable-rollback-repoint-evidence.md

### Cycle-2 red-hat remediation task detail files

Generated by /kb-sprint-tasks-plan on 2026-08-02T02:50:31Z (`--only` REDHAT-FIX-S29-R2-C01…H04). Specialist proposals: **mastra-planner** (R2-C01, R2-C03, R2-C04, R2-H02, R2-H03), **convex-planner** (R2-C02, R2-H04), **devops-engineer** (R2-H01). Source findings preserved from `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` @ `cab5c0717974a96e33c338105b5d198d82cb607d`.

- REDHAT-FIX-S29-R2-C01-make-authoritative-fence-lookup-override-boot-time-env-values-and-prove-already-running-se.md
- REDHAT-FIX-S29-R2-C02-drain-every-scheduled-surface-to-zero-with-pagination-and-fail-closed-on-residual-error-co.md
- REDHAT-FIX-S29-R2-C03-bind-parity-to-an-immutable-content-addressed-export-catalog-and-reject-truncated-or-calle.md
- REDHAT-FIX-S29-R2-C04-implement-rollback-through-the-serving-control-plane-with-live-acknowledgements-c-04-rollb.md
- REDHAT-FIX-S29-R2-H01-re-run-all-six-human-gate-steps-against-the-remediated-sha-with-fresh-deployed-evidence-h-.md
- REDHAT-FIX-S29-R2-H02-require-deployed-endpoint-identity-and-schema-valid-non-sentinel-postgres-backed-mcp-artic.md
- REDHAT-FIX-S29-R2-H03-compare-article-output-to-an-immutable-pre-freeze-comparator-never-a-child-authored-from-t.md
- REDHAT-FIX-S29-R2-H04-make-cross-process-fence-probe-failure-fail-closed-and-block-arm-timestamp-fallback-h-04-c.md

### Planner-flagged discrepancies (NOT silently applied — human owns the re-scope)

- **D06-03** roadmap estimate 150 min; `convex-planner` estimates **240–300 min** (≈346 write-capable exports across ≈113 modules, plus a 900 s quiet window and a 300 s cron window of wall-clock in the integration suite).
- **D06-05** roadmap estimate 150 min; `mastra-planner` estimates **300–360 min** (six enforcement seams, a migration, two CLI verbs, a six-section gate, plus reimplementing the `/article/` renderer at convex/http.ts:58-209 — not a proxy pass-through).

### Live risk found in shipped code during planning (not a Sprint 29 artifact)

`services/platform/src/etl/reconcile.ts:158` computes `variance = loadedCount - expectedTarget`, with `expectedTarget` derived from `count(source)` over archive rows (:136). Against a zero-row export every term is `0`, every per-table variance is `0`, and `ok` is `true` (:275-279) — the reconciliation reports green when **no data moved at all**. This affects any prior sprint that recorded a green `etl:reconcile` as evidence, not only Sprint 29. D06-04 gates *around* it (non-emptiness + live-parity preconditions) rather than editing it mid-cutover; the underlying hole needs its own remediation item.

Related: `holo article:compat` (holo.ts:5311-5333) returns a static payload with no fetch and no comparand, so the gate's `/article/` byte-match is unfalsifiable as written — D06-03 replaces or deletes it and captures a real baseline.
