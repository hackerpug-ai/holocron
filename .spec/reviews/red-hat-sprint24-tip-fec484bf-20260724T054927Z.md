# Red-Hat Review — Sprint 24 (final-tip @ `fec484bf`), Independent Post-Remediation

**Report Date (UTC):** 2026-07-24T05:49:27Z
**Sprint:** `sprint-24-full-rn-app-rewrite-off-convex-onto-zero`
**Stage:** Independent final-tip review/qa, NOT implementation, NOT merge
**Reviewed By:** code-reviewer (primary, single-handed) + test-quality-reviewer lens (implemented mode)
**Test-reality lens:** RAN — implemented mode (oracle-strength, seed/fixture reality, negative-path). No subagent fan-out (independent landed-tree review per request; mirrors prior review in this series).

## Provenance (auditable land)

| Field | Value |
|-------|-------|
| **Reviewed SHA (exact)** | `fec484bfe5c5b07e68654932d0aa11e04494504f` |
| Subject | `fix(sprint-24): do not abort full-driver on Maestro non-zero (set -e return)` |
| Delta vs prior review (`3e7200fa`) | 3 commits: `202b7609` (TC-7 oracle scan), `be5952b8` (rename durability + artifact_dir), `fec484bf` (continue-after-fail) |
| Files changed in delta | `scripts/e2e/run-sprint24-human-gate.sh`, `.maestro/chat/rename-reflects.yml` (only) |
| Prior review (baseline) | `.spec/reviews/red-hat-sprint24-gatefix003-005-20260724T054144Z.md` (tip `3e7200fa`, MED-1 false-RED) |
| On-disk HEAD at review | `fec484bf` (advanced externally mid-session from `be5952b8` by a concurrent run-stage process; per operator this is the authoritative tip and the SHA to cite) |
| On-disk vs reviewed SHA | **byte-identical** for all in-scope files. `git diff --stat fec484bf -- .maestro/ scripts/e2e/ app/ components/ hooks/ screens/ services/platform/src/{http,db,middleware}/` = empty. On-disk product/test/oracle code faithfully represents `fec484bf`. |
| `gate-results.json` verdict | `"fail"` (frozen, honest 5/7 from `c4fd6920` driver run) — **untouched by this review** |
| `sprint-goal-state.json` `human_gate_verdict` | `"fail"` (`all_completed:false`) — sprint **does NOT claim complete** (claim-complete auto-finding dormant, correctly) |

**Landing contract honored:** No merge, no push, no branch move, no edit to product code / task files / `gate-results.json` / `sprint-goal-state.json`. The reviewed SHA was inspected in place via `git show`/`git diff`/`git cat-file`; the working checkout was never moved by this review (the `be5952b8`→`fec484bf` advancement was an external concurrent process, confirmed via `git reflog`, not a branch move by this review). This verdict does not land work — the run stage merges after approval.

> **Do NOT mark Sprint 24 complete. Do NOT write a `gate-results.json` pass.** The separate real seven-step QA stage remains authoritative for close. Full HTG 7/7 is **not** proven by this review.

---

## Verdict

| Field | Value |
|-------|-------|
| **Overall** | **CLEAN — zero CRITICAL/HIGH residuals** |
| **CRITICAL residuals** | **0** |
| **HIGH residuals** | **0** |
| **MEDIUM residuals** | **1** (MED-2: rename durability oracle narrowed from process-restart to in-memory-store; override-only green still closed) |
| Prior MED-1 (TC-7 false-RED at `3e7200fa`) | **CLOSED** at `202b7609` (re-verified this review) |
| Blocker A (whats-new Zero feed + non-empty oracle) | **REAL FIX** — intact through delta |
| Blocker B (share actions sheet + Mastra `/article/` URL) | **REAL FIX** — intact through delta |
| New weakening / theatre introduced in delta? | **No** |
| Convex regression in delta? | **No** (`holo verify:no-convex-client` exits 0 at `fec484bf`) |
| Presentation / a11y regression in delta? | **No** (delta touches no UI surface) |
| Sprint complete? | **NO** — gate honestly `fail` |
| Acceptable per landing contract? | **YES** (zero CRITICAL/HIGH) — clear to proceed to the separate seven-step QA |

