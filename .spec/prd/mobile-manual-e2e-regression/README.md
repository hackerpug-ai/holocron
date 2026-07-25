# Holocron Mobile Manual E2E Regression Goal

> **Current execution handoff:** use
> [CURRENT-SPRINT-25-PLAN.md](./CURRENT-SPRINT-25-PLAN.md). It is pinned to the
> current Sprint 25 baseline, preserves completed evidence, excludes local-network
> disruption by user instruction, and lists the remaining work in execution order.

## Purpose

This document is a self-contained goal prompt for a separate Codex session. That
session must execute a full, non-automated mobile regression against the real
Holocron React Native app in an iOS Simulator, using computer-use for every user
interaction. It must capture screenshots, diagnose every failure, make the
smallest correct fix, and rerun affected coverage until the final result is
truthfully PASS or BLOCKED.

This document is a plan. Its creation does **not** prove that any interaction has
passed and does not include execution screenshots.

---

# Goal payload for the execution session

## Goal

Execute the complete Holocron mobile E2E regression in this document on a real
iOS Simulator. Drive all taps, long presses, typing, swipes, keyboard actions,
system prompts, app backgrounding, and relaunches through computer-use. Do not
use Maestro, Detox, Appium, XCUITest, prerecorded scripts, coordinate scripts,
or any other automated UI driver.

For every test:

1. Establish its stated precondition.
2. Perform the interaction through the rendered app.
3. Visually inspect the result and verify any required durable state.
4. Save the required screenshot evidence.
5. Record PASS, FAIL, or BLOCKED in the run ledger.
6. If it fails, execute the mandatory failure-remediation protocol before
   continuing.

The goal is complete only when every applicable test is PASS, every PASS has the
required evidence, all discovered fixes are committed, and the final audit has
been completed. A test may be marked N/A only when source inspection proves the
functionality is intentionally unavailable in the tested build; record the
source evidence and justification. Never convert a failure to N/A.

## Non-negotiable boundaries

- Work in `/Users/inference1/Projects/holocron`.
- Read `AGENTS.md` and the complete `RULES.md` before acting.
- Preserve all pre-existing worktree changes. Do not reset, clean, overwrite, or
  include unrelated files in commits.
- Use an iOS Simulator and the native Expo development client
  (`com.holocron.app`), not Expo Web and not Storybook.
- Use computer-use for user interactions. Shell commands are allowed only for
  setup, launch/terminate, screenshots, logs, read-only state verification,
  service control, and code-quality checks.
- Existing `.maestro/` flows may be read as historical coverage but must not
  drive this run or be cited as proof that a manual case passed.
- Exercise real services and real seeded non-production data. No mocked APIs,
  stubbed fleet responses, fake network layers, or component-only rendering.
- Never expose secret values in logs or the report. Record whether required
  variables are present, not their values.
- Do not weaken an assertion, hide an error, add arbitrary waits, alter seed data
  to dodge a defect, or delete a test to obtain a pass.
- Make no broad refactor while repairing a regression. Fix the smallest
  responsible behavior and preserve unrelated behavior.
- Follow `RULES.md` specialist, TDD, commit, and deploy policies for every source
  change. Client fixes require the deployment action prescribed there before
  claiming final completion.

## Authoritative application surface

The regression scope was derived from the current routes and interactive
components, including:

- Drawer and conversations:
  `app/(drawer)/_layout.tsx`, `screens/DrawerContent.tsx`,
  `components/DrawerHeader.tsx`, `components/ConversationRow.tsx`, and
  `components/ConversationActionMenu.tsx`
- Chat and voice:
  `app/(drawer)/chat/[conversationId].tsx`,
  `app/(drawer)/chat/reference.tsx`, `components/chat/ChatInput.tsx`,
  `components/chat/ChatThread.tsx`, and `components/voice/*`
- Articles and documents:
  `app/articles.tsx`, `screens/articles-screen.tsx`,
  `components/articles/ArticleImportModal.tsx`, `app/document/[id].tsx`,
  `components/documents/*`, and `components/narration/*`
- What's New:
  `app/(drawer)/whats-new/*` and `components/whats-new/*`
- Subscriptions:
  `app/subscriptions/*`, `app/(drawer)/subscriptions/*`,
  `app/(drawer)/subscription-content/[groupKey].tsx`,
  `screens/subscriptions-screen.tsx`,
  `screens/subscription-detail-screen.tsx`, and
  `components/subscriptions/*`
- Toolbelt:
  `app/(drawer)/toolbelt.tsx`, `app/toolbelt/add.tsx`,
  `screens/toolbelt-screen.tsx`, and `components/toolbelt/*`
- Improvements:
  `app/(drawer)/improvements*`, `screens/improvements-screen.tsx`, and
  `components/improvements/*`
- Research and assimilation:
  `app/(drawer)/research/[sessionId].tsx`,
  `app/assimilate/[sessionId].tsx`, `components/deep-research/*`, and
  `components/assimilate/*`
- Settings, web content, notifications, and routing:
  `app/(drawer)/settings.tsx`, `screens/settings-screen.tsx`,
  `components/settings/*`, `app/webview/[url].tsx`,
  `screens/WebViewScreen.tsx`, `components/notifications/*`,
  `app/_layout.tsx`, and `app/+not-found.tsx`

Before execution, compare this list with `rg --files app screens components`.
Add cases for any new user-visible route or interaction introduced after this
plan was written. Do not silently narrow the matrix to this snapshot.

## Required environment

Use one named simulator for the primary run:

- Primary: newest available iOS runtime on `iPhone 17`
- Compact-layout spot check: one available smaller iPhone simulator
- App identifier: `com.holocron.app`
- Scheme: `holocron`
- App orientation: portrait
- Database: non-production only; `DATABASE_URL` must identify
  `holocron_nonprod`
- Real platform API, Zero cache, Postgres, and inference fleet must be reachable

Required tools include Xcode CLI tools, Simulator.app, Bun, pnpm, curl, jq, and
psql. Use `scripts/e2e/provision-ios-simulator.sh` to provision the named
simulator if needed. Use `pnpm build:ios` or the current valid development
client artifact to install the app. Use `pnpm start` for Metro.

The current environment contracts include:

- `DATABASE_URL`
- `FLEET_URL`
- `EXPO_PUBLIC_PLATFORM_URL` or `PLATFORM_URL`
- `EXPO_PUBLIC_RN_API_KEY`
- `EXPO_PUBLIC_ZERO_CACHE_URL`
- `ZERO_ADMIN_PASSWORD`

If current project scripts introduce additional requirements, document them in
the run manifest.

## Evidence workspace

Create a unique, ignored evidence directory:

```text
.tmp/manual-mobile-e2e/<UTC-RUN-ID>/
├── manifest.md
├── ledger.md
├── defects.md
├── logs/
├── screenshots/
│   ├── PRE-01-pass.png
│   ├── NAV-01-pass.png
│   ├── ...
│   └── <CASE-ID>-fail-<UTC-TIMESTAMP>.png
└── final-report.md
```

The manifest must contain the UTC run ID, start time, git SHA, branch, worktree
status summary, simulator name/UDID/runtime, app build identity, service
endpoints with secrets redacted, seed command/result, and executor name.

Every applicable test requires at least one legible screenshot of its terminal
assertion. A multi-stage test requires additional screenshots where one image
cannot prove each required state. Every failure requires an immediate failure
screenshot before any reload or repair. Use filenames beginning with the exact
case ID. Screenshots from earlier runs, Maestro, Storybook, unit tests, or source
inspection do not satisfy this requirement.

Capture screenshots through computer-use or:

```bash
xcrun simctl io "<SIMULATOR-UDID>" screenshot \
  ".tmp/manual-mobile-e2e/<UTC-RUN-ID>/screenshots/<CASE-ID>-pass.png"
```

