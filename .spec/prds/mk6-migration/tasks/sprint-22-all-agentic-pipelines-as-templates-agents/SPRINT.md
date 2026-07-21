---
sequence: 22
timeline: Phase 4 — Reference-Flow Gate and Deep Services
status: In Progress
planned_from_roadmap_sha: 5b1ca289d800c1583b4becdd7ac456ad2c9d04a77525b29bef2cf45dd86701ce
planned_from_source_sha: 2b7cef55f0e633073b21106df4e306fb9d59ac6f
planned_at: 2026-07-21T04:33:19Z
---

# Sprint 22: All Agentic Pipelines as Templates/Agents

**Sequence:** 22
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** In Progress
> Progress: 5/10 tasks completed · red-hat remediation queued 2026-07-21T18:30:00Z
> Status-Note: Independent red-hat review found CRITICAL/HIGH issues; remediation required before gate re-run.

## Overview

Sprint 22 collapses holocron's per-domain agentic pipelines — research, whatsNew, assimilate, shop, subscriptions, and the four business-report kinds (revenue-validation / competitive / ai-roi / flights) — onto the Sprint 15 mission engine as **shared templates and agents**, eliminating the copy-pasted per-domain module shells. Each pipeline must reproduce its former output shape from one shared template, with all reasoning running server-side on the local inference fleet (CAP-INF-01) and retrieval served by the local embed/search stack (CAP-EMB-01). The sprint composes capabilities delivered in Sprints 08 (role router + fleet), 09 (structured output), 10 (hybrid search), 12 (eval/telemetry gate), 15 (durable mission engine), and 17 (deterministic pi-free research engine); it produces no new boundary-crossing capability chain itself (Capability Coverage: N/A). The standing-mission publish path that subscriptions exercises is a fulcrum seam whose enforcement is owned later in Sprint 23.

## Human Testing Gate

**Gate:** Running `holo mission run <pipeline>` for each of research/whatsNew/assimilate/shop/subscriptions against real Postgres+fleet produces that pipeline's former output shape from a shared template, with no per-domain copy-pasted module remaining.

## Human Test Deliverable

1. Run `holo mission run whatsNew` — produces the former daily-briefing document shape on real Postgres.
2. Run `holo mission run assimilate --target <repo>` and `holo mission run shop --query X` — each yields its former output.
3. Run `holo mission run report --kind revenue-validation` (and competitive/ai-roi/flights) — one template covers all four, reasoning on the fleet.
4. Run `holo verify:no-shells` — reports the per-domain copy-pasted pipeline modules are gone.
5. Run a standing subscriptions mission — it invokes the shared research template as a sub-workflow and publishes a document.
6. Run `holo infer:trace <id>` on a business report — reasoning ran server-side on the fleet (no client-side Claude skill).

## Tasks

| ID | Title | Agent | Estimate |
|---|---|---|---:|
| pipes-1 | Shared evidence-research core template (research/deepResearch/subscriptions-research/fulcrum share it) | mastra-implementer | 240 min |
| pipes-2 | One parameterized business-report template (4 kinds), reasoning on the fleet | mastra-implementer | 240 min |
| pipes-3 | whatsNew/assimilate/shop/subscriptions as templates/agents + standing sub-workflow publish | mastra-implementer | 300 min |
| pipes-4 | RED tests: each pipeline former-output, one-report-4-kinds, no-shells, sub-workflow-publish | red-test-generator | 210 min |
| pipes-5 | Review DRY collapse | mastra-reviewer | 90 min |
| REDHAT-FIX-1 | Wire real retrieval or explicitly re-scope scaffold-only gathers and CAP-EMB-01 composition (C-1) | remediation | TBD |
| REDHAT-FIX-2 | Make default CLI idempotency keys deterministic for equivalent pipeline requests (C-2) | remediation | TBD |
| REDHAT-FIX-3 | Implement the documented `holo infer:trace <id>` evidence command and execute it in the gate (H-1) | remediation | TBD |
| REDHAT-FIX-4 | Make standing subscriptions run without manual claims injection and diagnose the flaky gate path (H-2) | remediation | TBD |
| REDHAT-FIX-5 | Add behavioral GREEN and fleet-down fail-closed coverage for the pipeline runtime (H-3) | remediation | TBD |

## Source Coverage

- UC-SVC-02
- T-SVC-005, T-SVC-006, T-SVC-007, T-SVC-008
- `.spec/prds/mk6-migration/06-uc-svc.md`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- N/A — pipelines compose CAP-INF-01 (fleet reasoning) and CAP-EMB-01 (retrieval); the standing-mission publish path is a fulcrum seam owned in Sprint 23.

## Blocks

- Blocks: Sprint 29
- Depends on: Sprint 08, Sprint 09, Sprint 10, Sprint 12, Sprint 15, Sprint 17

## Specialist Proposals

- `mastra-planner` — sole dispatched planning specialist (resolved set: `[mastra-planner]`; this is a single-domain Mastra backend/agentic sprint with no UI surface, so no design planner was consulted). Authored all 5 task definitions (pipes-1..5); **Proposed By: `mastra-planner`** attribution is preserved in every task file per the NEVER-TIER `proposed_by` tripwire.
- `red-test-generator` and `mastra-reviewer` are the **execution** agents for pipes-4 / pipes-5 respectively (their task *specs* were authored by mastra-planner, exactly as in prior mastra sprints).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-21T05:02:44Z.
Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-1 on 2026-07-21T19:15:00Z (C-1 expansion from `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md`).
Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-2 on 2026-07-21T20:30:00Z (C-2 expansion from `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md`).
Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-3 on 2026-07-21T21:45:00Z (H-1/GATE-1 expansion from `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md`).
Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-4 on 2026-07-21T22:30:00Z (H-2 expansion from `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md`).
Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-5 on 2026-07-21T23:15:00Z (H-3 expansion from `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md`).

- pipes-1-shared-evidence-research-core-template.md
- pipes-2-parameterized-business-report-template-4-kinds.md
- pipes-3-whatsnew-assimilate-shop-subscriptions-templates-sub-workflow-publish.md
- pipes-4-red-tests-pipeline-former-output-no-shells-sub-workflow-publish.md
- pipes-5-review-dry-collapse.md
- REDHAT-FIX-1-wire-real-retrieval-or-rescope-scaffold-cap-emb-01.md
- REDHAT-FIX-2-deterministic-cli-idempotency-defaults.md
- REDHAT-FIX-3-implement-holo-infer-trace-and-gate-step-6.md
- REDHAT-FIX-4-standing-subscriptions-no-manual-claims.md
- REDHAT-FIX-5-behavioral-green-and-fleet-down-fail-closed.md

pipes-1..5 avg quality ~100/115; fakeability audit: **0 CRITICAL / 0 HIGH**. REDHAT-FIX-1/2/3/4/5: `validate_scenario.py` exit 0. Topological order: pipes-4 → pipes-1 ∥ pipes-2 → pipes-3 → pipes-5 → REDHAT-FIX-*. Status remains 🟠 In Progress — red-hat remediation queued.