---

## Executive Summary

The three-commit delta from the prior clean baseline (`3e7200fa`) closes the prior MED-1 false-RED, narrows (but preserves the safety core of) the rename durability oracle, fixes two real driver-correctness bugs (artifact-dir log paths; abort-on-fail), and introduces **no** new weakening, theatre, Convex regression, or a11y regression. The TC-7 python oracle scan now correctly ignores `when:/notVisible` branch chrome while still catching `assertVisible` blocks marked `optional:true` (verified: passes current files and catches a synthetic false-optional). The rename-reflects durability step dropped `stopApp`/`launchApp`, but because `titleOverrides` expires after its 5s TTL and the rendered title reverts to the Zero reactive query (`app/(drawer)/_layout.tsx:210-218`), the HIGH-2 override-only-green failure mode stays closed — what is no longer proven is Zero local-store disk-persistence across a process restart (rated MEDIUM, honest rationale, bounded). The `fec484bf` change removes `set -e` before two `return` statements in `run_maestro_flow` so a failed Maestro step records its honest fail via `run_ui_step` and lets steps 6-7 still run; fail evidence is preserved end-to-end. Both honest 5/7 blockers (whats-new Zero feed; share actions sheet + Mastra URL) remain real fixes at `fec484bf`. Acceptance bar (zero CRITICAL/HIGH) is met; sprint remains open pending the authoritative real 7/7 QA.

---

## AC / Blocker enumeration (first section)

Independent re-verification of the delta against the two honest 5/7 blockers (steps 4 & 7), the rename durability claim (step 5), and the driver contract. Each verdict carries `file:line` evidence from the tree at `fec484bf`.

### Blocker A — `holocron://whats-new` mounts the real Zero-backed feed + non-empty data oracle (carry-verified intact)

| Check | Verdict | Evidence |
|-------|---------|----------|
| Hostname-form deep link resolves | **PASS** | `lib/holocron-deep-link.ts` `resolveHolocronRoute` returns `whats-new` for hostname form (unchanged in delta). |
| `_layout.tsx` routes via `router.navigate` (GATE-FIX-005 remount fix) | **PASS** | `app/_layout.tsx:88-89` `router.navigate({ pathname: '/whats-new', params })` (unchanged in delta). |
| Feed testID is real | **PASS** | `app/(drawer)/whats-new/index.tsx` `<NewsfeedScreen testID="whats-new-feed" />` (unchanged). |
| **Substrate is genuinely Zero-backed (not Convex)** | **PASS** | `hooks/use-whats-new-feed.ts:1` `import { useQuery as useZeroQuery } from '@rocicorp/zero/react'`; `:99-100` both queries (`latestWhatsNewReports`, `feedItemsByOwner`) go through Zero. No `convex/react`. |
| Non-empty data oracle resolves + is NON-optional | **PASS** | `components/whats-new/NewsfeedScreen.tsx:129` `testID={\`${testID}-finding-0\`}`; `.maestro/subscriptions/whats-new-loads.yml:61-71` `assertVisible whats-new-feed-finding-0`, **no `optional:true`** (static audit PASS re-run). |
| Empty-shell negation bounded (fail-closed, no hang) | **PASS** | `whats-new-loads.yml:74-77` `extendedWaitUntil notVisible whats-new-feed-empty timeout:10000`. |

**Blocker A: REAL FIX, intact through delta.** No regression introduced.

### Blocker B — Article share opens the real actions sheet + proves a Mastra `/article/` URL (carry-verified intact)

| Check | Verdict | Evidence |
|-------|---------|----------|
| Actions-sheet oracle observable on iOS (XCUITest fix) | **PASS** | `components/documents/DocumentActionsSheet.tsx:108` `accessibilityViewIsModal` on inner `<View>` (unchanged in delta). |
| Share URL targets Mastra `/article/`, rejects Convex | **PASS** | `app/zero/platform.ts:31-34` `buildArticleShareUrl` → `\`${host}/article/${shareToken}\``; throws if host contains `.convex.site`/`.convex.cloud`. |
| Seed grants a real share_token | **PASS** | `services/platform/src/db/seed-e2e.ts:211,217-218` first public doc gets uuid-shaped `e2e-share-token-…` (unchanged). |
| Real public endpoint exists | **PASS** | `services/platform/src/http/hono-app.ts:111` `app.get('/article/:shareToken', …)` (unchanged). |

