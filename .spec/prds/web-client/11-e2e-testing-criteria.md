---
stability: TEST_SPEC
last_validated: 2026-08-28
prd_version: 1.0.0
---

# E2E / Human Testing Criteria — Holocron Web Client

**PRD version** 1.0.0 · **2026-08-28** · **98 criteria** across **20 use cases** ·
**88/88 acceptance criteria covered**

Sprint gates draw their `[human-gate]` criteria from this file. Every criterion names what must be
**running** — real versus fixtured — and an **observable** pass/fail condition. "It should work" is
not a criterion.

## Summary

| Type | Count | What it means |
|---|---|---|
| `e2e-automated` | 71 | Playwright against a built Worker, real origin, real Postgres, fixtured model endpoint |
| `human-gate` | 10 | A person must look — unfurl rendering, the operator's own self-check, daylight legibility |
| `api-contract` | 8 | Response shape or header asserted directly, no browser |
| `integration-test` | 7 | Vitest `integration`/`live` lanes against real Postgres |
| `build-gate` | 2 | Fails the build — including one that fails if the harness runs against a fixture server instead of a deployed Worker |
| **Total** | **98** | |

## Scenario suite backing these criteria

| Tier | Count | Shape |
|---|---|---|
| `visible` | 41 | Structured Scenario Contract v1 — `start_state` → `action` → `end_state` with `must_not_observe`, plus `negative_control`. Validator-clean. |
| `holdout` | 92 | Plain prose, deliberately different framing from the acceptance criteria. 4-5 per UC. Unstructured **by design** — structure is easier to teach-to-the-test. |
| **Total** | **133** | Across 20 use cases, at `.spec/scenarios/{uc-id}/` |

**Flow coverage gate:** `PRD ok — 20 use case(s) each have core + edge flows` (exit 0). Every use
case carries at least one `happy_path` plus edge flows spanning empty, invalid, permission-denied,
offline/timeout and cold-boot. Zero gaps, zero waivers.

