---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Technical Risks

Consolidated from all three specialist reports plus the Operator decisions. Ordered by severity.

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | **Big-bang data loss.** One-shot cutover, no dual-write; a missed table/blob or a late write is lost. | High | Freeze Convex writes before export; immutable `convex export` archive + `legacy_convex_id` columns kept through soak; idempotent re-runnable ETL; **do not `convex delete` until all gates + soak pass** (R-rollback). |
| R2 | **App-rewrite volume.** ~105 Convex hook call-sites across ~47 files + provider swap; Zero semantics differ → genuine rewrite with no RN e2e net today. | High | Provision RN e2e (Maestro/Detox) as a leading INFRA task; migrate screen-by-screen behind the coexistence window; grep-gate zero `convex/react` imports. |
| R3 | **Embedding-dimension + regeneration.** New model + dims + chunking → results change; silent quality regression or partial embed failure. | High | Pin `vector(1024)`; golden-query eval (new recall ≥ old) + the past-8K-retrieval assertion; idempotent resumable re-embed (`WHERE embedding IS NULL`, `SKIP LOCKED`); dim + unit-norm checks. |
| R4 | **16 crons have no home.** All Convex-runtime-bound; a missed one silently rots a background pipeline (no CI to catch it). | High | Enumerated 16→(7 janitor sweeps + 4 Mastra workflows + 1 queue consumer + 3→1 backfill + 1 digest); an AC asserts each observably fires; add a CI/health check. |
| R5 | **Structured output reliability on local models.** json_schema honoring varies across fleet backends ("compatibility mess"). | High | Constrained decode + Zod re-validation + bounded repair loop + boot-time per-role capability probe; escape hatch for extraction-critical steps; TDD known-malformed→repair-or-fail. |
| R6 | **FK integrity across `_id`→uuid remap.** A missed mapping NULLs/mis-points a FK; the two merges (research 5→3, analysis 12→3) are highest-risk. | Med-High | Whole-graph id map before any load; enforce real FK constraints (fail closed) + NULL-FK audit; `legacy_convex_id` re-derivation; extra spot-checks on merged tables. |
| R7 | **Fulcrum PRD reconciliation.** This migration retires fulcrum ADR-001 (SQLite ledger) and ADR-002 (cloud embedder). Building fulcrum against stale ADRs, or ambiguous ledger ownership. | Med-High | **Decision recorded (AP-1): Postgres-only, ledger in Postgres append-only tables — no SQLite.** Fulcrum's PRD must be re-planned to build as a mission template on this platform; flag both PRDs for reconciliation. |
| R8 | **Zero replication gotchas.** pgvector/tsvector can't sync; missing replica identity stalls UPDATE/DELETE; large jsonb bloats the client; big initial snapshot/slot lag; DDL needs publication upkeep. | Med | Minimal `zero_pub` (reactive subset only, vectors excluded via the passages split); uuid PK replica identity everywhere; test end-to-end propagation pre-cutover. |
| R9 | **Losing Convex's transactional scheduler.** The 23-case tool switch + `runAfter` chaining relied on it. | Med | Mastra workflow durability + queue exactly-once; kill-9 tests on commit + queue paths are mandatory; in-SDK tool loop bounded by `maxSteps` + budget + tripwire. |
| R10 | **pg-boss/graphile-worker on Bun unverified.** | Med | Sprint-0 gate on real Bun; graphile-worker primary / pg-boss fallback; Mastra native `schedule` covers pure crons regardless. |
| R11 | **Public `/article/` endpoint drift.** The only public URL; `app/document/[id].tsx` hard-codes the `.convex.site` shape — miss the rehost and every shared link 404s. | Med | Port the converter verbatim; keep path + token compatible; byte-compare a sample; narrow, explicit public exposure only. |
| R12 | **Mini contention: perpetual missions vs interactive latency + thermals.** | Med | Queue priority lanes (interactive > background); thermal/duty-cycle breaker; degradation ceiling drops background to sense-only under load. |
| R13 | **Local quality gap for the 10 chat specialists + CHALLENGE** (prompts tuned for Claude). | Med | Per-specialist eval scorers (judge role) with CI gating; declared high-stakes escape; prompt re-tuning; block-don't-warn on regression. |
| R14 | **Escape-hatch leakage** — silent cloud drift defeats local-first. | Med | Default-deny `resolveModel`; escape requires explicit flag + budget pre-check + telemetry; a test asserts no Anthropic call on the default path. |
| R15 | **jsonb query performance** — a hot query filtering *into* jsonb seq-scans. | Low-Med | Audit query patterns; promote hot keys to typed columns; GIN/expression indexes only where needed (most jsonb is read-whole). |
| R16 | **"Dev deployment IS production" + no CI.** Deletion is irreversible; no automated backup/deploy pipeline. | Low-Med | Export archive + soak before deletion; treat the deletion as the sole point of no return; add a minimal backup/health pipeline. |
| R17 | **Carrying forward a live stub.** `convex/db/agentActivity.ts` returns `null`. | Low | Implement for real on the new engine; do not port the stub silently. |
| R18 | **Chunking blowup** on pathological 50K-char docs. | Low | Cap chunk size/count (~512 tok / 64 overlap); ~15–40K passages estimated; resumable job; contextual-header generation deferrable. |
