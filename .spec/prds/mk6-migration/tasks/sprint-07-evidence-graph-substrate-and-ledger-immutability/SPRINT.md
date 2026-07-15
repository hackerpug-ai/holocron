---
sprint: 7
title: Evidence-Graph Substrate and Ledger Immutability
sequence: 7
timeline: Phase 1 — Platform Foundation
status: Planned
prd: ../../README.md
capability_coverage: []
---

# Sprint 7: Evidence-Graph Substrate and Ledger Immutability

**Sequence:** 7
**Timeline:** Phase 1 — Platform Foundation
**Status:** 🔵 Planned
**Proposed by:** mastra-planner
**Branch:** `mk6-evidence-ledger`

---

## Overview

This is a Phase-1 Platform Foundation sprint that turns the Sprint-04 evidence-graph tables into an **immutable, append-only ledger** with bi-temporal revision. Sprint 04 already stood up the substrate — `sources → passages → claims → entities → relations → beliefs` in `services/platform/src/db/schema/evidence.ts`, shape-complete with `valid_from`/`valid_to` (world-truth window), `tx_from`/`tx_to` (system-knowledge window), the `supersedes_id` supersession chain on `beliefs`, `actor`/`run_id`/`idempotency_key` provenance, and partial `*_current_idx` indexes scoped `WHERE tx_to IS NULL`. What does **not** exist yet is the immutability *enforcement* and the as-of *query* logic — and that is what this sprint owns. A schema with a `tx_to` column is not an immutable ledger; an immutable ledger is one where the database itself refuses a direct `UPDATE`/`DELETE` on `beliefs` and funnels every revision through a single atomic, audited transaction.