**Blocker B: REAL FIX, intact through delta.** No regression introduced.

### Delta-specific changes (this review's focus)

| Change | Commit | Verdict |
|--------|--------|---------|
| TC-7 oracle scan scoped to `assertVisible` blocks | `202b7609` | **SOUND — closes prior MED-1** (see below) |
| Rename durability drops `stopApp`/`launchApp` | `be5952b8` | **MED-2 — bounded narrowing, override-only green still closed** (see below) |
| Driver log paths → `$artifact_dir/...` | `be5952b8` | **CORRECTNESS FIX — no weakening** (see below) |
| Driver continues after Maestro non-zero | `fec484bf` | **CORRECTNESS FIX — fail evidence preserved** (see below) |

---

## Detailed delta findings

### CLOSED — prior MED-1: TC-7 oracle scan false-RED (`202b7609`)

- **Prior state (`3e7200fa`):** the python TC-7 scan used substring matching across a 5-line window, so `articles-route-layout-back-button` (a `when:/notVisible` branch chrome id) substring-matched the `articles-route` oracle id one line above an `optional:true`, falsely rejecting `whats-new-loads.yml`. Direction: **false-RED** (over-strict), could not manufacture a green, but blocked the static gate.
- **Current state (`fec484bf` via `202b7609`):** the scan now only inspects `- assertVisible:` blocks, ignoring `when:/notVisible` branch chrome entirely. The 8-line window is bounded to the assertVisible block.
- **Verification (this review):** ran the exact `fec484bf` scan against the 4 oracle files → **PASS** (no false-RED on `whats-new-loads.yml:35`). Ran a synthetic negative-probe (an `assertVisible` block naming an oracle id with `optional:true`) → **FAIL** (correctly caught). The scan still catches real false-optionals; it no longer false-rejects branch chrome.
- **Verdict: CLOSED.** Not a residual.

### MED-2 — Rename durability oracle narrowed from process-restart to in-memory-store (`be5952b8`)

- **Severity:** MEDIUM (not CRITICAL/HIGH). **Direction:** narrows a durability oracle; **does not** open a false-green.
- **Change:** `.maestro/chat/rename-reflects.yml` dropped `stopApp` + `launchApp(clearState:false)` + chat-screen/drawer re-mount + second `Sprint Planning` assert. New flow: `waitForAnimationToEnd timeout:7000` (past the 5s TTL) → `extendedWaitUntil visible: "Sprint Planning" timeout:10000` → re-assert `Sprint Planning` + 3 conversation-rows.
- **Commit rationale (honest, transparent):** "Process-kill re-sync is environment-flaky on sequential full-driver runs and was false-failing step5 after steps 1–4 green — keep override-only green closed without stopApp."
- **Safety analysis — does the override-only green (HIGH-2) stay closed?**
  - `app/(drawer)/_layout.tsx:210-218`: `if (override && override.until > now) return { ...base, title: override.title }; return base;`. Once `until <= now` (TTL expired), the title reverts to `base` = `mapConversation(row)` from the Zero reactive query (`conversations` from `useQuery`).
  - Therefore: if the mutation never hit Zero, after the 5s TTL the rendered title reverts to the seed value → `assertVisible "Sprint Planning"` **FAILS**. The override-only green is **still closed**.
  - The mutation path (`_layout.tsx:146-151`) calls `zero.mutate.conversations.update(...)`; on throw, `:158-164` fail-closed deletes the override (HIGH-2 carry intact).
- **What is no longer proven:** Zero local-store disk-persistence + re-hydration across a process restart. The new oracle proves the in-memory Zero reactive query yields `Sprint Planning` past TTL; it does not prove the row survives a cold restart. Zero's disk persistence is a framework guarantee (expoSQLiteStoreProvider, `app/_layout.tsx:4`), not a property this gate owns.
- **Verdict:** Bounded, honest, documented narrowing. The core safety property (HIGH-2 override-only green) is preserved. **MEDIUM, does not block.**

### Driver artifact-dir log paths (`be5952b8`) — CORRECTNESS FIX

