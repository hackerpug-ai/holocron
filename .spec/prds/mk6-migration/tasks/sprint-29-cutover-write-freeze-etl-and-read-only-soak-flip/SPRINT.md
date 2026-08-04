---
sequence: 29
timeline: Phase 7 — Cutover and Decommission
status: In Progress
planned_from_roadmap_sha: 74a7aa730d3539e59b37cd0191f79c99549d4690624411e5d5525d48aacee161
planned_from_source_sha: 82342b50d6fce525c1fa1f732253f7b8cf2e463228960a3f9021a66f6f0065cd
source_kind: local-prd-sha256
planned_at: 2026-08-02T17:07:23Z
capability_coverage: [CAP-DEP-01, CAP-CUT-01, CAP-MIG-01]
---

# Sprint 29: Cutover — Write Freeze, ETL and Read-Only Soak Flip

**Sequence:** 29
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** In Progress
> Progress: 6/7 base tasks completed (D06-02 cutover:go-no-go green) · D06-06 and D06-07 added by the 2026-08-02 deployment-boundary delta replan
> Status-Note: D06-02 GREEN @ 48866650 — hermetic phased cutover:go-no-go overall.ok=true failed_count=0 (8/8 gates, SHA-bound). Human-gate re-run 20260804T180223Z HEAD-bound deployed-http partial 4/8 (steps 2–4+8 pass; step1 needed isolation env defaults — now in re-run script; step5 needs HOLO_ARTICLE_SHARE_TOKEN; not landing_eligible until 8/8)
**Proposed by:** devops-engineer + mastra-planner + mcp-planner + convex-planner + react-native-ui-planner + frontend-designer
**Milestone:** — (`sprint-29`)
**Branch:** `mk6-cutover`
**PR:** —

> Strictly last-phase. Depends on **every** DATA/SVC/INFER feature sprint plus the full SYNC client rewrite being complete, and on both harness sprints (13, 20) for the pre-cutover go/no-go.

## Overview

Sprint 29 is **the cutover** — the one irreversible-in-practice sequence where production stops being served by Convex and starts being served by Postgres + Mastra. It implements **UC-SYNC-03 (Big-bang cutover)** as the ordered chain the PRD specifies: *parallel-build → freeze → drain → ETL → flip → verify → read-only soak*, with a rollback path preserved throughout the soak (UC-SYNC-04 owns the rollback drill itself in Sprint 30).

**What the PRD requires of this sprint** (`04-uc-plat.md` §UC-PLAT-05 and `08-uc-sync.md` §UC-SYNC-03):
1. Package the production platform as an immutable OCI release and a versioned four-service Compose contract, then deploy it on the named host `inference1` before the freeze (`T-PLAT-015`, `T-SYNC-020`).
2. Prove the already-listening external endpoint reports the exact host, container runtime, image digest, and source revision; an unexpected Mastra termination must recover automatically with durable data intact (`CAP-DEP-01`).
3. Stand up and validate the entire new stack (Postgres + Mastra + Zero + fleet) against a real integration suite **while Convex still serves production untouched** — the go/no-go (`T-SYNC-008`).
4. Durably fence Convex mutations/actions/uploads/webhooks, disable and drain all scheduled work, observe a declared quiet interval, capture an export watermark plus final-write audit, run the one-time ETL, and produce a source-catalog reconciliation report with **zero unexplained variance** (`T-SYNC-009`, human-gate tier).
5. Serve the app + MCP entirely from the deployed backend in a **read-only rollbackable soak**, verified end-to-end across reads, all 44 MCP tools, the `/article/` endpoint, and every migrated cron against real services, **while every production write path returns `migration_read_only`** (`T-SYNC-010`, e2e-automated).
6. Prove all 44 MCP tools return Postgres-backed results post-flip with `src/convex/client.ts` no longer importing `convex/browser`.

**What already exists at the planning SHA (`c7873378`).** The ETL machinery is built and exercised (Sprint 14): `services/platform/src/etl/{run,transform,reconcile,fk-audit,metadata,archive,vectors,deterministic-uuidv7,latest-run}.ts`. The MCP rehost is built (Sprint 19): `services/platform/src/mcp/{gateway,executor,manifest-loader,manifest-replay,verify-manifest,verify-rehost}.ts`. The client-data contract and its CI gate are built (Sprint 21): `services/platform/src/sync/{client-callsite-inventory,client-data-contract-author,client-data-contract-verify}.ts`, plus `holo verify:no-convex-client` and `holo verify-no-convex-env`. The integration lanes exist (Sprint 13): `pnpm test:integration` / `test:live` / `test:lanes` over the Vitest project split.

