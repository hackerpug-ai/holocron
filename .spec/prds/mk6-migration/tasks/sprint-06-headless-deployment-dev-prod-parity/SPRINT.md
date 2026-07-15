---
sprint: 6
title: Headless Deployment and Dev/Prod Parity
sequence: 6
timeline: Phase 1 — Platform Foundation
status: In Progress
prd: ../../README.md
capability_coverage: [CAP-EMB-01]
---

# Sprint 6: Headless Deployment and Dev/Prod Parity

**Sequence:** 6
**Timeline:** Phase 1 — Platform Foundation
**Status:** 🟠 In Progress
**Proposed by:** devops-engineer
**Branch:** `mk6-deployment`

---

## Overview

This is the third Phase-1 sprint. It makes the platform **runnable as a single headless stack** — one operator command brings all four services (Postgres, the Sprint-05 Mastra service, the scheduler, the zero-cache) up on the tailnet mini and reports them healthy within 60 seconds, and the identical stack runs on the laptop for development against the same config contract. It is the sprint where the individually-built pieces from Sprints 01–05 stop being separate `holo service:up` / `holo db:migrate` / `holo manifest:resolve` invocations and become a **managed lifecycle**: launchd service definitions, a `holo stack up/down/status` supervisor, a consolidated secrets source, and a Convex-env-alias sweep that proves no `EXPO_PUBLIC_CONVEX_URL` / `HOLOCRON_URL` / deploy-key sprawl remains.

The sprint establishes four one-time foundations, each of which is a later sprint's assumption: (1) **launchd unit definitions** for all four services so they survive reboot and restart on crash with zero manual per-service steps; (2) a **`holo stack up/down/status` operator CLI** plus a laptop dev-parity supervisor that boots the same four services under the same config contract (the mini and the laptop are the same stack, not two stacks); (3) a **consolidated secrets source** so every config value resolves from one place and `holo secrets doctor` reports zero missing keys, with all Convex env aliases removed and `holo verify-no-convex-env` proving the sweep across every repo surface; and (4) **fleet embed-route health wired into `holo stack status`** — the CAP-EMB-01 ops-visibility share, so an operator sees the local `:4545` embed route's health alongside Postgres/Mastra/scheduler/zero-cache rather than discovering a dead embedder only at retrieval time.

A gate is only real if it fails when the behavior is absent. The RED suite proves the lifecycle is grounded: `holo stack up` does not report healthy when a service is down, `holo stack down` leaves zero orphaned PIDs, the laptop boots the identical config contract, `holo secrets doctor` flags a deliberately-missing key, `holo verify-no-convex-env` fails when a Convex alias is reintroduced, and killing Mastra mid-run then re-running `holo stack up` restarts it with no manual cleanup. Per Architecture Posture AP-7, the trust model is single-user tailnet — there is **no RLS and no multi-tenant model**; the consolidated secrets store is a config-hygiene and dev/prod-parity control, not a tenant-isolation layer, and the security review (D01-06) scopes to the consolidated secrets store's confidentiality at rest and in process env, not to multi-tenant isolation.

---

## Human Test Deliverable

An operator can prove — with the platform built across Sprints 01–05 — that a single `holo stack up` on the mini brings Postgres, Mastra, the scheduler, and zero-cache all healthy within 60 seconds with zero manual per-service steps; that `holo stack down` exits all four processes clean with zero orphaned PIDs; that the identical `holo stack up` on the laptop yields the same health result under the same config contract; that `holo secrets doctor` resolves every config value with zero missing keys; that `holo verify-no-convex-env` finds zero Convex env aliases across the repo; and that killing Mastra mid-run and re-running `holo stack up` restarts the service to healthy with no manual cleanup.

**Test Steps:**
1. Run `holo stack up` on the mini — Postgres, Mastra, scheduler, zero-cache healthy within 60s.
2. Run `holo stack down` on the mini — all four processes exit clean, zero orphaned PIDs.
3. Run `holo stack up` on the laptop — identical health result under the same config contract.
4. Run `holo secrets doctor` — every config value resolves, zero missing keys reported.
5. Run `holo verify-no-convex-env` — zero Convex env aliases found across the repo.
6. Kill Mastra mid-run, rerun `holo stack up` — service restarts, reports healthy, no manual cleanup.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D01-01 | RED: seeded tests for stack-up health and Convex-env-alias detection | red-test-generator | 60 min |
| D01-02 | launchd service definitions for Postgres/Mastra/scheduler/zero-cache | devops-engineer | 150 min |
| D01-03 | `holo stack up/down/status` operator CLI + laptop dev-parity supervisor | devops-engineer | 180 min |
| D01-04 | Consolidated secrets source + Convex-env-alias removal + `holo verify-no-convex-env` | devops-engineer | 150 min |
| D01-05 | Wire fleet embed-route health into stack status (CAP-EMB-01 shared) | devops-engineer | 60 min |
| D01-06 | Security review: consolidated secrets store | security-reviewer | 60 min |