## Result definitions

- **PASS**: all Given/When/Then assertions were observed in this run, required
  durable state was verified, and required screenshots exist and are legible.
- **FAIL**: any expected behavior, visual state, state transition, persistence
  check, or evidence requirement is wrong or missing.
- **BLOCKED**: the test cannot execute because a required external dependency is
  unavailable after the blocked protocol below. Product defects are FAIL, not
  BLOCKED.
- **N/A**: current source proves the feature is intentionally unavailable on the
  tested platform/build. Requires file-and-line evidence and reviewer rationale.

Do not use “mostly passes,” “pass with caveat,” or inferred PASS.

## Mandatory failure-remediation protocol

This protocol applies to **every failed case below**. Each matrix row names the
adjacent cases that must also be rerun.

### 1. Freeze and preserve evidence

- Stop interacting as soon as the mismatch is clear.
- Capture `<CASE-ID>-fail-<timestamp>.png`.
- Record exact steps, expected result, actual result, visible text, simulator
  state, UTC time, and relevant logs.
- Preserve the seed identity and IDs involved. Do not erase the failed state
  before recording it.

### 2. Reflect before editing

Write a short reflection in `defects.md`:

1. What user guarantee did this case fail?
2. Is the mismatch reproducible from the stated precondition?
3. Is the cause product code, stale/incorrect test expectation, seed corruption,
   service/environment failure, or an intermittent race?
4. What is the narrowest responsible boundary: UI state, navigation, mutation,
   query/sync, API, workflow, native permission, or environment?
5. What evidence distinguishes the suspected cause from alternatives?
6. Which adjacent behaviors could the proposed change affect?

Reproduce once from the same precondition. Inspect source, device/Metro/platform
logs, and durable state. Do not edit until the failure classification has direct
evidence.

### 3. Choose the smallest correct response

- **Product defect:** add or strengthen the narrowest practical automated
  regression test, demonstrate its RED state, then make the minimal source fix.
- **Incorrect plan expectation:** only change the expectation if current product
  requirements or source-of-truth documentation proves the plan is wrong.
  Preserve the original record and explain the correction.
- **Seed defect:** minimally correct deterministic seed/setup and rerun every
  case that consumed it.
- **Environment failure:** repair only the local non-production substrate; do
  not change product behavior to accommodate a broken environment.
- **Intermittent/race:** reproduce and fix the synchronization/readiness defect.
  Do not add sleep-only workarounds.

Use the project specialist required by `RULES.md`: React Native UI specialist for
mobile state/UI, Mastra specialist for platform/mission behavior, and the
appropriate reviewer after implementation. Avoid unrelated formatting or
cleanup.

### 4. Verify the repair

Run the narrow automated regression test plus the relevant project gates. At
minimum:

```bash
pnpm typecheck
pnpm test
pnpm verify:no-convex-client
```

Run additional integration or seed checks when the changed boundary requires
them. Rebuild/reinstall for native or configuration changes; otherwise reload
the development client from a clean app state.

Then:

1. Re-establish the original test precondition.
2. Rerun the failed manual case through computer-use.
3. Rerun it again after terminating and relaunching the app.
4. Rerun every adjacent case named in its matrix row.
5. Save new `-fixed-pass.png` screenshots.
6. Record the tests and evidence in `defects.md`.
7. Commit only the fix and its tests with a conventional commit, allowing all
   hooks to run.
8. Resume the matrix at the failed case's suite boundary.

A repaired case is not PASS until both reruns and all adjacent cases pass.

### 5. Escalation and blocked handling

If a required external service is unavailable:

1. Record health checks and exact redacted errors.
2. Retry after one clean local service restart.
3. Verify that the problem is external using a second independent check.
4. Continue any suites not dependent on that service.
5. Mark only affected cases BLOCKED.

Do not claim the overall goal complete while any case is FAIL or BLOCKED. End
with a precise blocker report and the safest next action.

## Run ledger format

Create one row per case before execution:

```markdown
| Case | Pri | Result | Attempt | Screenshot(s) | Durable evidence | Defect/commit | Notes |
|---|---:|---|---:|---|---|---|---|
| NAV-01 | P0 | NOT RUN | 0 | — | — | — | — |
```

Allowed results are `NOT RUN`, `PASS`, `FAIL`, `BLOCKED`, and `N/A`.

## Common operator rules for all cases

- “Cold launch” means terminate the process and launch the installed native app;
  it does not mean a JavaScript fast refresh.
- “Relaunch” means terminate and reopen without reseeding.
- “Fresh seed” means run `pnpm seed:e2e` against the approved non-production
  database, then wait until Zero exposes the seeded data.
- When a case mutates data, either restore its precondition explicitly or keep
  later cases ordered behind it and record the dependency.
- Assert visible content, enabled/disabled controls, navigation destination,
  mutation outcome, and relaunch persistence—not merely that a control exists.
- Use unique values containing the run ID for created chats, imported articles,
  improvements, and search text so durable-state checks are unambiguous.
- If a system permission has already been decided, reset only that permission
  before the permission case. Do not erase unrelated simulator state.
- After every suite, inspect screenshots visually for blank screens, clipped
  content, overlapping controls, unreadable contrast, stale loading indicators,
  keyboard obstruction, and accidental error banners.

---

# Regression matrix

Each test below inherits the mandatory failure-remediation protocol. “Adjacent”
lists the minimum extra coverage required after a fix; add any other case
affected by the changed files.

## PRE — substrate, install, and deterministic state

### PRE-01 — record a clean baseline (P0)

**Given** the repository is open, **when** branch/SHA, dirty status, required
tool versions, simulator identity, and redacted environment presence are
recorded, **then** the manifest uniquely identifies the run without exposing
secrets. Capture the booted simulator home screen.

**Guarantee:** later evidence is attributable to one build and device.

**Adjacent:** PRE-02, PRE-03.

### PRE-02 — real services are ready (P0)

**Given** the approved non-production services are started, **when** platform,
Zero, Postgres, and fleet readiness are checked, **then** every service responds
and no mock/stub endpoint is configured. Capture the simulator plus a redacted
health summary.

**Guarantee:** UI outcomes exercise the real product path.

**Adjacent:** PRE-01, PRE-04, CHAT-06.

### PRE-03 — native client installs and cold launches (P0)

**Given** the named simulator is booted, **when** `com.holocron.app` is freshly
installed and launched, **then** the splash resolves to Holocron without a red
screen, Expo launcher, blank view, or crash.

**Guarantee:** the tested artifact is runnable.

**Adjacent:** PRE-01, PRE-04, NAV-01.

### PRE-04 — deterministic seed becomes visible (P0)

**Given** `pnpm seed:e2e` succeeds, **when** the app is cold-launched after Zero
is ready, **then** seeded conversations and representative seeded content are
visible. Verify one seeded ID in Postgres and the matching rendered item.

**Guarantee:** test data is real and deterministic.

**Adjacent:** PRE-02, PRE-03, NAV-02, ART-01, SUB-01.

### PRE-05 — relaunch preserves synchronized state (P0)

**Given** seeded data is visible, **when** the app is terminated and relaunched
without reseeding, **then** the same data returns and the app does not remain on
a loading screen.

**Guarantee:** cold-start synchronization is reliable.

**Adjacent:** PRE-04, NAV-01, SYS-04.

## NAV — startup, drawer, navigation, and conversations

### NAV-01 — initial redirect is stable (P0)

**Given** seeded conversations exist, **when** the app cold-launches, **then** it
opens the most recent conversation (or the documented new-chat fallback) once,
without a redirect loop or stale loading indicator.

**Guarantee:** users land in a usable chat.

**Adjacent:** PRE-05, NAV-02, CHAT-01.

### NAV-02 — drawer opens and exposes the product surface (P0)

