---
sprint: 8
title: Role Router, Local-First and Degraded Modes
sequence: 8
timeline: Phase 2 — Inference and Data
status: In Progress
prd: ../../README.md
capability_coverage: [CAP-INF-01]
---

# Sprint 8: Role Router, Local-First and Degraded Modes

**Sequence:** 8
**Timeline:** Phase 2 — Inference and Data
**Status:** 🟠 In Progress
**Proposed by:** mastra-planner
**Branch:** `mk6-inference-router`
**Opened:** 2026-07-15 — expanded by /kb-sprint-tasks-plan

---

## Overview

This is a Phase-2 Inference sprint that makes **local-first reasoning structural, not a per-call discipline.** Sprints 01 and 05 already stood up the Fleet Role Manifest (the versioned `divergent`/`convergent`/`judge`/`embed`/`rerank` → `:4545` LiteLLM mapping, with fail-closed startup validation) and the Mastra service + scoped-key control plane that does in-service `resolveModel` behind the auth boundary. What does **not** exist yet is the routing *enforcement* that the entire migration's local-first promise depends on: a single `resolveModel(role, { allowEscape })` router that every reasoning call site must go through, a default-deny Claude escape hatch that cannot silently drift back to cloud, and a degraded-mode controller that fails over to a *defined reduced mode* (never the cloud) when the fleet goes down. A service that *usually* calls the fleet is not local-first; a service that *cannot reach the cloud on the default path and proves it with a network assertion* is.

The sprint delivers four outcomes, each of which is a later sprint's load-bearing assumption: (1) **the role router** — `resolveModel(role, { allowEscape })` over `@ai-sdk/openai-compatible` against the LiteLLM fleet, so every former cloud call site names a role and never a provider (the `claudeFlash`/`claudePro`/`claudeUltra` factories are gone, verified by `holo verify:no-provider-refs`); (2) **the budget ledger + deterministic escape pre-check** — `@ai-sdk/anthropic` is reachable only for steps that declare `highStakes`/`allowEscape`, gated by a budget-ledger pre-check that blocks over-ceiling calls before they fire and meters every escape (reason/tokens/cost) to real Postgres; (3) **the degraded-mode controller** — when a fleet role endpoint is unreachable the system degrades to a declared reduced mode (research → sense-only; chat → surfaced "local fleet unavailable") and auto-resumes on endpoint return, **never** silently failing over to the cloud; and (4) the **RED suite** proving the local-first invariant bites — zero Anthropic requests on the default path (network assertion), an over-budget escape is blocked, and a fleet-down run degrades rather than reaching cloud.

Per Architecture Posture, the trust model is single-user tailnet — there is no RLS and no multi-tenant model. The control enforced here is the **local-first invariant**: the database and the network are jointly the proof surface (fleet request logs + a network capture asserting zero Anthropic traffic on the default path), not an authz boundary. The router this sprint installs is the seam every downstream reasoning surface composes: CAP-INF-01's structured extraction (Sprint 09), the research engine (Sprint 17), the chat specialists (Sprint 18), the pipelines (Sprint 22), the human-gate ASSAY≠CHALLENGE instances (Sprint 23), and the reactive degraded surfaces (Sprint 25) all call `resolveModel(role)` and inherit its default-deny escape and degraded behavior.

---

## Human Test Deliverable

An operator can prove — with the Fleet Role Manifest and Mastra service from Sprints 01 and 05 — that running `holo mission run triage --goal 'X'` with a network capture completes with N fleet calls to `:4545` and **zero** Anthropic requests on the default path; that `holo infer:call --role divergent` and `--role convergent` resolve to the 35B-A3B and 27B fleet models; that `holo infer:call --escape --cost 999` is blocked by the budget pre-check and records `budget_exceeded`; that one real `holo infer:call --escape --highStakes` within budget succeeds and logs reason/tokens/cost to the ledger; that taking the divergent endpoint down mid-run degrades the mission to its declared mode (never cloud) and resumes when it returns; and that `holo verify:no-provider-refs` reports zero direct provider references with no `claudeFlash/Pro/Ultra` factories.

