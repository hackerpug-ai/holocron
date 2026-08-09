# Offline contract — airplane-mode reads (S31-FE-07)

**UC-SYNC-01 AC-5 second conjunct · CAP-SYNC-01 · CAP-CUT-01**  
**iOS Simulator only** (01-scope.md:48). Offline-first without zero-cache remains Out of Scope (01-scope.md:78).

This runbook proves **exactly one** of the five declared offline-contract behaviours end-to-end with Maestro against genuinely stopped launchd services. The other four stay design intent under risk **R23**.

---

## Scope — five conjuncts (UC-SYNC-01 AC-5)

| # | Conjunct | Status | Evidence |
|---|----------|--------|----------|
| 1 | **airplane-mode reads** | **PROVEN** | Flow `.maestro/reactive/offline-contract-airplane-reads.yml` segment 1; harness `.maestro/reactive/run-offline-contract-airplane-reads.sh`; video `.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/S31-FE-07-segment-1.mp4` |
| 2 | queued writes | **Not covered** — risk **R23** | — |
| 3 | rejection rollback | **Not covered** — risk **R23** | — |
| 4 | duplicate replay | **Not covered** — risk **R23** | — |
| 5 | concurrent-edit outcomes | **Not covered** — risk **R23** | — |

**Do not claim** that UC-SYNC-01 AC-5 is fully satisfied. Only airplane-mode reads is proven here.

What “airplane-mode reads” means in this proof:

- With zero-cache stopped and confirmed not answering on `:4848`, opening a seeded research session reaches the existing terminal error surface (`research-detail-error` / copy `Research session not found`) within `ZERO_ROW_WATCHDOG_DEADLINE_MS + 10000ms`.
- At the same assertion point, `research-detail-loading` and `Loading research session...` are **not** visible (negative assertion is load-bearing).
- Segment 2 (supporting): with zero-cache restored and holocron-mastra stopped on `:4111`, sending a chat message surfaces exactly one `chat-degraded-banner` with copy `Local fleet unavailable — running in reduced mode`.

---

## Prerequisites

- Booted **iOS Simulator** with Expo development build `com.holocron.app`
- Metro serving this worktree on `:8081`
- Postgres answering (launchd `holocron-postgres` or equivalent)
- Operator shell has worktree `bin/` first on `PATH` (`export PATH="$PWD/bin:$PATH"`)
- `maestro` CLI installed; `xcrun simctl` available

---

## Stop order and down-confirmation

### Segment 1 — zero-cache down, Mastra up

1. **Seed while zero-cache is up** (so Postgres rows exist before the outage):

   ```bash
   holo seed:e2e --reset
   # If PONR_IMMUTABLE blocks TRUNCATE, use the harness upsert fallback (it is automatic).
   ```

2. **Stop holocron-zerocache only** (do not touch Mastra yet):

   ```bash
   DOMAIN="gui/$(id -u)"
   launchctl bootout "${DOMAIN}/holocron-zerocache" 2>/dev/null || true
   # Also kill any non-launchd zero-cache listener on 4848
   for p in $(lsof -nP -iTCP:4848 -sTCP:LISTEN -t 2>/dev/null || true); do kill -9 "$p" 2>/dev/null || true; done
   pkill -9 -f 'zero-cache' 2>/dev/null || true
   ```

3. **Down-confirmation (must fail)**:

   ```bash
   curl -sf --max-time 2 http://127.0.0.1:4848/keepalive && echo STILL_UP && exit 1
   # Expected: non-zero curl exit (connection refused or empty close)
   curl -sf --max-time 2 http://127.0.0.1:4111/health >/dev/null  # Mastra must still answer
   ```

4. **Video capture (segment 1)**:

   ```bash
   EVIDENCE=".spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence"
   mkdir -p "$EVIDENCE"
   xcrun simctl io booted recordVideo --codec=h264 "$EVIDENCE/S31-FE-07-segment-1.mp4" &
   REC_PID=$!
   ```

5. **Run harness / Maestro** (prefer the fail-closed harness — it re-checks keepalive before invoking Maestro):

   ```bash
   bash .maestro/reactive/run-offline-contract-airplane-reads.sh
   ```

   Or segment-only (after services already match segment 1):

   ```bash
   MAESTRO_OFFLINE_SEGMENT=1 maestro test .maestro/reactive/offline-contract-airplane-reads.yml \
     -e MAESTRO_OFFLINE_SEGMENT=1 \
     -e MAESTRO_APP_ID=com.holocron.app \
     -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
     -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL" \
     -e MAESTRO_RESEARCH_SESSION_URL=holocron://research/00000000-0000-4000-8000-e00000000033 \
     -e MAESTRO_CHAT_URL=holocron://chat/00000000-0000-4000-8000-0000000000e1 \
     -e MAESTRO_RESEARCH_ERROR_TIMEOUT_MS=40000
   ```

6. **Stop video** (`kill -INT $REC_PID` or Ctrl-C the recorder). Confirm the file exists and shows `Research session not found` with no loading spinner.

### Segment 2 — zero-cache up, Mastra down

1. **Restore zero-cache** and poll until healthy:

   ```bash
   export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
   export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-postgres://127.0.0.1:5432/holocron_nonprod}"
   nohup bash scripts/run-zero-cache.sh >/tmp/zero-restore.log 2>&1 &
   until curl -sf --max-time 2 http://127.0.0.1:4848/keepalive; do sleep 0.5; done
   ```

2. **Stop holocron-mastra only** (platform on `:4111`):

   ```bash
   DOMAIN="gui/$(id -u)"
   launchctl bootout "${DOMAIN}/holocron-mastra" 2>/dev/null || true
   for p in $(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null || true); do kill -9 "$p" 2>/dev/null || true; done
   ```