**Given** a chat is visible, **when** the operator opens the drawer, **then**
search, new chat, Articles, What's New, Toolbelt, Improvements, Settings, and
seeded conversations are visible, tappable, and not clipped.

**Guarantee:** all primary destinations are reachable.

**Adjacent:** NAV-01, NAV-03, NAV-06.

### NAV-03 — drawer conversation search and clear (P1)

**Given** multiple seeded conversations, **when** a unique title/last-message
term is typed, **then** only matching rows remain; a no-match term shows the
no-results state; clearing restores the full list and dismisses the keyboard.

**Guarantee:** conversation retrieval is understandable and reversible.

**Adjacent:** NAV-02, NAV-04.

### NAV-04 — open and switch conversations (P0)

**Given** two seeded conversations, **when** each row is opened, **then** its
correct thread and title render and the active drawer row follows the current
conversation.

**Guarantee:** users never see the wrong thread.

**Adjacent:** NAV-03, CHAT-02, NAV-05.

### NAV-05 — create a new chat (P0)

**Given** any existing conversation, **when** the drawer compose control and
then the chat-header new-chat control are used separately, **then** each opens a
clean new-chat screen with an enabled empty input and no prior messages.

**Guarantee:** conversation creation is always reachable.

**Adjacent:** NAV-04, CHAT-01, CHAT-03.

### NAV-06 — every drawer destination and back path (P0)

**Given** the drawer is open, **when** Articles, What's New, Toolbelt,
Improvements, and Settings are opened one at a time, **then** each correct screen
loads, its title/content is visible, and back returns to the originating chat
without resetting it.

**Guarantee:** primary navigation is complete and reversible.

**Adjacent:** NAV-02 and the first case of every destination suite.

### NAV-07 — conversation rename persists (P0)

**Given** a disposable seeded conversation, **when** its row is long-pressed,
Rename is chosen, a unique run-ID title is saved, and the app is relaunched,
**then** the drawer and opened chat show the new title. Verify the matching
durable row.

**Guarantee:** conversation identity edits persist end to end.

**Adjacent:** NAV-03, NAV-04, NAV-08.

### NAV-08 — rename validation and cancel (P1)

**Given** the rename dialog is open, **when** whitespace/empty text is entered,
**then** save is disabled or rejected; **when** a valid edit is canceled, the
original title remains after relaunch.

**Guarantee:** invalid or canceled edits cannot corrupt titles.

**Adjacent:** NAV-07, NAV-09.

### NAV-09 — conversation delete cancel and confirm (P0)

**Given** two disposable conversations, **when** delete is opened and canceled
for one, it remains; **when** delete is confirmed for the other, it disappears,
navigation falls back safely, and it remains absent after relaunch. Verify
durable deletion.

**Guarantee:** destructive actions require confirmation and persist accurately.

**Adjacent:** NAV-04, NAV-07, NAV-10.

### NAV-10 — drawer loading, empty, error, and retry states (P1)

**Given** each state can be induced without product-code modification, **when**
the drawer has no rows, delayed data, and a recoverable service interruption,
**then** it shows the appropriate empty/loading/error copy and retry restores
the list.

**Guarantee:** startup and retrieval failures are actionable.

**Adjacent:** PRE-02, PRE-04, NAV-02, SYS-03.

## CHAT — text chat, streaming, commands, messages, and voice

### CHAT-01 — empty chat input behavior (P0)

**Given** a new chat, **when** the input is empty or whitespace-only, **then**
send is disabled/no-op, the layout remains stable, and the keyboard does not
obscure the input.

**Guarantee:** empty messages are never dispatched.

**Adjacent:** NAV-05, CHAT-02, A11Y-04.

### CHAT-02 — existing thread renders in order (P0)

**Given** a seeded thread with user and assistant messages, **when** it opens,
**then** messages render in chronological order with the correct roles and
nonempty content, the latest content is reachable, and no duplicate appears
after relaunch.

**Guarantee:** conversation history is faithful.

**Adjacent:** NAV-04, CHAT-03, SYS-04.

### CHAT-03 — send and receive a real response (P0)

**Given** a new chat and healthy services, **when** a unique run-ID prompt is
sent, **then** the user message appears once, sending/agent activity is visible,
a nonempty assistant response arrives, stop/loading UI clears, and both rows
persist after relaunch. Verify matching Postgres and Zero records.

**Guarantee:** the core end-to-end product loop works.

**Adjacent:** PRE-02, CHAT-02, CHAT-04, CHAT-05, CHAT-06.

### CHAT-04 — multiline editing and keyboard lifecycle (P1)

**Given** a new chat, **when** multiline text is entered, edited, keyboard
dismissed/reopened, and sent, **then** content and line breaks are preserved,
the input clears only after submission, and controls remain reachable.

**Guarantee:** composing longer prompts is safe.

**Adjacent:** CHAT-01, CHAT-03, A11Y-04.

### CHAT-05 — stop generation (P0)

**Given** a prompt that produces a long response, **when** Stop generating is
tapped during generation, **then** activity ends promptly, no further text is
appended after stabilization, the app remains usable, and a subsequent prompt
can complete.

**Guarantee:** users retain control over long-running generation.

**Adjacent:** CHAT-03, CHAT-06, SYS-03.

### CHAT-06 — cancel/recover in-flight work (P0)

**Given** a real request is in flight, **when** the documented cancel path or
recoverable connection interruption occurs, **then** the UI leaves the busy
state, reports the outcome, and accepts a new request without duplicate durable
messages.

**Guarantee:** cancellation does not wedge or duplicate chat.

**Adjacent:** CHAT-03, CHAT-05, CHAT-07, SYS-03.

### CHAT-07 — visible send error and retry (P0)

**Given** a controlled temporary platform failure, **when** a unique prompt is
sent, **then** a visible error and Retry appear; after service recovery, Retry
produces exactly one user request and one eventual assistant response.

**Guarantee:** transient failures are recoverable without duplicates.

**Adjacent:** CHAT-03, CHAT-06, SYS-03.

### CHAT-08 — slash-command discovery and selection (P1)

**Given** focus in the chat input, **when** `/` is typed or the assistant button
is used, **then** command suggestions appear, filter as text changes, a selected
command populates/executes the documented form, and dismissal returns to normal
typing.

**Guarantee:** agent capabilities are discoverable and selectable.

**Adjacent:** CHAT-01, CHAT-03, CHAT-09.

### CHAT-09 — command-specific cards and actions (P1)

**Given** seeded or real responses containing plan confirmation, tool approval,
clarification quick replies, recommendation actions, document context, and
research/toolbelt/subscription cards, **when** each visible action is used,
**then** it changes only the intended state and navigates to the correct detail
when applicable. Split evidence by card type.

**Guarantee:** structured assistant interactions are not dead controls.

**Adjacent:** CHAT-08, RES-01, DOC-10, TOOL-06, SUB-12.

### CHAT-10 — message actions sheet (P1)

**Given** a message that exposes actions, **when** the message is long-pressed
or its action affordance is used, **then** the action sheet opens, each available
action has the documented effect, and backdrop/cancel closes it without
mutation.

**Guarantee:** secondary message actions are reachable and safe.

**Adjacent:** CHAT-02, CHAT-03.

### CHAT-11 — navigation from chat cards (P0)

**Given** messages linked to a research session, What's New report, document, or
other supported route, **when** each card/link is tapped, **then** the exact
detail opens and back returns to the same message position.

**Guarantee:** generated results remain connected to their source context.

**Adjacent:** CHAT-09, RES-01, WN-07, DOC-01.

### CHAT-12 — voice permission and start (P0)

**Given** microphone/speech permissions are reset, **when** the voice control is
tapped, **then** the native permission prompt is understandable; granting it
opens the voice assistant and reaches a ready/listening state without covering
essential controls.

