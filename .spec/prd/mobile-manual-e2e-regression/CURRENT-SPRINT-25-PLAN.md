---
plan_version: 2
plan_date: 2026-07-25
migration_sprint: 25
migration_sprint_name: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded
pinned_branch: main
pinned_sha: 2bceab958c29d596f40c76c6deef7b8726f5d9f0
source_matrix: .spec/prd/mobile-manual-e2e-regression/README.md
source_evidence: .tmp/manual-mobile-e2e/20260725T061213Z
safe_scope_cases: 121
user_skipped_network_cases: 3
---

# Current Sprint 25 Mobile Regression Continuation Plan

## 1. Your job

Continue the native iOS manual regression from the existing evidence. Do not
start over. Do not rerun a case marked **DONE** unless your own source change can
affect it.

The safe-scope target is:

- 121 applicable cases passed or given an exact external blocker.
- 3 network-disruption cases remain explicitly skipped by the user.
- Every new mutation is checked in the rendered app and in real Postgres/Zero.
- Every defect is minimally repaired, tested, and manually rerun.

This plan is written for a moderate/lower-reasoning agent. Follow it literally.
Do not invent new setup, reset data opportunistically, or broaden the scope.

## 2. Sprint and source pin

This continuation is pinned to Sprint 25 and `main` commit:

```text
2bceab958c29d596f40c76c6deef7b8726f5d9f0
```

Interpret the migration state as follows:

- Sprint 24 client rewrite: product code is present, but its formal gate still
  needs reconciliation against current evidence.
- Sprint 25 reactive surfaces: implementation and goal evidence are landed;
  this is the active test baseline.
- Sprint 26 uploads: still Planned and outside this plan. Do not test unfinished
  Sprint 26 behavior as if it were delivered.

Before running UI tests:

1. Run `git rev-parse HEAD`.
2. If it differs from the pinned SHA, stop and report the new SHA. Do not silently
   reuse this plan against later sprint code.
3. Run `git status --short`. The worktree is already dirty. Never reset, clean,
   discard, overwrite, or commit unrelated changes.
4. Read `AGENTS.md`, all of `RULES.md`, this file, and the original matrix.

## 3. Non-negotiable safety rules

### Never disconnect networking

Do not perform any of these actions:

- Disable simulator or host Wi-Fi.
- Enable airplane mode.
- Toggle a network interface.
- Change routes, DNS, packet filters, VPN, or firewall state.
- Stop shared Zero on `:4848`.
- Stop shared Metro on `:8081`.
- Use a whole-network outage as a test technique.

Do not stop the platform merely to manufacture an error. If an error case needs
a failure, use an already-supported malformed ID, invalid input, denied native
permission, unreachable URL, or request-scoped test fixture. If no safe trigger
exists, record `DEFERRED-SAFE` and continue.

### Preserve services and data

- Owned Metro for this run: `:8083`.
- App: `com.holocron.app` on the named iPhone 17 simulator.
- Do not restart or reseed while a persistence test is in progress.
- `seed:e2e --reset` truncates nonproduction tables. Use it only at a documented
  suite boundary after all prior durable checks are complete.
- Do not install a React Native MCP runtime into the app, entrypoint, Babel, or
  Metro configuration. It previously broke the Expo development client.
- Never print secret values. Presence checks only.

## 4. Standard startup procedure

1. Confirm platform, Postgres, Zero `:4848`, and the fleet are healthy with
   read-only checks.
2. Confirm no unrelated seed/reset process is running.
3. Start the owned native dev server:

   ```bash
   pnpm dev:ios -- --port 8083
   ```

4. Wait for Metro `:8083` to listen and for the app to open automatically.
5. If the installed development client does not connect, open only this URL:

   ```text
   exp+holocron://expo-development-client/?url=http://192.168.1.160:8083
   ```

6. Verify the app shows Holocron, not a launcher, red screen, blank view, or
   endless loading state.
