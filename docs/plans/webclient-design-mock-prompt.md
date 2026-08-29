# Holocron Web Client — design mock brief

Paste everything below this line into the design tool.

---

You are designing high-fidelity mocks for **holocron**, a personal research knowledge system, as a web client at `docs.holocrnlib.com`. One person owns it and uses it all day from a desk. It has two faces in one product, and the tension between them is the whole design problem.

1. **The operator cockpit** — behind sign-in, exactly two destinations: **Chats** (a conversation with an AI agent that searches the archive and the web and executes tools without asking permission) and **Library** (a searchable index of every research document). Dark by default. Keyboard-first.
2. **Public reader pages** at `/d/<token>` — one document, one link, no login. Anyone can open them, most often on a phone, in daylight. Follows the reader's OS colour scheme; light mode must be first-class, not a fallback.

The identity direction is **"lean into the name."** A holocron is a crystalline archive: deep dark field, luminous edges, faceted geometry, amber and teal light, motion only when state actually changes.

## The one rule that governs everything

**Identity lives in the chrome. Calm lives in the column.**

Glow, depth, facets and motion belong to navigation, cards, message frames, controls, loading and state transitions. The moment text becomes long-form — a research document, a long agent answer — the reading column goes calm and high-contrast with **nothing decorative inside the measure**: no shadows, no gradients, no glow, no accent colour on text, no animation. This is a *measure* boundary, not a page boundary, and it cuts through single components: a Library search result is a chromed frame containing calm type. The frame may glow; the snippet inside it may not.

The failure you are designing against: sci-fi chrome and a 4,000-word research document fighting each other. When in doubt, the document wins.

## Who you are designing for

**The Operator.** Senior engineer, 27"+ display, dark room, browser open all day beside an editor and a terminal. Lives in a terminal coding agent and expects the same register from this one: it answers and it executes, tersely, with no ceremony. Fires 20-minute research runs and walks away. Needs to find a half-remembered document by a phrase fragment. Needs to see at a glance what is currently public under his name. Will not tolerate approval prompts framed as safety.

**The Sent-To Peer.** Gets a link pasted into Slack with one line of framing. Opens it on a work laptop with 30 tabs open and 30 seconds of attention. Wants the charts — the chart is usually the finding. Skims headings and length before committing. Will copy a section link back into the thread.

**The Forwarded Stranger.** Two hops from the sender. Opens the link on a phone, outdoors, one-handed, OS in light mode, with zero context and mild suspicion. Decides in one screen whether a person is accountable for this and whether it is worth ten minutes. Will close the tab on the first confusing thing. Never sees the cockpit and must never be shown a sign-in. **This is the highest-volume reader of any page in the product.**

## Visual system — use these values exactly

### Colour

| Token | Role | Light | Dark |
|---|---|---|---|
| background | Page field | `#FFFFFF` | `#0A0E14` |
| foreground | Chrome text | `#14171C` | `#E8E4DE` |
| card | Raised chrome plane: cards, rows, message frames | `#F9F8F6` | `#111820` |
| popover | Palette, dropdowns, enlarge surface | `#FFFFFF` | `#151C26` |
| muted | Quiet fill: chips, badges, code chrome | `#F1EFEB` | `#1E2A3B` |
| muted-foreground | Timestamps, counts, tool-row summaries | `#5A6170` | `#9FADC0` |
| border | Decorative hairlines only | `#E3E0DA` | `#1E2A3B` |
| border-strong | Boundary of any control or state pip | `#767C88` | `#556B85` |
| primary (amber) | Identity accent as text/icon, active state | `#8A4B00` | `#F5A623` |
| primary-surface | Filled amber (primary button, active pip) | `#F5A623` | `#F5A623` |
| accent (teal) | Links in chrome, progress fill, "running" state | `#0B5F5A` | `#4FD1C5` |
| ring | Focus ring | `#0B5F5A` | `#F5A623` |
| destructive | Cancel, revoke, failed tool, interrupted turn | `#B42318` | `#F87171` |
| success | Run finished, copied, share live | `#116A45` | `#34D399` |
| warning | Device asleep, no-signal, propagation notice | `#8A5A00` | `#FBBF24` |

Reading-column tokens — the only colours permitted inside a measure:

