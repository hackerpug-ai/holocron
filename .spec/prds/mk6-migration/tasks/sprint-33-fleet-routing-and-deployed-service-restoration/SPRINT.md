---
sprint: 33
slug: fleet-routing-and-deployed-service-restoration
sequence: 33
status: In Progress
prd: .spec/prds/mk6-migration/README.md
planned_from_roadmap_sha: ce2f5ade6e8383597dd16317c2276319c78f3207b849212ba74b761d1a38ea8e
planned_from_source_sha: 4beec5ebbf39fe4dc1ee827a11677eaf110aff0e
planned_from_source_kind: git-head
planned_at: 2026-08-16
---

# Sprint 33: Fleet Routing and Deployed-Service Restoration

**Status:** In Progress
> Progress: 0/13 tasks completed · updated 2026-08-16T21:49:01Z

**Sequence:** 33
**Timeline:** TBD
**Proposed by:** human-directed scope (Track 1) + dispatched specialist SET

## Overview

The MK-VI platform is deployed on the `holocron` Mac and reachable at
`https://holocron.tail011a51.ts.net:44111`, but `/health` returns **503 degraded**.
Postgres, the durable queue (pg-boss) and zero-cache are all ready. Two deploy-time
faults keep the service from functioning, and a third makes the fault recur on the
next deploy:

1. **Fleet unreachable.** The container's fleet endpoint is
   `http://host.docker.internal:4545`, which resolves to the holocron Mac, where no
   inference service runs. `production-deploy.ts:447-462` (`fleetUrlForContainer`)
   both *defaults* to that value when `FLEET_URL` is unset and *rewrites* any
   `127.0.0.1`/`localhost`/`::1` value to `host.docker.internal` — a laptop-era
   assumption that the router shares a host with Docker. `services/platform/fleet/manifest.json`
   additionally hardcodes `http://127.0.0.1:4545` in six places (defaultEndpoint + all
   five roles).
2. **Retired data plane.** The runtime reports `data_plane: "convex"` /
   `target: "convex-frozen"` from the durable secrets file, while `convex/` was deleted
   from the repo in `e02104c9` — an ancestor of the running image. `cutover/data-plane-content.ts:38-48`
   fails closed on that combination, so `GET /api/documents/:id` (`hono-app.ts:383`) and
   the MCP `get_document` tool (`mcp/executor.ts:993`) both return **410
   `retired_cloud_plane_removed_d08_02`** without querying Postgres.
3. **Scheduler has no fleet.** `deploy/compose/compose.yaml:90-107` injects only
   `database_url` into the scheduler container — no `FLEET_URL`, no `FLEET_KEY` — so
   every cron job and background mission is model-less even once Mastra is healthy.

The human-directed remedy is a **fleet that does not depend on the laptop**: a LiteLLM
router packaged and deployed onto `holocron` alongside the existing laptop router, both
routing by capacity to oMLX on the Mac minis, with the role models actually resident on
those minis.

## Observed fleet state (2026-08-16, verified live)

| Fact | Value |
|---|---|
| Capacity routing built? | **Yes** — `~/llm-router/config.yaml` load-balances `implementer` across `inference1:8003` + `inference2:8003` (weight 100, least-busy), `laptop:8003` weight-1 fallback |
| Models on `inference1` | `Qwen3.6-35B-A3B-MLX-8bit` **only** |
| Models on `inference2` | `Qwen3.6-35B-A3B-MLX-8bit` **only** |
| Qwen3.8-27B on minis? | **No** — all three variants are laptop-only (`Qwen3.8-27B-8bit` is 28 GB) |
| `qwen3-embedding` | Laptop-only (`Qwen3-Embedding-0.6B-4bit-DWQ`, 335 MB) |
| `qwen3-reranker` | **Does not exist anywhere on the fleet** |
| `inference1` free disk | **42 GiB (91% full)** — 64 GB RAM |
| `inference2` free disk | 269 GiB — 64 GB RAM |
| Manifest fail-closed roles | `embed`, `rerank` |

## Human Testing Gate

**Gate:** With the laptop off the tailnet, the deployed holocron service reports healthy,
serves a real document out of Postgres instead of a 410, and answers a chat turn with
tokens generated on a Mac mini.

## Human Test Deliverable

A holocron deployment that keeps working when the operator's laptop is asleep, closed,
or off the tailnet.

### Test Steps

1. On the laptop, run `tailscale down` (or close the lid and confirm it drops off the
   tailnet). Expected: `tailscale status` from another device no longer lists `laptop`
   as active.
