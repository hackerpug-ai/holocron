---
stability: CONSTITUTION
last_validated: 2026-08-29
prd_version: 1.0.1
---

# UI Infrastructure

## The governing rule

**Identity lives in the chrome. Calm lives in the column.**

This is a *measure* boundary, not a page boundary, and it cuts through single components: a Library
result is a chromed frame containing calm type — the frame may glow, the snippet inside it may not.

## Open Code, not packages

shadcn/ui and AI Elements are **not importable packages**. Their CLIs copy source into the repo and
you edit the copies; AI Elements is a shadcn *registry*, not a second design system. The holocron
identity is implemented **by editing those copies** — there is no upstream to fight.

Every CLI invocation carries `cwd=packages/web`. A root-level `init` writes a `components.json` the
thin workspace root has no business owning; a run from `packages/mobile` copies Tailwind-v4 source
onto the Tailwind-v3 React Native component tree.

## Colour tokens

Carried forward from the identity that already ships in `global.css` `.dark:root`, labelled
*"Crystalline Archive theme — Holocron knowledge repository aesthetic"*. Light mode is specified
here for the first time; it was untouched shadcn defaults, and it is the theme the highest-volume
reader receives.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--background` | App field and public page surface. In dark this is also the reading surface - the column is a hole in the dark, not a ra | `#FFFFFF` | `#0A0E14` |
| `--foreground` | Chrome text: nav, headers, labels, card titles. | `#14171C` | `#E8E4DE` |
| `--card` | Raised chrome plane: research cards, conversation rows, library rows, tool rows. | `#F9F8F6` | `#111820` |
| `--card-foreground` | Text on a raised chrome plane. | `#14171C` | `#E8E4DE` |
| `--popover` | Command palette, dropdowns, the figure-enlarge surface. | `#FFFFFF` | `#151C26` |
| `--muted` | Quiet chrome fill: chips, badges, code chrome, disabled surfaces. | `#F1EFEB` | `#1E2A3B` |
| `--muted-foreground` | Secondary chrome text: timestamps, result counts, tool-row summaries. 6.22:1 light / 8.48:1 dark. | `#5A6170` | `#9FADC0` |
| `--border` | Decorative hairlines between chrome regions. Not required to hit 3:1; never used as the boundary of a focusable control. | `#E3E0DA` | `#1E2A3B` |
| `--border-strong` | Boundary of any focusable or state-bearing control (inputs, toggles, share pips, progress track). 4.19:1 light / 3.53:1  | `#767C88` | `#556B85` |
| `--primary` | The amber. Identity accent for chrome text/icons and active state. Dark keeps the vivid #F5A623 (9.54:1); light must dar | `#8A4B00` | `#F5A623` |
| `--primary-surface` | Filled amber surface (primary button, active nav pip). Vivid in both themes; the foreground flips. | `#F5A623` | `#F5A623` |
| `--primary-surface-foreground` | Ink on a filled amber surface. 8.86:1 light, 9.6:1 dark. | `#14171C` | `#0A0E14` |
| `--accent` | The teal. Secondary identity accent: links in chrome, progress fills, 'running' state. Light darkens to 7.50:1. | `#0B5F5A` | `#4FD1C5` |
| `--ring` | Focus ring colour. Amber in dark (9.54:1 on field), deep teal in light (7.50:1 on white). | `#0B5F5A` | `#F5A623` |
| `--destructive` | Cancel, revoke, tool failure, interrupted turn. Dark lightened from the RN #EF4444 (5.14:1) to 6.99:1 so it passes at bo | `#B42318` | `#F87171` |
| `--success` | Run completed, copy succeeded, share live. 6.62:1 light / 10.06:1 dark. | `#116A45` | `#34D399` |
| `--warning` | Device unreachable, no-signal-in-2m card state, propagation window notice. 5.93:1 light / 11.59:1 dark. | `#8A5A00` | `#FBBF24` |
| `--paper` | READING TOKEN. The reading-column surface. In dark it equals --background deliberately: giving the column its own plane  | `#FFFFFF` | `#0A0E14` |
| `--paper-ink` | READING TOKEN. Long-form body text. 17.96:1 light, 16.11:1 dark - far above the 4.5 floor because the volume reader is o | `#14171C` | `#EDEAE4` |
| `--paper-ink-muted` | READING TOKEN. Figure captions, footnotes, the byline/date line, table sub-labels. 6.22:1 light / 8.66:1 dark. | `#5A6170` | `#A6AEBC` |
| `--paper-rule` | READING TOKEN. Hairlines that belong to content, not chrome: hr, blockquote bar, table cell borders, figure frame. Decor | `#E3E0DA` | `#212C3C` |
| `--paper-link` | READING TOKEN. Body links and citation links. Teal-derived but NOT --accent: it is allowlisted inside the measure precis | `#0B5F5A` | `#7FDCD3` |
| `--paper-code-bg` | READING TOKEN. Inline code and pre fill. ~1.12 against --paper: a whisper, deliberately. | `#F4F2EE` | `#141C26` |
| `--paper-code-ink` | READING TOKEN. Code text = var(--paper-ink). No pink, no amber: the mono face plus the tinted fill already carry the dis | `#14171C` | `#EDEAE4` |
| `--paper-mark` | READING TOKEN. Search-snippet match highlight (the one place a highlight is legitimate inside calm type). Ink stays --pa | `#FDF0CE` | `#3A3213` |

## Type scale

