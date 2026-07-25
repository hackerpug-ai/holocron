# Sprint 25 Review Artifact — Reactive Surfaces

| Field | Value |
|-------|-------|
| **Task** | S-REACTIVE-05 (capstone reviewer pass) |
| **Sprint** | 25 — Reactive Surfaces (SSE, Mission/Research Progress, Degraded) |
| **Reviewer** | react-native-ui-reviewer |
| **Date (UTC)** | 2026-07-25T15:05:00Z |
| **Device** | iPhone 17 — iOS 26.5 — `C79BF38C-D353-46A2-A1ED-CCA6D68E1B04` |
| **Seed** | `bun services/platform/src/cli/holo.ts seed:e2e --reset` (exit 0) |
| **Metro** | `http://127.0.0.1:8081` (main packager serving merged reactive surfaces) |
| **Platform** | `http://127.0.0.1:4111` health ok |
| **Evidence root** | `.tmp/S-REACTIVE-05/` |
| **Closure gate** | **BLOCKED** — unresolved FAIL rows remain (see Summary) |

## Summary

| Task | Primary PRD criteria | Worst verdict | Closure |
|------|----------------------|---------------|---------|
| S-REACTIVE-01 | T-SYNC-006 | **PASS** (PRIMARY reconnect) / FAIL on AC-1 final oracle flake | Partial block |
| S-REACTIVE-02 | T-SYNC-005 | **PASS** | OK |
| S-REACTIVE-03 | T-SYNC-007 | **PASS** | OK |
| S-REACTIVE-04 | T-INFER-015 | **PASS** (no-hang) / **FAIL** (recovery Maestro) | **BLOCKED** |

**Sprint-25 ACs for this reviewer task:**

| ID | Statement | Verdict |
|----|-----------|---------|
| S-REACTIVE-05 AC-1 | Artifact cites all four tasks with evidence-backed per-AC verdicts | **PASS** |
| S-REACTIVE-05 AC-2 | Reconnect re-verified — 0 duplicate tokens; T-SYNC-006 PASS | **PASS** |

---

## S-REACTIVE-01 — Resumable SSE + exactly-once reconcile

**PRD:** UC-SYNC-02 / **T-SYNC-006**

| AC | Verdict | Maestro exit | Evidence path(s) | Notes |
|----|---------|--------------|------------------|-------|
| AC-1 Token streaming | **FAIL** | `1` | `.tmp/S-REACTIVE-05/logs/token-streaming.txt`; `.maestro/reactive/token-streaming.yml` | Mid-stream oracles `chat-stream-token-count` + `…-at-least-1` **COMPLETED**; final re-assert of `chat-stream-token-count-at-least-1` **FAILED** after stream → durable reconcile resets phase to `idle` (oracles unmount). Not a missing stream — oracle lifecycle race. |
| AC-2 Reconnect zero dups **[PRIMARY]** | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/reconnect-exactly-once.txt`; `.tmp/S-REACTIVE-05/screenshots/S-REACTIVE-01-AC-2-reconnect-exactly-once.png`; `.maestro/reactive/reconnect-exactly-once.yml` | Airplane mid-stream → resume → `chat-assistant-message-latest` once. No duplicate-token signal in log. **T-SYNC-006 → PASS**. |
| AC-3 Exactly one final message | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/exactly-one-final-message.txt`; screenshot `S-REACTIVE-01-AC-3-exactly-one-final-message.png`; `.maestro/reactive/exactly-one-final-message.yml` | Single latest assistant bubble after terminal. |
| AC-4 Last-Event-ID gap-fill | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/last-event-id-gap-fill.txt`; `.maestro/reactive/last-event-id-gap-fill.yml` | Gap-fill path green. |
| AC-5 Cancel stops stream | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/cancel-stops-stream.txt`; screenshot `S-REACTIVE-01-AC-5-cancel-stops-stream.png`; `.maestro/reactive/cancel-stops-stream.yml` | Stop control finalizes partial turn. |