7. Create a new continuation evidence directory under:

   ```text
   .tmp/manual-mobile-e2e/20260725T061213Z/continuation-sprint25-<UTC>/
   ```

8. Create `continuation-ledger.md` there. Never overwrite the original evidence.

## 5. How to execute one case

For every unchecked case:

1. Find the full case in `README.md`:

   ```bash
   rg -n "^### CASE-ID" .spec/prd/mobile-manual-e2e-regression/README.md
   ```

2. Establish the exact GIVEN precondition. Verify it visually and, when data is
   involved, with a read-only Postgres query.
3. Perform the WHEN interaction through the rendered native app.
4. Verify every THEN outcome. A visible control alone is not a pass.
5. Save a legible screenshot named `CASE-ID-short-result.png`.
6. For mutations, verify the durable row before relaunch and again after a true
   terminate/relaunch.
7. Record exactly one result: `PASS`, `FAIL`, `BLOCKED-EXTERNAL`, or
   `DEFERRED-SAFE`.

Never write “mostly passes.” Never infer a pass from source or from an older
automated flow.

## 6. Failure procedure

When expected behavior is wrong:

1. Save the failure screenshot before changing anything.
2. Check the native accessibility tree, relevant app/platform logs, and durable
   database state.
3. Classify the cause: product, stale expectation, seed/reset interference,
   external service, or native permission.
4. If product code is responsible, make the smallest fix.
5. Add a behavior test that would fail if the defect returned. Do not assert
   only that a mock was called or a field exists.
6. Run the focused test and appropriate repository checks.
7. Rerun the manual case twice: once normally and once after terminate/relaunch.
8. Rerun the adjacent cases named by the original matrix if the changed file can
   affect them.
9. Preserve unrelated dirty files and stage only owned changes.

## 7. Completed cases — explicitly DONE

These 52 cases have current-run native screenshots and, where required, durable
evidence in `.tmp/manual-mobile-e2e/20260725T061213Z/`. Do not rerun them unless
a later fix touches their behavior.

### PRE — 5 done

- [x] PRE-01 — baseline manifest and simulator identity.
- [x] PRE-02 — real platform, Zero, Postgres, Metro, and fleet readiness.
- [x] PRE-03 — native development client cold launch.
- [x] PRE-04 — deterministic seed visible in Postgres and native UI.
- [x] PRE-05 — synchronized state survives relaunch.

### NAV — 8 done

- [x] NAV-01 — stable startup redirect.
- [x] NAV-02 — complete primary drawer surface.
- [x] NAV-03 — conversation search, no-match, and clear.
- [x] NAV-04 — switch between correct seeded conversations.
- [x] NAV-05 — new chat from drawer and header.
- [x] NAV-06 — all primary destinations and safe Back paths.
- [x] NAV-07 — durable conversation rename.
- [x] NAV-09 — cancel/confirm deletion and relaunch durability.

### CHAT — 4 done

- [x] CHAT-01 — empty/whitespace input cannot send.
- [x] CHAT-02 — existing thread order and relaunch fidelity.
- [x] CHAT-03 — real nonempty response persisted through Postgres and Zero.
- [x] CHAT-06 — cancel plus successful recovery prompt without duplicate rows.

### ART — 2 done

- [x] ART-01 — article list and matching document route.
- [x] ART-05 — Markdown import, rendering, search, and relaunch persistence.

### DOC — 6 done

- [x] DOC-01 — open document and return to originating filtered list.
- [x] DOC-02 — rich Markdown and long-form layout.
- [x] DOC-05 — selected section added to chat and persisted.
- [x] DOC-08 — share, clipboard URL, public route, and durable token.
- [x] DOC-10 — full document added to chat and reopened.
- [x] DOC-11 — real narration generation, playback progress, and Stop.

### WN — 3 done

- [x] WN-01 — complete seeded What's New feed.
- [x] WN-03 — hero and standard source browser open/close.
- [x] WN-07 — report, sources, citation, and Back path.

### RES — 6 done

