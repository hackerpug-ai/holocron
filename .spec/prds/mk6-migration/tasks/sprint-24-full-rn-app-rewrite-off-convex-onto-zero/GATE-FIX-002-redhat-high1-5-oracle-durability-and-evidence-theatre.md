# GATE-FIX-002: Remediate red-hat HIGH-1..HIGH-5 (oracle durability, evidence theatre, share seed)
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `180 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `code-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Close red-hat findings HIGH-1..HIGH-5 from `.spec/reviews/red-hat-sprint24-20260724T050416Z.md` so Sprint 24 gate evidence cannot false-green: harden articles/what's-new/share/rename oracles for durability and seed counts, make rename fail-closed when Zero mutator fails (no titleOverrides-only Maestro pass), scrub dual-lens/verify-manifest theatre (kill Sprint 23 pointers; AC-1..AC-6), and invalidate stale `e2e-verification.json` PASS @ 4009dd97. Do **not** mark sprint complete or write honest `gate-results.json` pass unless a separate, later full 7/7 human-gate run exits 0 with this-cycle logs.

## Background
Authoritative review: `.spec/reviews/red-hat-sprint24-20260724T050416Z.md` (2026-07-24T05:04:16Z) at trunk `4f2545f4`. Verdict: **NEEDS GATE-FIX** (not clean). `gate-results.json` correctly remains **fail** (retracted prior false-green). REDHAT presentation greps hold; residual is gate oracle / evidence theatre / rename durability / share seed.

| ID | Finding | Required remediation |
|----|---------|---------------------|
| HIGH-1 | Full 7-step post-land Maestro gate not executed; dual-lens notes `full_htg_7_of_7: not_yet_this_cycle` | Driver + evidence contract: every step requires this-cycle log under `.tmp/GATE-FIX-002/`; refuse APPROVED / refuse gate pass without all 7; do not claim 7/7 in this task unless operator runs full driver (this task hardens readiness; full HTG is follow-on QA) |
| HIGH-2 | `titleOverrides` can green Maestro before Zero durability | Clear override on mutator failure; re-assert title after override TTL **or** kill/relaunch in rename flow; never keep override when mutate throws |
| HIGH-3 | Articles / What's New / Share not post-land proven; weak shell oracles; seed lacks `share_token` | Strengthen Maestro oracles (not shell-only); seed at least one public doc with `share_token` (or publish path); share flow must assert `/article/` not source-grep |
| HIGH-4 | GATE dual-lens / verify-manifest points at Sprint 23 evidence; APPROVED while 7/7 incomplete | Rewrite `.tmp/GATE-FIX-*/verify-manifest.json` (and dual-lens stamps) to GATE-FIX AC-1..6 only; remove sprint-23 paths; document that APPROVED requires evidence for all ACs claimed |
| HIGH-5 | Stale `.tmp/sprint-24-.../e2e-verification.json` overall PASS @ 4009dd97 | Archive/rename to `INVALID-false-green` (or delete with note) so automation cannot glob a PASS sibling while gate-results is fail |

## Specification
- **Objective:** Implement HIGH-1..HIGH-5 remediations without fabricating gate-results pass or marking S24 complete.
- **Success state:** Independent re-review of this task can mark HIGH-2..HIGH-5 closed in code/artifacts; HIGH-1 readiness is documented (driver cannot claim pass without 7 logs); `gate-results.json` remains fail until a later real 7/7 QA; no stale e2e-verification PASS; rename cannot pass on override alone; articles/whats-new/share oracles fail on empty shell; seed provides shareable document.