The sprint establishes four one-time foundations, each of which is a later sprint's assumption: (1) **substrate immutability-readiness** — audit the existing evidence tables against UC-DATA-02 and close only the real gaps (a uniqueness guarantee that one open belief exists per claim, an as-of index on `tx_from`, the `supports`/`contradicts` edge semantics on `relations`) plus the `holo evidence:seed` operator command, without re-creating tables Sprint 04 already delivered; (2) **DB-enforced immutability** — a new migration `0003_*` that `REVOKE`s `UPDATE`/`DELETE` on the ledger rows from the app role and installs a `SECURITY DEFINER` temporal-revision SQL function that atomically closes the predecessor's `tx_to`, inserts exactly one successor, rejects a stale concurrent revision, and is idempotent on `idempotency_key`; (3) **canonical corpus unification + as-of/net-support computation** — the `evidence:belief --as-of`, net-support (validity-windowed `supports`/`contradicts` edges), and `evidence:register-doc` (an internal doc's retrieval chunks are the *same* canonical `passages` rows, never a duplicate corpus); and (4) the **RED suite** proving every immutability guarantee fails-first against real Postgres.

A gate is only real if it fails when the behavior is absent. The RED suite proves the ledger is grounded: a direct `UPDATE`/`DELETE` on `beliefs` raises a permission error (the app role no longer holds the grant), the authorized revision transaction closes one predecessor and inserts exactly one successor, a stale concurrent revision is rejected (predecessor already closed), and an as-of query at an earlier `tx_from` still returns the pre-revision belief — the full audit chain is preserved. Per Architecture Posture AP-7, the trust model is single-user tailnet — there is **no RLS and no multi-tenant model**; the immutability enforced here is an **audit-integrity / append-only-ledger control** (enforced at the DB via `REVOKE` + a `SECURITY DEFINER` function), not a tenant-isolation layer. The substrate this sprint hardens is the surface CAP-MIG-01 loads historical Convex data into (Sprint 14) and that CAP-INF-01's research engine writes graded evidence to (Sprint 17); its deterministic admission is what the human-gate fulcrum (Sprint 23) reasons over.

---

## Human Test Deliverable

An operator can prove — with the evidence-graph tables stood up in Sprint 04 — that `holo evidence:seed` inserts a claim with two contradicting passages; that `holo evidence:belief --as-of now` returns the net current belief from validity-windowed edges; that `holo db:probe --raw "UPDATE beliefs SET ..."` raises a permission error because direct DML is denied at the database; that `holo evidence:revise <belief> --actor op` closes the prior `tx_to`, inserts exactly one successor, and records actor/run/idempotency; that two concurrent `holo evidence:revise` on the same row commit exactly one and reject the stale one; that `holo evidence:belief --as-of <earlier-tx>` still returns the pre-revision belief (audit chain intact); and that `holo evidence:register-doc <id>` yields retrieval chunks that are the same canonical `passages` rows (no duplicate corpus).

**Test Steps:**
1. Run `holo evidence:seed` — inserts a claim with two contradicting passages.
2. Run `holo evidence:belief --as-of now` — returns the net current belief from validity-windowed edges.
3. Run `holo db:probe --raw "UPDATE beliefs SET ..."` — raises a permission error (direct DML denied).
4. Run `holo evidence:revise <belief> --actor op` — closes prior `tx_to`, inserts one successor, records actor/run/idempotency.
5. Fire two concurrent `holo evidence:revise` on the same row — exactly one commits, the stale one is rejected.
6. Run `holo evidence:belief --as-of <earlier-tx>` — still returns the pre-revision belief (audit chain intact).
7. Run `holo evidence:register-doc <id>` — its retrieval chunks are the same canonical `passages` rows (no duplicate corpus).

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| ledger-1 | Evidence-graph substrate — audit/ensure immutability-readiness + bi-temporal correctness + `holo evidence:seed` | mastra-implementer | 300 min |
| ledger-2 | DB-enforced immutability: REVOKE UPDATE/DELETE + scoped temporal-revision SQL function | mastra-implementer | 240 min |
| ledger-3 | Canonical corpus unification + net-support / as-of belief computation | mastra-implementer | 210 min |
| ledger-4 | RED tests: direct DML rejected, atomic supersession, stale-concurrent rejection, as-of chain, no-dup corpus | red-test-generator | 180 min |
| ledger-5 | Review immutability + bi-temporal correctness | mastra-reviewer | 90 min |

---

## Human Testing Gate

**Gate:** Against real Postgres, a direct `UPDATE`/`DELETE` on `beliefs` is rejected at the database while the authorized temporal-revision transaction atomically closes the predecessor's `tx_to`, inserts exactly one successor, and rejects a stale concurrent revision — preserving the full as-of audit chain.

---

## Source Coverage

- UC-DATA-02 (Evidence-graph substrate) — all four ACs: insert a claim + two contradicting passages and query the current belief as-of a given transaction time; revise a belief only through the authorized temporal-revision transaction (atomically closes prior `tx_to`, inserts a successor, rejects stale concurrent revisions, preserves the audit chain); register an internal holocron document as a canonical self-sourced `source` whose retrieval chunks are the same canonical `passages` rows; confirm `supports`/`contradicts` are edges on the bi-temporal `relations` table and that a claim's net support is computable from validity-windowed edges
- UC-PLAT-01 (AC-4) — the temporal-revision transaction preserves ledger immutability
- `10-technical-requirements/03-data-schema.md` — the evidence substrate table shape (sources/passages/claims/entities/relations/beliefs) + bi-temporal columns
- `10-technical-requirements/01-architecture-posture.md` AP-1 (Postgres only) + AP-7 (tailnet trust boundary; no RLS, no multi-tenant — immutability is an audit-integrity control, not tenant isolation)
- `11-e2e-testing-criteria.md` — T-PLAT-004 (direct DML raises; authorized txn closes one predecessor, inserts one successor, rejects stale concurrent, preserves as-of chain) · T-DATA-005 (contradiction → current belief as-of) · T-DATA-006 (authorized belief revision atomic + direct DML fails) · T-DATA-007 (internal doc uses canonical source/passage corpus) · T-DATA-008 (supports/contradicts edges computable) · T-DATA-022 (canonical corpus has no duplicate physical relations — build-gate)
- Sprint 04 (the evidence-graph substrate tables + bi-temporal columns + `*_current_idx` indexes this sprint hardens and queries) · Sprint 05 (the Mastra service / Hono surface + scoped-key boundary the `evidence:*` commands mount behind)
- `services/platform/src/db/schema/evidence.ts` (existing substrate) · `services/platform/src/cli/holo.ts` (operator CLI — adds `evidence:seed|belief|revise|register-doc`) · `services/platform/src/db/migrations/` (new `0003_*` immutability migration)

## Capability Coverage

- N/A — the immutable ledger is the substrate CAP-MIG-01 loads into (Sprint 14 ETL) and CAP-INF-01's research engine writes graded evidence to (Sprint 17); no boundary-crossing capability chain is owned here. (UC-DATA-02 is a substrate, not a chain segment.)

---

## Blocks

- Sprint 14 (Big-Bang ETL — loads historical Convex claims/beliefs/relations into this immutable ledger; the ETL's reconciliation + NULL-FK audit assume the substrate + revision function exist)
- Sprint 17 (Deterministic Research Engine — writes graded, provenance-independent evidence and beliefs via the authorized revision path; its evidence gate reasons over the as-of chain this sprint establishes)
- Sprint 23 (Deterministic Human Gate — verdicts/probes persist onto this append-only ledger; WIP=1 and cited-kill determinism depend on ledger immutability)

**Dependent on:** Sprint 04 (the evidence-graph substrate tables + bi-temporal columns + `*_current_idx` indexes, and the Postgres 18 + Drizzle migration substrate this sprint extends with `0003_*`).

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-15T18:26:45Z (proposed by: mastra-planner [ledger-1, ledger-2, ledger-3, ledger-4, ledger-5]).
Avg quality score: ~100/115 (115-point rubric, min 80). Fakeability audit: **0 CRITICAL / fakeable scenarios** — `validate_scenario` clean on every behavioral AC across all 5 tasks (2 residual non-blocking HIGH wording-nits: ledger-1 NEG_CONTROL_WEAK, ledger-2 NEG_OBSERVE_WEAK).
Topological order: ledger-1 (substrate immutability-readiness + `holo evidence:seed`) → ledger-2 (DB-enforced immutability: REVOKE + `revise_belief` SECURITY DEFINER function — the gate core) → ledger-3 (canonical corpus + as-of / net-support computation) → ledger-4 (RED suite: direct-DML-rejected, atomic supersession, stale-concurrent rejection, as-of chain) → ledger-5 (adversarial review of immutability + bi-temporal correctness).

- ledger-1-evidence-graph-substrate-audit-seed-command-bi-temporal-readiness-confirmation.md
- ledger-2-db-enforced-immutability-revoke-update-delete-temporal-revision-security-definer.md
- ledger-3-canonical-corpus-unification-net-support-as-of-computation.md
- ledger-4-red-tests-immutability-supersession-as-of-chain.md
- ledger-5-review-immutability-bi-temporal-correctness.md