**Test Steps:**
1. Run `holo mission run triage --goal 'X'` with a network capture on — completes with N fleet calls to :4545.
2. Read the network capture — zero Anthropic requests on the default path.
3. Run `holo infer:call --role divergent` and `--role convergent` — resolve to the 35B-A3B and 27B fleet models.
4. Run `holo infer:call --escape --cost 999` — blocked by the budget pre-check, records `budget_exceeded`.
5. Run one real `holo infer:call --escape --highStakes` within budget — succeeds and logs reason/tokens/cost to the ledger.
6. Take the divergent endpoint down mid-run — the mission degrades to its declared mode (never cloud); bring it back — it resumes.
7. Run `holo verify:no-provider-refs` — reports zero direct provider references and no `claudeFlash/Pro/Ultra` factories.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| infer-1 | `resolveModel(role,{allowEscape})` router over fleet + default-deny Claude escape | mastra-implementer | 240 min |
| infer-2 | Budget ledger + deterministic escape pre-check + per-escape telemetry | mastra-implementer | 210 min |
| infer-3 | Degraded-mode controller (fleet-down → defined reduced mode, auto-resume) | mastra-implementer | 180 min |
| infer-4 | RED tests: zero-Anthropic default path, over-budget escape blocked, degraded-not-cloud | red-test-generator | 180 min |
| infer-5 | Review local-first structural integrity + escape leakage | mastra-reviewer | 90 min |
| REDHAT-FIX-H1 | Unify escape never-cloud: refuse `runBudgetedEscape` when process or DB degraded; route CLI `--escape` through the same choke point (fresh red-hat H1: escape dual-path bypass) | mastra-implementer | 120 min |
| REDHAT-FIX-H2 | Honest human gate: rewrite SPRINT human steps to runnable `infer:call`/suite surface (or implement mission) and re-gate without vitest substitutions (fresh red-hat H2: gate greenwash) | mastra-implementer | 90 min |
| REDHAT-FIX-H3 | Structural local-first: wire ≥1 in-service path through `resolveModel`+`createFleetChatModel` (or restated scope honesty) (fresh red-hat H3: seam-only structural claim) | mastra-implementer | 150 min |
| REDHAT-FIX-H4 | Durable degraded gate: escape/resolve must read Postgres `degraded_mode` so multi-process/CLI re-invocations honor fleet-down (fresh red-hat H4: process-local degraded flag) | mastra-implementer | 120 min |
| REDHAT-FIX-H5 | Hard budget pre-check: reject `estimatedCostUsd <= 0` for real escapes, transactional reserve, consistent ceiling source, fail-closed ledger write (fresh red-hat H5: soft/gameable budget) | mastra-implementer | 150 min |

---

## Human Testing Gate

**Gate:** Running a normal reasoning mission against the real fleet routes every call through `resolveModel(role)` to a live `:4545` endpoint and makes zero Anthropic requests, verified by fleet request logs plus a network assertion that fails if any call reaches cloud.

---

## Source Coverage

- UC-INFER-01 (Role router & local-first) — all four ACs: route every reasoning call through `resolveModel(role)` to a local fleet endpoint with zero cloud calls on the default path (verified by fleet request logs + a network assertion that no Anthropic request occurs unless a step declares escape); confirm no call site references a provider directly (the `claudeFlash`/`claudePro`/`claudeUltra` factories are gone); resolve `divergent` and `convergent` to their respective fleet models (fast 35B-A3B vs precise 27B) and route each step to its bound role; reject startup/run creation when the Fleet Role Manifest lacks a required model, capability, timeout/concurrency policy, or declared degraded mode
- UC-INFER-04 (Claude escape hatch & budget ledger) — all three ACs: invoke the Claude escape hatch only when a step declares escape AND the budget-ledger pre-check passes (block any call exceeding the ceiling); log every escape call to the budget ledger with reason/tokens/cost against real Postgres (one real budgeted Anthropic call); prove no Anthropic request on the default (non-escape) path via a network assertion during a normal mission run
- UC-INFER-05 (Degraded modes) — all three ACs: degrade to a defined reduced mode when a fleet endpoint is taken down mid-run (research → sense-only; chat → surfaced unavailability) and never silently fall back to cloud; surface a clear "local fleet unavailable" state rather than a hang or a covert cloud response; resume full operation automatically when the role endpoint returns
- `07-uc-infer.md` — UC-INFER-01/04/05 acceptance criteria (the role router, escape hatch + budget ledger, degraded modes)
- `11-e2e-testing-criteria.md` — T-INFER-001 (zero cloud on default path) · T-INFER-002 (no provider named at call sites) · T-INFER-003 (divergent/convergent resolve correctly) · T-INFER-011 (escape only when declared + budget OK) · T-INFER-012 (every escape metered) · T-INFER-013 (no Anthropic on default path) · T-INFER-014 (degrade, never silent cloud) · T-INFER-015 (clear unavailable state in chat) · T-INFER-016 (auto-resume on endpoint return) · T-INFER-017 (fleet manifest fails closed when incomplete)
- `10-technical-requirements/09-capability-chains.md` — CAP-INF-01 (role-routed local-first inference, budgeted escape, fleet-down degraded mode)
- `10-technical-requirements/11-runtime-contracts.md` — the LiteLLM `:4545` fleet contract + the `@ai-sdk/openai-compatible` / `@ai-sdk/anthropic` runtime wiring
- Sprint 01 (the Fleet Role Manifest — versioned `divergent`/`convergent`/`judge`/`embed`/`rerank` → `:4545` mapping + fail-closed startup validation + `resolveModel` skeleton) · Sprint 05 (the Mastra service / Hono surface + scoped-key boundary that does in-service `resolveModel`)
- `services/platform/src/` (the router, budget ledger, degraded-mode controller, and `holo infer:*` / `holo verify:no-provider-refs` operator commands this sprint adds)