## Critical Constraints
### MUST
- MUST cite red-hat report path as authority; never invent a cleaner verdict
- MUST preserve `gate-results.json` **fail** unless a later full 7/7 run with real logs (out of scope to force-pass here)
- MUST fix `titleOverrides` so mutator failure clears override and UI does not lie
- MUST harden Maestro oracles for what's-new (not loading/empty shell alone), articles (≥1 card is floor; add assertNotVisible empty + multi-card or finding indices when testIDs exist), rename durability past override TTL
- MUST seed `share_token` for at least one public e2e document OR ensure publish+share Maestro path can mint one
- MUST scrub dual-lens/verify-manifest Sprint-23 pointers and AC truncation theatre
- MUST invalidate stale e2e-verification.json PASS @ 4009dd97
### NEVER
- NEVER write `gate-results.json` verdict pass without real 7-step this-cycle logs
- NEVER mark Sprint 24 complete / goal:complete from this task alone
- NEVER treat dual-lens APPROVED as substitute for 7/7 human gate
- NEVER leave `titleOverrides` active after mutator catch (HIGH-2)
- NEVER leave stale e2e-verification PASS discoverable as current truth
### STRICTLY
- STRICTLY red_first: capture RED baselines (stale e2e-verification PASS; titleOverrides-before-mutate; weak whats-new shell; sprint-23 verify-manifest pointers) before green
- STRICTLY flow_ref UC-SYNC-01 / CAP-SYNC-01 / CAP-PUB-01
- STRICTLY presentation oracles may not weaken; only strengthen

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01, CAP-PUB-01
- **Provides:** durable-rename-oracle, count-strong-articles-whats-new-oracles, share-token-seed-path, honest-gate-evidence-artifacts
- **Consumes:** red-hat-sprint24-20260724T050416Z, GATE-FIX-001 landed stack, seed-e2e, Maestro flows, run-sprint24-human-gate.sh
- **Boundary contracts:** no-false-green-gate-artifacts, rename-not-override-only, share-not-source-grep-theatre

## Acceptance Criteria

### AC-1: Invalidate stale e2e-verification PASS (HIGH-5)
- **GIVEN:** `.tmp/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/e2e-verification.json` has overall PASS @ 4009dd97
- **WHEN:** implementer archives/renames it to INVALID-false-green (or equivalent) and ensures no live path claims overall PASS from that commit
- **THEN:** no unarchived file at the original path with overall PASS; gate-results remains fail
- **Test tier:** `integration`
- **Verify:** `test ! -f .tmp/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/e2e-verification.json || jq -e '.overall != "PASS"' .tmp/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/e2e-verification.json; test -f .tmp/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/e2e-verification.INVALID-false-green.json || test -f .tmp/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/e2e-verification.json.INVALID-false-green`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Negative control — would fail if:** file still overall PASS at original path without INVALID marker
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `stale-e2e-pass-baseline`:
    - actor: `cli_user`
    - step: show RED overall PASS @ 4009dd97
    - step: archive/invalidate
    - MUST observe: INVALID archive present; live path not PASS
    - MUST NOT observe: overall PASS as current truth

### AC-2: Rename durability — no titleOverrides-only green (HIGH-2)
- **GIVEN:** drawer rename uses `titleOverrides` + `zero.mutate.conversations.update`
- **WHEN:** mutator throws OR Maestro re-asserts after override TTL / relaunch
- **THEN:** override is cleared on mutate failure; rename Maestro flow re-asserts `Sprint Planning` after durability gate (wait > override TTL **or** kill/relaunch app and re-open drawer)
- **Test tier:** `e2e`
- **Verify:** `rg -n 'titleOverrides|setTitleOverrides|mutate\\.conversations\\.update' 'app/(drawer)/_layout.tsx' && rg -n 'Sprint Planning|clearState|titleOverrides|5000|6000|7000|relaunch|killApp' .maestro/chat/rename-reflects.yml app/\(drawer\)/_layout.tsx`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Negative control — would fail if:** catch keeps override forever; Maestro only asserts once within 5s override window with no durability re-check
  - **Evidence:** artifact `stdout` + optional Maestro log
  - **Case 1** — start_ref `rename-override-baseline`:
    - actor: `user`
    - step: on mutate error clear override and surface error (no silent lie)
    - step: extend rename-reflects with post-TTL or relaunch re-assert of Sprint Planning
    - MUST observe: clear override on catch; second oracle for durable title
    - MUST NOT observe: `// on catch: keep override` as sole behavior

