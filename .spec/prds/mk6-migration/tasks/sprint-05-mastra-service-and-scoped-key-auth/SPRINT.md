---
sprint: 5
title: Mastra Service and Scoped-Key Auth
sequence: 5
timeline: Phase 1 — Platform Foundation
status: Completed
prd: ../../README.md
capability_coverage: [CAP-INF-01]
---

# Sprint 5: Mastra Service and Scoped-Key Auth

**Sequence:** 5
**Timeline:** Phase 1 — Platform Foundation
**Status:** ✅ Completed — GATE-GOAL: ACHIEVED
**Proposed by:** mastra-planner
**Branch:** `mk6-mastra-service`

---

## Overview

This is the second Phase-1 sprint. It stands up the **sole backend** — one Mastra/Bun service (agents, a single shared tool/Zod registry, workflows, processors) fronted by a Hono HTTP + SSE surface, running on the tailnet mini — and authorizes every operation through **scoped API keys** over Tailscale. It is the point where the compatibility-locked runtime posture from Sprint 01 (`holo compat:spike` green matrix + the `holo` operator CLI + the Fleet Role Manifest) wires against the domain schema from Sprint 04 (`holo db:migrate` clean Postgres, `zero_pub` publication). Nothing downstream boots without this service: the scheduler (Sprint 06), inference router (Sprint 08), queue (Sprint 11), observability (Sprint 12), the real-service harness (Sprint 13), the mission engine (Sprint 15), chat (Sprint 18), the MCP rehost (Sprint 19), and the client contract (Sprint 21) all depend on a booted Mastra service with a real auth boundary and an in-service fleet resolver.

The sprint establishes four one-time foundations, each of which is a later sprint's assumption: (1) a **single composition root** that boots the compatibility-locked Mastra runtime and exposes `/health` reporting real DB/fleet/queue readiness; (2) a **single shared Zod tool + schema registry** consumed identically by agents, workflows, and the MCP gateway — collapsing the duplicate validation layer the Convex-era split forces; (3) a **scoped API-key middleware** with three scopes (RN application, MCP, control-plane) so an unkeyed tailnet request cannot invoke a verdict, steering, or MCP-mutation route, and a wrong-scope key cannot cross; and (4) **in-service fleet resolution** — `resolveModel(role)` wired to the versioned Fleet Role Manifest so every required model role resolves to a live `:4545` endpoint from within the running service and fails closed when a declared capability is absent.

A gate is only real if it fails when the behavior is absent. The RED suite proves the boundary is grounded: an unkeyed tailnet request to a mutation route returns `401`, a correctly-scoped key returns `200`, a wrong-scope key (RN key against an MCP mutation) returns `403`, the same Zod schema resolves for the agent path, the workflow path, and the MCP path (no duplicate validation), `/health` reports live readiness, and `holo manifest:resolve divergent` returns the live fleet endpoint. Per Architecture Posture AP-7, the trust model is single-user tailnet — there is **no RLS and no multi-tenant model**; the scoped-key boundary is an authorization control plane over a private network, not a tenant-isolation layer. The RED evidence is captured against the absent/broken start (no middleware, no registry, no resolver) before each goes green.

---

## Human Test Deliverable

An operator can prove — with the compatibility-locked Mastra service booted on the mini against Sprint 04's Postgres — that `holo service:up` answers `/health` with live DB/fleet/queue readiness, that an unkeyed tailnet request to a verdict/steer/MCP-mutation route returns `401` while the correctly-scoped RN/MCP key returns `200` and a wrong-scope key returns `403`, that the same Zod schema resolves for the agent, workflow, and MCP paths with no duplicate validation layer, and that `holo manifest:resolve divergent` returns the live fleet endpoint from inside the running service.

**Test Steps:**
1. Run `holo service:up` on the mini and `curl https://mini/health` — returns 200 with DB/fleet/queue readiness.
2. `curl -X POST https://mini/api/missions/x/steer` with no key — returns 401.
3. Repeat with the correctly-scoped RN key — returns 200 (accepted).
4. `curl` an MCP mutation with the RN key (wrong scope) — returns 403 (scope mismatch).
5. Run `holo registry:probe searchTool` — the same Zod schema resolves for the agent, workflow, and MCP paths.
6. Run `holo verify:no-dup-validation` — reports the duplicate validation layer absent.
7. Run `holo manifest:resolve divergent` from inside the running service — returns the live fleet endpoint.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| service-1 | Mastra composition root + Hono HTTP/SSE surface + /health readiness | mastra-implementer | 240 min |
| service-2 | Single shared Tool + Zod schema registry (agents/workflows/MCP consume identically) | mastra-implementer | 210 min |
| service-3 | Scoped API-key middleware (RN/MCP/control scopes) + fleet resolution wired in | mastra-implementer | 210 min |
| service-4 | RED tests: unkeyed→401, wrong-scope→403, keyed→200, shared-schema identity, /health | red-test-generator | 120 min |
| service-5 | Review auth boundary + registry singularity | mastra-reviewer | 90 min |

