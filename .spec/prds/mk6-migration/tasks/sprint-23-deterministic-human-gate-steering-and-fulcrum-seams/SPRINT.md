---
sequence: 23
timeline: Phase 4 — Reference-Flow Gate and Deep Services
status: Gate remediation in progress
planned_from_roadmap_sha: 2d40380dab23122c83681fe66277498df92c8ca670518f7236bcc35868223113
planned_from_source_sha: 72b8eee3bfa7e27714245f0bb8ae58241265ca18
source_kind: git-head
planned_at: 2026-07-21T20:13:41Z
---

# Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams

**Sequence:** 23
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** Gate remediation in progress
> Progress: 5/5 product tasks landed · GATE-FIX-001…004 landed · GATE-FIX-005 planned (003 AC-4 residual) · updated 2026-07-23T07:15:00Z
> Status-Note: Product tasks gate-1…gate-5 dual-lens reviewed and landed on main. GATE-FIX-001…004 landed (`f135f2b6`). Human gate is **NOT** complete: GATE-FIX-003 **AC-4 residual** — step 3 still creates research then immediately advances with no bounded poll / probe-ready marker. **GATE-FIX-005** (plan only in this wave) closes that residual before final quiescent QA.

## Overview

Sprint 23 hardens the mission engine's human-control surface into a **deterministic gate** — verdicts, steering, and approval transitions enforced by Postgres-writing handlers (not by model choice) — and proves the engine exposes the exact seams that let **fulcrum** be authored as one standing mission template with zero new platform code. This closes UC-SVC-05 and the four remaining SVC test criteria (T-SVC-017…020).

The control surface already exists from Sprint 15: `POST /api/missions/:id/verdicts` and `POST /api/missions/:id/steer` are wired in `services/platform/src/http/hono-app.ts` with handlers in `services/platform/src/http/missions.ts`, backed by the `mission_verdicts` and `mission_steering` tables. What is **missing** is deterministic enforcement of three rules against the real append-only ledger (Sprint 07): (1) an uncited `kill` must be rejected, (2) a second concurrent build on the same subject must be refused (WIP=1), and (3) `advance→validated` must be refused without a recorded probe — plus the workflow states (`work_in_progress`, `probe`, `validated`) those rules depend on. The ASSAY≠CHALLENGE distinct-instance pattern (Sprint 17) and mid-run steering (Sprint 15) already exist; this sprint guarantees both within a single deterministic cycle and adds the operator-visible `holo mission:cycle` and `holo fulcrum:authorable-check` evidence commands. The capstone (gate-3) asserts seam sufficiency — a fulcrum template compiles against contract + ledger + evidence-gate + role-bindings + publish with no new platform code — which is the fulcrum-seam handoff the cutover (Sprint 29) and the post-migration fulcrum product depend on.

The sprint composes capabilities delivered in Sprints 07 (immutable append-only ledger), 08 (role router / fleet), 15 (durable mission engine + control surface), and 17 (pure-TS evidence gate + ASSAY≠CHALLENGE). It owns one capability-chain segment: **CAP-INF-01** — ASSAY≠CHALLENGE distinct-instance enforcement + refuting-claim admission parity, realized as the fulcrum-seam capstone.

## Human Testing Gate

**Gate:** Against the real append-only ledger, `POST /api/missions/:id/verdicts` deterministically rejects an uncited kill, refuses a second concurrent build (WIP=1), and refuses `advance→validated` without a recorded probe — enforced in Postgres-writing handlers, not by model choice.

## Human Test Deliverable