### AC-3: Strengthen articles / what's-new / share oracles + share seed (HIGH-3)
- **GIVEN:** list-loads only needs one card; whats-new only needs shell; share seed may lack share_token
- **WHEN:** implementer hardens flows + seed
- **THEN:** whats-new asserts not empty-only shell (e.g. assertNotVisible whats-new-feed-empty and/or finding row testIDs); articles assertNotVisible empty after cards; seed provides ≥1 public doc with share_token OR publish before share; share flow asserts `/article/` not convex.site
- **Test tier:** `e2e`
- **Verify:** `rg -n 'whats-new-feed-empty|article-card|share_token|/article/|convex.site' .maestro/articles/list-loads.yml .maestro/subscriptions/whats-new-loads.yml .maestro/articles/share-url-mastra.yml services/platform/src/db/seed-e2e.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Negative control — would fail if:** only shell testID remains; seed still has is_public without share_token and no publish path
  - **Evidence:** artifact `stdout`
  - **Case 1** — start_ref `weak-oracle-baseline`:
    - actor: `cli_user`
    - step: patch seed + maestro ymls
    - MUST observe: empty-state negation and/or multi-item oracles; share_token or publish in seed/path
    - MUST NOT observe: whats-new-feed alone as sole data oracle

### AC-4: Kill dual-lens / verify-manifest theatre (HIGH-4)
- **GIVEN:** verify-manifest or dual-lens stamps may point at Sprint 23 mission logs / truncate ACs
- **WHEN:** implementer rewrites GATE-FIX evidence manifests under `.tmp/GATE-FIX-002/` (and cleans GATE-FIX-001 manifests if still referenced)
- **THEN:** no sprint-23 path in GATE-FIX verify manifests; AC ids cover AC-1..AC-6 for GATE-FIX contracts; stamps record full_htg_7_of_7 only when real logs exist (else not_yet / false)
- **Test tier:** `integration`
- **Verify:** `! rg -n 'sprint-23-deterministic' .tmp/GATE-FIX-001 .tmp/GATE-FIX-002 2>/dev/null; test -f .tmp/GATE-FIX-002/verify-manifest.json && jq -e '.task_id=="GATE-FIX-002" or .requirements' .tmp/GATE-FIX-002/verify-manifest.json`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Negative control — would fail if:** sprint-23 paths remain; APPROVED stamp claims 7/7 without logs
  - **Evidence:** artifact `stdout`
  - **Case 1** — start_ref `theatre-baseline`:
    - actor: `cli_user`
    - step: write honest GATE-FIX-002 verify-manifest + dual-lens note
    - MUST observe: no sprint-23 refs; full_htg not claimed green without logs
    - MUST NOT observe: mission-cycle sprint-23 log paths as AC verify

### AC-5: Full-driver readiness contract without forged pass (HIGH-1)
- **GIVEN:** post-land full 7/7 not executed; dual-lens said not_yet
- **WHEN:** implementer updates `scripts/e2e/run-sprint24-human-gate.sh` comments/guards so WRITE_GATE_RESULTS pass requires step logs 1..7 present and non-empty this-cycle, and documents required log names under `.tmp/GATE-FIX-002/`
- **THEN:** driver still refuses pass with skipped/blocked steps; README or script header lists required step log filenames; gate-results.json on disk remains fail after this task unless real run later
- **Test tier:** `integration`
- **Verify:** `rg -n 'WRITE_GATE_RESULTS|steps_passed|skipped|step2-coldboot|step3-articles|step7-share' scripts/e2e/run-sprint24-human-gate.sh && jq -e '.verdict=="fail"' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Negative control — would fail if:** task writes gate-results pass without logs
  - **Evidence:** artifact `stdout`
  - **Case 1** — start_ref `htg-not-run-baseline`:
    - actor: `cli_user`
    - step: strengthen driver guards + document log contract
    - MUST observe: gate-results still fail; pass path requires 7 real logs
    - MUST NOT observe: hand-written pass

## Files (expected)
- `app/(drawer)/_layout.tsx` — titleOverrides durability
- `.maestro/chat/rename-reflects.yml` — post-TTL / relaunch oracle
- `.maestro/articles/list-loads.yml`, `.maestro/subscriptions/whats-new-loads.yml`, `.maestro/articles/share-url-mastra.yml`
- `services/platform/src/db/seed-e2e.ts` — share_token
- `scripts/e2e/run-sprint24-human-gate.sh` — pass guards / log names
- `.tmp/GATE-FIX-002/*` — RED/GREEN evidence + honest verify-manifest
- `.tmp/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/e2e-verification*` — invalidate stale PASS

## Out of scope
- Marking Sprint 24 complete / goal:complete
- Forcing full 7/7 QA pass in this task (follow-on after independent review clean)
- Re-opening REDHAT theme/a11y (already PASS greps)

## Authority
- **Review:** `.spec/reviews/red-hat-sprint24-20260724T050416Z.md`
- **Prior gate:** `gate-results.json` verdict fail (by design)