- [x] RES-02 — completed research report and sources.
- [x] RES-03 — accessible citations and same-position browser return.
- [x] RES-04 — saved research opens its durable document.
- [x] RES-06 — pending plan content and controls.
- [x] RES-07 — cancel plus durable reviewer feedback.
- [x] RES-08 — approval, running state, and relaunch.

### SUB — 5 done

- [x] SUB-01 — grouped sources and durable source count.
- [x] SUB-04 — group route and matching researched document.
- [x] SUB-06 — feed type filters and content expansion.
- [x] SUB-07 — search, empty result, source browser, and safe area.
- [x] SUB-13 — toggle, unsubscribe, Postgres state, layout, and relaunch.

### TOOL — 4 done

- [x] TOOL-01 — all Toolbelt categories and seeded cards.
- [x] TOOL-03 — source browser and filter restoration.
- [x] TOOL-05 — deep-link add, search, durable row, and relaunch.
- [x] TOOL-06 — duplicate deep link remains exactly one row.

### IMP — 5 done

- [x] IMP-01 — open/closed filters, search, and empty result.
- [x] IMP-02 — matching detail and Back.
- [x] IMP-05 — create and relaunch durability.
- [x] IMP-06 — list/detail edits and relaunch durability.
- [x] IMP-08 — cancel delete, confirm delete, and durable absence.

### SET / SYS / WEB — 4 done

- [x] SET-02 — Light/Dark switching.
- [x] SET-03 — System appearance and relaunch persistence.
- [x] SYS-01 — cold/warm deep links open once.
- [x] WEB-01 — trusted HTTPS load, refresh, and return to origin.

## 8. User-skipped network cases — do not execute

These cases are outside the safe scope. Record `USER-SKIPPED-NETWORK`; do not
attempt their network-disruption steps.

- [~] SUB-10 — requires simulator networking to be disabled.
- [~] WEB-03 — full case requires an offline transition. Malformed-route safety
  is covered by other route cases.
- [~] SYS-03 — retain the existing platform-queue partial evidence, but skip the
  remaining network and Zero interruption branches.

## 9. Phase A — close the remaining safe P0 cases first

Do these in the order listed. Do not begin P1 until each runnable P0 is PASS or
has an exact safe deferral.

### A1. Chat and reference flow

- [ ] **CHAT-05 — Stop generation.** GIVEN a real long response is streaming,
  WHEN Stop is pressed, THEN busy UI clears, generation does not resume, the
  durable conversation has no duplicate terminal response, and a later prompt
  succeeds after relaunch.
- [ ] **CHAT-07 — Retry after send failure.** Use only a request-scoped safe
  failure already supported by the app/test data. Do not stop platform, Zero,
  Wi-Fi, or Metro. THEN Retry produces exactly one eventual user/assistant pair.
  If no safe trigger exists, record `DEFERRED-SAFE`.
- [ ] **CHAT-11 — Navigation from chat cards.** The full-document card path was
  observed but is not a complete case. Prove document, completed-research, and
  What's New cards each open the exact destination and Back returns to the same
  thread position. If seed data lacks a card type, record the missing fixture;
  do not fabricate a pass.
- [ ] **CHAT-12 — Voice permission and start.** Reset only microphone/speech
  permissions. Grant them through the native prompt and reach listening without
  obscured controls.
- [ ] **CHAT-13 — Voice controls.** Speak a real prompt, observe caption/activity,
  verify mute/unmute state, then Stop and confirm normal text chat remains usable.
- [ ] **CHAT-15 — Sprint 20 reference chat.** Cold-open the deterministic
  reference route, send a unique prompt, require a nonempty fleet response,
  verify the durable Postgres/Zero rows, terminate, and verify the exact thread
  returns without duplicate rows. Empty assistant output is FAIL.

### A2. Research, lifecycle, accessibility, and visuals

- [ ] **RES-01 — Live research progress.** Start or open a real active mission and
  observe at least one genuine progress transition. Verify ordered, nonduplicate
  activity and the matching durable iteration state.