**Guarantee:** voice is reachable through the real native permission path.

**Adjacent:** CHAT-01, CHAT-13, A11Y-07.

### CHAT-13 — voice conversation controls (P0)

**Given** the overlay is connected, **when** the operator speaks a short unique
prompt, toggles mute/unmute, observes captions/tool activity, and stops, **then**
status, captions, mute state, response activity, and closure all match the
interaction and text chat remains usable.

**Guarantee:** a voice session is controllable and leaves chat healthy.

**Adjacent:** CHAT-03, CHAT-12, CHAT-14.

### CHAT-14 — voice denial, error, retry, and dismiss (P1)

**Given** permission is denied or the voice connection is interrupted, **when**
voice is started, **then** an actionable error appears; retry works after
recovery, and dismiss always closes the overlay without freezing chat.

**Guarantee:** voice failures fail visibly and recover safely.

**Adjacent:** CHAT-12, CHAT-13, SYS-03.

### CHAT-15 — reference-chat cold-launch flow (P0)

**Given** a build configured with `EXPO_PUBLIC_REFERENCE_FLOW=true` and the
deterministic reference conversation, **when** the root route cold-launches and
a unique run-ID message is sent through `/reference-chat`, **then** the root
redirects once to the reference screen, the message appears once, a nonempty
real assistant reply arrives through the Postgres-to-Zero path, and both records
match after relaunch. Repeat once with the flag false and confirm the root opens
the standard new-chat path instead.

**Guarantee:** the dedicated native reference path and root feature flag both
route and synchronize correctly.

**Adjacent:** NAV-01, CHAT-03, SYS-01, SYS-04.

## ART — article library and import

### ART-01 — article list and count (P0)

**Given** seeded articles, **when** Articles opens, **then** loading resolves to
the correct count and cards with title/category metadata; tapping a card opens
the matching document.

**Guarantee:** saved knowledge is browsable and correctly linked.

**Adjacent:** PRE-04, ART-02, DOC-01.

### ART-02 — article search and clear (P1)

**Given** seeded articles with unique terms, **when** matching and nonmatching
queries are entered, **then** results/count and no-results copy are correct;
clearing restores all cards.

**Guarantee:** article search is accurate and reversible.

**Adjacent:** ART-01, ART-03.

### ART-03 — category filters (P1)

**Given** multiple seeded categories, **when** each category and All are tapped,
**then** only matching cards/counts appear and the selected chip is visually
clear. Combine category with search once.

**Guarantee:** library filters compose predictably.

**Adjacent:** ART-01, ART-02, ART-04.

### ART-04 — import validation and cancel (P1)

**Given** the import modal, **when** empty/whitespace content is submitted,
**then** import is disabled or rejected; backdrop/Cancel closes without adding a
card.

**Guarantee:** invalid or canceled imports do not create garbage.

**Adjacent:** ART-03, ART-05.

### ART-05 — import pasted Markdown (P0)

**Given** the import modal, **when** unique run-ID Markdown containing a heading,
paragraph, list, link, and code is imported, **then** one article is created,
appears in search, opens as a document, renders those structures, and remains
after relaunch. Verify durable state.

**Guarantee:** user knowledge can be imported without content loss.

**Adjacent:** ART-01, ART-04, DOC-02, DOC-03.

### ART-06 — alternate import selection (P1)

**Given** the import modal offers selectable source articles, **when** one source
is selected and imported, **then** the selected—not another—article appears once
and opens correctly. If the current build intentionally omits this mode, use the
strict N/A rule.

**Guarantee:** source selection maps to the intended content.

**Adjacent:** ART-04, ART-05.

### ART-07 — article empty/loading/retry presentation (P1)

**Given** empty seed, delayed data, and a recoverable service interruption,
**when** Articles opens in each condition, **then** loading, empty/action, and
recovered list states are distinct and usable.

**Guarantee:** library availability is never ambiguous.

**Adjacent:** PRE-02, ART-01, SYS-03.

## DOC — document reading, selection, sharing, chat, and narration

### DOC-01 — document loads and back works (P0)

**Given** a seeded article card, **when** it is opened, **then** the matching
title/body load, scrolling reaches the end, actions remain reachable, and back
returns to the originating list position.

**Guarantee:** documents are readable and navigation preserves context.

**Adjacent:** ART-01, DOC-02, DOC-09.

### DOC-02 — rich Markdown and long content (P0)

**Given** a document with headings, emphasis, links, lists, quote/callout, code,
table, and long paragraphs, **when** it is read and scrolled, **then** each
structure is legible, horizontally constrained, and does not overlap or clip.
Capture multiple screenshots.

**Guarantee:** stored knowledge renders faithfully.

**Adjacent:** ART-05, DOC-01, DOC-03, VIS-03.

### DOC-03 — inline links and web sheet (P1)

**Given** a document with a valid external link, **when** it is tapped, **then**
the in-app web surface shows the correct secure host and content; close returns
to the same document position.

**Guarantee:** citations open safely without losing reading context.

**Adjacent:** DOC-02, WEB-01, WEB-02.

### DOC-04 — text-selection copy (P1)

**Given** selectable document text, **when** a phrase is selected and Copy is
tapped, **then** the sheet closes and pasting into a temporary field yields the
exact selected phrase.

**Guarantee:** users can extract exact knowledge.

**Adjacent:** DOC-02, DOC-05.

### DOC-05 — text-selection add to chat (P0)

**Given** a selected passage, **when** Add to Chat is chosen and a target chat is
selected/created, **then** the correct passage/document context appears once in
that chat and remains after relaunch.

**Guarantee:** reading context transfers accurately into conversation.

**Adjacent:** DOC-04, DOC-10, CHAT-02.

### DOC-06 — text-selection listen (P1)

**Given** a selected passage and available narration, **when** Listen is chosen,
**then** narration starts at the intended section and the control bar reflects
the active segment.

**Guarantee:** section narration starts at user-selected context.

**Adjacent:** DOC-04, DOC-11, DOC-12.

### DOC-07 — document actions open/dismiss (P1)

**Given** a document, **when** the actions button is tapped, **then** Listen, Add
to Chat, and Share are visible; backdrop dismissal changes nothing and reopening
works.

**Guarantee:** all primary document actions are reachable and dismissible.

**Adjacent:** DOC-01, DOC-08, DOC-10, DOC-11.

### DOC-08 — share creates and copies a real URL (P0)

**Given** a private document, **when** Share is used, **then** a real Mastra
share URL appears, the native share sheet opens as documented, Copy puts the
same URL on the clipboard, and opening it resolves to the intended content.
Verify the durable public/share state.

**Guarantee:** sharing publishes the correct document and provides a usable URL.

**Adjacent:** DOC-03, DOC-07, WEB-01.

### DOC-09 — invalid, missing, loading, and error states (P1)

**Given** malformed, nonexistent, delayed, and temporarily unavailable document
IDs, **when** each route opens, **then** invalid/loading/error states are
distinct, readable, and their back/recovery action returns safely.

**Guarantee:** bad links and fetch failures never strand the user.

**Adjacent:** DOC-01, SYS-02, SYS-03.

### DOC-10 — add whole document to chat (P0)

**Given** a document action sheet and at least one target conversation, **when**
Add to Chat is used, **then** the picker selection opens the intended
conversation with one document-context card, whose navigation returns to the
same document.

**Guarantee:** whole-document grounding is attached to the correct chat.

**Adjacent:** DOC-05, DOC-07, CHAT-09, CHAT-11.

### DOC-11 — start/stop narration (P0)

**Given** a narratable document, **when** Listen is tapped, **then** generation
or loading resolves to audible playback, the active block is visibly indicated,
and stopping removes active playback without leaving stale controls.

**Guarantee:** document narration performs the advertised core action.