1. `POST /api/missions/:id/verdicts {kill, no-citation}` — rejected deterministically by the handler.
2. Start a second concurrent build on the same subject — refused (WIP=1).
3. `POST verdicts {advance→validated}` with no recorded probe — refused; add a probe — accepted.
4. `POST /api/missions/:id/steer` mid-run — the steering row takes effect on the following cycle without a restart.
5. Run `holo mission:cycle <id>` — the CHALLENGE instance differs from ASSAY; refuting claims pass the identical admission gate.
6. Run `holo fulcrum:authorable-check` — a fulcrum template compiles against contract+ledger+gate+role-bindings+publish seams with zero new platform code.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| gate-1 | Deterministic human-gate handlers — verdicts, WIP=1, cited-kill, probe-gated advance | mastra-implementer | 240 min |
| gate-2 | Mid-run steering + ASSAY≠CHALLENGE enforcement within a cycle | mastra-implementer | 210 min |
| gate-3 | Fulcrum-seams capstone — assert seams suffice to author fulcrum with no new platform code | mastra-implementer | 180 min |
| gate-4 | RED tests: uncited-kill rejected, WIP=1, unprobed-advance refused, steering-next-cycle, ASSAY≠CHALLENGE | red-test-generator | 180 min |
| gate-5 | Review seam sufficiency | mastra-reviewer | 90 min |
| GATE-FIX-001 | Gate step 5 assertion must accept JSON whitespace while preserving assay/challenge distinctness | devops-engineer | 30 min |
| GATE-FIX-002 | Gate step 2 must prove real WIP=1 refusal without matching its own literal grep text; use a real successful research burst | devops-engineer | 60 min |
| GATE-FIX-003 | Gate steps 1/3/4/5 must create/discover fresh valid runs after nonprod reseed (no hard-coded vanished UUIDs) | devops-engineer | 90 min |
| GATE-FIX-004 | Gate step 3 assertion must not self-match literal_cmd echo; body-level refuse-then-accept + exit 1 on fail | devops-engineer | 45 min |
| GATE-FIX-005 | Gate step 3b must bounded-poll for real committed research.plan@1 before advance (probe-ready marker; exit 1 on timeout) | devops-engineer | 45 min |

## Source Coverage

- UC-SVC-05
- T-SVC-017, T-SVC-018, T-SVC-019, T-SVC-020
- `.spec/prds/mk6-migration/06-uc-svc.md`
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- CAP-INF-01: ASSAY≠CHALLENGE distinct-instance enforcement + refuting-claim admission parity (the fulcrum-seam capstone)

## Blocks

- Blocks: Sprint 29
- Depends on: Sprint 07, Sprint 08, Sprint 15, Sprint 17

## Specialist Proposals

- `mastra-planner` — sole dispatched planning specialist (resolved set: `[mastra-planner]`; this is a single-domain Mastra backend/agentic sprint with no UI surface, so no design planner was consulted). Authored all 5 task definitions (gate-1..5) and remediated every fakeable scenario to `validate_scenario.py` exit 0. **Proposed By: `mastra-planner`** attribution is preserved in every task file per the NEVER-TIER `proposed_by` tripwire.
- `red-test-generator` and `mastra-reviewer` are the **execution** agents for gate-4 / gate-5 respectively (their task *specs* were authored by mastra-planner, exactly as in prior mastra sprints).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-21T20:13:41Z (specialist proposal: mastra-planner). Avg quality 115/115; fakeability audit: **0 CRITICAL / 0 HIGH** — `validate_scenario.py` exit 0 on every task's requirement contract. Topological order: gate-4 (RED suite, written first) → gate-1 ∥ gate-2 → gate-3 (capstone) → gate-5 (review). Status remains 🔵 Planned — expanded and ready for `/kb-run-sprint`, not yet executing.

- gate-1-deterministic-human-gate-handlers-verdicts-wip1-cited-kill-p.md
- gate-2-mid-run-steering-assaychallenge-enforcement-within-a-cycle.md
- gate-3-fulcrum-seams-capstone-assert-seams-suffice-to-author-fulcru.md
- gate-4-red-tests-uncited-kill-rejected-wip1-unprobed-advance-refuse.md
- gate-5-review-seam-sufficiency.md
- GATE-FIX-001-step5-assertion-accepts-json-whitespace.md
- GATE-FIX-002-step2-real-wip-one-without-self-matching-grep.md
- GATE-FIX-003-reseed-safe-fresh-run-discovery.md
- GATE-FIX-004-step3-assertion-no-self-match.md
- GATE-FIX-005-step3-bounded-probe-ready-poll.md
- GATE-FIX-PLAN-20260723T061322Z.md