**Three criteria are human-gate only** — `UC-READ-01 AC-5`, `UC-READ-03 AC-2`, `UC-READ-06 AC-4`.
Legitimate (unfurl rendering and the operator's self-check cannot be performed by CI) but **no
sprint can turn them green**. They must be release gates, not sprint gates, or a sprint sits
permanently red on finished work.

---

## CHAT: Agent Conversation

### UC-CHAT-01: Ask the agent and watch it execute without ceremony

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-CHAT-001` | A question streams an answer with no plan, confirmation or per-tool approval anywhere in the turn. | AC-1 | `e2e-automated` | Deployed app, device platform awake, real model provider credentials, real archive tools; Playwright driving Chats. | PASS when the first streamed token appears and the DOM contains no approval, confirm, or plan control at any sampled point during the turn. FAIL if any approval affordance renders, or if streaming does not begin. |
| `T-CHAT-002` | Each tool call renders as exactly one collapsed line naming the tool and its result. | AC-2 | `e2e-automated` | Same as T-CHAT-001, with a question that provokes at least two real tool calls; device platform tool-invocation log captured for cross-check. | PASS when the count of rendered tool lines equals the count of invocations in the platform log, each line names the tool and carries a result summary, and each is collapsed by default. FAIL on a count mismatch, a missing tool name |
| `T-CHAT-003` | A tool line expands to its real input and output and collapses again. | AC-3 | `e2e-automated` | Same as T-CHAT-002. | PASS when expanding shows both the input arguments and the output payload matching the platform log for that invocation, and collapsing restores the single-line form. FAIL if either half is missing or if the expanded content diffe |
| `T-CHAT-004` | A failed tool call is identifiable from its collapsed line without expanding it. | AC-4 | `e2e-automated` | Same as T-CHAT-001 with one tool pointed at an unavailable dependency so it genuinely fails. | PASS when the collapsed line for the failed call is programmatically and visually distinguishable from a successful line before any expansion. FAIL if the failure is only visible after expanding or if the line reads as successful. |
| `T-CHAT-005` | Cancel stops an in-flight turn and stops the work on the device. | AC-5 | `e2e-automated` | Same as T-CHAT-001 with a long tool chain; device platform log captured across the cancel boundary. | PASS when streaming stops within 2 seconds of cancel, the turn is marked cancelled, and the platform log shows no tool or provider invocation for that run after the cancel timestamp. FAIL if tokens continue, or if the device keeps |
| `T-CHAT-023` | No approval, plan or confirmation message type is reachable in the shipped agent surface. | AC-1 | `build-gate` | Production build of the web client; static scan of the emitted bundle and of the BFF stream schema. | PASS when no approval/plan/confirm message type is constructible or renderable in the shipped surface. FAIL if any such branch exists, even if unreachable on the current happy path. |

### UC-CHAT-02: Issue slash commands from anywhere in the app

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-CHAT-006` | One keystroke from any screen places the caret in the prompt input. | AC-1 | `e2e-automated` | Deployed app, operator signed in; keystroke issued from Chats, from Library, and from an open document. | PASS when document.activeElement is the prompt input after the keystroke in all three origins. FAIL if any origin requires navigation first or leaves focus elsewhere. |
| `T-CHAT-007` | Typing a slash lists all six commands, each with a description. | AC-2 | `e2e-automated` | Same as T-CHAT-006. | PASS when the palette lists exactly /research, /deep-research, /search, /browse, /stats and /help, each with a non-empty description string. FAIL on a missing command, an extra command, or an empty description. |
| `T-CHAT-008` | A command is completed and submitted with its argument using the keyboard alone. | AC-3 | `e2e-automated` | Same as T-CHAT-006 with the device platform awake so the command actually executes. | PASS when the whole sequence from keystroke to a dispatched turn is completed with keyboard events only, with zero pointer events, and the platform receives the command with its argument intact. FAIL if a pointer event is required |
| `T-CHAT-009` | /help enumerates exactly the command set the client supports. | AC-4 | `e2e-automated` | Same as T-CHAT-006; the client's command registry read from source for cross-check. | PASS when the /help output set equals the palette set equals the registry set. FAIL on any command present in one and absent from another. |

### UC-CHAT-03: Read a transcript that is a trustworthy record

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-CHAT-010` | A twenty-turn transcript contains exactly one card per record. | AC-1 | `e2e-automated` | Deployed app against the real device platform; a scripted 20-turn conversation producing 6 records; full scrollback traversed twice. | PASS when card elements grouped by record id yield exactly 6 groups of size 1, on both traversals. FAIL if any record id maps to two or more rendered cards at any scroll position. |
| `T-CHAT-011` | A card reflects its record's new state after the record changes on the device, with no reload. | AC-2 | `e2e-automated` | Card visible in the browser; the record's state mutated directly through the real platform API, not through the UI. | PASS when the card shows the new state within the invalidation window with no page reload and no second card appearing. FAIL if the card stays stale, requires a reload, or duplicates. |
| `T-CHAT-012` | Reopening a past conversation reproduces the same cards in the same states. | AC-3 | `e2e-automated` | Conversation from T-CHAT-010 reopened in a fresh browser context after a full reload. | PASS when the same 6 record ids each render exactly one card and each state matches the state recorded in Postgres. FAIL on a missing card, a duplicate, or a state mismatch against the database. |
| `T-CHAT-013` | The stream carries only record references and invalidations, never record contents. | AC-4 | `api-contract` | Every frame of a real streamed turn captured at the transport layer against the real device platform; a second run with the record query endpoint blocked while the stream is allowed. | PASS when no captured frame contains a document body, title, snippet or result payload - only {kind,id} references and invalidations - AND the blocked-query run renders no card contents. FAIL if any content appears in a frame, or  |

### UC-CHAT-04: Dispatch a long research run and come back to it

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-CHAT-014` | A deep research run is acknowledged as a dispatched device job within two seconds. | AC-1 | `e2e-automated` | Deployed app, real device platform, real model provider; /deep-research submitted with a real topic. | PASS when an acknowledgement plus a card carrying the run's record id appears within 2 seconds and the platform reports a job created with that id. FAIL if the browser holds an open request in place of a dispatched job, or if no r |
| `T-CHAT-015` | The run survives navigation, tab close and machine sleep. | AC-2 | `e2e-automated` | Run started; browser tab closed entirely; conversation reopened in a new context after several minutes; platform job state polled throughout. | PASS when the platform shows the job progressing for the entire window with no client connected, and the reopened card reflects that progress. FAIL if job state stops advancing when the tab closes. |
| `T-CHAT-016` | Card progress derives from reported run state, so a dead run stops looking alive. | AC-3 | `integration-test` | Real run started, then the device job process killed outright so no terminal state is ever reported; card observed for 120 seconds; the fields backing the progress rendering inspected in sou | PASS when progress reads only from device-reported run-state fields (no elapsed-time input), and the card stops advancing and names staleness within 120 seconds of the kill. FAIL if any timer feeds the progress rendering, or if th |
| `T-CHAT-017` | Cancel from the card reaches a cancelled state and stops device spend. | AC-4 | `e2e-automated` | Real run in flight; cancel pressed from the card; platform log and provider call log captured across the boundary. | PASS when the card reaches cancelled within 5 seconds and zero provider calls are billed for that run after the cancel timestamp. FAIL if the card cancels visually while the device job continues. |
| `T-CHAT-018` | The finished document opens from the card in one action and is present in the Library. | AC-5 | `e2e-automated` | A completed real deep-research run against the real device platform. | PASS when a single activation on the card opens the document, and the same document id is found in the Library listing and in Postgres. FAIL if opening takes more than one action or the document is absent from the Library. |
| `T-CHAT-024` | A real machine sleep during a long run leaves the run recoverable and honestly stated on return. | AC-2 | `human-gate` | Operator starts a real /deep-research run, closes the laptop for at least ten minutes, then reopens it and returns to the conversation. | PASS when the operator reports the card showed the run's true current state on return and the run either completed or was honestly named as stopped. FAIL if the card showed a stale or fabricated progress state, or if the run died  |

### UC-CHAT-05: Lose a connection mid-answer without losing the record of it

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-CHAT-019` | A reload during streaming leaves the turn explicitly marked as interrupted. | AC-1 | `e2e-automated` | Deployed app with a real streaming turn; hard reload issued after roughly 200 words have streamed. | PASS when the reloaded transcript shows that turn carrying an explicit interrupted marker persisted server-side. FAIL if the turn is absent, unmarked, or presented as complete. |
| `T-CHAT-020` | An interrupted turn is visually and semantically distinguishable from a completed one. | AC-2 | `e2e-automated` | One interrupted turn and one completed turn in the same transcript; both rendered. | PASS when the two differ in rendered markers and the interrupted turn carries no completed-turn affordance. FAIL if the only difference is that one text ends mid-sentence. |
| `T-CHAT-021` | An interrupted turn is re-askable without retyping the question. | AC-3 | `e2e-automated` | Interrupted turn present; re-ask control activated; platform receives the resulting turn. | PASS when a single activation dispatches a new turn whose prompt is byte-identical to the original and streaming begins. FAIL if the operator must retype, or if the re-ask sends a different prompt. |
| `T-CHAT-022` | The transcript states which records produced before the interruption survived. | AC-4 | `integration-test` | Two real runs: one interrupted after a document record was created, one interrupted before any record existed; Postgres queried for the truth in both. | PASS when the first shows the surviving record as exactly one card matching the database, and the second states that nothing was produced. FAIL if a surviving record is invisible in the transcript, or if a turn that produced nothi |

---

## LIB: Archive Library

### UC-LIB-01: Find a document from a remembered fragment

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-LIB-001` | A partial remembered phrase returns results ranked by both wording and meaning. | AC-1 | `e2e-automated` | Deployed app against the real device platform with the seeded 200-document archive and the real hybrid search path; no stubbed search. | PASS when the target document appears in the top five for the fragment query AND the result set also contains a semantically related document sharing none of the typed words. FAIL if results are lexical-only, semantic-only, or the |
| `T-LIB-002` | An exact phrase typed verbatim puts its source document on the first screen. | AC-2 | `e2e-automated` | Same as T-LIB-001, using an eleven-word sentence copied verbatim out of a seeded document. | PASS when the source document is rank 1 and visible without scrolling. FAIL if it ranks below the fold or below a semantically similar non-match. |
| `T-LIB-003` | Every result row carries a matching snippet drawn from the document body. | AC-3 | `e2e-automated` | Same as T-LIB-001 with a fragment query returning at least ten rows. | PASS when every row shows a non-empty snippet that is not merely the title repeated and that contains or is adjacent to the matched terms. FAIL on any row with an empty snippet or a snippet equal to the title. |
| `T-LIB-004` | A result row states whether it is a research output, a transcript, or a digest. | AC-4 | `e2e-automated` | Same as T-LIB-001 with a query returning at least one of each kind from the seeded fixture set. | PASS when each row's rendered kind matches the kind stored in Postgres for that document, for all three kinds. FAIL on a missing kind marker or a mismatch against the database. |
| `T-LIB-018` | The hybrid search path the Library drives is the real server-side hybrid search over the documents table. | AC-1 | `integration-test` | Application search requests captured at the device platform boundary against real Postgres; results compared with the platform's own hybrid search called directly with the same query. | PASS when the application's result ids and order match the direct platform call for five different queries. FAIL if the client re-ranks, filters client-side, or calls a lexical-only endpoint. |

### UC-LIB-02: Narrow the archive with filters

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-LIB-005` | Category, research-type and status chips narrow the result set correctly. | AC-1 | `e2e-automated` | Same as T-LIB-001; three chips applied in sequence; Postgres queried for the expected sets. | PASS when the count decreases at each step and the visible row set equals the database set for the applied predicate at each step. FAIL on any row that violates an applied chip. |
| `T-LIB-006` | The shared and unshared chips return exactly the documents in that share state. | AC-2 | `e2e-automated` | Seeded archive with seven public documents; both chips exercised; share state cross-checked in Postgres. | PASS when the shared chip yields exactly the seven public documents and the unshared chip yields exactly the complement. FAIL on any set difference from the database. |
| `T-LIB-007` | Chips combine with a search query and the result count updates. | AC-3 | `e2e-automated` | Same as T-LIB-005 with a query typed while chips remain applied. | PASS when every visible row satisfies both the chips and the query, and the displayed count changes to match the combined result size. FAIL if the count is stale or if a row violates either predicate. |
| `T-LIB-008` | All filters clear in exactly one action and the URL returns to the unfiltered address. | AC-4 | `e2e-automated` | Four chips and a query applied; one activation of the clear control. | PASS when a single interaction removes every chip and the query, restores the full archive count, and leaves the Library at its unfiltered URL. FAIL if more than one interaction is required or if filter state persists in the URL. |

### UC-LIB-03: Read a document in a calm reading column

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-LIB-009` | The reading column is a high-contrast measure with no chrome inside it. | AC-1 | `e2e-automated` | Deployed app at 1440px with the 4,200-word fixture open in the Library reading column. | PASS when body text contrast against its background is >= 7:1, measured line length is 45-75 characters, and the element tree inside the measure contains no glow, tint, border, badge or interactive control. FAIL on any chrome elem |
| `T-LIB-010` | Figures render in the reading column at the same measure the public page uses. | AC-2 | `e2e-automated` | Same document open in the reading column and at its real public URL, both at 1440px, against the deployed Worker and the deployed app. | PASS when both surfaces render the same number of loaded figures and their measured column widths differ by no more than 5%. FAIL on a figure-count difference or a width divergence beyond 5%. |
| `T-LIB-011` | A citation is followable from a claim to its source inside the document view. | AC-3 | `e2e-automated` | Fixture document with six real citations open in the reading column. | PASS when all six render as anchors with absolute hrefs and visible source identity, and activating one navigates to that href. FAIL if any citation is dropped or rendered as inert text. |
| `T-LIB-012` | A heading anchor jumps to its section and can be copied as a link. | AC-4 | `e2e-automated` | Same document in the reading column at 1440px with clipboard permission granted; slug compared against the public page's slug for the same heading. | PASS when activating the anchor scrolls the heading into view, the clipboard holds a URL that reopens the document at that section, and the slug matches the public page's slug for the same heading. FAIL on a slug divergence betwee |
| `T-LIB-019` | The operator confirms his reading column and the stranger's page look like the same document. | AC-2 | `human-gate` | Operator views the same document side by side: the Library reading column and the real public URL, both at desk width and both at phone width. | PASS when the operator reports the same measure, the same type scale, and the same figures on both surfaces at both widths. FAIL on any difference the operator can name, since a divergence here destroys the self-check that guards  |

### UC-LIB-04: Ask about the passage in front of him

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-LIB-013` | Selecting a passage offers exactly one control. | AC-1 | `e2e-automated` | Deployed app with the fixture document open in the reading column; a single sentence selected programmatically and by real drag. | PASS when exactly one interactive control appears anchored to the selection in both cases. FAIL on zero controls or on two or more. |
| `T-LIB-014` | Ask about this lands in Chats with the passage quoted and its source document identified. | AC-2 | `e2e-automated` | Same as T-LIB-013 with the device platform awake; the control activated. | PASS when Chats opens carrying the selected sentence verbatim as quoted context and the source document's title and id present, with the caret in the input. FAIL if the quote is altered or the source identity is missing. |
| `T-LIB-015` | The answer to a follow-up refers to the quoted passage and names its document. | AC-3 | `e2e-automated` | Same as T-LIB-014 with a real model provider; follow-up 'why would that be' submitted. | PASS when the completed answer references the quoted content and names the source document, and the turn's request payload on the device carries both the passage and the document id. FAIL if the payload lacks either, since a prose |
| `T-LIB-016` | Returning to the document restores the scroll position that was left. | AC-4 | `e2e-automated` | Selection made at roughly 60% scroll depth in the 4,200-word document; the operator goes to Chats and returns. | PASS when the restored scrollY is within 50px of the departure value. FAIL if the document reopens at the top or at an arbitrary offset. |
| `T-LIB-017` | No AI control appears anywhere in the reading column until text is selected. | AC-5 | `e2e-automated` | Full scroll of the 4,200-word document with hover over paragraphs, headings and figures, no selection made. | PASS when the enumerated set of interactive controls inside the measure is empty for the whole traversal, and exactly one appears immediately after a selection. FAIL on any hover-triggered affordance or any persistent assistant co |

---

## READ: Public Reader

### UC-READ-01: Render a shared document completely, figures included

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-READ-001` | Every remote absolute-URL image in a published document renders as a loaded figure on the public page. | AC-1 | `e2e-automated` | Real device platform on the Mac behind the real cloudflared tunnel; Postgres seeded via 'bun services/platform/src/cli/holo.ts seed:e2e --reset'; reader Worker deployed to a real Cloudflare  | PASS when the article contains one figure element per remote image (2 in the fixture) and each img reports naturalWidth > 0 after load with a 200 image/* response. FAIL on any figure whose img fails to load, any 0-width image, or  |
| `T-READ-002` | Document-local images render as figures with no literal image markdown and no dead anchors left in the body. | AC-2 | `e2e-automated` | Same as T-READ-001, using share-e2e-figures whose markdown references assets/a1, assets/a2 and assets/a3 stored as real rows in the device Postgres. | PASS when 3 document-local figures load with 200 responses from /d/<token>/assets/<id> AND document.body.innerText contains zero occurrences of '![' AND the article contains zero anchors with href='#'. FAIL on any one of the three |
| `T-READ-003` | A dense chart enlarges beyond the reading measure on a phone viewport and can be dismissed three ways. | AC-3 | `e2e-automated` | Playwright at 390x844 with touch emulation against the deployed public page for share-e2e-figures. | PASS when tapping the 2400x1600 figure produces an overlay at >= 95% of viewport width, page scroll is locked while open, and each of outside-tap, close control and Escape restores the previous scroll position within 50px. FAIL if |
| `T-READ-004` | The /d/<token>/assets/<id> route serves bytes only while the document is currently shared. | AC-4 | `api-contract` | Direct HTTP against the deployed Worker on the real docs hostname; share state toggled through the real platform API against real Postgres; no browser required. | PASS when the asset returns 200 with image/* and a body length equal to the stored row while public, AND returns a non-200 with zero image bytes within 60s of unsharing. FAIL if any image bytes are served after the 60s bound or if |
| `T-READ-005` | The operator counts identical figures in his reading column and on the real public URL for the same document. | AC-5 | `human-gate` | Operator signed into the deployed app with the real device awake; the same document open in the Library reading column and in a second tab at its real public URL. | PASS when the operator reports the same number of visibly rendered figures on both surfaces and states the count. FAIL on any difference, or if the operator cannot reach the real public URL from the share control. |
| `T-READ-027` | A browser end-to-end harness exists for the web surface and executes against a deployed URL in CI. | AC-1 | `build-gate` | Clean checkout, CI runner with no pre-installed browsers; the INFRA sprint's provisioning is the only source of the harness. Reality gate records the web surface as MISSING. | PASS when a single documented command installs the browser and runs at least one browser test against a real deployed Worker URL, exiting non-zero on failure. FAIL if no such command exists, if it runs against a local fixture serv |
| `T-READ-028` | The asset route is scoped to the token, so an asset id cannot be fetched through another document's token. | AC-4 | `integration-test` | Two published fixture documents with distinct assets in real Postgres; direct HTTP against the deployed Worker. | PASS when /d/<token-A>/assets/<id-belonging-to-B> returns a non-200 with no image bytes, and path-traversal variants under a valid token also return non-200. FAIL if any cross-token or traversal request returns bytes. |

### UC-READ-02: Orient a cold reader within the first screen

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-READ-006` | Title, publisher identity and publication date are all readable in the first viewport with no scrolling. | AC-1 | `e2e-automated` | Playwright at 390x844 against the deployed public page for share-e2e-long, colour scheme emulated light. | PASS when all three strings are present and within the initial viewport bounding box at scrollY 0, and the header band occupies <= 25% of viewport height. FAIL if any of the three requires scrolling or is absent. |
| `T-READ-007` | The public page follows the operating-system colour scheme and light mode is a real light treatment. | AC-2 | `e2e-automated` | Playwright with prefers-color-scheme emulated as light, dark and no-preference against the deployed public page; a planted localStorage theme=dark and a ?theme=dark query string in the light | PASS when light and no-preference both yield body background relative luminance > 0.85 with body text contrast >= 7:1, including with the planted dark hints present. FAIL if any light-preference run renders a dark background. |
| `T-READ-008` | The body is legible at phone width with no horizontal scrolling and no pinch-zoom required. | AC-3 | `e2e-automated` | Playwright at 390x844 against the deployed public page for share-e2e-long. | PASS when document.scrollWidth <= window.innerWidth, computed body font-size >= 16px, and measured line length is between 45 and 75 characters. FAIL on horizontal overflow or a measured line length outside that band. |
| `T-READ-009` | No sign-in, cookie, install or modal gate appears on the public page, and no cookie is set. | AC-4 | `e2e-automated` | Playwright with a fresh context, cookies observed at the network layer, against the deployed public page; repeated once with a planted expired operator cookie. | PASS when the response carries no Set-Cookie header, no element with dialog role is present, no redirect to any sign-in route occurs, and context.cookies() is empty after load, in both runs. FAIL on any Set-Cookie, any modal, or a |
| `T-READ-010` | First contentful paint on the public page is document text, with no spinner or skeleton at any point. | AC-5 | `e2e-automated` | Playwright tracing with a purged edge cache and Fast 3G throttling against the deployed public page; server-rendered HTML also captured with JavaScript disabled. | PASS when the first contentful paint element is body text, the raw HTML response already contains the document prose, and no frame in the trace contains a loading/skeleton/spinner element. FAIL if any skeleton frame exists or if p |

### UC-READ-03: Preview a shared link before it is opened

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-READ-011` | A pasted share link unfurls with title, description and hero image in Slack, iMessage and a mail client. | AC-1 | `human-gate` | Real share link for share-e2e-figures pasted into a real Slack channel, a real iMessage thread and a real mail client compose window, with the Worker deployed and the document public. | PASS when all three clients render a card showing the document title, a prose description, and a visible image. FAIL if any of the three renders a bare URL or a card missing the image. |
| `T-READ-012` | A reviewer with no prior context can tell a research write-up from an arbitrary URL paste using the card alone. | AC-2 | `human-gate` | Two cards side by side in a real Slack channel: the share link and a control URL to an unrelated page; reviewer has not seen the document. | PASS when the reviewer names the document's subject from the card alone and identifies it as a research write-up. FAIL if the reviewer cannot state what the document is about from the card. |
| `T-READ-013` | OpenGraph and Twitter card metadata are emitted on every response for a currently shared document. | AC-3 | `api-contract` | Direct HTTP with a crawler user agent against the deployed Worker for every public token in the seeded fixture set. | PASS when each response carries og:title, og:description (60-200 chars), og:url matching the canonical URL, og:type, twitter:card=summary_large_image, twitter:title and twitter:description; and any og:image present resolves to a 2 |
| `T-READ-014` | The operator sees the recipient's card without hand-authoring any metadata. | AC-4 | `human-gate` | Operator shares a freshly created document with no manual metadata entry anywhere in the flow, then pastes the link into Slack. | PASS when the card renders with title, description and image and the operator confirms he entered no metadata at any step. FAIL if any manual metadata field exists in the share flow or the card is incomplete. |

### UC-READ-04: Navigate and cite a long document by section

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-READ-015` | A heading anchor can be copied and opened by a third party to land on that section. | AC-1 | `e2e-automated` | Playwright at 1440px against the deployed public page for share-e2e-long; clipboard permission granted; a second clean browser context used for the landing check. | PASS when the copied clipboard value equals https://docs.holocrnlib.com/d/share-e2e-long#latency-under-batch-load and opening it in the second context scrolls that heading into the first viewport. FAIL on a clipboard value of a di |
| `T-READ-016` | Heading structure and document length are visible before the reader commits to reading. | AC-2 | `e2e-automated` | Playwright at 1440px and at 390x844 against the deployed public page for the 14-heading fixture. | PASS when an outline or heading list exposing all 14 headings is reachable without scrolling past the first screen at desktop width, and an explicit length signal (word count, reading time, or progress rail extent) is present at b |
| `T-READ-017` | Reading progress is signalled on a phone and tracks scroll monotonically. | AC-3 | `e2e-automated` | Playwright at 390x844 against the deployed public page for share-e2e-long, sampled at 10 scroll positions; repeated with prefers-reduced-motion. | PASS when a progress element outside the reading measure reports near 0 at top, near 100 at bottom, never decreases while scrolling down, and still updates under reduced motion. FAIL if no signal exists, if it is inside the measur |
| `T-READ-018` | A citation is followable from the claim to its source from within the shared document. | AC-4 | `e2e-automated` | Playwright against the deployed public page for a fixture document carrying 6 real citations, one of which targets a host that returns 404. | PASS when all 6 citations render as anchors with absolute href values and visible source identity, and clicking one navigates to that href. FAIL if any citation is dropped, rendered as plain text, or if the page blocks first paint |

### UC-READ-05: Explain a withdrawn document calmly

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-READ-019` | A withdrawn link returns a designed page rather than a raw error, stack trace or blank body. | AC-1 | `e2e-automated` | share-e2e-revoked published, confirmed resolving, then unshared through the real platform API; Playwright against the deployed Worker after the 60s bound. | PASS when the response body contains the withdrawn copy in the product's typography, contains no stack trace or framework error text, and body text length is greater than zero. FAIL on a default error page, an empty body, or a bar |
| `T-READ-020` | A reader with no context reads the page as a deliberate withdrawal rather than a broken link. | AC-2 | `human-gate` | A reviewer who has not seen the document or the spec opens the revoked URL on a phone. | PASS when the reviewer states unprompted that the author withdrew the document. FAIL if the reviewer says the link is broken, expired by accident, or that the site is down. |
| `T-READ-021` | The withdrawn page offers no sign-in route to the content. | AC-3 | `e2e-automated` | Playwright against the deployed Worker for a revoked token, in an anonymous context and again with a valid operator session cookie present. | PASS when neither run contains a sign-in link, an auth form, an account-creation prompt, or copy implying access is available with an account, and neither redirects to an auth route. FAIL if the operator run reveals any privileged |
| `T-READ-022` | The withdrawn response carries both cache headers and is cached at the edge like a live document. | AC-4 | `api-contract` | Direct HTTP against the deployed Worker on the real zone for a revoked token, requested from three edge locations. | PASS when both Cache-Control and Cloudflare-CDN-Cache-Control are present with max-age <= 60, the 404 status is cacheable, and at least one repeat request reports a cache hit. FAIL if either header is absent, if max-age exceeds 60 |
| `T-READ-029` | Repeated visits to a dead link generate zero origin requests to the device. | AC-4 | `integration-test` | Revoked token; device platform running with access logging on; 20 requests issued from three edge locations after the first request warms the cache. | PASS when the platform access log records zero requests for that token after the first. FAIL on any origin hit attributable to a cached-withdrawn response. |

### UC-READ-06: Preserve every share link already in circulation

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-READ-023` | Every token minted before the rewrite resolves to the same document at the same address. | AC-1 | `e2e-automated` | Fixture list of pre-rewrite tokens including share-e2e-legacy in the seeded Postgres; deployed rewritten reader serving the real docs hostname. | PASS when every token returns 200, resolves to the same document id it resolved to before the cutover, and follows no redirect to a different path shape. FAIL on any 404, any redirect that changes the path, or any document id mism |
| `T-READ-024` | A newly minted share link matches the documented https://docs.holocrnlib.com/d/<token> shape. | AC-2 | `integration-test` | Mint links through both the application share path and the MCP share tool against the real device platform and real Postgres. | PASS when both paths return URLs matching ^https://docs\.holocrnlib\.com/d/[A-Za-z0-9_-]+$ and the URL string in the MCP tool description matches the URL actually returned. FAIL on any other shape or on drift between the tool's pr |
| `T-READ-025` | The /d/<token> path yields exactly two outcomes across the full token matrix. | AC-3 | `api-contract` | Direct HTTP against the deployed Worker for tokens that are valid-public, valid-revoked, never-minted, malformed, path-traversing and whitespace-padded. | PASS when every response is either the document or the withdrawn page. FAIL on any redirect to sign-in, JSON error body, 500, directory listing, or empty 200 anywhere in the matrix. |
| `T-READ-026` | The previous standalone reader is retired with no circulating link changing address. | AC-4 | `human-gate` | Cutover performed on the real zone with an external client polling a circulating token once per second throughout; old reader decommissioned. | PASS when the operator confirms the old reader is off, and the poll log contains zero 502/503/reset/DNS failures and zero address changes for the whole window. FAIL on any error in the poll series or any surviving dependency on th |

---

## SHARE: Share Lifecycle

### UC-SHARE-01: Publish one document and hand over one link

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-SHARE-001` | Toggling a document public from the Library returns its canonical URL in the same view. | AC-1 | `e2e-automated` | Deployed app, device platform awake, real Postgres; toggle pressed on a Library row. | PASS when the URL appears in the same view without navigation and matches ^https://docs\.holocrnlib\.com/d/[A-Za-z0-9_-]+$, and Postgres shows the document public with that token. FAIL if the URL requires opening the document, or  |
| `T-SHARE-002` | The link copies in one action with visible confirmation. | AC-2 | `e2e-automated` | Same as T-SHARE-001 with clipboard permission granted and the clipboard read back. | PASS when one activation places the exact canonical URL on the clipboard and a confirmation is rendered. FAIL on a clipboard mismatch, a silent copy, or a confirmation shown when the write actually failed. |
| `T-SHARE-003` | The same control opens the real public URL in a new tab. | AC-3 | `e2e-automated` | Same as T-SHARE-001; new tab captured and its address inspected. | PASS when the new tab's URL is exactly the public docs URL - not an internal preview route, not a query-param preview mode - and it renders the public page. FAIL if any preview surface distinct from the real URL is opened. |
| `T-SHARE-004` | Every figure renders on the opened public page before the operator sends the link. | AC-4 | `e2e-automated` | Same as T-SHARE-003 using share-e2e-figures with five figures. | PASS when all five figures on the opened public page report naturalWidth > 0 and the count equals the figure count in the operator's reading column. FAIL on any unloaded figure or any count mismatch. |
| `T-SHARE-005` | Exactly one link exists per document and nothing else in the product is shareable. | AC-5 | `api-contract` | Repeated share calls for one document against the real platform; full enumeration of share affordances in the deployed app. | PASS when repeated shares yield one active token in Postgres and no share affordance exists on a conversation, a collection, a search result set, or a research card. FAIL on a second token or any non-document share surface. |
| `T-SHARE-016` | The operator completes a real share-and-self-check end to end and confirms the recipient's page. | AC-3 | `human-gate` | Operator, real device awake, real deployed Worker: find a document with figures, share it, copy the link, open the real public URL, then send it to a real recipient on a different network an | PASS when the operator reports he saw the stranger's page before sending, and the recipient confirms the same figures rendered on their device. FAIL if the operator could not reach the real public page from the share control, or i |

### UC-SHARE-02: See what is public at a glance

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-SHARE-006` | Share state is visible on every Library row without opening the document. | AC-1 | `e2e-automated` | Deployed app with the seeded 200-document archive, seven of them public; all rows rendered. | PASS when every row exposes a share-state indicator and the set of rows marked public equals the seven public ids in Postgres. FAIL if any row lacks the indicator or the sets differ. |
| `T-SHARE-007` | The shared filter lists the complete public set in one view. | AC-2 | `e2e-automated` | Same as T-SHARE-006 with the shared chip applied. | PASS when exactly the seven public documents are listed, all reachable in one view, and the count reads seven matching Postgres. FAIL on a missing document, an extra document, or a count that disagrees with the database. |
| `T-SHARE-008` | A row's share state changes immediately after toggling, without a reload. | AC-3 | `e2e-automated` | Same as T-SHARE-006; an eighth document toggled public with no page reload issued. | PASS when the row shows the new state and the shared count moves from seven to eight, with no navigation or reload, and the change is confirmed in Postgres. FAIL if a reload is required or if the UI leads the database without a su |
| `T-SHARE-009` | An already-public document is identifiable as such before it is shared again. | AC-4 | `e2e-automated` | Same as T-SHARE-006; the share affordance on an already-public row inspected before activation. | PASS when the row states the document is already public and the share control reflects that state before any activation. FAIL if the control is indistinguishable from an unshared row's control. |

### UC-SHARE-03: Take a share back and know it is dead

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-SHARE-010` | Unsharing is completed with one action from the Library row. | AC-1 | `e2e-automated` | Deployed app with a public document; one activation of the unshare control on its row; Postgres inspected after. | PASS when a single interaction sets the document unshared in Postgres with no confirmation ladder and no navigation. FAIL if unsharing requires opening the document or multiple steps. |
| `T-SHARE-011` | The propagation bound is stated to the operator at the moment of unsharing. | AC-2 | `e2e-automated` | Same as T-SHARE-010; the interface captured at the instant of the unshare. | PASS when copy naming a sixty-second bound is rendered at that moment, and the number stated matches the max-age actually set on the withdrawn response. FAIL if no bound is stated, or if the stated bound and the deployed header di |
| `T-SHARE-012` | The public URL serves the withdrawn page within the stated sixty-second bound. | AC-3 | `e2e-automated` | Real revocation against real Postgres; an external client polling the deployed Worker on the real zone once per second from three edge locations, after warming the document in each. | PASS when every location returns the withdrawn page no later than 60 seconds after the unshare and never returns the document afterwards. FAIL on any document response past the bound at any location. |
| `T-SHARE-013` | A recipient's previously working link returns the withdrawn page after revocation. | AC-4 | `e2e-automated` | Second browser context on a different network with the link loaded and bookmarked before revocation; hard reload issued after the bound. | PASS when the reload returns the withdrawn page with no document content in the response body. FAIL if the document is served from any cache layer after the bound. |
| `T-SHARE-014` | A re-shared document resolves again from the Library row. | AC-5 | `e2e-automated` | Previously revoked document re-shared through its Library row; the public URL polled from the deployed Worker. | PASS when the public URL returns the document within the stated bound and the row shows public, with the token in Postgres matching the URL in the row. FAIL if the link stays dead past the bound or if a different token is minted w |
| `T-SHARE-015` | Both cache headers are set on document and withdrawn responses so revocation cannot inherit the zone default TTL. | AC-3 | `api-contract` | Direct HTTP against the deployed Worker on the real Cloudflare zone for a public token and a revoked token. | PASS when both Cache-Control and Cloudflare-CDN-Cache-Control are present on both responses with max-age <= 60 and the 404 is cacheable. FAIL if either header is missing on either response, or if max-age exceeds 60 anywhere. |

---

## SHELL: Operator Shell

### UC-SHELL-01: Sign in once and reach both destinations

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-SHELL-001` | Sign-in lands the operator in Chats and no subsequent navigation re-authenticates. | AC-1 | `e2e-automated` | Deployed app with real BetterAuth against real Postgres; device platform awake; Playwright from a clean context using seeded operator credentials. | PASS when sign-in ends on the Chats route and six subsequent navigations between Chats and Library produce no sign-in route in the navigation history and no 401 responses. FAIL on any re-auth prompt. |
| `T-SHELL-002` | Moving between destinations preserves the state of the destination that was left. | AC-2 | `e2e-automated` | Same as T-SHELL-001, with a typed draft in Chats and an applied filter in Library. | PASS when the Chats draft text is byte-identical on return and the Library filter chips are still applied with the same result count. FAIL if either resets. |
| `T-SHELL-003` | A hard reload of any authenticated page leaves the operator signed in. | AC-3 | `e2e-automated` | Same as T-SHELL-001; hard reload issued on Chats, on Library, and on a document route. | PASS when all three reloads render the authenticated destination with no redirect to sign-in. FAIL on any redirect or any 401. |
| `T-SHELL-004` | The auth redirect applies to the operator destinations and never to a public document URL. | AC-4 | `api-contract` | Direct HTTP with no session against the deployed app for /chats and /library, and against the deployed Worker for a public /d/<token>; repeated with cookies blocked entirely. | PASS when both operator routes redirect to sign-in and the public document returns 200 with the document, no redirect, and no Set-Cookie, in both runs. FAIL if the public path ever redirects or sets a cookie. |
| `T-SHELL-005` | A stranger opens a shared document with no operator session in existence. | AC-5 | `e2e-automated` | Playwright incognito context with cookies blocked, against the deployed public URL, while no operator session exists anywhere. | PASS when the document renders in full with its figures and no auth artefact of any kind is present. FAIL on any auth prompt, cookie, or missing content. |

### UC-SHELL-02: Show an honest state when the device is unreachable

| # | Criterion | AC | Type | Setup | Pass / fail |
|---|---|---|---|---|---|
| `T-SHELL-006` | The Library names the device as not answering rather than rendering an empty archive. | AC-1 | `e2e-automated` | Operator signed in; device platform process stopped and tunnel closed for real; archive contains 200 seeded documents. | PASS when the Library renders the device-unreachable copy with a retry control and renders zero document rows without any empty-archive or zero-results copy. FAIL if the empty-archive component renders or if the failure is unnamed |
| `T-SHELL-007` | A Chats turn that fails because the device is unreachable is named as such. | AC-2 | `e2e-automated` | Same as T-SHELL-006; a question submitted in Chats while the device is down. | PASS when the turn is marked failed with copy naming the device, distinct from the generic error string used for other failures. FAIL on a generic error, an empty assistant bubble, or a turn left streaming. |
| `T-SHELL-008` | Retry from the same screen succeeds once the device is awake, with no navigation. | AC-3 | `e2e-automated` | Device restarted while the unreachable state is on screen in both Library and Chats. | PASS when pressing retry populates the Library with the seeded documents and completes a Chats turn, with the route unchanged throughout. FAIL if recovery requires navigating away, reloading, or signing in again. |
| `T-SHELL-009` | The renders for device-unreachable and genuinely-empty are different and are driven by different conditions. | AC-4 | `integration-test` | Two real runs against the real platform: device down with 200 documents, and device up with a truly empty archive. | PASS when the two renders differ in visible copy and only the unreachable render offers retry. FAIL if both map to the same component or the same string. |
| `T-SHELL-010` | A real machine sleep, not a stopped process, produces the named unreachable state. | AC-1 | `human-gate` | Operator puts the actual Mac to sleep with the browser open on the Library, waits two minutes, then wakes it. | PASS when the operator reports the Library named the device as not answering while asleep and recovered via retry after wake, with no empty archive shown at any point. FAIL if an empty archive or a generic error appeared. |

---

## Maintenance

- **Adding a criterion.** Use the next `T-{PREFIX}-{NNN}` for its group. IDs are stable and
  referenced downstream — never renumber.
- **Changing a UC's acceptance criteria.** Re-run
  `/kb-prd-plan --update "regenerate e2e-testing-criteria for affected UCs"`. Unchanged criteria
  keep their IDs.
- **The coverage rule is checked.** Every acceptance criterion in every use case must be referenced
  by at least one criterion here. Currently 88/88 with none
  uncovered.
- **Real services.** A mocked device does not satisfy a criterion. The only fixtured boundary in the
  whole suite is the model HTTP endpoint; see the harness constitution.

---

_From `product-manager.test-suite.json`. Counts, AC coverage and validator cleanliness were
independently recomputed by the orchestrator rather than accepted from the self-report._