3. **Down-confirmation**:

   ```bash
   curl -sf --max-time 2 http://127.0.0.1:4111/health && echo MASTRA_STILL_UP && exit 1
   # Expected: exit 7 connection refused (or equivalent non-zero)
   curl -sf --max-time 2 http://127.0.0.1:4848/keepalive  # zero must answer
   ```

4. **Run segment 2** (harness does this automatically after segment 1):

   ```bash
   MAESTRO_OFFLINE_SEGMENT=2 maestro test .maestro/reactive/offline-contract-airplane-reads.yml \
     -e MAESTRO_OFFLINE_SEGMENT=2 \
     ... # same env as segment 1
   ```

5. Capture screenshot evidence under `.gate-evidence/` (harness copies Maestro shots as `S31-FE-07-segment-2-*.png`).

---

## Fail-closed preflight (AC-4)

The harness **must not** invoke Maestro for segment 1 while `:4848/keepalive` still returns ok.

```bash
# With holocron-zerocache deliberately still running:
OFFLINE_CONTRACT_AC4_PROBE=1 bash .maestro/reactive/run-offline-contract-airplane-reads.sh
# Expected: exit non-zero, stderr/stdout names port 4848, zero Maestro invocations
```

---

## Negative control — spinner forced (AC-3)

Proves the negative loading assertion is load-bearing (not a vanity positive-only check).

**Proven scratch (this stack):** temporary early-return in `hooks/useResearchSession.ts` `useDeepResearchSession` that forces `{ session: undefined, isLoading: true, error: null }` when a sessionId is present. Segment 1 then stays on `research-detail-loading` / `Loading research session...` and never reaches `Research session not found`.

**Why not pure `useZeroRowWatchdog → null`:** on this stack, disabling the watchdog alone does **not** force RED. Zero can settle the row to `null` (query completed, no match) rather than leave it `undefined`; the research screen then takes the `error || !viewData` branch and still shows `research-detail-error`. The spinner scratch is the load-bearing regression for AC-3.

Operator steps (or use the harness helper below):

1. Identify the project root Metro is serving (cwd of the process listening on `:8081`). The scratch **must** land there; editing a sibling worktree while Metro serves another is a silent no-op and produces a false pass.
2. Scratch-edit `<metro-root>/hooks/useResearchSession.ts` — at the top of `useDeepResearchSession`, force `isLoading: true` (marker `S31_FE_07_SCRATCH_SPINNER`). The harness resolves this path automatically via `lsof` on `:8081`.
3. Allow Metro Fast Refresh / re-bundle to deliver the regressed hook (the harness warms `index.bundle` after apply).
4. With zero-cache stopped, run segment 1 only. **Expected: Maestro FAILS** (never sees `Research session not found` / `research-detail-error` within the deadline; loading remains visible).
5. `git checkout -- hooks/useResearchSession.ts` in the Metro project root, wait for refresh, re-run segment 1 — **Expected: exit 0**.
6. **Never commit** the scratch edit.

Harness helper:

```bash
OFFLINE_CONTRACT_NEGATIVE_CONTROL=1 bash .maestro/reactive/run-offline-contract-airplane-reads.sh
# Writes .gate-evidence/S31-FE-07-AC-3-negative-control.txt with RED exit + GREEN exit + log tails
```

---

## Restore (AC-5) — reverse stop order

Always restore **Mastra first if it is down for segment 2**, then ensure zero-cache is up (or reverse of the last stop). After a full harness run both must answer:

```bash
# Restore Mastra / platform on :4111 (prefer original process command or launchd)
DOMAIN="gui/$(id -u)"
launchctl bootstrap "$DOMAIN" "$HOME/Library/LaunchAgents/holocron-mastra.plist" 2>/dev/null \
  || (cd "$HOLO_ROOT" && nohup bun services/platform/src/cli/holo.ts service:up >/tmp/mastra-restore.log 2>&1 &)

# Restore zero-cache on :4848
export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-postgres://127.0.0.1:5432/holocron_nonprod}"
nohup bash scripts/run-zero-cache.sh >/tmp/zero-restore.log 2>&1 &

# Poll both
until curl -sf --max-time 2 http://127.0.0.1:4848/keepalive; do sleep 0.5; done
until curl -sf --max-time 2 http://127.0.0.1:4111/health; do sleep 0.5; done
```

Healthy-stack flows (must pass after restore):

```bash
maestro test .maestro/research/session-loads.yml
maestro test .maestro/chat/send-streams.yml
```

Must **not** observe `research-detail-error` or `chat-degraded-banner` on the healthy stack.

---

## Operator checklist

- [ ] Seeded before any bootout
- [ ] Segment 1: keepalive on 4848 fails; 4111 healthy
- [ ] Segment 1: video shows error, not spinner
- [ ] Segment 2: 4848 healthy; 4111 refuses; exactly one degraded banner (count on video/screenshot)
- [ ] AC-4 probe exits non-zero naming 4848 with zero Maestro runs
- [ ] AC-3 regressed build fails; checkout restores green
- [ ] Restore: both services answer; session-loads + send-streams pass
- [ ] Scope table still claims **one** proven conjunct; four remain R23

---

## Related files

- Flow: `.maestro/reactive/offline-contract-airplane-reads.yml`
- Harness: `.maestro/reactive/run-offline-contract-airplane-reads.sh`
- Evidence: `.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/`
- Patterns: `.maestro/reactive/zero-down-terminal-error.yml`, `.maestro/reactive/degraded-no-hang.yml`
- Risk register: `.spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md` (R23)