| Token | Role | Light | Dark |
|---|---|---|---|
| paper | Column surface (in dark it equals background — the column is a hole in the dark, not a card) | `#FFFFFF` | `#0A0E14` |
| paper-ink | Body text | `#14171C` | `#EDEAE4` |
| paper-ink-muted | Captions, byline, footnotes | `#5A6170` | `#A6AEBC` |
| paper-rule | hr, blockquote bar, table borders, figure frame | `#E3E0DA` | `#212C3C` |
| paper-link | Body links — always underlined | `#0B5F5A` | `#7FDCD3` |
| paper-code-bg | Inline code and pre fill (a whisper) | `#F4F2EE` | `#141C26` |
| paper-mark | Search-snippet match highlight | `#FDF0CE` | `#3A3213` |

Vivid amber `#F5A623` on white is 1.9:1 — never use it as text in light mode; light gets the burnt amber. Ink on filled amber is `#14171C` (light) / `#0A0E14` (dark).

### Type

Reading face: the system sans stack (no webfont on the public page). Chrome face: one variable sans, weights 400–650, used only in the cockpit and the unfurl card. Mono for code, tool arguments, share tokens.

| Role | Size (phone → desktop) | Line height | Notes |
|---|---|---|---|
| Document title | 28 → 38px | 1.15 | weight 700, tracking −0.02em, balanced wrap |
| h2 | 22 → 26px | 1.25 | weight 650, 2.2em above / 0.6em below |
| h3 | 19 → 21px | 1.30 | weight 600 |
| h4 | 17 → 18px | 1.35 | h5/h6 render at body size, weight 650, tracking +0.02em |
| Lead (first paragraph, public page) | 18 → 21px | 1.60 | full ink, not muted — this paragraph decides the 30-second triage |
| Body | 17 → 19px | 1.70 | **one value on both surfaces** |
| Caption | 14 → 15px | 1.50 | never italic |
| UI small | 13px | 1.40 | chips, badges, tool rows, timestamps |
| UI | 14px | 1.45 | nav, buttons, inputs, row titles |
| UI large | 16px | 1.45 | composer input (16px minimum), card titles |

### Space and radius

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Page gutter 20px (phone) → 32px (desktop). Space above and below every figure: 32–44px. Minimum tap target 44px.

Radius — crystalline means tight: **4** chips, badges, inline code · **6** buttons, inputs, figures, tool rows · **10** cards, popovers, palette · **14** the enlarge surface only · **999 (pill)** status pips and filter chips **only** — a pill button reads as a consumer app · **0** full-bleed figures on phone.

### Identity primitives — chrome only, never inside a reading column

- **Glow edge** — a card's luminous rim. Dark: 1px inset amber at 22% plus a soft amber bloom (28px, −10px spread, 45%). Light: 1px inset amber at 30% plus a real 1px/3px ink shadow at 10% — a bloom on white is mud, so light gets a crisp rim instead.
- **Active glow** — the same rim in **teal**, only on a research card whose last real progress event is under 90 seconds old. Static, not pulsing. Running is a different hue from selected.
- **Facet cut** — **one** clipped corner, top-right, 10px (6px on phone), on research, document and tool cards only. Never four corners. Never on buttons, inputs or chips — there it becomes a costume.
- **Facet line** — a 1px gradient hairline along a card's top edge, amber fading to transparent at 60%. The cheapest "lit edge" and the workhorse of the identity.
- **Edge accent** — a 2px amber hairline at the very top of the viewport on the public page (doubling as the reading-progress rail track), and down the left edge of the operator nav rail.
- **Depth** — three elevations: resting rows/chips, raised cards/dropdowns, top layer for palette and enlarge.
- **Focus ring** — 2px page-colour offset then 2px ring colour. The one accent element permitted inside the column, because focus visibility outranks calm.

### The reading column

Measure: `min(68ch, 42rem)` — about 646px at 19px on desktop, about 350px at a 390px phone (~41 characters). Laid out as a grid with a full-bleed track, never negative margins. Headings show a copy-anchor glyph on hover at desktop only. On phone: hyphenation on, no hover affordances, **no sticky header** — the 3px progress rail at the top edge is the only fixed element. At ≥1440px a quiet table of contents may sit in the left gutter (13px, muted, current section in foreground, no glow) — the gutter is outside the measure, so it is chrome.

### Figures — images are the reason this product is being rebuilt

- A figure spans the measure, 1px paper-rule frame, radius 6, caption beneath in caption size, muted, not italic. Generous air above and below — a chart should read as evidence, not an interruption.
- **Full-bleed** is the one licensed break of the column: wider than the measure on desktop, edge-to-edge with radius 0 on phone. Figures only — never text, tables or code.
- **Every figure enlarges.** On phone, tap anywhere on the image; no visible affordance, because an icon over every chart is litter. On desktop, a small 32px glyph fades in bottom-right on hover. Enlarged: the image on a scrim, contained (never cropped), filling the viewport, pinch-zoomable.
- A failed image never vanishes silently: the figure keeps its caption and shows a 1px paper-rule box reading "(image unavailable)".