**What the delta adds.** D06-01 through D06-05 implemented the cutover controls, but the revised PRD makes a real production-container boundary mandatory. The repository still lacks a canonical production Dockerfile, a digest-pinned four-service Compose release, a deployment receipt for `inference1`, and a fail-closed external identity/restart proof. D06-06 and D06-07 add those two missing contracts without reopening the five shipped cutover tasks or their red-hat remediation history.

**The gate is one un-fakeable operator outcome:** after a pinned Compose release is externally identified and survives restart, the freeze-drain-ETL sequence leaves the app plus all 44 MCP tools serving reads from Postgres, and **every** production write path — app mutation, MCP tool write, upload, job, mission — visibly returns `migration_read_only` rather than succeeding or hanging. In-process, stale, or mismatched deployment identities fail before the write freeze begins.

> **Dependency caveat (advisory, non-blocking).** This sprint was expanded via explicit `--sprint 29` selection. At planning time Sprint 20 (E2E Maestro harness) and Sprint 24 (RN app rewrite) are 🟠 In flight and Sprint 26 (uploads) is ⚪ Deferred with an incomplete runtime gate. The go/no-go task (D06-02) is exactly the gate that must catch that state — it is expected to **fail closed** until those sprints land. If the Sprint 24 provider wiring or the Sprint 26 upload path changes shape, re-run `/kb-sprint-tasks-plan 29 --only D06-02,D06-05 --overwrite` to refresh those tasks.

## Human Testing Gate

**Gate:** After cutover, the pinned `inference1` container serves Postgres-backed app and 44-tool MCP reads while every production write path returns `migration_read_only`.

**Dispatcher (required):** `bun services/platform/src/cli/holo.ts` — do not use a PATH `holo` stub.

**Authoritative plan:** `gate-plan.json` (remediated by REDHAT-FIX-S29-H03 and extended by D06-07). Every step is a real deployment/cutover CLI action plus a conjunctive multi-field jq oracle — never jq-only peeks on pre-baked `.tmp` JSON, never any-of freeze fields, never `overall.ok` with null `toolsPassed`/`toolsTotal`.

**Oracle suite:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts`

**Freshness suite (REDHAT-FIX-S29-R2-H01):** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts`

**Re-run harness:** `bash scripts/run-sprint29-human-gate-rerun.sh` — D06-07 extends the current six-step harness to all eight `gate-plan.json` `literal_cmd` steps and writes `.gate-evidence/{new-run-id}/step{1..8}.log` plus honest `gate-results.json`. It must refuse historical false-pass run_id `20260802T004525Z`, any local-process identity, and any stale release receipt. Honest fail/partial is required — never forge 8/8 or copy stale results.

## Human Test Deliverable

**Test Steps** (1:1 with the post-D06-07 `gate-plan.json`; each action uses the dispatcher above):