**Adjacent:** DOC-06, DOC-07, DOC-12, SYS-05.

### DOC-12 — narration playback controls (P1)

**Given** narration is active, **when** pause/resume, previous, next, and each
playback speed are used, **then** audio/progress/active block follow the control
and boundary controls behave safely.

**Guarantee:** narration is navigable and controllable.

**Adjacent:** DOC-11, DOC-13.

### DOC-13 — narration error, retry, and regenerate (P1)

**Given** narration generation is made to fail recoverably, **when** Listen is
used, **then** an error is visible; after recovery, Retry failed segments and
Regenerate create playable audio without duplicate/stale progress.

**Guarantee:** audio generation failures are repairable in place.

**Adjacent:** DOC-11, DOC-12, SYS-03.

## WN — What's New feed, report, social, and citations

### WN-01 — feed loads representative findings (P0)

**Given** seeded findings, **when** What's New opens, **then** loading resolves
to a hero and/or finding cards with accurate title/source/category information
and no duplicate card.

**Guarantee:** recent intelligence is visible and coherent.

**Adjacent:** NAV-06, WN-02, WN-05.

### WN-02 — filter bar and empty result (P1)

**Given** findings in multiple categories, **when** filters are selected and
cleared, **then** card membership and selected styling match the filter; a
zero-match filter shows the intended empty state.

**Guarantee:** feed narrowing is accurate and reversible.

**Adjacent:** WN-01, WN-03.

### WN-03 — hero/finding opens source (P0)

**Given** a finding with a URL, **when** hero and standard cards are tapped,
**then** each opens the correct secure host in the web sheet and close restores
the filtered feed position.

**Guarantee:** findings lead to the claimed source.

**Adjacent:** WN-01, WN-02, WEB-01.

### WN-04 — social group navigation (P1)

**Given** a visible social group, **when** it is opened, **then** the social list
loads, Back returns to the feed, and the navigation tooltip does not block
interaction.

**Guarantee:** grouped social intelligence is reachable.

**Adjacent:** WN-01, WN-05, WN-06.

### WN-05 — social platform filters (P1)

**Given** posts from multiple platforms, **when** each platform filter is used,
**then** only matching posts remain and selected state is clear.

**Guarantee:** platform filtering is truthful.

**Adjacent:** WN-04, WN-06.

### WN-06 — social sorting and source open (P1)

**Given** multiple social posts, **when** each sort mode is selected, **then**
visible order changes according to its label; tapping a post opens its exact
source and close restores the sorted list.

**Guarantee:** social ordering and source navigation work.

**Adjacent:** WN-04, WN-05, WEB-01.

### WN-07 — report detail and citations (P0)

**Given** a seeded report, **when** its detail route opens and each representative
citation is tapped, **then** title/body/outline/citations match the report, the
web sheet opens the cited host, and back returns safely.

**Guarantee:** reports and evidence remain connected.

**Adjacent:** CHAT-11, WN-03, RES-03.

### WN-08 — feed/detail loading, empty, error, retry/back (P1)

**Given** delayed, empty, missing-ID, and interrupted states, **when** feed and
detail routes open, **then** each state has correct feedback and recovery/back
behavior.

**Guarantee:** intelligence failures are visible and escapable.

**Adjacent:** WN-01, WN-07, SYS-03.

## SUB — subscriptions, feed, search, settings, and persistence

### SUB-01 — subscriptions list and counts (P0)

**Given** seeded subscription sources, **when** Subscriptions opens, **then**
source/group cards and counts match durable data and no source is duplicated.

**Guarantee:** tracked sources are represented accurately.

**Adjacent:** PRE-04, SUB-02, SUB-04.

### SUB-02 — subscription search and clear (P1)

**Given** multiple sources, **when** matching/nonmatching text is entered and
cleared, **then** list/no-results/full-list states are correct.

**Guarantee:** users can find tracked sources.

**Adjacent:** SUB-01, SUB-03.

### SUB-03 — platform filters and empty platform (P1)

**Given** multiple source platforms, **when** each platform filter is selected,
**then** cards/counts match; a platform with no sources shows the platform-
specific empty state; returning to All restores all cards.

**Guarantee:** source classification is reliable.

**Adjacent:** SUB-01, SUB-02, SUB-04.

### SUB-04 — open grouped subscription content (P0)

**Given** a creator/source group with documents, **when** it is opened, **then**
the correct group title and documents render and a document card opens the
matching content.

**Guarantee:** subscriptions lead to their collected knowledge.

**Adjacent:** SUB-01, SUB-05, DOC-01.

### SUB-05 — group document search and empty state (P1)

**Given** a populated group, **when** matching/nonmatching document terms are
entered, **then** correct cards or no-match copy appear; clearing restores all.
Also open a deliberately empty group if available.

**Guarantee:** content within a source remains discoverable.

**Adjacent:** SUB-04, SUB-06.

### SUB-06 — feed loads and filters content types (P0)

**Given** seeded subscription feed items, **when** the feed opens and each
available filter chip is toggled, **then** card types/counts and selected styling
match and toggling the active filter restores All. Inspect representative
article, video, release, and social card variants that exist in current seeded
data; use each card's expand/collapse or “read more” interaction and verify that
metadata, fallback imagery, and summary state remain attached to the right item.

**Guarantee:** the personalized feed is present and filterable.

**Adjacent:** SUB-01, SUB-07, SUB-08.

### SUB-07 — feed search and source open (P0)

**Given** searchable content, **when** matching/nonmatching text is entered,
**then** loading, results, and empty search states are correct; tapping a result
opens its exact source and close restores the query/results.

**Guarantee:** users can retrieve and inspect subscription content.

**Adjacent:** SUB-06, WEB-01.

### SUB-08 — feed card feedback persists (P1)

**Given** feedback controls are enabled, **when** thumbs-up and thumbs-down are
selected/toggled on separate cards, **then** selection is mutually correct,
ranking/display does not jump unexpectedly, and the state survives relaunch.
Verify durable feedback.

**Guarantee:** personalization feedback is recorded accurately.

**Adjacent:** SUB-06, SUB-11, SET-05.

### SUB-09 — feed social group and social source (P1)

**Given** social subscription content, **when** the social group is opened,
filtered/sorted if available, and a post is tapped, **then** each state and
source URL are correct and back restores feed position.

**Guarantee:** social subscription content is reachable end to end.

**Adjacent:** SUB-06, WN-04, WEB-01.

### SUB-10 — offline banner and queue recovery (P0)

**Given** a loaded feed, **when** simulator networking is disabled and a
queueable supported action is attempted, **then** the offline banner and queue
indicator accurately reflect state; after reconnect, queued work drains once
and content refreshes without duplicates.

**Guarantee:** offline behavior is explicit and eventually consistent.

**Adjacent:** SUB-06, SUB-08, SYS-03, SYS-04.

### SUB-11 — ranking/display switches (P1)

**Given** subscription feed settings, **when** personalized ranking, feedback
use, and feedback-button display switches are toggled separately, **then** the
corresponding feed behavior changes and each setting survives relaunch.

**Guarantee:** feed preferences control visible behavior and persist.

**Adjacent:** SUB-06, SUB-08, SET-05.

### SUB-12 — settings modal controls and manage link (P1)

**Given** Settings > Feed Settings, **when** push, in-app notifications,
thumbnails, autoplay, and All/Videos/Blogs filters are changed, **then** selected
states are clear, close/reopen preserves documented persistence, and Manage
Subscriptions opens the correct screen.

**Guarantee:** every exposed feed setting is operative.

**Adjacent:** SET-01, SET-05, SUB-01, SUB-11.

### SUB-13 — subscribe/toggle/unsubscribe lifecycle (P0)

**Given** a supported seeded/addable source, **when** it is subscribed, automatic
research is toggled, and the app is relaunched, **then** source and toggle state
persist; **when** unsubscribe is confirmed, it disappears and stays absent.
Verify durable state.