## Capability Coverage

- CAP-INF-01: role-routed local-first inference, budgeted escape, and fleet-down degraded mode. This sprint owns the router seam (`resolveModel(role,{allowEscape})`), the default-deny escape + budget ledger, and the degraded-mode controller — the boundary contracts every downstream reasoning surface consumes (Sprint 09 structuring, Sprint 17 research, Sprint 18 chat, Sprint 22 pipelines, Sprint 23 ASSAY≠CHALLENGE, Sprint 25 reactive degraded surfaces).

---

## Blocks

- Sprint 09 (Structured Output on Local Models — the extraction pipeline calls `resolveModel(role)` and inherits the default-deny escape)
- Sprint 12 (Observability + Eval Gate — per-call inference telemetry + budget-ledger visibility are the detective-controls segment of CAP-INF-01)
- Sprint 17 (Deterministic Research Engine — ASSAY/CHALLENGE run as distinct fleet instances via the router; zero-pi depends on local-first being structural)
- Sprint 18 (Chat Redesign — chat specialists are role-routed via `resolveModel`; least-privilege tool grants inherit the router seam)
- Sprint 22 (All Agentic Pipelines as Templates — pipeline reasoning runs server-side on the fleet through the router, no client-side Claude)
- Sprint 23 (Deterministic Human Gate — ASSAY≠CHALLENGE distinct-instance enforcement rides on the router + degraded mode)
- Sprint 25 (Reactive Surfaces — the chat degraded "local fleet unavailable" state consumes this sprint's degraded-mode controller)

**Dependent on:** Sprint 01 (the Fleet Role Manifest — versioned role→`:4545` mapping + fail-closed startup validation + `resolveModel` skeleton) · Sprint 05 (the Mastra service / Hono surface + scoped-key control plane that does in-service `resolveModel` behind the auth boundary).

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-15 (proposed by: mastra-planner).
Avg quality score: ~115/115 (115-point rubric, min 80). Fakeability audit: **0 CRITICAL / 0 HIGH** — `validate_scenario` clean (exit 0) on every behavioral AC across all 5 tasks (independently re-verified on the rendered files).
Topological order: infer-1 (router, the seam) → infer-2 (budget ledger + default-deny escape) ∥ infer-3 (degraded-mode controller) → infer-4 (RED suite proves infer-1/2/3) → infer-5 (adversarial review of infer-1/2/3/4).

- infer-1-resolve-model-router-default-deny-claude-escape.md
- infer-2-budget-ledger-deterministic-escape-pre-check-telemetry.md
- infer-3-degraded-mode-controller-fleet-down-auto-resume.md
- infer-4-red-tests-zero-anthropic-over-budget-blocked-degraded-not-cloud.md
- infer-5-review-local-first-structural-integrity-escape-leakage.md

### REDHAT remediation expansion

Generated by /kb-sprint-tasks-plan on 2026-07-16T03:59:36Z (proposed by: mastra-planner; binding source: `.spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md` HIGH H1–H5).
Avg quality score: ~115/115 (115-point rubric, min 80). Fakeability: scenarios present on every behavioral AC (orchestrator render).
Topological order for remediation: REDHAT-FIX-H1 (escape choke) ∥ REDHAT-FIX-H3 (structural wiring) → REDHAT-FIX-H4 (durable DB degraded; depends H1) ∥ REDHAT-FIX-H5 (hard budget; depends H1) → REDHAT-FIX-H2 (honest gate; depends H1/H3/H4/H5).

- REDHAT-FIX-H1-unify-escape-never-cloud-runbudgetedescape-degraded-choke.md
- REDHAT-FIX-H2-honest-human-gate-rewrite-infer-call-suite-no-greenwash.md
- REDHAT-FIX-H3-structural-local-first-wire-resolve-model-createfleetchatmodel.md
- REDHAT-FIX-H4-durable-degraded-gate-postgres-degraded-mode-multi-process.md
- REDHAT-FIX-H5-hard-budget-precheck-reject-zero-estimate-transactional-reserve.md