1. **`cutover:go-no-go`** — Run the full harness suite against the candidate stack while Convex still serves production. Pass only when `overall.ok==true`, `failed_count==0`, and eight real gates are collected.
2. **`deploy:apply`** — Cold-recreate the pinned Compose release on `inference1`. Pass only when exactly four declared services reach real health without deleting durable volumes.
3. **Restart proof** — Unexpectedly terminate the Mastra container process (not `docker compose stop`), then fetch production `/health` externally. Pass only when restart policy returns a new serving process on the same image digest and source revision.
4. **`deploy:verify` negative controls** — Reject loopback/in-process listeners plus wrong host, runtime, digest, and source revision before any cutover state changes.
5. **`cutover:freeze` + `cutover:quiet-check`** — Arm the durable write fence, drain scheduled work, and require zero accepted writes across the declared quiet interval.
6. **`cutover:run-etl`** — Run the one-time ETL (CAP-MIG-01) and require zero unexplained variance, non-empty source evidence, clean FK audit, and clean vectors.
7. **`cutover:flip` + `cutover:verify-soak`** — Derive app, MCP, article, and cutover endpoints from the verified deployment base URL; require reads, 44 tools, jobs, and `/article/` to pass.
8. **Write probe (`migration_read_only`)** — Attempt a write on the deployed Hono surface during soak. Pass only when status is **423** and body `error`/`code` is `migration_read_only`.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D06-01 | RED: every write path returns migration_read_only during soak | red-test-generator | 90 min |
| D06-02 | Pre-cutover go/no-go: full harness suite green against the new stack | devops-engineer | 90 min |
| D06-03 | Durable write-fence + cron/queue drain + quiet interval | devops-engineer | 150 min |
| D06-04 | Capture export watermark + orchestrate the one-time ETL run | devops-engineer | 120 min |
| D06-05 | Flip app plus MCP into rollbackable read-only soak, run verification gates | devops-engineer | 150 min |
| D06-06 | Package pinned production OCI image and versioned Compose contract | devops-engineer | 120 min |
| D06-07 | Deploy on inference1 and prove external network identity before cutover | devops-engineer | 120 min |
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
| REDHAT-FIX-S29-R3-C01 | Bind human-gate evidence to HEAD and require 6/6 deployed identity | devops-engineer | 120 min |
| REDHAT-FIX-S29-R3-C02 | Remove production fixture fallback from verify-reads parity | devops-engineer | 90 min |
| REDHAT-FIX-S29-R3-C03 | Real Postgres-backed MCP oracle + non-self-supplied deployed identity | devops-engineer | 120 min |
| REDHAT-FIX-S29-R3-H01 | Drain all claimed surfaces or honest residual inventory | devops-engineer | 120 min |
| REDHAT-FIX-S29-R3-H02 | Fence mission + already-running worker irreversible effects | devops-engineer | 150 min |
| REDHAT-FIX-S29-R3-H03 | Rollback requires pre-existing serving generation acks | devops-engineer | 120 min |

## Source Coverage

- UC-PLAT-05, UC-SYNC-03; AP-10, R20; T-PLAT-015, T-SYNC-008, T-SYNC-009, T-SYNC-010, T-SYNC-020
- `.spec/prds/mk6-migration/04-uc-plat.md` (UC-PLAT-05 — named-host container deployment)
- `.spec/prds/mk6-migration/08-uc-sync.md` (UC-SYNC-03 lines 44–53; UC-SYNC-04 rollback boundary lines 56–59)
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` (lines 210–212 — tier + real-service bindings)
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` (CAP-DEP-01, CAP-CUT-01, CAP-MIG-01)
- `.spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md`
- `.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md`

## Capability Coverage

- CAP-DEP-01: exact source → immutable image/Compose contract → `inference1` deploy → external identity, restart, and durability proof
- CAP-CUT-01: freeze → drain → flip → read-only soak with every write path returning `migration_read_only`
- CAP-MIG-01: the operator-orchestrated one-time ETL run + reconciliation gate

## Blocks

- Blocks: Sprint 30
- Depends on: Sprint 06, Sprint 13, Sprint 14, Sprint 19, Sprint 20, Sprint 22, Sprint 23, Sprint 24, Sprint 25, Sprint 26

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-08-01T01:10:00Z and delta-replanned on 2026-08-02T17:07:23Z. Specialist proposals: **red-test-generator** (D06-01), **devops-engineer** (D06-02…D06-07), with deployment-boundary analysis from **mastra-planner** and **mcp-planner**. `convex-planner` and `mastra-planner` contributed the original domain analysis that reshaped D06-03/D06-04/D06-05; their full expansions remain planning evidence.

**Fakeability audit (real tool, not hand-audited):** `validate_scenario.py` (`~/Projects/brain/tools/validate-scenario/`) run on every behavioral AC of all 7 base tasks → **0 CRITICAL, 0 HIGH**, with non-zero `scenario_count` verified per task. The D06-06 and D06-07 delta contracts each report `scenario_count=5`; an exit-0 contract with zero scenarios is not accepted.

- D06-01-red-every-write-path-returns-migration-read-only-during-soak.md
- D06-02-pre-cutover-go-no-go-full-harness-suite-green-against-the-new-stack.md
- D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md
- D06-04-capture-export-watermark-orchestrate-the-one-time-etl-run.md
- D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md
- D06-06-package-pinned-production-oci-image-and-versioned-compose-contract.md
- D06-07-deploy-on-inference1-and-prove-external-network-identity-before-cutover.md


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