**Guarantee:** subscription lifecycle mutations are accurate.

**Adjacent:** SUB-01, SUB-03, SUB-14.

### SUB-14 — subscription progress, retry, and completion (P1)

**Given** a subscription ingestion with representative platform progress,
**when** progress updates, one platform is made to fail recoverably, Retry is
used, and completion is dismissed, **then** status/progress/error/result are
truthful and no source/content is duplicated.

**Guarantee:** long-running subscription work is observable and recoverable.

**Adjacent:** SUB-13, CHAT-09, SYS-03.

### SUB-15 — feed meta/generating/loading/empty states (P1)

**Given** each state can be induced with real data/service control, **when** the
feed opens, **then** meta, generating, loading skeleton, and empty presentation
appear only in their corresponding state and resolve correctly.

**Guarantee:** feed processing state is never misleading.

**Adjacent:** SUB-06, SUB-10, SUB-14.

## TOOL — toolbelt discovery and add flow

### TOOL-01 — toolbelt list and categories (P0)

**Given** seeded tools in multiple categories, **when** Toolbelt opens, **then**
cards and metadata render; each category filter shows only matching tools and
All restores the list.

**Guarantee:** saved development resources are browsable.

**Adjacent:** NAV-06, TOOL-02, TOOL-04.

### TOOL-02 — tool search, no results, and clear (P1)

**Given** multiple tools, **when** a matching and nonmatching term is entered,
**then** results/no-results are correct; the clear affordance restores all tools
and dismisses stale text.

**Guarantee:** tool retrieval is accurate and reversible.

**Adjacent:** TOOL-01, TOOL-03.

### TOOL-03 — open tool source (P0)

**Given** a tool card with a source URL, **when** it is opened, **then** the
correct secure host/content appear in the in-app browser and close restores the
same filter/search/list position.

**Guarantee:** saved tools point to their claimed source.

**Adjacent:** TOOL-01, TOOL-02, WEB-01.

### TOOL-04 — loading, empty, error, and retry (P1)

**Given** delayed, empty, and interrupted data states, **when** Toolbelt opens,
**then** its loading, category-oriented empty view, error, and retry recovery are
distinct and usable.

**Guarantee:** tool availability is transparent and recoverable.

**Adjacent:** TOOL-01, SYS-03.

### TOOL-05 — add tool from valid deep link (P0)

**Given** a `holocron` deep link containing all required unique tool fields,
**when** the link is opened, **then** loading resolves to success, the screen
returns automatically, the new tool is searchable/openable, and it persists
after relaunch. Verify durable state.

**Guarantee:** external tool capture works end to end.

**Adjacent:** TOOL-01, TOOL-03, TOOL-06, SYS-01.

### TOOL-06 — duplicate add is idempotent (P0)

**Given** the same valid tool deep link has already succeeded, **when** it is
opened again, **then** “Already in your toolbelt” (or current documented
equivalent) appears and exactly one durable/list item exists.

**Guarantee:** repeated external events do not duplicate knowledge.

**Adjacent:** TOOL-05, TOOL-07.

### TOOL-07 — missing/invalid add parameters (P1)

**Given** a tool add deep link missing each required field in representative
combinations, **when** it opens, **then** an error is visible, tapping returns
safely, and no partial tool is created.

**Guarantee:** malformed links fail closed.

**Adjacent:** TOOL-05, SYS-01.

## IMP — improvement intake, search, edit, and delete

### IMP-01 — list, status filters, and search (P0)

**Given** seeded improvements in representative statuses, **when** Improvements
opens, status filters and matching/nonmatching search are used, **then**
membership, selected styling, no-results, and reset behavior are correct.

**Guarantee:** improvement work is discoverable by state and content.

**Adjacent:** NAV-06, IMP-02, IMP-04.

### IMP-02 — open detail and back (P0)

**Given** a seeded request, **when** its card opens, **then** title, description,
status, timestamps/metadata, and any result content match; back restores the
list filter/position.

**Guarantee:** list and detail refer to the same request.

**Adjacent:** IMP-01, IMP-06.

### IMP-03 — pull to refresh and processing indicator (P1)

**Given** a pending/processing request, **when** the list is pulled to refresh,
**then** refresh terminates, state updates from durable data, and the processing
indicator appears only while work is active.

**Guarantee:** users can obtain current processing state.

**Adjacent:** IMP-01, IMP-04, SYS-03.

### IMP-04 — submit validation and dismiss (P1)

**Given** the Add Improvement sheet, **when** the description is empty,
whitespace-only, or canceled/backdrop-dismissed, **then** Submit is disabled or
rejected and no request is created.

**Guarantee:** invalid/canceled reports do not enter the backlog.

**Adjacent:** IMP-01, IMP-05.

### IMP-05 — submit a unique improvement (P0)

**Given** the Add Improvement sheet, **when** a unique run-ID description is
submitted, **then** input transitions through processing/result as documented,
one request appears in the list/detail, and it persists after relaunch. Verify
durable state and any screenshot attachment metadata if supplied.

**Guarantee:** feedback capture reaches the real improvement pipeline.

**Adjacent:** IMP-03, IMP-04, IMP-06.

### IMP-06 — edit from list and detail (P0)

**Given** two disposable requests, **when** Edit is opened from list and detail,
unique title/description changes are saved, **then** both surfaces update and
persist after relaunch.

**Guarantee:** improvement edits are consistent across entry points.

**Adjacent:** IMP-01, IMP-02, IMP-07, IMP-08.

### IMP-07 — edit validation and cancel (P1)

**Given** the edit sheet, **when** title/description is blank, save is disabled;
**when** valid changes are canceled or the sheet is swiped/backdrop-dismissed,
the original values remain.

**Guarantee:** incomplete or canceled edits never overwrite requests.

**Adjacent:** IMP-06, IMP-08.

### IMP-08 — delete cancel and confirm (P0)

**Given** two disposable requests, **when** delete is canceled for one, it
remains; **when** deletion is confirmed for the other, it disappears from list
and detail navigation, remains absent after relaunch, and durable state agrees.

**Guarantee:** destructive improvement actions are confirmed and persistent.

**Adjacent:** IMP-01, IMP-02, IMP-06.

### IMP-09 — list/detail loading, empty, error, and recovery (P1)

**Given** delayed, empty, missing-ID, and interrupted states, **when** list/detail
open, **then** each communicates the right state and retry/back/recovery works.

**Guarantee:** improvement failures do not strand users or misstate data.

**Adjacent:** IMP-01, IMP-02, SYS-03.

## RES — deep research and assimilation

### RES-01 — active research progress (P0)

**Given** a real or deterministic active research session, **when** its detail
opens, **then** query, status, iterations/steps, progress, and activity update
without duplicate rows or regressions in order.

**Guarantee:** long-running research is observable.

**Adjacent:** CHAT-09, RES-02, RES-04.

### RES-02 — completed research report and outline (P0)

**Given** a completed session, **when** detail opens, **then** report, outline,
iteration timeline/summaries, and source count match durable data and remain
readable through the end.

**Guarantee:** completed research is complete and coherent.

**Adjacent:** RES-01, RES-03, DOC-02.

### RES-03 — research citation source (P0)

**Given** a completed report with citations, **when** representative citations
are opened, **then** each correct URL/host loads in the browser and back returns
to the same report position.

**Guarantee:** research claims retain source traceability.

**Adjacent:** RES-02, WEB-01.

### RES-04 — research-to-document redirect (P0)

**Given** a session whose result has a saved document, **when** its research
route opens, **then** it redirects once to the matching document without a loop
and back behaves consistently.

**Guarantee:** finalized research resolves to its durable artifact.

**Adjacent:** RES-01, DOC-01.