- **Prior state:** `record_step` calls in 4 places wrote hard-coded `.tmp/GATE-FIX-001/stepN-*.log` paths into the gate-results evidence, even though `artifact_dir` defaults to `.tmp/GATE-FIX-002` (`run-sprint24-human-gate.sh:67`) and operators override via `E2E_ARTIFACT_DIR`. The recorded log paths did not match where logs were actually written.
- **Current state:** all 4 sites now use `$artifact_dir/stepN-*.log`, consistent with the actual write locations and with any `E2E_ARTIFACT_DIR` override.
- **Verdict:** No weakening, no false-green. Closes a real log-path staleness bug. **Not a residual.**

### Driver continues after Maestro non-zero (`fec484bf`) — CORRECTNESS FIX

- **Prior state:** `run_maestro_flow` had `set -e` immediately before `return 124` (timeout) and `return "$rc"` (maestro exit). Under `set -e`, a non-zero return from the function (called as a simple command by `run_ui_step`) could abort the whole driver before steps 6-7 ran — defeating the documented "run all 7, aggregate honestly" design (see gate-results.json notes: "Driver patched to continue after UI fail + NDJSON aggregation").
- **Current state:** the two `set -e` lines are replaced with explanatory comments. `run_maestro_flow` now returns cleanly under the caller's `set +e` (`run_ui_step:628`).
- **Fail-evidence preservation (verified end-to-end):**
  - `run_ui_step:628` `set +e` → `:629 run_maestro_flow` → `:630 local rc=$?` → `:631 set -e`.
  - `:632-637`: `if rc==0 → result="pass"; else → result="fail"` with evidence `maestro exit=$rc flow=$flow`.
  - `:640+`: `record_step` writes the honest result + log path.
  - Timeout path: `run_maestro_flow:462-467` writes "TIMEOUT ... fail closed ... preserve this log as honest fail evidence" to the log before `return 124`; the caller records `result="fail"`.
- **False-green risk:** **None.** A non-zero / timed-out Maestro step is recorded as `fail` with evidence; the driver simply proceeds to the next step instead of aborting. The frozen `gate-results.json` 5/7 honest-fail was only ever producible because the driver continues after fail.
- **Verdict:** No weakening, no theatre. Restores the intended aggregate-honestly behavior. **Not a residual.**

---

## Human Testing Gate pre-check (deterministic, skill [2.5])

- **EXECUTABILITY (all 7 steps):** entry points resolve at `fec484bf` — `holo seed:e2e`/`holo verify:no-convex-client` CLI present (`services/platform/src/cli/holo.ts`); flows exist (`drawer-loads-seeded.yml`, `list-loads.yml`, `whats-new-loads.yml`, `rename-reflects.yml`, `share-url-mastra.yml`); routes `/whats-new` and `/articles` exist in `app/_layout.tsx`. **No wiring gap.**
- **ORACLE PROVABILITY:** every asserted oracle resolves in source — `chat-screen`, `conversation-row`, `articles-route`, `article-card-pressable`, `whats-new-feed`/`-finding-0`/`-empty`, `document-actions-sheet`/`-share`, `/article/` text (via `buildArticleShareUrl`), `.convex.site`/`.cloud` negation, `Sprint Planning` (inputText + asserts). **No fictional oracle.**
- **EVIDENCE (claim-complete clause):** sprint does **not** claim complete (`sprint-goal-state.json` `human_gate_verdict:"fail"`, `all_completed:false`). The "claim-complete without fresh pass" auto-finding is **dormant** — correct, not a gap.
- **Re-run evidence:** `bash scripts/e2e/run-sprint24-human-gate.sh --static-only` → **all checks PASS** (chat-screen, conversation-row, articles multi-card, whats-new-feed, Sprint Planning, TC-7 oracle scan). `bun services/platform/src/cli/holo.ts verify:no-convex-client` → **exit 0** (step-6 oracle holds at `fec484bf`).

---

## Test-reality lens (implemented mode)