---

## Human Testing Gate

**Gate:** An operator running a single `holo stack up` command on the mini gets all four services — Postgres, Mastra, the scheduler, zero-cache — reporting healthy within 60 seconds, with zero manual per-service steps.

---

## Source Coverage

- UC-PLAT-05 (Deployment & dev/prod parity) — all three ACs: bring the full stack (Postgres, Mastra, scheduler, zero-cache) up and down on the mini with one command each; run the identical stack on the laptop for dev against the same config contract as the mini; resolve all configuration from a single consolidated secrets source with zero Convex env aliases (`EXPO_PUBLIC_CONVEX_URL`, `HOLOCRON_URL`, deploy keys, etc.) remaining in any surface
- `10-technical-requirements/02-system-components.md` — the four-service stack shape (Postgres + Mastra service + scheduler + zero-cache)
- `10-technical-requirements/06-external-dependencies.md` — Tailscale reachability + the consolidated secrets/config posture
- `10-technical-requirements/01-architecture-posture.md` AP-7 (tailnet trust boundary; no RLS, no multi-tenant) + AP-1 (Postgres only, no SQLite)
- `10-technical-requirements/09-capability-chains.md` CAP-EMB-01 — operational embed-route health surfaced in `holo stack status` (this sprint owns the ops-visibility share; the chunk+embed pass is owned in Sprint 10, regenerated at ETL in Sprint 14)
- Sprint 01 (the `holo` operator CLI + compatibility-locked runtime + the Fleet Role Manifest) · Sprint 04 (clean Postgres schema + `zero_pub` publication) · Sprint 05 (Mastra `service:up` + `/health` readiness + scoped-key boundary + `manifest:resolve`)
- T-PLAT-015 (one-command up/down on mini) · T-PLAT-016 (identical dev stack on laptop, same config contract) · T-PLAT-017 (config from one consolidated source; grep finds zero Convex env aliases; config resolves)

## Capability Coverage

- CAP-EMB-01: operational embed-route health surfaced in `holo stack status` — this sprint owns the `:4545` embed-route health probe wired into the stack supervisor (the ops-visibility share); the local Qwen3 chunk+embed pass, idempotent resumable re-embed, and past-8K retrieval are owned in Sprint 10, with ETL-time vector regeneration owned in Sprint 14

---

## Blocks

- Sprint 13 (Vitest Integration Harness — the real-service suite runs against this managed stack; its fail-closed-without-Postgres/fleet posture assumes a managed, healthy stack)
- Sprint 20 (E2E Maestro Harness — the cold-boot reference flow boots this managed stack on the macOS runner)
- Sprint 27 (Standing Off-Mini Backup — the backup jobs run against this stack's Postgres and report through this stack's health surface)
- Sprint 29 (Cutover — the freeze/drain/flip read-only soak runs against this managed stack)

**Dependent on:** Sprint 01 (the `holo` operator CLI + compatibility-locked Mastra/Bun runtime + the Fleet Role Manifest) · Sprint 04 (the clean Postgres domain schema + `zero_pub` publication the zero-cache consumes) · Sprint 05 (the Mastra `service:up` composition root + `/health` readiness + scoped-key boundary + `manifest:resolve` that the stack supervisor orchestrates)

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-14 (proposed by: devops-engineer [D01-01, D01-02, D01-03, D01-04, D01-05, D01-06]).
Avg quality score: 100.8/115 (115-point rubric, min 80). Fakeability audit: 0 fakeable scenarios (`validate_scenario` clean on every behavioral AC across all 6 tasks — D01-04/D01-05 scenarios added, D01-01/D01-03 scenarios strengthened in a remediation pass).
Topological order: D01-01 (RED suite) → D01-04 (consolidated secrets) → D01-02 (launchd units) → D01-03 (stack supervisor) → D01-05 (embed health) → D01-06 (security review). Scheduler slot honestly `pending` everywhere (Sprint 11 owns it); zero-cache real-against-`zero_pub` OR honestly disabled — never fake-healthy.

- D01-01-red-seeded-tests-for-stack-up-health-and-convex-env-alias-detection.md
- D01-02-launchd-service-definitions-for-postgres-mastra-scheduler-zero-cache.md
- D01-03-holo-stack-up-down-status-operator-cli-laptop-dev-parity-supervisor.md
- D01-04-consolidated-secrets-source-convex-env-alias-removal-holo-verify-no-convex-env.md
- D01-05-wire-fleet-embed-route-health-into-stack-status-cap-emb-01-shared.md
- D01-06-security-review-consolidated-secrets-store.md
