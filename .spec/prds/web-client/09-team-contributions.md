---
stability: PRODUCT_CONTEXT
last_validated: 2026-08-28
prd_version: 1.0.0
---

# Team Contributions

Twelve specialist consultations across five phases. Every proposal is staged verbatim and
immutable at `.tmp/kb-prd-plan/web-client/proposals/`; the diff between those files and this PRD is
merge, dedupe and template-fill only.

## Phase 1 — User Personas

| Lens | Delivered |
|---|---|
| `frontend-designer` | 3 personas, 17 needs, 13 pains, 7 journeys, 16 design notes |
| `product-manager` | 3 personas, 16 needs, 16 pains, 9 journeys, 12 jobs-to-be-done |

Both lenses converged independently on the same three personas, and both rated the
silently-text-only sharing defect highest severity. Both also surfaced something the brief had not:
**the cold stranger is the only organic distribution path this product has**, which promotes unfurl
metadata and a provenance header from polish to load-bearing.

## Phase 2 — Architecture

| Lens | Delivered |
|---|---|
| `product-manager` | 20 functional requirements, 5 groups, 20 use cases, 88 acceptance criteria |
| `nextjs-planner` | 12 routes, 23 FRs, 11 risks |
| `trpc-planner` | 13 procedures, 16 FRs, 6 capability chains |
| `aisdk-planner` | 10 stream part types, 10 FRs, 2 chains |
| `cloudflare-workers-planner` | 4 bindings needed of 15 considered, 3 cache surfaces |
| `betterauth-planner` | 14 FRs, 7 public-boundary rules, 5 chains |

Two lenses independently discovered the same blocker: the brief's "BetterAuth tables in the device
Postgres, no new infrastructure" premise does not hold, because the tunnel carries HTTP behind
Cloudflare Access and there is no TCP path to Postgres for Hyperdrive to bind to.

`nextjs-planner` and `product-manager` each failed once to an API error mid-run and were recovered
by one full re-dispatch, recorded as such in the delivery ledger.

## Phase 3 — UI Infrastructure

| Lens | Delivered |
|---|---|
| `shadcn-ai-elements-planner` | 23 registry items, 12 reused components, 11 constraints, 14 do-not-build entries |
| `frontend-designer` | 25 colour tokens, 14 type tokens, 8 motion surfaces, 7 enforcement mechanisms, 9 accessibility requirements |

The design lens found that a holocron identity **already ships in this repo** — `global.css`
`.dark:root` is labelled *"Crystalline Archive theme — Holocron knowledge repository aesthetic"*
(`#0A0E14` field, `#E8E4DE` cream, `#F5A623` amber, `#4FD1C5` teal) — and carried those hues forward
rather than inventing a palette, buying operator/mobile continuity for free. It also flagged that
light mode is untouched shadcn defaults, which is the theme the highest-volume reader gets.

**Resolved conflict.** `shadcn-ai-elements-planner` independently proposed an oklch azure palette.
Resolved in favour of `frontend-designer`: design owns tokens, and its palette is grounded in an
identity that already exists here. The shadcn lens's structural contributions are unaffected.

## Phase 4 — Test Suite, Harness and Coverage

| Lens | Delivered |
|---|---|
| `product-manager` | 133 scenarios across 20 UCs (41 visible, 92 holdout), 98 testing criteria, 88/88 ACs covered |
| `nextjs-planner` (re-ask) | E2E harness constitution: framework, determinism seam, turnkey runner, 12 landmines, flake policy, 7 CI lanes, reference-flow gate |

The test suite's first delivery was truncated in transit; it was re-asked with the hand-off split
into parts rather than restaged from a prose summary. The orchestrator independently recomputed
every count, recomputed AC coverage from the architecture proposal, and re-ran
`validate_scenario.py` (clean: 41 scenarios, zero violations) and the flow-coverage gate (exit 0)
rather than accepting the self-report.

The harness lens corrected an error in its own brief: the field vocabulary the orchestrator
specified (`seed_method: fixture`, `artifact_type: har`/`db_row`) is rejected by the validator. The
canonical values were used.

---

_Delivery ledger: `.tmp/kb-prd-plan/web-client/_ledger.json`. Every lens DELIVERED; none
UNDELIVERED; two FAILED-then-recovered._