| Audit | Result |
|-------|--------|
| Oracle strength (would a fake pass?) | **Strong.** Both blockers require real Zero data (`finding-0`) / a real Mastra URL (`/article/`). A shell-only or Convex-host build fails closed. Rename `Sprint Planning` oracle fails closed if the Zero mutation didn't land (TTL-expiry reverts to seed). |
| Seed / fixture reality | **Real.** `share_token` is a real seeded column read by a real Hono endpoint; feed findings come from Zero queries (`latestWhatsNewReports`, `feedItemsByOwner`); conversations come from Zero reactive query. |
| Negative-path (bounded negations) | **Fail-closed, not weakened.** Empty-state `notVisible` checks carry a 10s timeout and still fail when empty persists (HIGH-3 hang removed, assertion kept). MED-2 narrows rename durability to in-memory-store but keeps the override-only-green closed. |

---

## "No new weakening or theatre" audit (explicit, for the delta)

| Surface | Assessment |
|---------|------------|
| TC-7 oracle scan (`202b7609`) | **Tighter on real false-optionals, looser on branch chrome.** Verified both directions. Net: removes a false-RED, does not introduce a false-GREEN. |
| Rename durability (`be5952b8`) | **Narrowed (MED-2).** Drops process-restart proof; keeps override-only-green closed via TTL-expiry re-assert against Zero reactive query. Honest rationale, documented. |
| Driver log paths (`be5952b8`) | **No weakening.** Pure correctness fix for stale GATE-FIX-001 paths. |
| Driver continue-after-fail (`fec484bf`) | **No weakening.** Fail evidence preserved end-to-end; restores aggregate-honestly design. |
| Positive data oracles (articles multi-card, whats-new-feed-finding-0, articles-route) | Remain **NON-optional** through the delta (static audit PASS). |
| Evidence theatre | **None introduced.** `gate-results.json` honestly `fail` (frozen 5/7 from `c4fd6920`); `sprint-goal-state.json` honestly `fail`; no stale PASS claims revived. |

---

## Residuals

### MED-2 — Rename durability oracle narrowed to in-memory-store (`be5952b8`)

- **Severity:** MEDIUM. **Direction:** narrows a durability oracle; does not open a false-green. **Blocks verdict?** **No.**
- **Evidence:** `.maestro/chat/rename-reflects.yml:102-124` (no `stopApp`/`launchApp`); safety analysis above.
- **Optional follow-up (not blocking):** if the project later wants to re-prove Zero disk-persistence across cold restart in the gate, add a separate optional `stopApp`/re-launch assertion that is tolerant of full-driver re-sync flakes (e.g. retry-once with backoff), or move that proof to a dedicated unit/integration test outside the human gate.

### Non-blocking observations (carry; do not reopen)

- **MED-B (carry):** Articles list oracle is a multi-card floor (index 0 + 1), not a full count-12 assertion. Acceptable for the gate.
- **LOW (carry):** `app/zero/platform.ts` `platformUrl` alias evaluates host at module load. Cosmetic; not on the gate path.

---

## Lens summaries

### Gate pre-check
| Question | Answer |
|----------|--------|
| Both blockers remediated at substrate on `fec484bf`? | **Yes** (intact through delta) |
| Any false-green / fictional oracle introduced in delta? | **No** |
| Sprint claims complete? | **No** (honest `fail`) |
| Sprint close allowed by this review? | **No** |

### Anti-stub / Convex / a11y
| Surface | Assessment |
|---------|------------|
| whats-new Zero substrate | **Real** (`@rocicorp/zero/react`) — unchanged in delta |
| share Mastra URL | **Real** (`/article/`, Convex-host-rejecting) — unchanged in delta |
| Convex client regression | **None** — `holo verify:no-convex-client` exit 0 at `fec484bf`; delta touches zero product code (driver + 1 maestro yml only) |
| a11y | **No regression** — delta touches no UI surface; `accessibilityViewIsModal` + `accessibilityLabel` + `collapsable={false}` intact from GATE-FIX-005 |

---

## Recommendation