## Screens to mock

Label every frame with its route and state. Desktop frames at 1440×900, phone at 390×844. All cockpit screens in dark. The public reader and withdrawn page in **both** light and dark.

### 1 · Public reader — `/d/<token>` (light + dark, desktop + phone)

Top to bottom:
- 2px amber edge hairline (the progress-rail track; the fill tracks scroll position).
- A slim **non-sticky** band, ≤88px desktop / ≤64px phone, closed by a 1px rule, three lines of type maximum: a 20px **monochrome** facet glyph (foreground colour, not amber, not glowing, not a link) · the wordmark "holocron" at 13px, letter-spaced, muted · a category badge · the publisher — **a human name**, in paper-ink · an absolute date, "28 August 2026" · reading time and length, "18 min · 4,100 words".
- Title, lead paragraph, body in the measure. Show: an h2 with the hover anchor glyph, two figures with captions, one full-bleed figure, a table scrolling inside itself, a blockquote with a 3px rule bar and muted text (no tint, no italic), inline code, underlined teal links, an h3 and an ordered list.
- Footer: one quiet line, "holocron — a personal research archive", with one link.

States: **document** · **withdrawn** — same visual language, calm: the mark, one sentence "This document is no longer shared.", the footer line; no title, no date, no sign-in, nothing implying an account · **temporarily unavailable** — one sentence and a retry link.

This page must never show a spinner, skeleton, cookie banner, navigation, share buttons, comments, read counts, avatar, theme toggle, or any call to action.

### 2 · Unfurl card — 1200×630

