# Sprint 3 Closeout

**Closed:** 2026-07-14
**Disposition:** Completed — acceptance gate passed (gate-verified, not administrative).

## Gate result

`holo mcp:verify-manifest` exits 0 reporting **44/44 tools covered, both transports** (stdio + Streamable HTTP, MCP protocol 2025-11-25, stateless, no server sampling). The completeness gate has real teeth: removing the live `store_document_success.json` fixture flips the bare re-run to **exit 1** naming `store_document`; the fixture was restored git-clean afterward. The verdict was independently recomputed — recomputed `pass` == claimed `pass`, 6/6 steps, **0 discrepancies** (`gate-verification.json`).

- `sprint-goal-state.json`: `met: true` — 5-layer AND: 10 tasks complete (5 original + 5 REDHAT-FIX) + gate PASS + **380/380 E2E PASS** + build (typecheck + lint) PASS + human-test PASS.
- `gate-results.json`: `verdict: pass`, `verified: true`, commit under test `63500b5`.
- `GATE-RESULTS.md`: VERIFIED — 6/6 recomputed, 0 discrepancies.

## Red-hat remediation

Two adversarial review cycles were run and remediated: cycle 1 (REDHAT-FIX-01/02/03 — tautological replay assertions, fixture coverage, fail-closed field validation) and cycle 2 (REDHAT-FIX-04/05 — parameterized cross-source replay validation, error-code catalog). All 5 fixes landed with commits and RED evidence.

## Harness finding (recorded, not a product defect)

The QA runner `exec-step.sh` masks non-zero exit codes as 0 inside an interactive zsh cmux pane (process-substitution + job-control resets `$?`). A locally-corrected runner captured true exits; product behavior was unchanged and unstubbed (verified by direct invocation). Recommended upstream patch noted in `GATE-RESULTS.md`. No product source was touched for the gate.

## Landed work

All 10 tasks (mcp-manifest-01..05 + REDHAT-FIX-01..05) landed as a series of `feat`/`fix(sprint-03)` commits directly on `main`; the terminal commit under test is **`63500b5`** (cycle-2 evidence refresh). There is no GitHub PR — this `.spec` sprint executed via direct-to-main commits; the commit URL is the landing reference recorded in the roadmap.

## Closeout actions

- Synced the AC-N acceptance checkboxes across all 10 task files to reflect the gate/e2e-verified criteria. Trailing tooling/evidence/scope self-check boxes are left unchecked, per the repo's post-land convention (see `schema-2`/`schema-5`).
- `SPRINT.md` body status corrected to **Completed** (frontmatter already `Completed`).

## Resumes into

- **Sprint 19** — MCP Gateway Rehost flips the gateway onto Postgres against this frozen 44-tool manifest, on both transports.