- [ ] **SYS-04 — Background and relaunch.** Create one unique message and select
  a theme/language setting. Background/foreground, terminate/relaunch, and prove
  route, message rows, and settings remain exact. Abort if an external seed reset
  occurs during the case.
- [ ] **A11Y-01 — VoiceOver navigation.** Enable VoiceOver and traverse startup,
  drawer, primary destinations, and Back. Every interactive control must have an
  understandable role/label and predictable focus order.
- [ ] **A11Y-02 — VoiceOver mutations.** With VoiceOver, create/send, rename,
  cancel/confirm delete, import, edit, and unsubscribe using disposable data.
  Verify visible and durable outcomes.
- [ ] **VIS-01 — Light/Dark sweep.** Capture representative screenshots for every
  functional suite in both themes. Fail clipped, transparent, overlapping, or
  unreadable surfaces.

## 10. Phase B — safe P1/P2 cases by suite

Run each suite in this order. Use the original case text for detailed Given /
When / Then requirements.

### B1. Low-risk validation and local UI state

- [ ] NAV-08 — rename whitespace validation and cancel persistence.
- [ ] CHAT-04 — multiline editing, keyboard lifecycle, and unobscured composer.
- [ ] CHAT-08 — slash-command discovery and selection.
- [ ] CHAT-10 — message actions sheet, cancel, and intended action.
- [ ] ART-02 — search, no-match, and clear.
- [ ] ART-03 — category filters and empty category.
- [ ] ART-04 — import validation and cancel.
- [ ] ART-06 — alternate import selection.
- [ ] DOC-03 — inline trusted link and web-sheet return.
- [ ] DOC-04 — selected text Copy uses the exact passage.
- [ ] DOC-06 — selected text Listen uses the selected passage.
- [ ] DOC-07 — document action sheet open and dismiss.
- [ ] WN-02 — filter bar, combined filter, empty result, and clear.
- [ ] SUB-02 — subscription search, no-match, and clear.
- [ ] SUB-03 — platform filters and empty platform.
- [ ] SUB-05 — group-document search and empty state.
- [ ] TOOL-02 — Toolbelt search, no results, and clear.
- [ ] TOOL-07 — missing/invalid deep-link parameters return safely.
- [ ] IMP-04 — submit validation and dismiss without row creation.
- [ ] IMP-07 — edit validation and cancel without durable change.
- [ ] SET-01 — complete settings labels, values, and controls.
- [ ] SET-04 — every displayed voice language persists after relaunch.
- [ ] SET-05 — subscription summary and feed-settings entry.
- [ ] SYS-02 — unknown and malformed app routes return safely.
- [ ] SYS-08 — canonical and legacy redirects resolve once.

### B2. Real cards, mutations, and durable state

- [ ] CHAT-09 — command-specific cards and their real actions.
- [ ] WN-04 — social group navigation and Back.
- [ ] WN-05 — social platform filters.
- [ ] WN-06 — social sorting and trusted source open.
- [ ] SUB-08 — feedback persists in UI and Postgres after relaunch.
- [ ] SUB-09 — social group and social source navigation.
- [ ] SUB-11 — ranking/display switches persist after relaunch.
- [ ] SUB-12 — settings modal controls and Manage link.
- [ ] IMP-03 — pull-to-refresh and processing indicator settle correctly.
- [ ] WEB-02 — in-page back/forward plus native swipe gestures.
- [ ] SYS-05 — share, permission, clipboard, and audio sheet dismissal resumes
  the exact app screen.
- [ ] SYS-06 — notification routing from each simulator-supported lifecycle.
  If push provisioning is unavailable, record `BLOCKED-EXTERNAL` with evidence.
- [ ] SYS-07 — notification toast and notification-list interactions.

### B3. Loading/error/retry cases using safe triggers only

Never stop shared services for this phase. Use malformed IDs, nonexistent IDs,
empty deterministic data, denied permissions, and existing request-scoped
fixtures. If the full original precondition cannot be induced safely, record
`DEFERRED-SAFE` rather than claiming PASS.