Dark in both themes (it renders inside someone else's chat client). Background field, a 4px amber bar across the top, 64px padding. **With a hero figure:** 58/42 split — title block left; the document's first image right, **contained, never cropped**, with a facet-line frame and one facet-cut corner. **Without a figure:** title spans full width; a large facet glyph at 8% opacity bottom-right. Title 56px / 1.15 / weight 650, clamped to three lines. Bottom-left: mark, "holocron", publisher name, date, at 24px muted. This card is the one surface where the holocron treatment is unrestrained. Mock both variants, plus the withdrawn variant (mark + "This document is no longer shared", no title, no hero).

### 3 · Sign-in — `/sign-in`

Email and password only. No sign-up link, no "forgot password", no social buttons — exactly one person will ever sign in. States: form · submitting · invalid credentials · auth backend unreachable.

### 4 · Operator shell

Left nav rail with the amber edge accent down its left edge, collapsible to icons. Two destinations — Chats, Library — with the conversation list under Chats. A ⌘K hint. States: **shell** · **device unreachable** — a single banner, "your holocron is asleep", with an inline retry; the rail, search and filter chips stay fully rendered, only data panels degrade. The whole page never becomes an error screen.

### 5 · Chats — `/chats/<id>`

Conversation list left, thread centre, composer at the bottom. States to mock:
- **Empty** (first run) — an Empty composition, no spinner.
- **Idle thread** with a completed exchange.
- **Streaming turn** — a blinking 2px block cursor is the only persistent motion anywhere in the product.
- **Tool calls in flight and complete** — each call is **one collapsed line**: "searched holocron · 12 results" in 13px muted with a chevron. A failed call is visibly marked on the collapsed line in destructive colour **without expanding**. Expanded: input and output in mono. Never auto-expanded.
- **Run dispatched** — a research card in its filling state: teal active rim (static), a single facet-line sweep, progress driven by real counters ("round 2 of 5 · 7 of 12 sub-questions · 4 findings verified"), a **Cancel** on the card.
- **Run stalled** — "no signal for 2 min": dimmed rim, warning label, elapsed time. The card must be able to look *different* from a live run.
- **Run finished** — the card shows the document it produced with a link into the Library.
- **Document card** — rendered from the record; a given record appears exactly once in a transcript.
- **Interrupted turn** — the message is explicitly marked interrupted, shows what survived, and offers one-action "Ask again". Never a truncated answer that reads as finished.
- **Cancelled** and **device unreachable**.
- **A long answer** (>500 words) — the text inside the message frame adopts document typography; nothing decorative inside the measure.

Composer: 16px input; the submit button flips to **Stop** while streaming. Typing "/" opens an inline popover listing `/research` `/deep-research` `/search` `/browse` `/stats` `/help`, each with a one-line description, with an argument mode ("/deep-research <topic>").

**Two cancels, two controls, never conflated:** the composer's Stop ends the turn; the research card's Cancel kills the device job. Different labels, different places. Show both.

### 6 · ⌘K command palette

Over a scrim at top-layer depth, with a visible title. The same command list as the "/" popover plus navigation and recent conversations. Reachable from Library as well as Chats.

### 7 · Library — `/library`

A search field with a leading icon and a trailing clear button. Filter chips (multi-select, pill radius) for category, research type, status, and **shared / unshared**. Result rows: title, the matching snippet with a paper-mark highlight, a kind badge (research output · transcript · digest), a **share-state pip** always visible on the row, updated date, and an overflow menu (open · copy link · unshare). The row frame may glow; the snippet inside it is calm type.

States: **results** · **empty archive** · **no matches** (with clear-filters) · **device asleep** (rail and chips stay; the results panel says so with retry) · **re-query** (a static muted skeleton, no pulse). Also mock the **"Shared" filter active** — this is the audit view: everything currently public, in one scan.

### 8 · Library document — `/library/<id>`

**The same reading column as the public page, pixel for pixel** — same measure, type, figure treatment. The operator previews what a stranger will see by opening the real public URL, so nothing about the column may differ. Additions: the provenance band gains a **ShareControl**; figure enlarge is a dialog.

ShareControl: a switch labelled **Public** with a description beneath it — "Anyone with the link can read this. Turning it off stops the link within 60 seconds." — the URL `docs.holocrnlib.com/d/<token>`, a **Copy** action, and a link "Open the recipient's page ↗". After copy, a toast "Link copied". After unshare, a toast that states the 60-second bound as a fact.

States: **document** · **selection active** — the operator has selected a passage and exactly **one** quiet control, "Ask about this", appears at the selection, sitting outside the measure; nothing else appears on hover · **not found** · **device asleep**.

### 9 · The Empty family

One composition, five uses, so mock them as a set: device unreachable · empty archive · no matches · empty conversation · withdrawn document.

## Motion — one sheet describing each

- **Research card:** a single 400ms facet-line sweep across the top edge, and one discrete step of the progress arc, fired **only when a real progress event arrives**. Nothing loops. After 90s without an event the card transitions to its static stalled state. An animation that would look the same on a dead run is a defect.
- **Streaming cursor:** 1.06s opacity blink. Must not render once the stream is closed, cancelled or interrupted.
- **Tool row:** 140ms expand/collapse on click. Never animates on arrival.
- **Progress rail (public page):** fill tracks scroll exactly, no easing.
- **Share pip:** 160ms colour cross-fade and one 1.0→1.15→1.0 pulse when the share mutation settles — the motion is the confirmation.
- **Enlarge:** 120ms fade and 98→100% scale on open; instant close.
- **The public page body and every reading column: zero motion.** No entrance animation, no reveal on scroll, no fade-in on images.
- Show reduced-motion variants: cursor becomes a solid glyph; the research card conveys state through colour and the step-count text alone.

## Do not

- No plan-proposal, confirmation, or "approve tool" UI anywhere in chat. The agent answers and executes.
- No preview mode for sharing — the preview *is* a link to the real public URL.
- No spinner or skeleton on the public page. No sticky header on phone. No avatar. No theme toggle, navigation, share buttons, comments or read counter on the public page.
- No glow, shadow, gradient, accent-coloured text, or animation inside a reading column.
- No pill buttons. No four clipped corners — one. No vivid amber text on white.
- No progress element that cannot show a stalled state.
- Do not let the cockpit's dark identity become the public page's default — the public page follows the OS.
- Do not make the operator's document column differ from the public column in any way.

## Decisions these mocks should help make

Show a variant where useful; state a recommendation.

1. **The publisher string in the public band** — a human name (recommended), a brand, or "holocron"? The stranger's question is whether a *person* is accountable.
2. **How far the facet cut spreads** — cards only (recommended). Mock one frame with it on chips and buttons so it can be rejected on sight.
3. **Does the cockpit get a light mode?** Recommended: dark-locked; light exists only on the public page.
4. **The withdrawn page** — mark plus one sentence plus footer (recommended), or also show when it was withdrawn?
5. **The chrome typeface** — one variable sans (recommended) versus the system stack everywhere. Show the shell in both.

## Deliverables

Desktop 1440×900 and phone 390×844 for every screen; dark for all cockpit screens; light and dark for the public reader and withdrawn page; every named state above; the unfurl card in three variants; one token sheet showing the colour, type, radius and identity primitives with their values; one motion sheet. Label each frame with route and state.