### RES-05 — research loading, missing, error, and back (P1)

**Given** delayed, nonexistent, and interrupted session IDs, **when** each opens,
**then** loading/error copy is accurate and Go back returns safely.

**Guarantee:** bad research routes are recoverable.

**Adjacent:** RES-01, SYS-02, SYS-03.

### RES-06 — assimilation plan renders (P0)

**Given** a seeded pending assimilation session, **when** its route opens,
**then** plan title/status/Markdown and Approve/Reject actions match durable
state.

**Guarantee:** proposed knowledge changes are reviewable before execution.

**Adjacent:** RES-02, RES-07, RES-08.

### RES-07 — reject cancel and feedback submit (P0)

**Given** two pending plans, **when** Reject is opened and canceled for one, its
state remains pending; **when** unique feedback is submitted for the other, the
status/navigation and durable feedback match the documented result.

**Guarantee:** rejection is intentional and preserves reviewer rationale.

**Adjacent:** RES-06, RES-09.

### RES-08 — approve assimilation (P0)

**Given** a disposable pending plan, **when** Approve is tapped, **then** the
action cannot be double-submitted, completion/navigation is clear, and durable
status/result show one approved execution after relaunch.

**Guarantee:** approved knowledge changes execute exactly once.

**Adjacent:** RES-06, RES-09, SYS-04.

### RES-09 — assimilation invalid/loading/error states (P1)

**Given** malformed, delayed, missing, and interrupted session IDs, **when** each
opens, **then** invalid/loading/error states are distinct and Back recovers.

**Guarantee:** malformed assimilation links fail safely.

**Adjacent:** RES-06, RES-07, RES-08, SYS-03.

## SET — settings and persistence

### SET-01 — settings surface is complete (P1)

**Given** Settings opens, **when** the entire screen is scrolled, **then**
Subscriptions, Appearance, Voice Language, and information sections render,
with every option reachable and no clipping.

**Guarantee:** preferences are discoverable.

**Adjacent:** NAV-06, SET-02, SET-04, SUB-12.

### SET-02 — explicit light and dark themes (P0)

**Given** Settings, **when** Light and Dark are selected in turn, **then** the
whole app updates immediately using readable semantic colors; drawer, chat, one
document, and one modal are spot-checked in each theme.

**Guarantee:** theme selection affects the full product without unreadable UI.

**Adjacent:** SET-01, SET-03, VIS-01.

### SET-03 — theme persistence and system mode (P0)

**Given** each theme option, **when** the app is relaunched, **then** explicit
Light/Dark persist as documented; with System selected, changing simulator
appearance produces the documented matching behavior without stale selected
state.

**Guarantee:** appearance choice remains trustworthy across sessions.

**Adjacent:** SET-02, SYS-04, VIS-01.

### SET-04 — every voice language persists (P1)

**Given** the eight visible language options, **when** each is selected, **then**
exactly one option is selected; at least English and one non-English choice are
verified after relaunch and against durable `app_settings` state.

**Guarantee:** voice language preference is saved accurately.

**Adjacent:** SET-01, CHAT-12, SET-05.

### SET-05 — subscription summary and feed-settings entry (P1)

**Given** seeded subscriptions, **when** the Settings subscription cards are
used, **then** the displayed source count agrees with the list, Manage opens
Subscriptions, Feed Settings opens the modal, and returning preserves settings
scroll context.

**Guarantee:** settings summaries and shortcuts are accurate.

**Adjacent:** SUB-01, SUB-11, SUB-12.

## WEB — in-app browser

### WEB-01 — host, security indicator, refresh, and close (P0)

**Given** any trusted HTTPS source opened from the app, **when** loading
completes, **then** the displayed host and lock state are correct, Refresh
reloads content, and Close returns to the exact originating screen.

**Guarantee:** external content opens transparently without losing app context.

**Adjacent:** DOC-03, WN-03, SUB-07, TOOL-03.

### WEB-02 — in-page back/forward and swipe gestures (P1)

**Given** a loaded web page with a navigable link, **when** an in-page link is
opened, toolbar Back/Forward and iOS swipe navigation are used, **then** content
and button availability follow browser history while app Close remains distinct.

**Guarantee:** browser history works without corrupting app navigation.

**Adjacent:** WEB-01, SYS-05.

### WEB-03 — invalid/offline URL behavior (P1)

**Given** a malformed or unreachable URL and an offline transition, **when** the
browser opens/refreshes, **then** the failure is visible, the app does not crash,
and Close returns safely.

**Guarantee:** external failures are contained.

**Adjacent:** WEB-01, SYS-03.

## SYS — deep links, notifications, lifecycle, and resilience

### SYS-01 — supported deep-link routes (P0)

**Given** the app is cold and then warm, **when** representative `holocron://`
links for Toolbelt add, Subscriptions, What's New, Articles, Improvements, and
supported generic paths are opened, **then** each lands on the exact destination
once with parameters intact and Back has sensible behavior.

**Guarantee:** external entry points route deterministically.

**Adjacent:** TOOL-05, NAV-06, SYS-02.

### SYS-02 — unknown and malformed route (P1)

**Given** cold and warm app states, **when** unknown/malformed routes and invalid
IDs are opened, **then** the app displays its not-found/domain error behavior
and offers a working path home without a loop or crash.

**Guarantee:** bad external navigation fails safely.

**Adjacent:** SYS-01, DOC-09, RES-05.

### SYS-03 — service/network loss and reconnect (P0)

**Given** loaded chat and content screens, **when** network/platform/Zero
availability is interrupted in controlled turns, **then** in-flight and new
actions show appropriate errors/offline state; after recovery, stale indicators
clear, data catches up once, and no duplicate mutation appears.

**Guarantee:** transient outages do not corrupt or wedge the app.

**Adjacent:** CHAT-07, SUB-10, WEB-03, SYS-04.

### SYS-04 — background, terminate, and relaunch (P0)

**Given** one newly created chat message and one changed persistent preference,
**when** the app backgrounds/foregrounds and then terminates/relaunches, **then**
navigation remains valid, synchronized content and preferences persist, and no
duplicate work is dispatched.

**Guarantee:** lifecycle transitions preserve user state.

**Adjacent:** PRE-05, CHAT-03, SET-03, SUB-11.

### SYS-05 — system sheets and app resumption (P1)

**Given** share, permission, clipboard, and audio/system surfaces are invoked,
**when** each is dismissed by success and cancel paths, **then** Holocron resumes
on the correct screen with responsive controls and correct active audio state.

**Guarantee:** native system UI does not break app state.

**Adjacent:** DOC-08, DOC-11, CHAT-12, WEB-02.

### SYS-06 — push-notification routing (P1)

**Given** representative notification payloads for Toolbelt, Subscriptions,
What's New, Articles, Improvements, and generic supported routes, **when** each
notification is tapped from foreground/background/cold states as available,
**then** the exact route and parameters open once. If simulator push
provisioning is unavailable, mark BLOCKED with tool/runtime evidence—not PASS.

**Guarantee:** notifications take users to the claimed result.

**Adjacent:** SYS-01 and each destination's first case.

### SYS-07 — notification toast and list interactions (P1)

**Given** an in-app notification is generated, **when** its toast, bell/list,
dismissal, and target action are used, **then** content, read/dismiss state, and
navigation are correct and persistent where documented. If no reachable
production path exposes these controls, apply the strict N/A rule.

**Guarantee:** in-app notifications are actionable rather than decorative.

**Adjacent:** SYS-06, NAV-06.

### SYS-08 — canonical and legacy redirect compatibility (P1)

**Given** cold and warm app states, **when** `/articles/<valid-id>`, legacy
`/subscriptions/feed` with query parameters, canonical drawer subscription-feed
and social routes, and `/subscriptions/settings` are opened, **then** each
redirects once to its current canonical document, What's New, feed/social, or
subscription-management destination with supported parameters preserved; Back
does not bounce through a redirect loop.