2. From a second tailnet device, run
   `curl -sS https://holocron.tail011a51.ts.net:44111/health`.
   Expected: HTTP **200**, `"status":"ok"`, `"fleet":{"ready":true,...}` naming a
   non-loopback endpoint, and `data_plane` reported as `postgres` — not `convex`.
3. From that device, request the seeded document:
   `curl -sS -H "Authorization: Bearer $HOLO_KEY_MCP" https://holocron.tail011a51.ts.net:44111/api/documents/{seeded-id}`.
   Expected: HTTP **200** with the seeded document's title in the body. A 410 with
   `retired_cloud_plane_removed_d08_02` is a FAIL.
4. Open the holocron app on the phone or simulator and send one chat message.
   Expected: tokens stream back and a reply persists in the conversation.
5. On `inference1` (and `inference2`), confirm the request was served locally — the
   oMLX server log shows the completion, or the holocron router's metrics show the
   request routed to that mini.
6. On the laptop, run `tailscale up` to restore the fleet's normal state.
   Expected: the holocron service stays healthy throughout; no restart required.

## Tasks

*Expanded just-in-time by `/kb-sprint-tasks-plan` from the dispatched specialist SET
(`mastra-planner`, `devops-engineer`, `mcp-planner`). See "Task Detail Files" below.*

## Source Coverage

- `.spec/prds/mk6-migration/07-uc-infer.md` — UC-INFER (local inference & role router)
- `.spec/prds/mk6-migration/04-uc-plat.md` — UC-PLAT (platform foundation, deployment)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC (cutover, data-plane flip)
- `.spec/prds/mk6-migration/10-technical-requirements/06-external-dependencies.md` — LiteLLM router + fleet contract
- `.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` — runtime readiness contract

## Capability Coverage

- `CAP-INFER-01` — role router resolves every role to a live local endpoint
- `CAP-PLAT-01` — deployed runtime reports truthful readiness
- `CAP-CUT-01` — data plane serves content from Postgres

## Blocks

- Depends on the in-flight `imp-mk6-functional-completeness-1786837297` task
  **MK6-DATA-001** for proof that the deployed Postgres holds the real migrated corpus.
  The data-plane flip in this sprint MUST NOT land before that proof exists — flipping
  onto an unproven database converts a loud 410 into a silent wrong answer.
- Overlaps `MK6-FLEET-001` (same sprint set) on fleet routing. Sprint 33 owns the
  **router and model provisioning**; MK6-FLEET-001 owns the **in-service routing config**.
  Reconcile before both land.

## Known Gaps Carried Into This Sprint

- **`qwen3-reranker` is unobtainable from the current fleet.** No reranker model exists
  on the laptop or either mini. The manifest's `rerank` role is `degradationAction:
  fail-closed`, so reranked hybrid RRF search (Sprint 10's deliverable) fails at call
  time regardless of endpoint. This does NOT block the gate above — `probeFleet`
  (`http/health.ts:204`) checks endpoint reachability, not per-role model availability.
  Recorded as an explicit gap for a later sprint, not silently downgraded.

## Task Detail Files

Generated by `/kb-sprint-tasks-plan` on 2026-08-16. Avg quality 106.5/115 (min 105).
Every task's `REQUIREMENT-CONTRACT v1` block validated non-vacuously against
`validate_scenario.py` from the rendered file — scenario_count matches AC count on all 13.

Dependency-ordered:

- `S33-OPS-01-provision-qwen38-27b-8bit-onto-inference2-and-inference1-dis.md`
- `S33-OPS-02-package-the-litellm-router-as-a-docker-compose-service-and-d.md`
- `S33-OPS-05-provision-qwen3-embedding-06b-4bit-dwq-onto-both-minis-and-w.md`
- `S33-OPS-03-wire-the-scheduler-compose-service-to-fleeturl-fleetkey-so-b.md`
- `S33-OPS-04-fix-the-fictional-fleeturl-example-and-prove-the-fleet-depen.md`
- `S33-PLAT-01-make-the-container-fleet-endpoint-explicit-and-fail-closed-k.md`
- `S33-PLAT-02-make-resolvemodel-reach-the-real-router-add-configured-base.md`
- `S33-PLAT-03-make-health-tell-the-truth-about-the-fleet-per-role-model-av.md`
- `S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md`
- `S33-PLAT-04-flip-the-data-plane-convex-to-postgres-behind-a-fail-closed.md`
- `S33-MCP-01-getdocument-surfaces-a-named-retired-plane-error-and-real-po.md`
- `S33-MCP-02-hybridsearch-performs-real-fleet-backed-rrf-retrieval-or-fai.md`
- `S33-MCP-03-prove-the-44-tool-mcp-surface-on-the-deployed-service-over-b.md`

