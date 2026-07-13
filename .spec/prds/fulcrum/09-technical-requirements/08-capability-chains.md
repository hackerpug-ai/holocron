---
stability: CONSTITUTION
last_validated: 2026-07-12
prd_version: 1.0.0
---

# Capability Chains

Boundary-crossing promises that must hold end-to-end. Each names the trigger, the ordered hops, the boundary contracts, failure modes, real-service proof, and the owning specialist.

## CAP-DISPATCH-01 — Convex dispatches a cycle to the tailnet worker and receives an exactly-once commit

- **Promise**: a scheduled cycle runs on the tailnet worker and its effects land in the ledger exactly once, even across worker/backend restarts.
- **Trigger**: `fulcrum.scheduler.tick` enqueues a work item.
- **Hops**: Scheduler → `fulcrumWorkQueue` row (pending) → Worker `queue.lease` (leased, `cycleKey` assigned) → Worker runs phases → Worker `cycle.commit(idempotencyKey=cycleKey)` → Ledger append.
- **Boundary contracts**: lease has a TTL; commit is unique on `idempotencyKey` and returns the stored result on replay; an expired lease is re-dispatched.
- **Failure modes**: worker dies mid-cycle (lease expires → re-dispatch; no partial commit); double-dispatch (idempotency collapses to one); Convex unreachable from worker (worker retries with backoff, cycle stays leased).
- **Real-service proof**: SIGKILL the worker between ASSAY and COMMIT against a real Convex dev deployment; reopen; assert exactly one committed cycle and no orphan evidence/claims.
- **Owner**: `convex-planner` / `convex-implementer` (queue + commit), `pi-agent-implementer` (worker loop).

## CAP-INFER-01 — A cycle phase runs on local inference through the role map

- **Promise**: SENSE/GENERATE/ASSAY/CHALLENGE each execute on the correct local model, never cloud (unless opted in), with ASSAY≠CHALLENGE.
- **Trigger**: worker enters a phase needing a model.
- **Hops**: phase → `modelFor(role)` → `createOpenAI({ baseURL })` → LiteLLM `/v1` → `reviewer`/`implementer` node → tokens back.
- **Boundary contracts**: base URL is a local endpoint; role map resolves to distinct models for ASSAY vs CHALLENGE (assert-distinct, fail-closed); no cloud provider constructed on the cycle path unless `FULCRUM_CLOUD_FALLBACK` is on.
- **Failure modes**: endpoint down (fleet health → degraded/offline → sense-only); role map misconfigured to identical models (cycle refuses to run); timeout (retry on the same role, then degrade).
- **Real-service proof**: run a real cycle with the fleet up and confirm from telemetry that ASSAY hit the convergent endpoint and CHALLENGE the divergent one; then take the fleet offline and confirm sense-only, no cloud call.
- **Owner**: `pi-agent-implementer` (provider + phases), `mcp-reviewer` (no-cloud-leak audit).

## CAP-EVIDENCE-01 — A retrieved source becomes an admitted, quote-verified, graded claim

- **Promise**: nothing enters a score without a fetched source, a verified verbatim quote, a deterministic grade, and an admission decision.
- **Trigger**: ASSAY extracts a candidate claim.
- **Hops**: retrieval (Exa/Jina) → fetched source content → normalize → `verifyQuote` (substring) → `gradeEvidence` (tier×recency) → `evaluateAdmission` → `provenanceSweep` → append evidence+claim → `computeScore`.
- **Boundary contracts**: quote must be an exact substring of normalized source or the claim is rejected; unknown domain → unclassified → provisional; a provenance group counts once; self-sourced never corroborates.
- **Failure modes**: fabricated quote (rejected by substring check); syndicated evidence (collapsed to one group); holocron self-citation (flagged self-sourced, excluded from independence); stale evidence (out-of-window → provisional).
- **Real-service proof**: feed a real fetched page and a claim whose quote is *not* present → assert rejection; feed a valid quote → assert admission and a score change of exactly the expected weighted amount; feed the same content on three domains → assert one provenance group.
- **Owner**: `convex-implementer` (Gate module), `convex-reviewer` (determinism + no-model audit).

## CAP-PUBLISH-01 — A committed finding becomes searchable holocron knowledge

- **Promise**: a candidate's current synthesis is published into the holocron `documents` store (embedded, searchable) so the loop feeds the archive it also reads.
- **Trigger**: a cycle materially changes a candidate's synthesis.
- **Hops**: commit → Brief/Dossier generator → `documents` insert/update + embedding → hybrid/vector search index.
- **Boundary contracts**: re-publish updates rather than duplicates (idempotent upsert keyed to the candidate); published findings are tagged so a later SENSE marks them self-sourced.
- **Failure modes**: duplicate documents (upsert prevents); self-citation laundering (self-sourced tag prevents independence credit).
- **Real-service proof**: run two cycles on one candidate against a real Convex deployment; assert one document exists, updated, embedded, and searchable, and that a subsequent retrieval of it is tagged self-sourced.
- **Owner**: `convex-implementer`.

## CAP-GATE-01 — An operator verdict transitions state under the invariants

- **Promise**: verdicts move candidates only within the rules (cited kill, WIP=1, probe-gated validation) and feed calibration.
- **Trigger**: `fulcrum.gate.verdict`.
- **Hops**: verdict → invariant checks (cited-claim exists / WIP slot free / probe recorded) → stage transition + verdict row + touch row → (on kill) closeout claim.
- **Boundary contracts**: uncited kill rejected; second active-build advance rejected; `→validated` without a `fulcrumProbes` row rejected.
- **Failure modes**: attempted uncited kill (rejected); WIP violation (rejected); premature validation (rejected).
- **Real-service proof**: exercise each rejection against a real deployment and confirm the state does not change; confirm a valid advance transitions and writes a touch.
- **Owner**: `convex-implementer` / `convex-reviewer`.