---

## Human Testing Gate

**Gate:** With the compatibility-locked service booted on the mini, an unkeyed tailnet request to a verdict/steer/MCP-mutation route returns 401 while the same request with its correctly-scoped RN/MCP key returns 200.

---

## Source Coverage

- UC-PLAT-02 (Stand up the Mastra service) — all four ACs: boot + `/health` over Tailscale; single shared Zod tool registry reachable identically by agents/workflows/MCP with no duplicate validation layer; scoped API-key boundary so an unkeyed tailnet request cannot invoke MCP/verdict/steering mutations (no RLS, no multi-tenant); in-service `resolveModel` resolution through the versioned Fleet Role Manifest that fails closed when a capability is absent
- `10-technical-requirements/02-system-components.md` — the Mastra service component shape (agents, tools, workflows, processors, Hono HTTP/SSE)
- `10-technical-requirements/04-api-design.md` — the Hono API surface, scoped-key control plane, `/health` readiness
- `10-technical-requirements/01-architecture-posture.md` AP-7 (tailnet trust boundary; no RLS, no multi-tenant) + AP-1 (Postgres only)
- `10-technical-requirements/11-runtime-contracts.md` — Mastra compatibility lock + Fleet Role Manifest (`resolveModel(role,{allowEscape})`, per-role declaration, fail-closed startup validation)
- `10-technical-requirements/09-capability-chains.md` CAP-INF-01 — in-service role-routed inference behind the scoped-key control plane (this sprint owns the resolution + auth-boundary segment)
- Sprint 01 (`holo` operator CLI, compatibility-locked runtime, Fleet Role Manifest schema + `resolveModel` skeleton + fail-closed startup validation) · Sprint 04 (clean Postgres schema, `zero_pub` publication)
- T-PLAT-005 (service boots + `/health` over Tailscale) · T-PLAT-006 (single shared Zod registry, no duplicate validation) · T-PLAT-007 (scoped-key boundary over Tailscale) · T-PLAT-008 (in-service `resolveModel` via Fleet Role Manifest, fail-closed)

## Capability Coverage

- CAP-INF-01: in-service model-role resolution behind the scoped-key control plane — this sprint owns the `resolveModel(role)` wiring inside the booted service and the scoped-key boundary that gates which operations may invoke it; the role-routed local-first inference, budgeted escape, and degraded mode are owned in Sprint 08

---

## Blocks

- Sprint 06 (Headless Deployment and Dev/Prod Parity — `holo stack up` manages this service)
- Sprint 08 (Role Router, Local-First and Degraded Modes — extends this `resolveModel` skeleton with budget ledger + degraded mode)
- Sprint 11 (Scheduler and Durable Queue — runs inside this service process)
- Sprint 12 (Observability, Telemetry and Eval Gate — emits per-call telemetry from this service)
- Sprint 13 (Vitest Integration Harness — the real-service suite targets this booted service)
- Sprint 15 (Mission Engine — runs against this composition root)
- Sprint 18 (Chat Redesign — `POST /api/chat-runs` rides this Hono surface + registry)
- Sprint 19 (MCP Gateway Rehost — rebinds the 44 tools to this shared registry + Postgres)
- Sprint 21 (Client Data Contract — every Hono command target resolves against this service)

**Dependent on:** Sprint 01 (the `holo` operator CLI + compatibility-locked Mastra/Bun runtime + the Fleet Role Manifest schema with `resolveModel` skeleton and fail-closed startup validation from compat-3) · Sprint 04 (the clean Postgres domain schema + `zero_pub` publication the service boots against)

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-14 (proposed by: mastra-planner [service-1, service-2, service-3, service-4, service-5])
Avg quality score: 100/115 (115-point rubric, min 80). Fakeability audit: 0 fakeable scenarios (`validate_scenario` clean on every behavioral AC across all 5 tasks).
Topological order: service-1 → service-2 → service-3 → service-4 → service-5 (composition root → shared registry → scoped-key+resolveModel → RED suite → review)

- service-1-mastra-composition-root-hono-health.md
- service-2-shared-tool-zod-schema-registry.md
- service-3-scoped-key-middleware-and-fleet-resolution.md
- service-4-red-tests-unkeyed-wrong-scope-keyed-shared-schema-health.md
- service-5-review-auth-boundary-and-registry-singularity.md