### T-SYNC-006

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| **T-SYNC-006** Resumable SSE tokens + durable consistency | **PASS** | Maestro `reconnect-exactly-once` exit `0`; log shows airplane toggle with pre-disconnect `chat-stream-token-count-at-least-1` + post-reconnect single `chat-assistant-message-latest`; screenshot `.tmp/S-REACTIVE-05/screenshots/S-REACTIVE-01-AC-2-reconnect-exactly-once.png`. Duplicate token count observed: **0**. |

### Compliance (S-REACTIVE-01 surfaces)

| Check | Verdict | Evidence |
|-------|---------|----------|
| Theme tokens (no hardcoded hex in chat stream UI) | **PASS** | Compliance audit: no `#[hex]` in `ChatThread.tsx` / chat route (`.tmp/S-REACTIVE-05/logs/compliance-audit.txt`) |
| testID coverage | **PASS** | `chat-screen`, `stop-generating-button`, stream oracles, reconnect indicator — `components/chat/ChatThread.tsx`, `app/(drawer)/chat/[conversationId].tsx` |
| Accessibility | **PASS** | `accessibilityRole`/`accessibilityLabel` on stop, degraded, reconnect; stream oracles accessible |
| ScreenLayout / safe area | **PASS** | `ScreenLayout` + `useSafeAreaInsets` in `app/(drawer)/chat/[conversationId].tsx` |
| WARN — duplicate degraded banner | **WARN** | `chat-degraded-banner` rendered in both `ChatThread` and conversation footer (non-blocking) |

---

## S-REACTIVE-02 — Live research progress via Zero

**PRD:** UC-SYNC-02 / **T-SYNC-005**

| AC | Verdict | Maestro exit | Evidence path(s) | Notes |
|----|---------|--------------|------------------|-------|
| AC-1 Progress advances to 3/5 **[PRIMARY]** | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/research-progress-advances.txt`; harness `.maestro/reactive/run-research-progress-advances.sh`; flow `.maestro/reactive/research-progress-advances.yml`; screenshots `S-REACTIVE-02-AC-1-progress-{1,2,3}-of-5.png` | Live Zero-driven label advances. |
| AC-2 Bound to `research_sessions` | **PASS** | n/a (static contract) | `services/platform/src/db/schema/zero-pub.ts` (`research_sessions`); `app/zero/queries.ts` (`researchSessionById`); `app/zero/schema.ts` (`current_iteration`/`max_iterations`) | Code evidence in compliance audit. |
| AC-3 Mobile compliance | **PASS** | `0` (same research flow) | `DeepResearchDetailView.tsx` uses `SafeAreaView`, theme classes, `testID=research-progress-bar` + a11y progressbar; route uses `ScreenLayout` | See compliance audit. |

### T-SYNC-005

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| **T-SYNC-005** Live research progress on app | **PASS** | Maestro research flow exit `0`; progress screenshots under `.tmp/S-REACTIVE-05/screenshots/`. |

---

## S-REACTIVE-03 — Cross-surface p95 ≤ 5s

**PRD:** UC-SYNC-02 / **T-SYNC-007**

| AC | Verdict | Maestro exit | Evidence path(s) | Notes |
|----|---------|--------------|------------------|-------|
| AC-1 MCP→app ≤5s p95 **[PRIMARY]** | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/cross-surface-sync-slo.txt`; harness `.maestro/reactive/run-cross-surface-sync-slo.sh`; flow `.maestro/reactive/cross-surface-sync-slo.yml`; screenshots `S-REACTIVE-03-AC-1-cross-surface-p95-pass.png`, `…-p95-fifth-iteration.png` | Real MCP update path + p95 helper. |
| AC-2 ≥5 iterations measured | **PASS** | n/a (flow structure) | `.maestro/reactive/helpers/assert-p95-slo.js`; flow loops ≥5; `MIN_SAMPLES`/`SYNC_SLO_MS=5000` | Evidence in flow + helpers. |

### T-SYNC-007

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| **T-SYNC-007** Cross-surface change meets sync SLO | **PASS** | Maestro cross-surface harness exit `0`; p95 assert via `helpers/assert-p95-slo.js`. |