**Guarantee:** saved links from earlier app versions continue to reach the
intended current content.

**Adjacent:** ART-01, DOC-01, SUB-01, SUB-06, WN-01, SYS-01, SYS-02.

## A11Y — accessibility and input

### A11Y-01 — VoiceOver primary navigation (P0)

**Given** VoiceOver is enabled, **when** the operator traverses startup, drawer,
all drawer destinations, and back controls, **then** focus order is logical,
every actionable control has an intelligible name/role/state, and no essential
control is unreachable. Record a screen capture or screenshots plus notes.

**Guarantee:** primary navigation is usable without sight.

**Adjacent:** NAV-02, NAV-06, A11Y-02.

### A11Y-02 — VoiceOver core mutations (P0)

**Given** VoiceOver, **when** new chat/send, conversation rename/delete,
article import, improvement submit/edit, document actions, and a settings change
are performed, **then** controls announce state/validation and each mutation
completes without focus loss.

**Guarantee:** core create/edit/delete workflows are accessible.

**Adjacent:** corresponding mutation cases, A11Y-01.

### A11Y-03 — dynamic text sizes (P1)

**Given** default, large, and maximum accessibility text sizes, **when** drawer,
chat, article list/document, settings, sheets, and confirmation dialogs are
opened, **then** text remains readable, content scrolls, buttons retain labels,
and no required control is clipped or overlapped. Capture each representative
screen at maximum size.

**Guarantee:** larger text does not remove functionality.

**Adjacent:** NAV-02, DOC-02, SET-01, VIS-03.

### A11Y-04 — keyboard and focus behavior (P1)

**Given** text inputs on drawer, chat, article import, improvement forms, and
search screens, **when** focus moves, Return/Done/dismiss are used, and modal
inputs scroll, **then** the active field and submit/cancel controls remain
visible and focus returns sensibly.

**Guarantee:** keyboard use never traps or hides the workflow.

**Adjacent:** CHAT-04, ART-05, IMP-05.

### A11Y-05 — contrast and selected/disabled state (P1)

**Given** light/dark themes, **when** filters, radio options, switches, disabled
buttons, errors, and destructive confirmations are inspected, **then** state is
distinguishable beyond color alone where required and text/control contrast is
readable.

**Guarantee:** users can perceive action state and risk.

**Adjacent:** SET-02, VIS-01.

### A11Y-06 — reduce motion and interaction stability (P2)

**Given** Reduce Motion is enabled, **when** drawer, bottom sheets, voice,
narration, and loading transitions are used, **then** interactions complete,
essential status is still conveyed, and animations do not leave invisible
overlays or stale touch blockers.

**Guarantee:** motion preference does not break functionality.

**Adjacent:** NAV-07, IMP-05, CHAT-12, DOC-11.

### A11Y-07 — permission messaging (P1)

**Given** microphone/speech/notification permissions are undecided, denied, and
allowed in separate attempts, **when** features request access, **then** purpose
text and app recovery behavior are understandable and denial does not trap the
user.

**Guarantee:** native capability consent is informed and reversible.

**Adjacent:** CHAT-12, CHAT-14, SYS-06.

## VIS — visual and layout regression

### VIS-01 — light/dark visual sweep (P0)

**Given** Light then Dark, **when** one terminal screenshot from every functional
suite is reviewed side by side, **then** there are no blank views, raw error
objects, transparent/incorrect backgrounds, unreadable text, missing icons,
stale overlays, or theme-inconsistent system bars.

**Guarantee:** the full product remains visually usable in both themes.

**Adjacent:** SET-02 and every suite's first case.

### VIS-02 — small and primary simulator widths (P1)

**Given** the primary and smaller iPhone simulators, **when** drawer, chat with
keyboard, long document/table/code, filter rows, settings, and modal sheets are
opened, **then** horizontal overflow is intentional, safe areas are respected,
and no essential control is off-screen.

**Guarantee:** supported phone widths retain complete functionality.

**Adjacent:** NAV-02, CHAT-04, DOC-02, SET-01.

### VIS-03 — scroll, modal, and safe-area stress (P1)

**Given** longest seeded/created content and maximum text size, **when** nested
scroll views, bottom sheets, dialogs, web sheets, narration bars, and the
keyboard are combined, **then** content remains reachable, backdrop taps affect
only the top surface, and closing restores the exact underlying state.

**Guarantee:** layered mobile UI remains operable under stress.

**Adjacent:** DOC-02, IMP-07, WEB-01, A11Y-03.

---

# Execution order and state management

Run in this order unless a documented data dependency requires a local
adjustment:

1. PRE
2. NAV
3. CHAT
4. ART
5. DOC
6. WN
7. SUB
8. TOOL
9. IMP
10. RES
11. SET
12. WEB
13. SYS
14. A11Y
15. VIS

Start from one fresh deterministic seed. Use run-ID-prefixed disposable records
for destructive cases. Reseed only at a suite boundary, record it, and rerun any
earlier case whose evidence depended on modified seed state. Do not reseed to
erase a failure.

## Current coverage-risk assessment

At plan creation, the repository contained 20 Maestro flows covering useful
happy paths in articles, chat, research, subscriptions, Toolbelt add, and
What's New. That is not proof of this manual run and leaves material gaps:

- many drawer and CRUD validation/cancel/destructive paths
- structured chat cards and message actions
- voice permissions, controls, errors, and language behavior
- document selection, complete narration controls, and browser history
- search/filter composition across multiple screens
- subscription feedback/settings/offline queue behavior
- deep-link, notification, lifecycle, and malformed-route handling
- accessibility, dynamic type, themes, small-screen layout, and system sheets
- durable-state oracles and screenshot evidence for each interaction

Therefore the pre-execution confidence grade is **D (incomplete E2E proof)**.
This grade describes evidence breadth, not an assertion that the app is broken.
Only the completed ledger can improve the manual regression verdict.

# Final audit and terminal report

Before reporting completion:

1. Compare `rg --files app screens components` with the authoritative surface
   and add/run any missing new interaction.
2. Confirm every matrix ID has one ledger row.
3. Confirm no row remains `NOT RUN`, `FAIL`, or `BLOCKED`.
4. Confirm every N/A has file-and-line evidence and is genuinely intentional.
5. Confirm every PASS has a current-run, legible terminal screenshot.
6. Confirm every mutation case has the required durable-state check.
7. Confirm every defect has reflection, RED evidence where practical, minimal
   fix, focused and full checks, two manual reruns, adjacent reruns, screenshots,
   specialist review, and a commit.
8. Confirm no screenshot predates the run manifest start time.
9. Confirm screenshot filenames and reported paths exist.
10. Inspect every screenshot visually; file existence alone is insufficient.
11. Run the repository's required final quality gates and record their outputs.
12. If client code changed, complete the `RULES.md` deploy policy and record the
    release/deployment evidence.
13. Inspect `git status` and ensure only pre-existing unrelated changes remain.

Write `final-report.md` with:

- run identity and tested commit/build
- overall `PASS` or `BLOCKED` verdict
- counts by PASS/N/A/BLOCKED/FAIL
- suite-by-suite totals
- defects found, root causes, minimal fixes, commits, and rerun evidence
- all quality-gate results
- deployment evidence when required
- screenshot directory and a representative screenshot index
- remaining risks and exact blockers

The only valid all-green completion statement is:

> All applicable Holocron mobile interactions in the current source-derived
> regression matrix passed through computer-use on the named iOS Simulator.
> Every case has current-run screenshot evidence, all durable-state assertions
> passed, and every discovered defect was minimally fixed and rerun with its
> adjacent coverage.

Do not use that statement unless the final audit proves every clause.