| Token | Size | Line height | Usage |
|---|---|---|---|
| `--font-reading` | system stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ' | n/a | The reading column and the ENTIRE public tree. Zero webfont requests on /d/[token] - no FOUT, no font-display negotiation, no refl |
| `--font-chrome` | one variable face, weight axis 400-650, Latin subset, font-display: bl | n/a | Nav rail, wordmark, card titles, palette, tool rows, OG card. The typeface split is itself an instance of the chrome/column rule:  |
| `--font-mono` | ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monos | n/a | Code, tool call arguments, share tokens, IDs. |
| `--text-title` | clamp(1.75rem, 1.40rem + 1.60vw, 2.375rem) [28px phone -> 38px desktop | 1.15 | Document h1 on both /d/[token] and /library/[id]. text-wrap: balance. Weight 700, letter-spacing -0.02em. |
| `--text-h2` | clamp(1.375rem, 1.24rem + 0.62vw, 1.625rem) [22px -> 26px] | 1.25 | Section headings in a 4,000-word document. Weight 650. Flow: 2.2em above, 0.6em below. Anchor target. |
| `--text-h3` | clamp(1.1875rem, 1.12rem + 0.34vw, 1.3125rem) [19px -> 21px] | 1.30 | Sub-section. Weight 600. Flow: 1.7em above, 0.5em below. |
| `--text-h4` | clamp(1.0625rem, 1.03rem + 0.17vw, 1.125rem) [17px -> 18px] | 1.35 | Deepest heading level that stays a heading. h5/h6 render at --text-body weight 650 with letter-spacing 0.02em rather than growing  |
| `--text-lead` | clamp(1.125rem, 1.06rem + 0.31vw, 1.3125rem) [18px -> 21px] | 1.60 | Standfirst: the document's first paragraph on the public page. Colour --paper-ink (not muted). This is the paragraph that decides  |
| `--text-body` | clamp(1.0625rem, 0.98rem + 0.42vw, 1.1875rem) [17px phone -> 19px desk | 1.70 | Long-form body. One value for both surfaces and both viewports - a 4,000-word document at 19px/1.70 in a 68ch measure is ~365 line |
| `--text-caption` | clamp(0.875rem, 0.86rem + 0.08vw, 0.9375rem) [14px -> 15px] | 1.50 | figcaption, footnotes, table sub-labels, the header's byline/date/reading-time line. Never italic - italic at 14px on a phone in d |
| `--text-code` | 0.875em of parent (inline) / 0.875rem (block) | 1.60 | em-relative inline so code never towers over its sentence; rem-fixed in blocks so wide code doesn't force a wider measure. |
| `--text-ui-sm` | 0.8125rem [13px] | 1.40 | CHROME ONLY. Chips, badges, tool-row summaries, timestamps, kbd hints. |
| `--text-ui` | 0.875rem [14px] | 1.45 | CHROME ONLY. Nav labels, buttons, inputs, library row titles, palette items. |
| `--text-ui-lg` | 1rem [16px] | 1.45 | CHROME ONLY. Chat composer input (16px minimum prevents iOS zoom-on-focus), card titles, section headers in the shell. |

## Spacing and radius

| Token | Value |
|---|---|
| `--space-1..9` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96px plus --space-px 1px |
| `--gutter` | clamp(1.25rem, 5vw, 2rem) [20px phone -> 32px desktop]. The single page-edge inset. The reading grid's outer tracks are minmax(var(--gutter), 1fr). |
| `--flow-p` | 0.95em. Paragraph gap inside the measure. em-based so vertical rhythm scales with the fluid type instead of drifting at phone width. |
| `--flow-figure` | clamp(2rem, 1.5rem + 2vw, 2.75rem). Space above and below every figure - the pause that makes a chart read as evidence rather than an interruption. |
| `--rail-h` | 3px. Reading-progress rail thickness at the viewport top edge. |
| `--tap-min` | 44px. Minimum hit area for every control on the public page. |
| `--radius-sm` | 4px - chips, badges, inline code, kbd |
| `--radius-md` | 6px - buttons, inputs, figures, tool rows. Also --radius (the shadcn contract default), replacing the RN app's 0.5rem. |
| `--radius-lg` | 10px - cards, popovers, the command palette |
| `--radius-xl` | 14px - the enlarge popover surface only |
| `--radius-pill` | 999px - status pips and filter chips ONLY. Crystalline geometry means tight radii; a pill button reads as a consumer app and is banned outside these t |
| `--radius-bleed-phone` | 0px - full-bleed figures below 640px touch both screen edges |

## Identity primitives — chrome only

| Token | Role | Forbidden inside the measure |
|---|---|---|
| `--glow-edge` | The holocron edge. A card's luminous rim. Reinterpreted per theme rather than dimmed: a bloom on white is mud, so light mode becomes a crisp accent ri | **yes** |
| `--glow-active` | The live-run rim. Applied only to a research card whose last reported run-state event is under 90s old. Teal, not amber, so 'running' is a different h | **yes** |
| `--facet-cut` | Crystalline geometry, rationed. A single clipped corner (top-right) on cards via clip-path, never four. Applied to research/document/tool cards only - | **yes** |
| `--facet-line` | The 1px gradient hairline along a card's top edge, fading out at 60%. The cheapest possible 'lit edge' and the workhorse of the identity. | **yes** |
| `--depth-1..3` | Resting / raised / top-layer elevation. --depth-3 is permitted on the enlarge popover even though its trigger sits inside the measure, because the pop | **yes** |
| `--edge-accent` | The page edge. A 2px hairline at the top of the viewport on the public page (doubling as the progress-rail track fill) and down the left edge of the o | **yes** |
| `--scrim` | Backdrop behind the enlarge popover and the command palette. | **yes** |
| `--focus-ring` | CARVE-OUT: permitted inside the measure. Body links, heading anchors and figure-enlarge buttons are focusable and must be visible. Focus visibility ou | no — documented carve-out |

## The reading column

**Measure.** --measure: min(68ch, 42rem). Laid out as a CSS grid, not a max-width block: grid-template-columns: [full-start] minmax(var(--gutter),1fr) [measure-start] min(var(--measure), 100% - 2*var(--gutter)) [measure-end] minmax(var(--gutter),1fr) [full-end]. Every child defaults to grid-column: measure; only a licensed full-bleed figure takes grid-column: full. No negative margins anywhere - negative-margin breakouts are the standard cause of horizontal scroll on a 390px phone, a named failure mode in the cold-reader journey.

**Line height.** 1.70 for --text-body, unchanged across viewports. One number, both surfaces, both widths - because 'preview is the real public URL' is only true if there is nothing left that can differ.

**Desktop.** >=1024px: body 19px/1.70, title 38px/1.15, gutter 32px, measure ~646px (~72-78 characters). Heading anchors reveal on hover (pointer: fine only). At >=1440px a margin table of contents is permitted in the left gutter track - the gutter is outside the measure, so it is chrome and may carry identity, but it stays quiet.

**Phone.** <=480px: body 17px/1.70, title 28px/1.20, gutter 20px, content ~350px at a 390px viewport (~41 characters). hyphens: auto enabled only at this breakpoint. Full-bleed figures go edge-to-edge with radius 0. No hover affordances exist at all. The 3px progress rail is the only fixed element; the header band does NOT stick, because on the highest-volume viewport a sticky band is a permanent tax on the reading area.

### Rules

- No chrome inside the measure. Banned on every element in the .measure subtree: box-shadow, text-shadow, filter: drop-shadow, backdrop-filter, gradient backgrounds, animation, transition (except color/text-decoration), --facet-cut, and any var(--glow-*|--depth-*|--edge-*|--facet-*).
- Exactly two accent-derived tokens are allowlisted inside the measure: --paper-link and --focus-ring. --primary and --accent themselves are banned.
- Both surfaces render through the one DocumentBody module (FR-NEXT-07), whose only prop besides markdown is assetBase. It accepts no className, no style, no children, no variant.
- text-wrap: pretty on paragraphs and captions; text-wrap: balance on headings and the title.
- overflow-wrap: anywhere on links and inline code so a bare URL or a share-<uuid> token cannot force horizontal scroll.
- scroll-margin-top: calc(var(--rail-h) + var(--space-6)) on every heading, so an incoming anchor link does not land under the progress rail.
- Tables get their own overflow-x: auto wrapper with tabular-nums. A wide table scrolls inside itself; it never widens the measure.
- Blockquotes use a 3px --paper-rule left bar and --paper-ink-muted text - no tint fill, no card, no italic.
- Reading time and word count are computed at render and shown once in the header ('18 min - 4,100 words'). This is the answer to 'how long is this before I commit', which both the recipient and the cold reader ask.
- The operator's /library/[documentId] renders the identical measure, type scale and figure treatment; the only additions are a text-selection listener island and scroll-position restore, neither rendering inside the measure until the operator selects text.

## Figures

Images are the reason this rewrite exists, so figures get real design rather than a working renderer.

- **Default.** <figure> spanning the full measure, <img> at width:100%, height:auto, --radius-md, a 1px --paper-rule frame, and --flow-figure of space above and below. The frame is a content boundary, not identity. loading=lazy + decoding=async on every figure except the first, which gets loading=eager + fetchpriority=high because it is also the OG hero.
- **Full-bleed.** The one licensed break of the column, and it must be AUTHORED, not inferred. Trigger: the markdown title attribute contains the marker #wide, which a ~6-line rehype rule strips from the rendered caption. A dimension heuristic was REJECTED: it would make the operator's preview unpredictable, and unpredictable preview is the exact defect class this rewrite exists to close. Below 640px it collapses to true edge-to-edge. Figures only: never text, never a table, never a code block.
- **Caption.** Rendered as <figcaption> below the image in --text-caption / --paper-ink-muted / not italic. Source resolves in three tiers so alt text is never announced twice: (1) ![alt](src "title") -> caption = title, img alt = alt; (2) ![alt](src) -> caption = alt, img alt = ""; (3) ![](src) -> no caption, alt="", and the golden-file test counts these and reports them, because an uncaptioned undescribed chart is the accessibility version of the bug this rewrite is fixing.
- **Enlarge.** Every figure is enlargeable - no heuristic about which ones deserve it, because a heuristic means some charts silently are not tappable. The <img> is wrapped in a <button popovertarget> with accessible name 'Enlarge: {caption}'; the target is a popover="auto" element over --scrim. Light-dismiss, Esc and backdrop click all come free from the platform. ZERO client JavaScript, which keeps FR-NEXT-08 and the no-client-JS public tree intact. Where popover is unsupported the same element is a plain anchor to the image - the fallback still works and still needs no JS.
- **Phone.** Figures fill the measure minus gutter (~350px at 390px); full-bleed figures fill the viewport. Tap anywhere on the image to enlarge - no visible enlarge affordance at (pointer: coarse), because a persistent icon over every chart is litter inside the measure.

- Plain <img> pointing at /d/<token>/assets/<id> or the remote https URL. Never next/image (FR-NEXT-22).
- A figure is the ONE element allowed to carry a visible border inside the measure, and only in --paper-rule.
- figure > img { aspect-ratio: var(--figure-ratio, auto) } - set from publish-time asset metadata when available. Today that metadata does not exist, so late-loading figures shift the text below them. This is a real, un-hidden CLS gap; see open_questions.
- A remote image that fails to load must not silently vanish: the <figure> retains its caption and renders a 1px --paper-rule box with '(image unavailable)'. Silent absence is precisely the failure mode that survived for a year.
- The document's first figure is the OG hero. The same rewrite pass that emits the img src emits the og:image URL, so the unfurl can never point at an asset the page cannot serve.

## Motion

| Surface | Animates | Trigger | Never | Reduced motion |
|---|---|---|---|---|
| Research / deep-research card (the licensed showcase) | A single 400ms --facet-line sweep across the card's top edge, plus one discrete advance of | Arrival of a reported run-state event from the device. One event = one | Never a timer-driven, looping, or indefinite animation. An animation that a dead run could still produce is pr | No sweep, no arc rotation. State change conveyed entirely by discrete colour cha |
| Streaming assistant message | The streaming cursor: a 1.06s opacity blink on a 2px block glyph. | Token stream open. | Must not render when the stream is closed, cancelled or interrupted - a blinking cursor on a dead stream is th | Solid, non-blinking block glyph. |
| Tool row (collapsed details/summary) | 140ms ease-out height + opacity on expand/collapse. | Operator click or Enter on the summary. | Never auto-expands, never animates on arrival. | Instant. |
| Reading-progress rail (page top edge, chrome) | Fill width, driven by CSS scroll-driven animation (animation-timeline: scroll()). | The reader's own scroll position. No JS, no scroll listener (FR-NEXT-2 | Never a smoothed/eased catch-up - it must track scroll exactly, or it is decoration. Never rendered inside the | DELIBERATE CARVE-OUT: retained. It is direct manipulation - a position indicator |
| Library row share-state pip | 160ms cross-fade of the pip colour and a single 1.0 -> 1.15 -> 1.0 scale pulse. | The share/unshare mutation SETTLING (not the optimistic write). The mo | Never a toast that shifts layout. The revocation propagation bound is stated in text next to the pip, not anim | Colour cross-fade only. |
| Figure-enlarge popover | 120ms opacity plus 98% -> 100% scale on open via @starting-style. | Click/tap on the figure. | No animation on close. No zoom-from-origin transition - it needs measurement and therefore JS. | Instant. |
| The public page body and the reading column | Nothing. Zero. | n/a | No entrance animation, no reveal-on-scroll, no parallax, no fade-in on images, no page transition, no skeleton | n/a - already zero. |
| Route navigation, focus rings, Library results panel | Route navigation: nothing. Focus rings: nothing, ever. Results panel: a --muted pulse skel | Filter/search change. | No skeleton anywhere under app/(public)/. | Static --muted block, no pulse. |

## How the rule is ENFORCED (not merely stated)

### 1. Identity tokens do not resolve inside the reading measure.

**Mechanism.** Runtime token scoping, ~8 lines of CSS. .measure { --glow-edge: initial; --glow-active: initial; --facet-line: initial; --facet-cut: 0px; --depth-1..3: initial; --edge-accent: initial; --scrim: initial; }. A var() reference to an 'initial' custom property yields the guaranteed-invalid value, so box-shadow: var(--glow-edge) computes to unset and no glow renders. This is enforcement, not convention: the token literally cannot resolve in that subtree, including inside third-party or shadcn-copied components never reviewed for this rule.

**Fails how.** Silently correct at runtime - the glow simply does not appear. Paired with the computed-style e2e test so a developer finds out at CI rather than by squinting.

### 2. Identity tokens may never be referenced with a var() fallback argument; the measure subtree may not declare chrome properties at all.

**Mechanism.** Stylelint. (a) regex ban on /var\(\s*--(glow|depth|facet|edge|scrim)[^,)]*,/ repo-wide - this keeps the scoping above from being trivially bypassed. (b) declaration-property-value-disallowed-list scoped to .measure selectors and components/document/**. (c) color-no-hex plus a repo grep for hex outside tokens.css. (d) ban outline:none without a box-shadow replacement.

**Fails how.** pnpm lint:css exits non-zero; CI red; pre-commit hook blocks.

### 3. No identity utility classes in document components.

**Mechanism.** A ~40-line custom ESLint rule holocron/no-identity-in-measure applied to components/document/**. Bans className tokens matching /^(shadow-|drop-shadow|backdrop-|bg-gradient-|animate-(?!none)|ring-(?!offset-0))/ and text-primary/bg-primary/text-accent/etc. Allowlist: text-paper-link, focus-visible:ring-*, border-paper-rule.

**Fails how.** pnpm lint exits non-zero.

### 4. A caller cannot style into the measure, because it cannot pass anything that styles.

**Mechanism.** The container contract, and the strongest of the five because it makes the violation unrepresentable rather than detectable. DocumentBody's props are exactly { markdown: string; assetBase: string } - no index signature, no className, no style, no children, no variant. Backed by eslint react/forbid-component-props.

**Fails how.** TypeScript compile error for a stray prop; ESLint error for className/style.

### 5. Nothing inside the rendered measure has a shadow, gradient, animation, or accent colour - verified against the real DOM, in both themes, on both surfaces.

**Mechanism.** THE LOAD-BEARING ONE. Playwright loads a fixture document at /d/{token} AND /library/{id}, light and dark, 390px and 1440px; queries every element inside .measure; asserts computed box-shadow/text-shadow/background-image/animation-name are 'none'; asserts no computed color equals resolved --primary or --accent, with --paper-link and focus ring excluded. Catches what source-level rules cannot: a violation arriving through a vendored shadcn copy, an AI-Elements component, a parent layout, or a browser default.

**Fails how.** e2e red with the offending selector and property named.

### 6. Operator and stranger see byte-identical reading columns.

**Mechanism.** Same Playwright run screenshots the .measure element only on both routes at 1440px and 390px and pixel-diffs them; any non-zero diff fails. Module sharing proves the same code runs; this proves the same pixels come out, and catches drift module sharing cannot - such as an (app) layout setting a different root font-size.

**Fails how.** e2e red with the diff image as a CI artifact.

### 7. Light and dark token blocks never drift, and the public tree ships no client JS.

**Mechanism.** (a) pure-function test parses tokens.css and asserts the .dark block and the @media (prefers-color-scheme: dark) block declare an identical property set with identical values. (b) CI grep asserts 'use client' appears under app/(public)/ in exactly one path, error.tsx. (c) pure-function test asserts every declared token pair meets its stated contrast ratio. UNIT_TEST_JUSTIFIED: (a) and (c) are CSS parsing and colour maths with zero I/O.

**Fails how.** pnpm test exits non-zero / CI grep fails with the offending path.

## Registry items

| Registry | Item | Serves | Notes |
|---|---|---|---|
| `shadcn` | `sidebar` | UC-SHELL-01, UC-CHAT-03, UC-LIB-01 | Two destinations + conversation list. SidebarProvider wraps the (app) layout; collapsible="icon". Auto-resolves sheet, tooltip, separator, skeleton, button, input as registryDependencies - d |
| `shadcn` | `command` | UC-CHAT-02, UC-LIB-01 | CommandDialog mounted in the (app) layout, not in the chat page, so Cmd-K is reachable from the Library too. Keep the default DialogTitle (a stripped title is a known a11y regression). The s |
| `shadcn` | `item` | UC-LIB-01, UC-LIB-02, UC-SHARE-02 | Library rows are Item/ItemGroup, not Table and not Field - the shadcn rule is Field only when a form control is inside. ItemTitle + ItemDescription carry the snippet; ItemActions carries sha |
| `shadcn` | `toggle-group` | UC-LIB-02, UC-SHARE-02 | Filter chips over category / researchType / status / shared. Use ToggleGroup (multiple) for option sets - Badge is display-only and cannot carry pressed state. Bound to URL searchParams so a |
| `shadcn` | `input-group` | UC-LIB-01 | Search field with a leading search icon and a trailing clear button inside the control. InputGroupAddon must sit AFTER InputGroupInput in the DOM and be positioned with align="inline-start", |
| `shadcn` | `badge` | UC-SHARE-02, UC-LIB-01, UC-CHAT-04 | Persistent share state on every Library row (design lens: share state is scannable, never behind a menu), document kind on results, run status on research cards. |
| `shadcn` | `card` | UC-CHAT-03, UC-CHAT-04 | Shell for DocumentCard and ResearchCard. Both render from trpc documents.byId / research.byId keyed by record id - never from stream contents. Preferred over the AI Elements Task item becaus |
| `shadcn` | `progress` | UC-CHAT-04 | Driven by research.byId progress { round, maxRounds, subQuestionsClosed, subQuestionsTotal, findingsVerified } at the server-directed nextPollAfterMs. Never a timer: the design lens is expli |
| `shadcn` | `empty` | UC-SHELL-02, UC-LIB-01, UC-LIB-02, UC-CHAT-01, UC-READ-05 | Widest reuse in the plan - five UCs, one component. Device-unreachable (with a retry Button in EmptyContent), empty archive, no matches, empty conversation, and the withdrawn-document page.  |
| `shadcn` | `toast` | UC-SHARE-01, UC-SHARE-03 | NOT 'sonner' - that slug now redirects to toast, and the call form is the Base UI manager toast.add({ title, description }) / toast.promise(...), not toast(...). Carries 'Link copied' and th |
| `shadcn` | `switch` | UC-SHARE-01 | The publish toggle. Paired with field so the 60s revocation SLA is stated as FieldDescription next to the control rather than discovered after the fact. |
| `shadcn` | `field` | UC-SHARE-01 | Field orientation="horizontal" for the share toggle row; FieldDescription carries the propagation bound. Only form-control surface in the whole plan. |
| `shadcn` | `dialog` | UC-LIB-03 | Figure lightbox in the AUTHED reader only. The public reader cannot use it (zero client JS) - there the same Figure component degrades to a plain anchor to the full asset URL. One component, |
| `shadcn` | `dropdown-menu` | UC-LIB-02, UC-SHARE-02 | Library row overflow: open, copy link, unshare. Share STATE never moves in here - only actions. |
| `shadcn` | `spinner` | UC-SHELL-02, UC-CHAT-01 | The replacement for the deprecated AI Elements Loader. Authed surfaces only. |
| `shadcn` | `skeleton` | UC-LIB-01 | Authed lists only. A Skeleton anywhere under app/(public)/** is a design bug by the staged design finding - the stranger must never see a spinner. |
| `shadcn` | `tooltip` | UC-CHAT-01, UC-READ-04 | TooltipProvider in the (app) layout. Heading-anchor copy affordances at desktop widths. |
| `ai-elements` | `conversation` | UC-CHAT-01, UC-CHAT-03, UC-CHAT-05 | Conversation + ConversationContent + ConversationScrollButton + ConversationEmptyState. Stick-to-bottom scroller. ConversationScrollButton renders only when not at bottom - do not force it.  |
| `ai-elements` | `message` | UC-CHAT-01, UC-CHAT-03, UC-CHAT-05 | Message takes from=, NOT role= - the highest-frequency false friend in this registry. Brings MessageResponse (the Streamdown markdown renderer, children must be a STRING) and MessageActions/ |
| `ai-elements` | `prompt-input` | UC-CHAT-01, UC-CHAT-02, UC-LIB-04 | PromptInputSubmit takes status and flips to a stop icon on 'streaming' - that is the turn-cancel affordance, wired to AbortController on the tRPC stream. Enter submits, Shift+Enter newlines, |
| `ai-elements` | `tool` | UC-CHAT-01, UC-CHAT-03 | The reason the wire union names its tool fields the way it does: ToolHeader state accepts exactly input-streaming | input-available | output-available | output-error, 1:1 with the ChatStream |
| `ai-elements` | `reasoning` | UC-CHAT-01 | Driven by reasoning-delta. isStreaming auto-opens then auto-closes; pass defaultOpen only for a completed turn you want left open. Requires the BFF to set toUIMessageStreamResponse({ sendRea |
| `ai-elements` | `sources` | UC-CHAT-01 | CONDITIONAL - install only after verifying a search tool's output shape. ChatStreamPart has NO source-* variant, so Sources cannot be stream-driven as specified; it would have to be derived  |

## Component reuse

| Component | Reused by | Status |
|---|---|---|
| **DocumentBody (typeset markdown renderer + Figure + heading anchors)** | UC-READ-01, UC-READ-02, UC-READ-04, UC-LIB-03, UC-SHARE-01 | new |
| **Figure (caption slot, measure-constrained, full-bleed break, enlarge)** | UC-READ-01, UC-LIB-03 | new |
| **Empty (shadcn)** | UC-SHELL-02, UC-LIB-01, UC-LIB-02, UC-CHAT-01, UC-READ-05 | copied |
| **RecordCard -> DocumentCard / ResearchCard** | UC-CHAT-03, UC-CHAT-04, UC-LIB-01 | new |
| **Tool (ai-elements)** | UC-CHAT-01, UC-CHAT-03 | edited |
| **Command palette (shadcn command)** | UC-CHAT-02, UC-LIB-01 | edited |
| **ShareControl (switch + field + copy + open-real-URL + toast)** | UC-SHARE-01, UC-SHARE-03 | new |
| **ShareState badge + shared/unshared filter chip** | UC-SHARE-02, UC-LIB-02 | new |
| **AskAboutThis selection affordance** | UC-LIB-04, UC-CHAT-01 | new |
| **ProvenanceHeader (what / who / when)** | UC-READ-02, UC-LIB-03 | new |
| **Conversation / Message / PromptInput (ai-elements)** | UC-CHAT-01, UC-CHAT-02, UC-CHAT-03, UC-CHAT-04, UC-CHAT-05 | copied |
| **OG / unfurl card metadata** | UC-READ-03 | new |

### Reuse notes

**DocumentBody (typeset markdown renderer + Figure + heading anchors)** — The single highest-leverage component in the plan. One module, two mounts, differing only by an assetBase prop (public /d/[token]/assets/[id] vs the authed asset path) and an enlarge mode. UC-SHARE-01's 'preview' is NOT a component - it opens the real public URL in a new tab, which is why this module must be shared rather than mirrored.

**Figure (caption slot, measure-constrained, full-bleed break, enlarge)** — Images are the reason the rewrite exists, so this needs real design and not just a working renderer. Full-bleed is the ONE licensed break of the column. Enlarge is a plain anchor to the asset URL on the public page (zero JS) and a shadcn Dialog in the authed reader.

**Empty (shadcn)** — Five states, one copy. The withdrawn-document page is this component in the same visual language with no sign-in prompt - a designed state, not an error page, and cacheable at 404.

**RecordCard -> DocumentCard / ResearchCard** — shadcn card + progress + badge. Renders from documents.byId / research.byId keyed by record id. A record-ref part supplies PLACEMENT ONLY. The card's contents have no channel on the stream, which is what makes the duplicate-card defect structurally impossible rather than patched.

**Tool (ai-elements)** — Copied then edited for the terse register: collapsed by default, one line, ToolHeader title carries the human summary ('searched holocron - 12 results') while type stays tool-<toolName> so the state badge is correct. Claude Code's voice - factual, no approval gate.

**Command palette (shadcn command)** — One CommandList module, two mounts: Cmd-K CommandDialog in the (app) layout and an inline '/' popover on PromptInput. Edited to add argument mode so /research <topic> submits in a single pass. Invoked from the Library, it routes to /chats carrying the command in router state.

**ShareControl (switch + field + copy + open-real-URL + toast)** — One control does publish, copy and verify. 'Open the recipient's page' is a link to the real public URL - the cheapest guarantee that operator and stranger see identical output, and one less surface that can drift.

**ShareState badge + shared/unshared filter chip** — shadcn badge on the row plus a toggle-group chip. The pairing is what makes the audit journey one click: scan, or filter to exactly what is public.

**AskAboutThis selection affordance** — The Library's ONLY AI affordance - one quiet control at the selection, sitting outside the measure. Carries the passage into PromptInput as the quote field and returns the operator to his reading position.

**ProvenanceHeader (what / who / when)** — On the public page this slim band is the entire identity budget. Same component in the authed reader with an extra slot filled by ShareControl.

**Conversation / Message / PromptInput (ai-elements)** — All five CHAT use cases run through the same three copies. The only edit is the interrupted-turn marker for UC-CHAT-05, added as a MessageContent variant rather than a new component.

**OG / unfurl card metadata** — Genuinely new, no component reuse - Next generateMetadata, not React. Title, first-paragraph description, hero image drawn from the document's first figure. Arguably the first render of every shared document; design it explicitly rather than letting it fall out of defaults.

## Do NOT build

| Item | Why |
|---|---|
| AI Elements Loader | Deprecated in the registry (1.8.2) in favour of the shadcn Spinner. Any copy of it is stale source that will not be maintained upstream. |
| ConversationMessage as the client message type | Deprecated in favour of AI SDK UIMessage (1.9.0). Our reducer already targets UIMessage, which is precisely what lets AI Elements render natively without useChat. |
| Any import of useChat or useCompletion from @ai-sdk/react | tRPC transforms every output (issue #6103), so the raw AI SDK response cannot return through the BFF. The hook does not work here. AI Elements are prop-driven - ToolHeader takes type/state, ToolInput takes input, ToolOutput takes output/errorText - which is the whole reason this cost is bounded. |
| shadcn add sonner | The slug redirects to toast, and the API is the Base UI manager: toast.add({...}) / toast.promise(...), not toast(...). Installing under the old name and calling it the old way produces a component that silently does nothing. |
| AI Elements Confirmation / ConfirmationActions | Product decision 4: the agent answers and executes, with no plan, confirmation, or per-tool approval ladder. An approval component contradicts the settled scope. |
| AI Elements ChainOfThought | Same reason - it is a plan-ladder surface. Reasoning covers the disclosure need and maps to an actual wire variant; ChainOfThought does not. |
| AI Elements Image | It renders AI SDK Experimental_GeneratedImage from generateImage as a data URL. Document figures are markdown images served from the origin asset route. Wrong component for the job and it would pull an unused dependency into the reader. |
| AI Elements Task for the research card | Its shape is a title plus an item/file list; the truth model is round / subQuestion / findings progress fields from research.byId. shadcn card + progress + badge fits the real data, and the card must render from the record, not from anything stream-shaped. |
| MessageBranch / branch selectors, ConversationDownload, Suggestions | Out of MVP. MessageBranch in particular implies re-generation semantics the BFF does not have. |
| A root-level shadcn init (or any CLI run from the repo root or from packages/mobile) | The repo root is a thin workspace orchestrator that owns no product code, so a root init writes config nothing consumes; run from packages/mobile it copies Tailwind-v4 Open Code into the Expo app's Tailwind-v3 RN component tree, colliding with its components.json, global.css and tailwind.config.js. |
| Any import of shadcn/ui or AI Elements as an npm package | Both are Open Code. The CLIs copy source into packages/web/components/{ui,ai-elements}/ and you edit the copies. There is no package to import from, and the holocron identity is implemented by editing those copies - there is no upstream to fight. |
| A preview mode / preview component for share | Preview is a link that opens the real public URL in a new tab. It is the cheapest possible guarantee that operator and stranger see identical output, and one less surface that can drift. |
| A third markdown renderer | Chat uses MessageResponse (Streamdown, ships with the message item); documents use the shared DocumentBody. Adding react-markdown or similar in the Library reader reintroduces exactly the operator/stranger divergence that made every shared document text-only. |
| next-themes, a theme toggle, or any 'use client' file under app/(public)/** other than error.tsx | The public page respects prefers-color-scheme in CSS only and must paint text first off the edge cache. |

## Public-page identity budget

### The band carries

- One slim NON-STICKY band, <=88px desktop / <=64px phone, above the title, closed by a 1px --border rule. Three lines of type total, maximum.
- The holocron mark: a 20px monochrome facet glyph in --foreground. Not --primary, not glowing, not animated, not a link.
- The wordmark 'holocron' at --text-ui-sm, letter-spaced 0.08em, --muted-foreground.
- The publisher identity - a human name, because the stranger's question is 'is a person accountable for this'. --text-caption in --paper-ink, the highest-contrast thing in the band after the title.
- The publication date, absolute, in <time datetime>: '28 August 2026'. Absolute is the fact; the reader does the staleness maths.
- Reading time and word count: '18 min - 4,100 words'. The recipient's 30-second triage input and the cold reader's 'how much am I committing to'.
- The category / research-type badge, carried over from the existing origin page in --muted / --muted-foreground / --radius-sm.
- The page's top edge: a 2px --edge-accent hairline that doubles as the reading-progress rail track. One element, two jobs, both chrome - and the entire remaining identity budget.

### It must not carry

- No sign-in, no account affordance, no 'you could see more if you had an account'. There is no such account.
- No cookie banner, consent modal, app-install interstitial, newsletter capture, or CTA of any kind.
- No navigation, menu, search, or back-to-site link. The mark is not a link. A single quiet footer line satisfies 'what is this site' without competing with the first screen.
- No share buttons, reactions, comments, or read counter. Nothing that turns a document into a post.
- No sticky header. On a 390px phone a persistent band is a permanent tax on the reading area. Only the 3px rail is fixed.
- No author avatar. It costs a request, competes with the hero figure, and a name already answers the accountability question.
- No glow, gradient, --facet-cut or --depth-* in the band. --edge-accent is the only identity token on the page.
- No theme toggle, localStorage read, inline theme script, or client JS for theming (FR-NEXT-13).
- No webfont. --font-reading is the system stack, so first paint is text with no swap and no reflow.
- No spinner, skeleton, Suspense boundary, or loading.tsx (FR-NEXT-08).

**Rationale.** This band is the only surface on which a stranger's provenance triage can happen - there is no second screen, no about page, no nav. So it must answer what / who / when / how-long completely, then get out of the way within one screen. Everything excluded was excluded for one of two reasons: it delays the first line of actual text, or it converts a reader into a bounce. The identity survives as exactly three things - a monochrome mark, a 2px lit page edge, and the same colour language as the cockpit - enough for the operator to recognise his own product and little enough that the document reads as considered work rather than an artifact leaked from someone's tooling.

## The unfurl card

**Composition.** 1200x630, rendered server-side by Next ImageResponse at /d/[token]/opengraph-image, dark in BOTH themes (an unfurl renders inside someone else's chat client and cannot read prefers-color-scheme). --background field; 4px --edge-accent bar across the top; 64px padding. WITH a hero figure - 58/42 split, title block left, the document's first image right at object-fit: CONTAIN with a --facet-line frame and one --facet-cut corner. Contain, never cover: a chart centre-cropped by an unfurl renderer is worse than no image, and cropping is exactly the class of silent degradation this rewrite exists to end. WITHOUT a figure - title block spans full width, large 8%-opacity facet glyph bottom-right. This card is 100% chrome with no reading measure, so it is the one surface where the holocron treatment is unrestricted.

**Title.** Document title at 56px / 1.15 / weight 650 in --foreground, clamped to 3 lines. Metadata <title> and og:title carry the same string untruncated.

**Description.** og:description and meta description: first ~200 characters of markdown-stripped body, trimmed at a sentence boundary, never mid-word. It does NOT appear on the image - Slack and iMessage render it as their own text beside the card, and duplicating it wastes the card's area.

**Image.** og:image = the composed card URL (not the raw asset), 1200x630, twitter:card = summary_large_image, og:type = article, article:published_time, canonical on docs.holocrnlib.com/d/<token> (FR-NEXT-11). The hero source is the first image node found by the same rewrite pass that emits the body's img src, so the card can never point at an asset the page itself cannot serve. Cached immutably keyed on token + updatedAt.

**Rationale.** The unfurl card is the first render of every shared document and, for a forwarded reader, frequently the only one. Handing the raw first asset straight to og:image - the obvious implementation - reproduces the original defect in a new place: a 2400x800 latency chart centre-cropped to 1200x630 by Slack is an unreadable smear that makes the author look careless, which is exactly the reputational damage the rewrite is repairing. Withdrawn documents get a neutral variant - mark plus 'This document is no longer shared', no title, no hero, robots: noindex (FR-NEXT-12) - so a revoked link never leaks its title through a chat client's cached unfurl.

## Accessibility

| Requirement | Target | Verified how |
|---|---|---|
| Long-form body text contrast, both themes. Target set far above the WCAG floor because 4.5:1 is a compliance n | >=12:1. Achieved: light #14171C on #FFFFFF = 17.96:1; dark #EDEAE4 on #0A0E14 = 16.11:1. | Pure-function contrast test over the token-pair table in CI (UNIT_TEST_JUSTIFIED: colour maths, zero I/O), PLUS axe-core in Playwright on both routes, |
| Secondary and caption text contrast. | >=4.5:1 at all sizes, no large-text exemption used anywhere. light 6.22:1, dark 8.66:1 (raised from the RN app's #8B9AAF). | Same token-pair test plus axe-core. |
| Non-text contrast for control boundaries and state indicators. | >=3:1. --border FAILS this (1.32 light / 1.33 dark) and is therefore decorative-only; --border-strong exists specifically to carry | Token-pair test asserts the ratio; lint bans --border on any element with a focusable role, so the two tokens cannot be swapped by accident. |
| Focus visibility on every focusable element, including inside the measure. | 2px offset in the page colour then a 2px --ring. Dark amber 9.54:1, light deep teal 7.50:1. Never animated, never removed. This is | Stylelint bans outline:none without replacement; a Playwright keyboard-walk tabs the public page and the reading column asserting a non-none outline o |
| Reduced motion. | Global reduce block; per-surface degradations specified in motion[] rather than left to the blanket rule. ONE documented carve-out | Playwright with reducedMotion:'reduce' asserts animation-name 'none' on the streaming cursor and research card, and that the rail is STILL PRESENT - t |
| Increased contrast preference. | @media (prefers-contrast: more): --border steps to --border-strong, muted inks step to full inks, --paper-rule steps to --border-s | Playwright contrast emulation plus a visual check that the reading column geometry is unchanged. |
| Touch targets and pointer-appropriate affordances. | >=44x44 CSS px (--tap-min). Heading-anchor affordances revealed only at (hover:hover) and (pointer:fine); at coarse pointers no gl | Playwright bounding-box assertion on every interactive element at 390px with a touch-emulating context. |
| Semantics and assistive-technology structure. | <article> with aria-labelledby; native <figure>/<figcaption> with the three-tier alt rule so no image is announced twice or not at | axe-core in e2e plus the golden-file test over real published documents asserting one h1 and no level skips. |
| First paint is text, no font swap, no typographic layout shift. | Zero webfont requests on /d/[token]. The chrome webfont loads only in the (app) tree and the OG renderer. | CI grep asserts no font import under app/(public)/; Playwright asserts zero font requests on a /d/[token] load; Lighthouse CLS budget on the public ro |

## UI constraints

### Every shadcn and ai-elements CLI invocation runs with cwd=packages/web.

**Rationale.** Post-migration every package under packages/* owns its own app/, components/, components.json, global.css, tailwind config and tsconfig.json, and the repo root owns none of them. A bare root init writes config the thin orchestrator does not consume; the same init run from packages/mobile overwrites the Expo app's components.json and copies Open Code on top of the RN component tree.

**Enforced by.** Add "ui:add": "shadcn@latest add" and "ai:add": "ai-elements@latest add" to packages/web/package.json and invoke via pnpm --filter @holocron/web, so the cwd is structural. No pnpm-workspace.yaml edit is needed — the migration already set it to packages/* only, which enrolls packages/web. packages/web/tsconfig.json declares its own paths { "@/*": ["./*"] } resolving inside packages/web; it must not reach packages/mobile.

### No import from components/ai-elements/** inside app/(public)/** or inside DocumentBody.

**Rationale.** The public page ships zero client JS beyond error.tsx, and no chrome may appear inside the reading measure.

**Enforced by.** ESLint no-restricted-imports patterns scoped by overrides on those paths; failing the lint fails CI.

### No loading.tsx and no Skeleton under app/(public)/**.

**Rationale.** The stranger must never see a spinner; the first paint is text off the edge cache. Any skeleton on /d/<token> is a design bug.

**Enforced by.** A CI file-existence check on app/(public)/**/loading.tsx plus the same lint override banning the skeleton import in that tree.

### Long-form prose only ever renders inside .typeset, and chrome is a sibling of that element, never a child.

**Rationale.** The chrome/column boundary is a measure boundary, not a page boundary - it cuts through single components. A Library row is a chromed frame containing calm type.

**Enforced by.** max-width: var(--measure) on .typeset, plus the in-layer neutraliser resetting box-shadow / backdrop-filter / animation on descendants that are not marked not-typeset. A violation disarms itself visually instead of shipping.

### The operator reader and the public reader import the same DocumentBody module.

**Rationale.** The preview is the standing guard against the class of defect that made every shared document text-only. If the operator reads at a different width or figure treatment, he cannot preview what he is sending.

**Enforced by.** One module, two mounts, differing only by an assetBase prop. There is no second markdown renderer to drift from - chat uses MessageResponse, documents use DocumentBody, and a third is banned.

### Message takes from=, MessageResponse children must be a string, Tool takes defaultOpen={false}.

**Rationale.** from-vs-role is the registry's highest-frequency false friend; MessageResponse silently renders nothing for non-string children; the upstream Tool example ships defaultOpen={true}, which would turn every turn into a wall of open panels.

**Enforced by.** Encoded in the reducer's output types - the render layer receives UIMessage.role and must translate at the boundary - plus a review checklist item and one integration test per rule against a real stream.

### invalidate parts never enter message state.

**Rationale.** The stream carries invalidations; the query carries truth. An invalidate folded into UIMessage.parts would put record freshness into the transcript, which is exactly the coupling that produced duplicate cards.

**Enforced by.** Type-level: the reducer's part union has no Invalidate member, so it cannot compile. invalidate is handled in the stream consumer as a queryClient.invalidateQueries side effect before the reducer is reached.

### Two cancels, two controls, never conflated.

**Rationale.** Aborting the chat stream aborts the TURN, not a device job the turn already dispatched. A stop button that implies it killed a twenty-minute research run is a trust defect.

**Enforced by.** PromptInputSubmit status="streaming" -> AbortController on the tRPC subscription (turn). ResearchCard carries its own Cancel -> research.cancel with a client-generated controlRequestKey so a double-click cannot double-cancel. The two are never the same control and their labels say which is which.

### Research card motion is driven by research.byId progress fields, never by a timer or CSS keyframe alone.

**Rationale.** The loading state is the licensed showcase for the holocron treatment and the thing the operator stares at for twenty minutes. An animation identical for a live run and a dead one teaches distrust of every card.

**Enforced by.** Progress takes value from real fields at the server-directed nextPollAfterMs; indeterminate when maxRounds is genuinely unknown. No setInterval-driven visual state in the card.

### The (public) tree themes by @media (prefers-color-scheme) only; .dark class and next-themes exist under (app) only.

**Rationale.** Light mode is a first-class deliverable of the public reader, and any JS theming path on /d/<token> breaks the zero-client-JS and no-flash guarantees.

**Enforced by.** Tokens declared under both .dark and the media query in one globals.css; (app)/layout.tsx sets class="dark", (public)/layout.tsx sets nothing. next-themes is in the lint boundary ban list for (public).

### prefers-reduced-motion is honoured everywhere, including the streaming cursor.

**Rationale.** State change is the motion trigger, not decoration; motion is near-zero in the reading column and on the public page.

**Enforced by.** One global reduce-motion reset in the base layer of globals.css, written once at scaffold time so no component can opt back in.

### Every colour, size, radius and elevation resolves from a token in styles/tokens.css. No hex/rgb/hsl literal in any component file; no magic px where a --space-* exists.

**Rationale.** The existing RN tailwind.config.js has colours tokenised but ZERO spacing, type or elevation scale, so every size in that app is a magic number. The new package must not inherit that, and the chrome/column enforcement only works if every value is a named token that can be scoped or banned.

**Enforced by.** stylelint color-no-hex plus CI grep for hex outside tokens.css; ESLint rejects arbitrary Tailwind values like p-[13px].

### There is exactly one document renderer, used by /d/[token] and /library/[documentId] and nothing else, accepting no className, style, children, slot or variant.

**Rationale.** 'Preview is the real public URL' is the standing guard against the defect class that made every shared document text-only for a year. It only holds if the two columns cannot diverge. A styling prop is the seam through which they would diverge on the first PR that wants a slightly different look in the cockpit.

**Enforced by.** Exact TypeScript prop type with no index signature; eslint react/forbid-component-props; the Playwright measure-only pixel diff between the two routes.

### The (public) tree ships no client JavaScript except error.tsx, and no loading.tsx or Suspense boundary exists under app/(public)/d/[token].

**Rationale.** The stranger must never see a spinner; first paint is document text off the edge cache. Every client component there is a hydration cost paid by a reader with no relationship to the product and a 30-second attention budget.

**Enforced by.** CI greps for 'use client' and loading.tsx in that subtree; Playwright asserts the public route loads zero JS chunks beyond the framework baseline.

### The public page follows prefers-color-scheme in CSS only. The operator shell is dark-locked by a class. Neither reads localStorage, runs an inline theme script, or renders a theme toggle.

**Rationale.** FR-NEXT-13 and the cold-reader's highest-severity pain: a deep-dark page opened outdoors at noon. Any JS-driven theming introduces a flash and a hydration dependency on the one page that must paint text instantly.

**Enforced by.** tokens.css drift test; CI greps; Playwright loads /d/[token] with colorScheme 'light' and asserts a light computed background.

### Motion is bound to state, never to time. Any looping or indefinite animation on a state-bearing surface is a defect, and any progress indicator must be able to visibly reach a stalled state.

**Rationale.** An animation that a dead run could still produce is progress theatre; once the operator catches it lying he distrusts every future card, and the twenty-minute deep-research card is the surface he stares at longest.

**Enforced by.** ESLint bans animation-iteration-count: infinite and animate-* outside an allowlist of exactly two surfaces; an integration test drives the research card from a fixture event stream, stops feeding events, and asserts it reaches 'no signal' with animation-name 'none' within 90s.

### Full-bleed is authored via an explicit #wide marker, never inferred from image dimensions.

**Rationale.** Any heuristic makes the operator's preview unpredictable, and unpredictable preview is precisely the failure this rewrite exists to close. An author who cannot predict the output cannot verify it before sending.

**Enforced by.** The rehype rule implements only the marker path; the golden-file test asserts documents without the marker produce zero full-bleed figures.

### Inline style attributes are banned except for two dynamic custom properties: --figure-ratio on a figure and --progress on the rail. No CSS-in-JS anywhere.

**Rationale.** Inline styles are unreachable by the .measure token-scoping mechanism and by stylelint, so each one is a hole in the enforcement.

**Enforced by.** eslint react/forbid-dom-props: ['style'] with a two-path allowlist; the computed-style e2e catches anything that slips through.

---

_Merged from `shadcn-ai-elements-planner.ui-infra.json` (structure, registry, install) and `frontend-designer.ui-infra.json` (tokens, column, figures, motion, enforcement, accessibility). Palette conflict resolved in favour of the design lens; see team contributions._