---

## S-REACTIVE-04 — Degraded local fleet unavailable

**PRD:** UC-SYNC-02 / **T-INFER-015**

| AC | Verdict | Maestro exit | Evidence path(s) | Notes |
|----|---------|--------------|------------------|-------|
| AC-1 Fleet-down → exact message, no hang **[PRIMARY]** | **PASS** | `0` | `.tmp/S-REACTIVE-05/logs/degraded-no-hang.txt`; harness `.maestro/reactive/run-degraded-no-hang.sh`; flow `.maestro/reactive/degraded-no-hang.yml`; screenshot `S-REACTIVE-04-AC-1-degraded-no-hang.png` | Exact `Local fleet unavailable — running in reduced mode`; `chat-degraded-banner`; `chat-agent-busy-false`; no stop-spinner hang. |
| AC-2 Inferred from chat failure envelope | **PASS** | n/a (contract) | `hooks/use-resumable-sse-stream.ts` (`applyFleetFailureEnvelope`, `SURFACE_UNAVAILABLE_MESSAGE`); platform `degraded-mode-controller.ts` | Client does **not** Zero-query `degraded_mode`. |
| AC-3 Recovers when fleet returns **[PRIMARY]** | **FAIL** | `1` | `.tmp/S-REACTIVE-05/logs/degraded-recovery.txt`; harness `.maestro/reactive/run-degraded-recovery.sh`; flow `.maestro/reactive/degraded-recovery.yml` | Banner clears (`chat-degraded-banner` not visible **COMPLETED**) and a **successful post-restore stream** appears in UI, but Maestro fails `assertNotVisible: "Local fleet unavailable — running in reduced mode"` because durable assistant rows still contain that exact string in transcript history. **Closure blocker.** |

### T-INFER-015

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| **T-INFER-015** Clear unavailable state in chat (no hang) | **PASS** (no-hang) / **FAIL** (full recovery oracle) | No-hang Maestro exit `0` + screenshot; recovery Maestro exit `1` (history text oracle). |

### FAIL remediation (S-REACTIVE-04 AC-3)

1. Prefer Maestro oracle on `chat-degraded-banner` / `chat-stream-phase-degraded` only (live state), **or**
2. Do not persist `SURFACE_UNAVAILABLE_MESSAGE` as durable `chat_messages.content` for fleet-unavailable failures (keep banner-only UX), **or**
3. Soft-delete/replace the degraded error bubble when a successful post-restore turn completes.

Functional recovery (banner off + new successful reply) is visible in failure screenshots under `.tmp/S-REACTIVE-05/screenshots/screenshot-❌-*-degraded-recovery.yml.png` — still **FAIL** for the authored Maestro AC.

---

## S-REACTIVE-05 reviewer ACs

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 Artifact cites S-REACTIVE-01..04 with per-AC rows + Maestro exit + file path | **PASS** | This file; four task sections above; matrix `.tmp/S-REACTIVE-05/logs/exit-matrix.json` |
| AC-2 Reconnect zero dups + T-SYNC-006 PASS | **PASS** | reconnect exit `0`; T-SYNC-006 row above; PNG under `.tmp/S-REACTIVE-05/screenshots/` |

### Verify commands (executed)

```text
holo/bun seed:e2e --reset                          → exit 0  (.tmp/S-REACTIVE-05/logs/seed-e2e*.txt)
maestro test .maestro/reactive/reconnect-exactly-once.yml → exit 0
maestro test .maestro/reactive/{token-streaming,exactly-one-final-message,last-event-id-gap-fill,cancel-stops-stream}.yml
bash .maestro/reactive/run-research-progress-advances.sh → exit 0
bash .maestro/reactive/run-cross-surface-sync-slo.sh     → exit 0
bash .maestro/reactive/run-degraded-no-hang.sh           → exit 0
bash .maestro/reactive/run-degraded-recovery.sh          → exit 1
pnpm tsc --noEmit / pnpm typecheck                     → exit 2 (pre-existing platform upload typing)
pnpm lint                                              → exit 1 (pre-existing biome errors)
python3 validate_scenario.py .validate-payloads/S-REACTIVE-05.json → exit 0
```