- [ ] NAV-10 — drawer loading, empty, error, and retry.
- [ ] CHAT-14 — voice denial, error, retry, and dismiss.
- [ ] ART-07 — article loading, empty, error, and retry.
- [ ] DOC-09 — malformed, missing, loading, and error routes.
- [ ] DOC-12 — narration play/pause/seek/skip controls.
- [ ] DOC-13 — narration error, retry, and regenerate.
- [ ] WN-08 — feed/detail loading, empty, error, retry, and Back.
- [ ] SUB-14 — subscription progress, retry, and completion.
- [ ] SUB-15 — feed meta, generating, loading, and empty states.
- [ ] TOOL-04 — Toolbelt loading, empty, error, and retry.
- [ ] IMP-09 — improvement list/detail loading, empty, error, and recovery.
- [ ] RES-05 — research loading, missing, error, and Back.
- [ ] RES-09 — assimilation invalid, loading, and error states.

### B4. Accessibility and layout

- [ ] A11Y-03 — default, large, and maximum accessibility text sizes.
- [ ] A11Y-04 — focus and keyboard behavior across all text inputs.
- [ ] A11Y-05 — contrast plus selected/disabled state in both themes.
- [ ] A11Y-06 — Reduce Motion interaction stability. This is the sole P2 case.
- [ ] A11Y-07 — permission purpose text and denial recovery.
- [ ] VIS-02 — small and primary simulator widths.
- [ ] VIS-03 — long scroll, modal, keyboard, and safe-area stress.

## 11. Current-sprint migration gates

Run these read-only/build checks after safe P0 and again at final audit:

```bash
pnpm verify:no-convex-client --roots app,components,hooks,screens
bun services/platform/src/cli/holo.ts verify:client-contract \
  --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml \
  --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json
pnpm test:unit
git diff --check
```

Required outcomes:

- No `convex/react` client imports.
- Client contract reports all 105 entries complete and all 105 targets resolved.
- Unit suite passes.
- No whitespace errors.

Also reconcile these sprint gates without rerunning network-disconnection steps:

- Sprint 20 reference-flow product proof is satisfied only when CHAT-15 passes.
- Sprint 24's seven-step gate must be regenerated on the pinned SHA; later manual
  DOC-08 evidence may support the share step but does not rewrite the old artifact.
- Sprint 25's existing reactive gate evidence is retained. Do not repeat its
  airplane-mode/network-disconnection action.
- Sprint 26 is not part of this plan.

## 12. Final audit and stop condition

The safe-scope continuation is complete only when:

1. All 52 cases in Section 7 remain explicitly DONE.
2. The three cases in Section 8 remain user-skipped and were not attempted.
3. Every runnable checkbox in Sections 9 and 10 is PASS.
4. Every `DEFERRED-SAFE` names the exact unsafe precondition and proves no safe
   supported fixture exists.
5. No safe-scope case remains FAIL or PARTIAL.
6. Every mutation has rendered and durable evidence.
7. Every source fix has a meaningful behavior test and adjacent manual reruns.
8. Final quality gates and exact outputs are recorded.
9. The final report states **safe-scope PASS**, not full network/offline PASS and
   not full migration completion.

Write the continuation report to:

```text
.tmp/manual-mobile-e2e/20260725T061213Z/continuation-sprint25-<UTC>/final-report.md
```

The final summary must include:

- Pinned sprint, branch, and SHA.
- Counts for DONE, new PASS, FAIL, BLOCKED-EXTERNAL, DEFERRED-SAFE, and
  USER-SKIPPED-NETWORK.
- Defects, root causes, fixes, tests, and rerun evidence.
- Screenshot and durable-evidence paths.
- Exact remaining migration risks, especially Sprint 26 and Sprint 29 cutover.

Do not claim that all production data is migrated. That proof belongs to Sprint
29 after write freeze, queue drain, final ETL, and zero-variance reconciliation.
