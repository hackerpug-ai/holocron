---
stability: CONSTITUTION
last_validated: 2026-08-20
prd_version: 3.0.0
---

# Capability Chains

Boundary-crossing promises that must hold end-to-end. Each names the trigger, the ordered hops, the boundary contracts, failure modes, real-service proof, and the owning specialist. Owners are **`mastra-*`**. There is no Convex publish hop and no SQLite commit hop.

## CAP-COMMIT-01 — A cycle commits to Postgres exactly once, kill-9-safe

- **Promise**: a cycle's effects land in the evidence graph exactly once and atomically, even if the Mastra service or scheduler-worker is killed mid-cycle.
- **Trigger**: `fulcrum:cycle` selects a work item and derives its `idempotencyKey`.
- **Hops**: `selector.next` (Postgres) → `mission:execute` → stage graph → `evidence-gate` → `commit` stage → one Postgres transaction appending sources/claims/`belief_scores`/lineage + `mission_runs` row.
- **Boundary contracts**: `mission_runs` unique on `(template_key, idempotency_key)` and returns the stored commit on replay; a `budget_exceeded` / failed cycle still writes an explicit run row.
- **Failure modes**: process killed mid-cycle (transaction either commits or does not — never partial; the item is re-selected under the same key → one commit); double-run (idempotency collapses to one).
- **Real-service proof**: SIGKILL the Mastra service between ASSAY and COMMIT, reopen Postgres, assert all-or-nothing across `sources` / `claims` / `belief_scores` / `mission_runs`, 20 iterations.
- **Owner**: `mastra-implementer` (runtime + commit); `mastra-reviewer` (idempotency + lease).

## CAP-INFER-01 — A cycle phase runs on local inference through live role names

- **Promise**: SENSE-plan / GENERATE / ASSAY / CHALLENGE each execute on the correct local model, never cloud (unless opted in), with ASSAY≠CHALLENGE, and never on `judge`.
- **Trigger**: a stage needing a model.
- **Hops**: stage → `modelRoleBindings` (`divergent` / `convergent` / `embed`) → loopback `http://127.0.0.1:{router_port}/v1` → `inference1`/`inference2` → tokens back. Optional `fleet.json` aliases `fulcrum-assay`/`fulcrum-challenge` resolve 1:1 onto those roles.
- **Boundary contracts**: role map resolves to distinct models for ASSAY vs CHALLENGE (assert-distinct on **resolved** identity from `x-litellm-model-api-base` / `x-litellm-model-id` + `GET /model/info`, fail-closed); no cloud provider on the cycle path unless `FULCRUM_CLOUD_FALLBACK` is on; `judge` is never requested.
- **Failure modes**: no-host for a role (degrade-and-name; never retry under a different role); role map identical (cycle refuses); timeout (retry **same** role, then degrade).
- **Real-service proof**: run a real cycle with the fleet up and confirm from **headers** that ASSAY hit `divergent` and CHALLENGE hit `convergent` on two distinct models; then stop oMLX on both minis and confirm reduced mode, no cloud call, no `judge`.
- **Owner**: `mastra-implementer` (bindings + stages), `mastra-reviewer` (no-cloud-leak, no-judge, no-coder-role audit).

## CAP-EVIDENCE-01 — A retrieved source becomes an admitted, quote-verified, graded claim

- **Promise**: nothing enters a `belief_scores` row without a fetch artifact, a verified verbatim quote ⊆ `normalizedText`, a deterministic grade, and an admission decision.
- **Trigger**: ASSAY extracts a candidate claim (agent = extract only).
- **Hops**: registry tool (`hybrid_search` / `search_fts` / `search_vector` / `search_research` / `get_research_session` / `get_document`) → fetch artifact `{ url, fetchedAt, raw, normalizedText, contentHash }` on `sources` → `verifyQuote(quote, normalizedText)` → `gradeEvidence` → `evaluateAdmission` → `provenanceSweep` → append claim → `computeScore` (LED code, not an agent tool).
- **Boundary contracts**: quote must be an exact substring of that artifact's `normalizedText` or the claim is rejected; unknown domain → unclassified → provisional; a provenance group counts once; self-sourced never corroborates; quotes must **not** be sliced from RRF `sourceText`.
- **Failure modes**: fabricated quote (rejected); syndicated evidence (collapsed); holocron self-citation (flagged self-sourced); stale evidence (out-of-window → provisional).
- **Real-service proof**: feed a real `documents`/`passages` hit and a claim whose quote is *not* present in `normalizedText` → assert rejection; feed a valid quote → assert admission and a `belief_scores` change of exactly the expected weighted amount; feed the same content on three domains → assert one provenance group. Fail if the quote equals `sourceText.slice(0, 280)`.
- **Owner**: `mastra-implementer` (Gate module), `mastra-reviewer` (determinism + no-`generateText` audit of gate/score modules).

## CAP-PUBLISH-01 — A committed finding becomes searchable holocron knowledge

- **Promise**: a candidate's current synthesis is published into `documents` (embedded 1024-dim, searchable) so the loop feeds the archive it also reads.
- **Trigger**: a cycle materially changes a candidate's synthesis.
- **Hops**: commit → Markdown generator → `publishDocumentForRun` → `documents` insert/update (idempotent on `source_run_id`) → hybrid/vector index on `passages`/`documents`.
- **Boundary contracts**: re-publish updates rather than duplicates; published findings are tagged so a later SENSE marks them self-sourced; embed via the `embed` role (1024-dim).
- **Failure modes**: duplicate documents (upsert prevents); self-citation laundering (self-sourced tag prevents independence credit).
- **Real-service proof**: run two cycles on one candidate against **real Postgres**; assert one `documents` row exists, updated, 1024-dim embedded, and searchable, and that a subsequent retrieval of it is tagged self-sourced. No Convex hop.
- **Owner**: `mastra-implementer`.

## CAP-GATE-01 — An operator verdict transitions state under the invariants

- **Promise**: verdicts move candidates only within the rules (cited kill, WIP=1, probe-gated validation) and feed calibration. `ackBrief` writes a `touches` row.
- **Trigger**: `holo fulcrum verdict` → `POST /api/missions/:id/verdicts`. `holo fulcrum ack-brief` → `POST /api/missions/:id/touches`.
- **Hops**: verdict → invariant checks (cited-claim exists / WIP slot free / probe recorded) → stage transition + `mission_verdicts` row + `touches` row → (on kill) closeout claim.
- **Boundary contracts**: uncited kill rejected; second active-build advance rejected; `→validated` without a `probes` row rejected; file read of a brief does not write a touch.
- **Failure modes**: attempted uncited kill (rejected); WIP violation (rejected); premature validation (rejected).
- **Real-service proof**: exercise each rejection against **real Postgres** and confirm state does not change; confirm a valid advance transitions and writes a touch; confirm `holo fulcrum ack-brief` inserts `touches.touch_type='brief_ack'`.
- **Owner**: `mastra-implementer` / `mastra-reviewer`.