---

## Maestro exit matrix (this re-run)

| Flow | Exit | Log |
|------|------|-----|
| token-streaming | 1 | `.tmp/S-REACTIVE-05/logs/token-streaming.txt` |
| reconnect-exactly-once | 0 | `.tmp/S-REACTIVE-05/logs/reconnect-exactly-once.txt` |
| exactly-one-final-message | 0 | `.tmp/S-REACTIVE-05/logs/exactly-one-final-message.txt` |
| last-event-id-gap-fill | 0 | `.tmp/S-REACTIVE-05/logs/last-event-id-gap-fill.txt` |
| cancel-stops-stream | 0 | `.tmp/S-REACTIVE-05/logs/cancel-stops-stream.txt` |
| research-progress-advances | 0 | `.tmp/S-REACTIVE-05/logs/research-progress-advances.txt` |
| cross-surface-sync-slo | 0 | `.tmp/S-REACTIVE-05/logs/cross-surface-sync-slo.txt` |
| degraded-no-hang | 0 | `.tmp/S-REACTIVE-05/logs/degraded-no-hang.txt` |
| degraded-recovery | 1 | `.tmp/S-REACTIVE-05/logs/degraded-recovery.txt` |

Machine-readable: `.tmp/S-REACTIVE-05/logs/exit-matrix.json`

---

## Theme / a11y / testID / ScreenLayout audit

Full dump: `.tmp/S-REACTIVE-05/logs/compliance-audit.txt`

| Surface | Theme | a11y | testID | ScreenLayout/SafeArea | Verdict |
|---------|-------|------|--------|------------------------|---------|
| Chat streaming / degraded | className tokens | alert roles, labels | extensive e2e oracles | ScreenLayout + insets | **PASS** (+ WARN duplicate banner) |
| Research progress | className tokens | progressbar a11y | `research-progress-bar/label` | SafeAreaView + ScreenLayout | **PASS** |
| Cross-surface (document read path) | exercised via existing doc UI | flow-level | flow asserts title visibility | n/a (journey) | **PASS** |

No hardcoded hex colors found on rewired reactive surface components under review.

---

## Typecheck / lint (TC-3)

| Gate | Exit | Notes |
|------|------|-------|
| `pnpm typecheck` | 2 | Pre-existing: `services/platform/src/uploads/service.ts` JSONValue typing — **not introduced by Sprint 25 reactive surfaces** |
| `pnpm lint` | 1 | Pre-existing biome debt across repo — **WARN**, non-blocking for this review task's Maestro ACs |

Evidence: `.tmp/S-REACTIVE-05/logs/typecheck.txt`, `.tmp/S-REACTIVE-05/logs/lint.txt`

---

## Closure decision

| Question | Answer |
|----------|--------|
| May Sprint 25 close? | **NO** |
| Blockers | **S-REACTIVE-04 AC-3** Maestro recovery FAIL (exit 1); **S-REACTIVE-01 AC-1** token-streaming final oracle FAIL (exit 1) |
| Non-blocking WARNs | Duplicate `chat-degraded-banner`; pre-existing typecheck/lint |
| Capstone S-REACTIVE-05 ACs | **Satisfied** (artifact + T-SYNC-006 re-verify) |

---

## Attempt / environment notes

1. Worktree Metro with symlinked `node_modules` initially served Expo tutorial welcome screen (empty router context). Reviewer switched to main holocron Metro on `:8081` which bundled real `chat-screen` routes.
2. Degraded harnesses require `services/platform/node_modules` resolvable from the worktree (linked for this pass).
3. Port **8766** conflict: MCP sync server vs restore-fleet server; recovery re-run used `RESTORE_SERVER_PORT=8767`.
4. Deterministic stream pace raised to `HOLO_CHAT_DETERMINISTIC_PACE_MS=700` for mid-stream airplane window (reconnect PASS).