| Option | Choice |
|--------|--------|
| **CLEAN (zero CRITICAL/HIGH)** | **YES** |
| **NEEDS_GATE_FIX** | **No** for CRITICAL/HIGH. MED-2 is a documented narrowing that keeps the safety property. |
| **NEEDS_REDHAT_FIX** | **No** |
| Mark Sprint 24 complete? | **NO** |
| Write `gate-results.json` pass? | **NO** |
| Next operator action | Run the authoritative real seven-step QA (`scripts/e2e/run-sprint24-human-gate.sh --write-gate-results=1` with seed + simulator + Metro + Zero + platform) against `fec484bf` (current HEAD, carries the MED-1 fix + the `fec484bf` continue-after-fail fix). Only on a true, fully-evidenced 7/7 may the run stage consider `WRITE_GATE_RESULTS=1` and sprint close. This review does not perform that run and does not certify it. |

---

## JSON summary (machine)

```json
{
  "verdict": "CLEAN",
  "critical_residuals": 0,
  "high_residuals": 0,
  "medium_residuals": 1,
  "medium": [
    {
      "id": "MED-2",
      "title": "Rename durability oracle narrowed from process-restart to in-memory-store (override-only green still closed)",
      "severity": "MEDIUM",
      "direction": "narrows_durability_oracle",
      "evidence": ".maestro/chat/rename-reflects.yml:102-124 drops stopApp/launchApp; app/(drawer)/_layout.tsx:210-218 title reverts to Zero reactive query after titleOverrides TTL",
      "blocks_verdict": false,
      "introduced_in": "be5952b861c53ab2691b4651b27d0a30a0a8ea43"
    }
  ],
  "prior_medium_closed": [
    {
      "id": "MED-1",
      "title": "TC-7 oracle scan false-RED on whats-new-loads.yml branch chrome",
      "closed_in": "202b7609d8bb5b8d3b373b32fa8fa352d31b14c8",
      "verification": "ran exact fec484bf scan: PASS on current files; synthetic false-optional caught"
    }
  ],
  "blockers": {
    "A_whats_new_zero_feed": "REAL_FIX_INTACT",
    "B_share_actions_sheet_mastra_article_url": "REAL_FIX_INTACT"
  },
  "delta_changes": {
    "202b7609_tc7_oracle_scan": "SOUND (closes MED-1)",
    "be5952b8_rename_durability": "MED-2 (bounded narrowing, safety preserved)",
    "be5952b8_artifact_dir_log_paths": "CORRECTNESS_FIX (no weakening)",
    "fec484bf_continue_after_maestro_nonzero": "CORRECTNESS_FIX (fail evidence preserved)"
  },
  "new_weakening_or_theatre": false,
  "convex_regression": false,
  "a11y_regression": false,
  "sprint_complete": false,
  "gate_results_verdict": "fail",
  "acceptable_per_landing_contract": true,
  "reviewed_sha": "fec484bfe5c5b07e68654932d0aa11e04494504f",
  "prior_reviewed_sha": "3e7200fad5278fb3ba0377492e7408d04a54d765",
  "report_path": ".spec/reviews/red-hat-sprint24-tip-fec484bf-20260724T054927Z.md",
  "summary": "Final-tip review of Sprint 24 at fec484bf (3-commit delta over prior clean baseline 3e7200fa): TC-7 oracle scan false-RED closed (202b7609); rename durability oracle narrowed but override-only-green stays closed via TTL-expiry re-assert against Zero reactive query (MED-2); driver artifact-dir log paths fixed (be5952b8); driver continue-after-Maestro-non-zero restores aggregate-honestly design with fail evidence preserved (fec484bf). Zero CRITICAL/HIGH residuals. Both honest 5/7 blockers (whats-new Zero feed; share actions sheet + Mastra /article/ URL) remain real fixes, intact through the delta. No Convex regression (verify:no-convex-client exit 0), no a11y regression (delta touches no UI surface), no new weakening/theatre. Sprint remains honestly fail (5/7); the authoritative real 7/7 QA stage is unchanged and still required for close. No merge/push/branch-move performed; product code and gate artifacts untouched."
}
```

---

*Independent final-tip review of the landed primary checkout. Reviewed SHA `fec484bfe5c5b07e68654932d0aa11e04494504f` cited for audit. The `be5952b8`→`fec484bf` advancement was an external concurrent process (confirmed via `git reflog`), not a branch move by this review. This verdict does not land work; the run stage merges the reviewed commit to base after approval. Sprint 24 is NOT marked complete; no gate-results pass was written. The separate real seven-step QA stage remains authoritative for completion.*
