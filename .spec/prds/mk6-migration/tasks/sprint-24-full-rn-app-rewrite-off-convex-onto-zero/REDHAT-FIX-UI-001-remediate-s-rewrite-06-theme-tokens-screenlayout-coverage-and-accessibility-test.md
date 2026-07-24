# REDHAT-FIX-UI-001: Remediate S-REWRITE-06 theme tokens, ScreenLayout coverage, and accessibility/testID gaps across rewired surfaces
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `180 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Remediate every S-REWRITE-06 FAIL finding: eliminate hardcoded hex and untokenized spacing on rewired surfaces, wrap all content drawer routes in ScreenLayout, stamp testID+accessibilityLabel on interactive loading/error chrome, then produce a fresh clean review artifact with theme and a11y PASS while keeping contract/no-convex green.

## Background
S-REWRITE-06 overall_verdict NEEDS_FIXES remains open (review-artifact at commit context of rewrite; findings authoritative). Concrete RED baseline (do not weaken): hex count=55 (39 production) in whats-new freshness/category/platform maps, settings Tailwind hex swatches, improvements/assimilate placeholders, ShopListingCard retailers; numeric spacing in chat/reference, ArticleImportModal, IterationTimeline; ScreenLayout only on settings/toolbelt/improvements/whats-new/index (4/14); missing testID/a11y on research/improvements/whats-new detail chrome, chat error-retry, drawer retry-button, social back. _layout.tsx is navigator shell — ScreenLayout N/A; fix verify to content routes only. Contract 105/105 and no-convex-client PASS — presentation-only fix must preserve both. Success = theme hex 0, ScreenLayout on every content drawer route, testID+a11y on interactive chrome, fresh review-artifact theme+a11y PASS with overall_verdict PASS. Do NOT mark sprint complete from this planning output alone.

## Specification
- **Objective:** Remediate every S-REWRITE-06 FAIL finding: eliminate hardcoded hex and untokenized spacing on rewired surfaces, wrap all content drawer routes in ScreenLayout, stamp testID+accessibilityLabel on interactive loading/error chrome, then produce a fresh clean review artifact with theme and a11y PASS while keeping contract/no-convex green.
- **Success state:** grep hex count under app/components/hooks/screens is 0; every content drawer route (13 files excluding _layout.tsx) uses ScreenLayout; research/improvements/whats-new/chat interactive chrome has testID+accessibilityLabel; client-contract 105/105 and no-convex-client still PASS; fresh review-artifact.json overall_verdict PASS with theme and a11y_mobile_patterns both PASS.

## Critical Constraints
### MUST
- MUST drive production hex color count from baseline 55 to 0 under the S-REWRITE-06 AC-1 grep (excluding theme.* references)
- MUST wrap every content drawer route in ScreenLayout (baseline FAIL 4/14; pure navigator app/(drawer)/_layout.tsx is N/A exception — document and verify content routes only, never claim _layout equality incorrectly)
- MUST add testID + accessibilityLabel (and accessibilityRole where interactive) on loading/error/success chrome Pressable/Button across research/improvements/whats-new/chat detail routes and drawer retry
- MUST obtain a fresh review-artifact.json with theme + a11y_mobile_patterns PASS, client_data_contract PASS, and overall_verdict PASS (or equivalent clean, not NEEDS_FIXES)
- MUST preserve holo verify:no-convex-client PASS and client-contract 105/105
### NEVER
- NEVER re-introduce convex/react imports or break holo verify:no-convex-client / 105/105 client-contract mapping
- NEVER leave raw #RRGGBB in production component bodies (including Tailwind bg-[#...] and PLATFORM_COLORS maps) — host brand/freshness/category colors under theme tokens
- NEVER claim S-REWRITE-06 already passed; overall_verdict is NEEDS_FIXES with AC-1/AC-2 FAIL at baseline
- NEVER create parallel sibling screen files — remediate in place
- NEVER rubber-stamp review-artifact PASS without re-running greps
### STRICTLY
- STRICTLY red_first: capture RED baseline commands (hex count=55; ScreenLayout 4/14) before edits; GREEN only when verify greps expect 0 / full content-route coverage
- STRICTLY use theme.colors.*, theme.spacing.*, theme.radius.*, theme.typography.* (extend lib/theme.ts when semantic tokens missing)
- STRICTLY flow_ref UC-SYNC-01; presentation-only — do not change Zero query/mutator wiring except incidental imports for layout wrappers
- STRICTLY ScreenLayout verify excludes pure navigator _layout.tsx (document exception in review artifact notes)

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01
- **Provides:** theme-token-compliant-rewired-surfaces, screenlayout-coverage-all-content-drawer-routes, a11y-testid-loading-error-chrome-contract, fresh-s-rewrite-06-review-pass-theme-a11y
- **Consumes:** S-REWRITE-06-review-artifact-NEEDS_FIXES, lib/theme.ts, components/ui/screen-layout.tsx, rewired-zero-surfaces-from-S-REWRITE-01-through-05
- **Boundary contracts:** presentation-only-no-data-plane-regression, preserve-cap-cut-01-zero-convex-react-imports, preserve-client-data-contract-105-of-105, theme-screenlayout-a11y-contract-for-rewired-surfaces

## Acceptance Criteria
### AC-1: Zero hardcoded hex colors outside theme tokens [PRIMARY]
- **GIVEN:** s-rewrite-06-red-baseline shows hex count=55 (expect 0) including 39 production hits
- **WHEN:** implementer replaces hardcoded #RRGGBB and Tailwind bg-[#...] with theme tokens (extending lib/theme.ts for freshness/category/platform/brand as needed) across listed hotspot files and remaining grep hits
- **THEN:** the S-REWRITE-06 AC-1 verify grep counts 0 matches outside theme context
- **Test tier:** `integration`
- **Verification service:** `static analysis grep + lib/theme.ts token surface`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l | tr -d ' ' | grep -qx '0'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis grep + lib/theme.ts token surface`
  - **Negative control — would fail if:**
    - stub — files unchanged and count remains 55
    - mock — grep path narrowed to empty directory
    - static — hex only moved into comments still matching grep
    - empty — theme tokens not referenced
    - disconnect — theme module not imported
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `s-rewrite-06-red-baseline`:
    - actor: `cli_user`
    - step: run baseline grep and capture RED count 55
    - step: map freshness/category/platform/retailer colors into theme tokens in lib/theme.ts
    - step: update NewsfeedHeader, categoryColors, SocialPosts*, settings-screen, improvements-screen, assimilate session placeholders, ShopListingCard to use theme
    - step: re-run grep; assert count 0
    - MUST observe:
      - hex grep count `0`
      - theme token references for freshness/category/platform colors (`theme.colors.*`)
      - no `bg-[#` arbitrary hex classes in screens/settings-screen.tsx
    - MUST NOT observe:
      - hex count `55`
      - production strings `fresh: '#22C55E'` / `PLATFORM_COLORS` raw hex maps in component bodies
      - placeholderTextColor=`#9ca3af` or `#71717a`
      - empty theme token map with `0` theme.colors references

### AC-2: ScreenLayout on every content drawer route [PRIMARY]
- **GIVEN:** baseline ScreenLayout coverage is 4/14 drawer tsx (only settings, toolbelt, improvements, whats-new/index); _layout.tsx is navigator shell N/A
- **WHEN:** implementer wraps missing content routes with ScreenLayout, pushing layout into child screens when route is a thin re-export
- **THEN:** every content drawer route file imports/uses ScreenLayout; pure navigator _layout.tsx remains documented N/A exception and is excluded from equality verify
- **Test tier:** `integration`
- **Verification service:** `static analysis ScreenLayout coverage matrix`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `CONTENT=$(find 'app/(drawer)/' -name '*.tsx' ! -name '_layout.tsx' | wc -l | tr -d ' '); WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | grep -v '_layout.tsx' | wc -l | tr -d ' '); test "$CONTENT" -eq "$WITH" && test "$WITH" -ge 13`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis ScreenLayout coverage matrix`
  - **Negative control — would fail if:**
    - stub — only the original 4 files keep ScreenLayout
    - empty — routes still bare View/SafeAreaView only
    - mock — verify command excludes all missing files
    - static — comment contains word ScreenLayout without import usage
    - disconnect — screen-layout module not used
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `s-rewrite-06-red-baseline`:
    - actor: `cli_user`
    - step: capture RED matrix: ScreenLayout on 4 files only
    - step: wrap each missing content drawer route (or its child screen for thin re-exports) in ScreenLayout
    - step: re-run content-route equality verify excluding pure navigator _layout.tsx with documented note
    - MUST observe:
      - ScreenLayout content-route equality CONTENT==WITH with WITH>=`13`
      - routes `chat/[conversationId]`, `research/[sessionId]`, `improvements/[requestId]`, `whats-new/[reportId]` import `ScreenLayout`
      - routes `subscriptions/feed`, `subscriptions/social`, `whats-new/social`, `subscription-content/[groupKey]` use `ScreenLayout` (route or child)
    - MUST NOT observe:
      - ScreenLayout content-route count still `4`
      - bare SafeAreaView-only success chrome without `ScreenLayout` on detail routes
      - thin re-export routes returning unwrapped child screens (`0` ScreenLayout)
      - empty content-route ScreenLayout coverage

### AC-3: testID and accessibilityLabel on interactive loading/error chrome
- **GIVEN:** review findings show Pressable/Button on research/[sessionId], whats-new/[reportId], improvements/[requestId], chat error-retry, drawer retry-button, social back lacking testID and/or accessibilityLabel
- **WHEN:** implementer stamps stable testIDs and accessibilityLabel (+ accessibilityRole=button) on every interactive chrome control across loading/error/success branches
- **THEN:** no interactive loading/error chrome Pressable/Button remains without both testID and accessibilityLabel in the cited detail routes
- **Test tier:** `integration`
- **Verification service:** `static analysis a11y/testID chrome audit`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `rg -n 'accessibilityLabel=|testID=' app/\(drawer\)/research/\[sessionId\].tsx app/\(drawer\)/whats-new/\[reportId\].tsx app/\(drawer\)/improvements/\[requestId\].tsx app/\(drawer\)/chat/\[conversationId\].tsx app/\(drawer\)/_layout.tsx components/whats-new/SocialPostsListScreen.tsx`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis a11y/testID chrome audit`
  - **Negative control — would fail if:**
    - stub — only success branch stamped, loading/error back Pressables still bare
    - empty — no accessibilityLabel attributes added
    - mock — audit script always prints PASS
    - static — testID without accessibilityLabel on retry/back
    - disconnect — chrome not reachable for Maestro later
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `a11y-hotspot-files`:
    - actor: `cli_user`
    - step: add testID research-detail-back / improvements-detail-back / whats-new-detail-back on all chrome states
    - step: add accessibilityLabel Go back / Retry on Pressable/Button chrome
    - step: fix chat error-retry-button and drawer retry-button a11y
    - step: fix SocialPostsListScreen back accessibilityLabel
    - step: run chrome a11y smoke verify
    - MUST observe:
      - `accessibilityLabel` present on back/retry chrome in research, improvements, whats-new detail routes
      - `testID` present on the same interactive back/retry controls (`research-detail-back` or equivalent)
      - `error-retry-button` has accessibilityRole=`button` and accessibilityLabel=`Retry`
      - `retry-button` has accessibilityLabel=`Retry loading conversations`
    - MUST NOT observe:
      - bare handleBack Pressable without `testID`/`accessibilityLabel` on loading/error branches
      - `retry-button` with testID only and `0` accessibilityLabel
      - SocialPostsListScreen back with testID only and empty accessibilityLabel
      - empty a11y chrome on detail loading/error states

### AC-4: Numeric spacing and typography use theme tokens on cited hotspots
- **GIVEN:** review flagged numeric padding/gap/fontSize outside tokens in chat/reference.tsx, ArticleImportModal.tsx, IterationTimeline.tsx
- **WHEN:** implementer replaces hardcoded spacing/radius/typography literals with theme.spacing / theme.radius / theme.typography tokens
- **THEN:** cited hotspot files no longer use raw padding:16/gap:12 style of literals for layout tokens; values resolve through theme
- **Test tier:** `integration`
- **Verification service:** `static analysis spacing/typography token audit`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `rg -n 'padding:\s*16|gap:\s*12|padding:\s*20|borderRadius:\s*12|fontSize:\s*1[0-8]' app/\(drawer\)/chat/reference.tsx components/articles/ArticleImportModal.tsx components/deep-research/IterationTimeline.tsx && exit 1 || echo 'PASS no banned numeric literals on hotspots'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis spacing/typography token audit`
  - **Negative control — would fail if:**
    - stub — hotspot files unchanged
    - static — numbers only reformatted still present
    - empty — theme.spacing unused
    - mock — audit path excludes hotspots
    - disconnect — theme not imported in files
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `theme-hotspot-files`:
    - actor: `cli_user`
    - step: replace contentContainerStyle padding/gap literals in chat/reference.tsx with theme.spacing
    - step: tokenize ArticleImportModal and IterationTimeline StyleSheet numbers with theme tokens
    - step: run banned-literal verify on the three hotspots
    - MUST observe:
      - `theme.spacing` / `theme.radius` / `theme.typography` references in the three hotspot files
      - verify prints `PASS` no banned numeric literals on hotspots
    - MUST NOT observe:
      - contentContainerStyle={{ padding: `16`, gap: `12` }}
      - large hardcoded fontSize `10`-`18` StyleSheet block remaining without tokens
      - empty theme.spacing usage (`0` theme.spacing references on hotspots)

### AC-5: Fresh clean review for theme+a11y while contract stays PASS
- **GIVEN:** AC-1..AC-4 remediated and contract-green-preserve baseline
- **WHEN:** react-native-ui-reviewer re-runs S-REWRITE-06 verify commands and writes a fresh review-artifact.json
- **THEN:** theme and a11y_mobile_patterns verdicts are PASS; client_data_contract remains PASS; holo verify:no-convex-client exits 0; overall_verdict is PASS (or equivalent clean, not NEEDS_FIXES)
- **Test tier:** `integration`
- **Verification service:** `static analysis + holo verify:client-contract + holo verify:no-convex-client + review-artifact.json + react-native-ui-reviewer`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l | tr -d ' ' | grep -qx '0' && CONTENT=$(find 'app/(drawer)/' -name '*.tsx' ! -name '_layout.tsx' | wc -l | tr -d ' '); WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | grep -v '_layout.tsx' | wc -l | tr -d ' '); test "$CONTENT" -eq "$WITH" && holo verify:no-convex-client --roots app,components,hooks,screens && holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json && jq -e '((.categories[] | select(.id=="theme") | .verdict)=="PASS") and ((.categories[] | select(.id=="a11y_mobile_patterns") | .verdict)=="PASS") and ((.categories[] | select(.id=="client_data_contract") | .verdict)=="PASS") and (.overall_verdict == "PASS" or .overall_verdict == "APPROVED" or .overall_verdict == "CLEAN")' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis + holo verify:client-contract + holo verify:no-convex-client + review-artifact.json + react-native-ui-reviewer`
  - **Negative control — would fail if:**
    - stub — review-artifact overwritten to PASS without re-running greps
    - mock — old NEEDS_FIXES artifact left in place
    - static — theme still FAIL count 55
    - disconnect — client-contract not re-verified
    - empty — categories missing
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `contract-green-preserve`:
    - actor: `cli_user`
    - step: re-run hex grep expect 0
    - step: re-run ScreenLayout content-route equality
    - step: re-run holo verify:no-convex-client and verify:client-contract
    - step: write/update review-artifact.json with fresh PASS verdicts for theme and a11y_mobile_patterns and overall_verdict PASS
    - MUST observe:
      - review-artifact theme verdict `PASS`
      - review-artifact a11y_mobile_patterns verdict `PASS`
      - client_data_contract verdict `PASS`
      - overall_verdict `PASS` (or `APPROVED`/`CLEAN` equivalent)
    - MUST NOT observe:
      - hex count `55`
      - ScreenLayout content coverage still `4`
      - overall_verdict `NEEDS_FIXES`
      - empty categories with `0` PASS verdicts

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Hardcoded #RRGGBB count under app/components/hooks/screens is 0 outside theme context | AC-1 | `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' \| grep -v 'theme\.' \| wc -l \| tr -d ' ' \| grep -qx '0'` |
| TC-2 | Baseline RED still fails before fix: hex count equals 55 at task start | AC-1 | `test "$(grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' \| grep -v 'theme\.' \| wc -l \| tr -d ' ')" = "55"` |
| TC-3 | Every content drawer route (excluding pure navigator _layout.tsx) uses ScreenLayout | AC-2 | `CONTENT=$(find 'app/(drawer)/' -name '*.tsx' ! -name '_layout.tsx' \| wc -l \| tr -d ' '); WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' \| grep -v '_layout.tsx' \| wc -l \| tr -d ' '); test "$CONTENT" -eq "$WITH"` |
| TC-4 | Baseline RED still fails before fix: ScreenLayout only on 4 of 14 drawer tsx | AC-2 | `test "$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' \| wc -l \| tr -d ' ')" = "4"` |
| TC-5 | Interactive loading/error chrome on detail routes has testID and accessibilityLabel | AC-3 | `rg -n 'accessibilityLabel=\|testID=' app/\(drawer\)/research/\[sessionId\].tsx app/\(drawer\)/whats-new/\[reportId\].tsx app/\(drawer\)/improvements/\[requestId\].tsx app/\(drawer\)/chat/\[conversationId\].tsx` |
| TC-6 | Cited spacing/typography hotspots no longer use banned raw numeric literals | AC-4 | `rg -n 'padding:\s*16\|gap:\s*12\|padding:\s*20\|borderRadius:\s*12' app/\(drawer\)/chat/reference.tsx components/articles/ArticleImportModal.tsx components/deep-research/IterationTimeline.tsx && exit 1 \|\| echo PASS` |
| TC-7 | Client-data-contract and no-convex-client remain PASS after presentation remediations | AC-5 | `holo verify:no-convex-client --roots app,components,hooks,screens && holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-8 | Fresh review-artifact has theme PASS, a11y_mobile_patterns PASS, client_data_contract PASS, and overall_verdict clean PASS | AC-5 | `jq -e '((.categories[] \| select(.id=="theme") \| .verdict)=="PASS") and ((.categories[] \| select(.id=="a11y_mobile_patterns") \| .verdict)=="PASS") and ((.categories[] \| select(.id=="client_data_contract") \| .verdict)=="PASS") and (.overall_verdict == "PASS" or .overall_verdict == "APPROVED" or .overall_verdict == "CLEAN")' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json` |

## Reading List
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json` (all) — Authoritative NEEDS_FIXES findings: theme FAIL hex=55; a11y_mobile_patterns FAIL ScreenLayout 4/14; file:line list; contract PASS do not re-break
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/S-REWRITE-06-reviewer-pass-theme-a11y-contract-compliance-across-rewired-surfaces.md` (all) — Original AC-1/AC-2 verify commands and ScreenLayout matrix expectations
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/SPRINT.md` (all) — Remediation row REDHAT-FIX-UI-001 objectives
- `lib/theme.ts` (all) — Extend with freshness/category/platform/brand tokens as needed
- `components/ui/screen-layout.tsx` (all) — Canonical ScreenLayout API used by settings/whats-new/index
- `app/(drawer)/whats-new/index.tsx` (all) — Reference ScreenLayout usage pattern to copy
- `components/whats-new/NewsfeedHeader.tsx` (all) — fresh/aging/stale hex remediation
- `components/whats-new/categoryColors.ts` (all) — category border hex → theme
- `components/whats-new/SocialPostsListScreen.tsx` (all) — PLATFORM_COLORS + back a11y
- `components/whats-new/SocialPostsGroupCard.tsx` (all) — Duplicate PLATFORM_COLORS hex map
- `screens/settings-screen.tsx` (all) — bg-[#0A0E14] theme swatches
- `screens/improvements-screen.tsx` (all) — placeholderTextColor hex
- `app/assimilate/[sessionId].tsx` (all) — placeholderTextColor #9ca3af
- `app/(drawer)/chat/[conversationId].tsx` (all) — ScreenLayout missing; error-retry a11y
- `app/(drawer)/chat/reference.tsx` (all) — ScreenLayout missing; padding/gap literals
- `app/(drawer)/research/[sessionId].tsx` (all) — ScreenLayout + back chrome testID/a11y
- `app/(drawer)/improvements/[requestId].tsx` (all) — ScreenLayout + a11y gaps
- `app/(drawer)/whats-new/[reportId].tsx` (all) — ScreenLayout + a11y gaps
- `app/(drawer)/subscriptions/feed.tsx` (all) — Thin re-export needs ScreenLayout wrapper
- `app/(drawer)/subscriptions/social.tsx` (all) — Thin re-export needs ScreenLayout wrapper
- `app/(drawer)/whats-new/social.tsx` (all) — Thin re-export needs ScreenLayout wrapper
- `app/(drawer)/subscription-content/[groupKey].tsx` (all) — Bare loading/error Views need ScreenLayout + testIDs
- `components/articles/ArticleImportModal.tsx` (all) — Numeric padding/radius tokenization
- `components/deep-research/IterationTimeline.tsx` (all) — StyleSheet numeric typography/spacing tokenization
- `components/shop/ShopListingCard.tsx` (all) — Retailer brand hex still hits global AC-1 grep
- `RULES.md` (all) — Semantic theme tokens, ScreenLayout for (drawer)/, testID convention, a11y

## Guardrails
### WRITE-ALLOWED
- `lib/theme.ts (MODIFY — add freshness/category/platform/brand/retailer semantic tokens)`
- `components/whats-new/NewsfeedHeader.tsx (MODIFY)`
- `components/whats-new/categoryColors.ts (MODIFY)`
- `components/whats-new/SocialPostsListScreen.tsx (MODIFY)`
- `components/whats-new/SocialPostsGroupCard.tsx (MODIFY)`
- `components/whats-new/**/*.tsx (MODIFY theme/a11y only)`
- `components/articles/ArticleImportModal.tsx (MODIFY)`
- `components/deep-research/IterationTimeline.tsx (MODIFY)`
- `components/shop/ShopListingCard.tsx (MODIFY if still in global hex grep)`
- `components/ui/screen-layout.tsx (MODIFY only if API needs slot for existing headers)`
- `components/subscriptions/**/*.tsx (MODIFY ScreenLayout push-down for thin re-exports)`
- `screens/settings-screen.tsx (MODIFY)`
- `screens/improvements-screen.tsx (MODIFY)`
- `screens/**/*.tsx (MODIFY presentation tokens only as grep requires)`
- `app/assimilate/[sessionId].tsx (MODIFY)`
- `app/(drawer)/chat/[conversationId].tsx (MODIFY)`
- `app/(drawer)/chat/reference.tsx (MODIFY)`
- `app/(drawer)/improvements/[requestId].tsx (MODIFY)`
- `app/(drawer)/research/[sessionId].tsx (MODIFY)`
- `app/(drawer)/whats-new/[reportId].tsx (MODIFY)`
- `app/(drawer)/whats-new/social.tsx (MODIFY)`
- `app/(drawer)/subscriptions/feed.tsx (MODIFY)`
- `app/(drawer)/subscriptions/social.tsx (MODIFY)`
- `app/(drawer)/subscription-content/[groupKey].tsx (MODIFY)`
- `app/(drawer)/_layout.tsx (MODIFY a11y on retry-button only)`
- `app/(drawer)/**/*.tsx (MODIFY ScreenLayout/theme/a11y only)`
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json (MODIFY via honest re-review)`
### WRITE-PROHIBITED
- Changing Zero query/mutator/Hono wiring except incidental imports for layout wrappers
- Re-introducing convex/react
- Creating new sibling *Screen.tsx variants instead of in-place remediations
- Rubber-stamping review-artifact PASS without re-running greps
- Weakening holo verify:client-contract inventory or no-convex-client roots
- Any file not listed under write_allowed

## Design
- **References:** SPRINT.md § Remediation (REDHAT-FIX-UI-001), review-artifact.json (overall_verdict NEEDS_FIXES; theme FAIL; a11y_mobile_patterns FAIL; client_data_contract PASS), S-REWRITE-06 task AC-1/AC-2 verify commands, lib/theme.ts, components/ui/screen-layout.tsx, app/(drawer)/whats-new/index.tsx ScreenLayout reference
- **Pattern:** Tokenize colors/spacing via lib/theme.ts + wrap content routes in ScreenLayout + stamp testID/accessibilityLabel on all chrome states; presentation-only remediation
- **Pattern source:** app/(drawer)/settings.tsx, app/(drawer)/whats-new/index.tsx, components/ui/screen-layout.tsx, RULES.md RN conventions
- **Anti-pattern:** Leaving PLATFORM_COLORS hex maps in components; ScreenLayout only on 4 top-level screens; optional a11y only on success branch; claiming review PASS while hex count still 55; incorrectly requiring ScreenLayout on navigator _layout.tsx
- **Interaction notes:**
  - Safe areas: ScreenLayout must preserve safe-area handling; do not regress notches/home indicators
  - Touch targets: back/retry Pressables must remain >=44pt when adding a11y props
  - Platform: iOS/Android both consume same theme tokens; no platform-specific hex
  - testID pattern: {screen}-{component}-{element} e.g. research-detail-back, improvements-detail-back, whats-new-detail-back, error-retry-button
  - Brand colors: if brand fidelity required, host under theme.colors.brand.* / theme.colors.platform.* / theme.colors.freshness.* — never raw hex in JSX
  - _layout.tsx exception: pure drawer navigator shell is not a content route; ScreenLayout N/A — fix verify to content routes only and document in review artifact

## Verification Gates
1. **RED baseline hex (pre-fix evidence)**
   - command: `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l`
   - expected: At task start: 55 (document RED). After fix: 0
2. **GREEN hex zero**
   - command: `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l | tr -d ' ' | grep -qx '0'`
   - expected: Exit 0
3. **RED baseline ScreenLayout (pre-fix evidence)**
   - command: `echo WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | wc -l) TOTAL=$(find 'app/(drawer)/' -name '*.tsx' | wc -l)`
   - expected: At task start: WITH=4 TOTAL=14
4. **GREEN ScreenLayout content-route equality**
   - command: `CONTENT=$(find 'app/(drawer)/' -name '*.tsx' ! -name '_layout.tsx' | wc -l | tr -d ' '); WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | grep -v '_layout.tsx' | wc -l | tr -d ' '); test "$CONTENT" -eq "$WITH" && test "$WITH" -ge 13`
   - expected: Exit 0; WITH>=13 content routes
5. **No Convex client preserved**
   - command: `holo verify:no-convex-client --roots app,components,hooks,screens`
   - expected: Exit 0
6. **Client contract preserved**
   - command: `holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
   - expected: Exit 0; 105/105 mapped
7. **Fresh review artifact theme+a11y PASS + overall clean**
   - command: `jq -e '((.categories[] | select(.id=="theme") | .verdict)=="PASS") and ((.categories[] | select(.id=="a11y_mobile_patterns") | .verdict)=="PASS") and ((.categories[] | select(.id=="client_data_contract") | .verdict)=="PASS") and (.overall_verdict == "PASS" or .overall_verdict == "APPROVED" or .overall_verdict == "CLEAN")' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json`
   - expected: Exit 0
8. **Typecheck**
   - command: `pnpm tsgo --noEmit`
   - expected: Exit 0
9. **Lint**
   - command: `pnpm biome check .`
   - expected: Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-implementer` — Owns RN presentation surfaces (app/, components/, screens/) that S-REWRITE-06 failed for theme hex, ScreenLayout coverage, and a11y/testID chrome. This is presentation-contract remediation only — data-plane contract already PASS (105/105) and must not be re-broken. Fresh clean review is owned by react-native-ui-reviewer after implementer green greps.
- **Reviewer:** `react-native-ui-reviewer`

## Dependencies
- **depends_on:** S-REWRITE-01, S-REWRITE-02, S-REWRITE-03, S-REWRITE-04, S-REWRITE-05, S-REWRITE-06
- **blocks:** honest-sprint-24-close, Sprint-25, Sprint-26, Sprint-29

## Coding Standards
- `RULES.md`
- `brain/docs/kanban/TASK-TEMPLATE.md`
- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`

## Notes
S-REWRITE-06 overall_verdict NEEDS_FIXES remains open (review-artifact at commit context of rewrite; findings authoritative). Concrete RED baseline (do not weaken): hex count=55 (39 production) in whats-new freshness/category/platform maps, settings Tailwind hex swatches, improvements/assimilate placeholders, ShopListingCard retailers; numeric spacing in chat/reference, ArticleImportModal, IterationTimeline; ScreenLayout only on settings/toolbelt/improvements/whats-new/index (4/14); missing testID/a11y on research/improvements/whats-new detail chrome, chat error-retry, drawer retry-button, social back. _layout.tsx is navigator shell — ScreenLayout N/A; fix verify to content routes only. Contract 105/105 and no-convex-client PASS — presentation-only fix must preserve both. Success = theme hex 0, ScreenLayout on every content drawer route, testID+a11y on interactive chrome, fresh review-artifact theme+a11y PASS with overall_verdict PASS. Do NOT mark sprint complete from this planning output alone.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-UI-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s-rewrite-06-red-baseline": {
      "description": "S-REWRITE-06 review-artifact.json overall_verdict NEEDS_FIXES with theme FAIL (hex=55, production=39) and a11y_mobile_patterns FAIL (ScreenLayout 4/14)",
      "seed_method": "recorded_external",
      "records": [
        "hex count=55 via grep -rn '#[0-9a-fA-F]{6}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme.' | wc -l",
        "ScreenLayout files with match=4; drawer tsx total=14",
        "Missing ScreenLayout content routes: chat/[conversationId], chat/reference, improvements/[requestId], research/[sessionId], whats-new/[reportId], subscriptions/feed, subscriptions/social, whats-new/social, subscription-content/[groupKey]",
        "Has ScreenLayout: settings.tsx, toolbelt.tsx, improvements.tsx, whats-new/index.tsx",
        "_layout.tsx navigator shell \u2014 ScreenLayout N/A exception (do not count as content route)"
      ]
    },
    "theme-hotspot-files": {
      "description": "Concrete files with hardcoded hex / untokenized spacing from review findings",
      "seed_method": "recorded_external",
      "records": [
        "components/whats-new/NewsfeedHeader.tsx freshness hex fresh/aging/stale ('#22C55E','#F59E0B','#EF4444')",
        "components/whats-new/categoryColors.ts category border hex",
        "components/whats-new/SocialPostsListScreen.tsx and SocialPostsGroupCard.tsx PLATFORM_COLORS brand hex + '#64748B'",
        "screens/settings-screen.tsx Tailwind bg-[#0A0E14] swatches",
        "screens/improvements-screen.tsx and app/assimilate/[sessionId].tsx placeholderTextColor hex",
        "app/(drawer)/chat/reference.tsx padding:16 gap:12; components/articles/ArticleImportModal.tsx numeric padding/radius; components/deep-research/IterationTimeline.tsx numeric StyleSheet",
        "components/shop/ShopListingCard.tsx retailer brand hex (global grep AC-1)"
      ]
    },
    "a11y-hotspot-files": {
      "description": "Missing testID/accessibilityLabel chrome from review findings",
      "seed_method": "recorded_external",
      "records": [
        "app/(drawer)/research/[sessionId].tsx back Pressables L114/L153; Button L180",
        "app/(drawer)/whats-new/[reportId].tsx back Pressables L147/L184; Button L208",
        "app/(drawer)/improvements/[requestId].tsx loading/error back L104/L141/L165; success testID without accessibilityLabel L211",
        "app/(drawer)/chat/[conversationId].tsx error-retry-button testID without accessibilityLabel",
        "app/(drawer)/_layout.tsx retry-button testID without accessibilityLabel",
        "components/whats-new/SocialPostsListScreen.tsx back Pressable testID without accessibilityLabel"
      ]
    },
    "contract-green-preserve": {
      "description": "Client-data-contract and no-convex-client already PASS \u2014 must remain green after presentation fixes",
      "seed_method": "public_api",
      "records": [
        "105/105 call sites mapped",
        "holo verify:no-convex-client PASS hits=0",
        "holo verify:client-contract exit 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN hex baseline 55 WHEN implementer tokenizes all hardcoded colors THEN grep count is 0",
      "verify": "grep -rn '#[0-9a-fA-F]\\{6\\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\\.' | wc -l | tr -d ' ' | grep -qx '0'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis grep + lib/theme.ts token surface",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "static",
            "empty",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s-rewrite-06-red-baseline",
            "action": {
              "actor": "cli_user",
              "steps": [
                "tokenize hex with theme tokens",
                "re-run grep"
              ]
            },
            "end_state": {
              "must_observe": [
                "hex grep count `0`",
                "theme token references for freshness/category/platform colors (`theme.colors.*`)",
                "no `bg-[#` arbitrary hex classes in screens/settings-screen.tsx"
              ],
              "must_not_observe": [
                "hex count `55`",
                "production strings `fresh: '#22C55E'` / `PLATFORM_COLORS` raw hex maps in component bodies",
                "placeholderTextColor=`#9ca3af` or `#71717a`",
                "empty theme token map with `0` theme.colors references"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN ScreenLayout on only 4/14 drawer tsx WHEN implementer wraps all content drawer routes THEN content-route ScreenLayout equality holds (_layout N/A exception documented)",
      "verify": "CONTENT=$(find 'app/(drawer)/' -name '*.tsx' ! -name '_layout.tsx' | wc -l | tr -d ' '); WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | grep -v '_layout.tsx' | wc -l | tr -d ' '); test \"$CONTENT\" -eq \"$WITH\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis ScreenLayout coverage matrix",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s-rewrite-06-red-baseline",
            "action": {
              "actor": "cli_user",
              "steps": [
                "wrap missing content routes in ScreenLayout",
                "re-run equality verify"
              ]
            },
            "end_state": {
              "must_observe": [
                "ScreenLayout content-route equality CONTENT==WITH with WITH>=`13`",
                "routes `chat/[conversationId]`, `research/[sessionId]`, `improvements/[requestId]`, `whats-new/[reportId]` import `ScreenLayout`",
                "routes `subscriptions/feed`, `subscriptions/social`, `whats-new/social`, `subscription-content/[groupKey]` use `ScreenLayout` (route or child)"
              ],
              "must_not_observe": [
                "ScreenLayout content-route count still `4`",
                "bare SafeAreaView-only success chrome without `ScreenLayout` on detail routes",
                "thin re-export routes returning unwrapped child screens (`0` ScreenLayout)",
                "empty content-route ScreenLayout coverage"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN missing a11y/testID on detail chrome WHEN implementer stamps both on all branches THEN chrome audit PASS",
      "verify": "rg -n 'accessibilityLabel=|testID=' app/\\(drawer\\)/research/\\[sessionId\\].tsx app/\\(drawer\\)/whats-new/\\[reportId\\].tsx app/\\(drawer\\)/improvements/\\[requestId\\].tsx app/\\(drawer\\)/chat/\\[conversationId\\].tsx",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis a11y/testID chrome audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "a11y-hotspot-files",
            "action": {
              "actor": "cli_user",
              "steps": [
                "add testID+accessibilityLabel on back/retry chrome all states"
              ]
            },
            "end_state": {
              "must_observe": [
                "`accessibilityLabel` present on back/retry chrome in research, improvements, whats-new detail routes",
                "`testID` present on the same interactive back/retry controls (`research-detail-back` or equivalent)",
                "`error-retry-button` has accessibilityRole=`button` and accessibilityLabel=`Retry`",
                "`retry-button` has accessibilityLabel=`Retry loading conversations`"
              ],
              "must_not_observe": [
                "bare handleBack Pressable without `testID`/`accessibilityLabel` on loading/error branches",
                "`retry-button` with testID only and `0` accessibilityLabel",
                "SocialPostsListScreen back with testID only and empty accessibilityLabel",
                "empty a11y chrome on detail loading/error states"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN numeric spacing hotspots WHEN implementer uses theme.spacing/radius/typography THEN banned literals absent",
      "verify": "rg -n 'padding:\\s*16|gap:\\s*12|padding:\\s*20|borderRadius:\\s*12' app/\\(drawer\\)/chat/reference.tsx components/articles/ArticleImportModal.tsx components/deep-research/IterationTimeline.tsx && exit 1 || echo PASS",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis spacing/typography token audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "empty",
            "mock",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "theme-hotspot-files",
            "action": {
              "actor": "cli_user",
              "steps": [
                "replace numeric literals with theme tokens on three hotspots"
              ]
            },
            "end_state": {
              "must_observe": [
                "`theme.spacing` / `theme.radius` / `theme.typography` references in the three hotspot files",
                "verify prints `PASS` no banned numeric literals on hotspots"
              ],
              "must_not_observe": [
                "contentContainerStyle={{ padding: `16`, gap: `12` }}",
                "large hardcoded fontSize `10`-`18` StyleSheet block remaining without tokens",
                "empty theme.spacing usage (`0` theme.spacing references on hotspots)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN remediations complete WHEN review commands re-run THEN theme+a11y PASS, contract PASS, overall_verdict PASS",
      "verify": "jq -e '((.categories[] | select(.id==\"theme\") | .verdict)==\"PASS\") and ((.categories[] | select(.id==\"a11y_mobile_patterns\") | .verdict)==\"PASS\") and (.overall_verdict == \"PASS\" or .overall_verdict == \"APPROVED\" or .overall_verdict == \"CLEAN\")' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis + holo verify:client-contract + holo verify:no-convex-client + review-artifact.json",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "static",
            "disconnect",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "contract-green-preserve",
            "action": {
              "actor": "cli_user",
              "steps": [
                "re-run greps and holo verifies",
                "write fresh review-artifact"
              ]
            },
            "end_state": {
              "must_observe": [
                "review-artifact theme verdict `PASS`",
                "review-artifact a11y_mobile_patterns verdict `PASS`",
                "client_data_contract verdict `PASS`",
                "overall_verdict `PASS` (or `APPROVED`/`CLEAN` equivalent)"
              ],
              "must_not_observe": [
                "hex count `55`",
                "ScreenLayout content coverage still `4`",
                "overall_verdict `NEEDS_FIXES`",
                "empty categories with `0` PASS verdicts"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "primary": false,
      "description": "Hardcoded #RRGGBB count under app/components/hooks/screens is 0 outside theme context",
      "verify": "grep -rn '#[0-9a-fA-F]\\{6\\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\\.' | wc -l | tr -d ' ' | grep -qx '0'",
      "maps_to_ac": "AC-1",
      "scenario": null
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "primary": false,
      "description": "Baseline RED still fails before fix: hex count equals 55 at task start",
      "verify": "test \"$(grep -rn '#[0-9a-fA-F]\\{6\\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\\.' | wc -l | tr -d ' ')\" = \"55\"",
      "maps_to_ac": "AC-1",
      "scenario": null
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "primary": false,
      "description": "Every content drawer route (excluding pure navigator _layout.tsx) uses ScreenLayout",
      "verify": "CONTENT=$(find 'app/(drawer)/' -name '*.tsx' ! -name '_layout.tsx' | wc -l | tr -d ' '); WITH=$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | grep -v '_layout.tsx' | wc -l | tr -d ' '); test \"$CONTENT\" -eq \"$WITH\"",
      "maps_to_ac": "AC-2",
      "scenario": null
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "primary": false,
      "description": "Baseline RED still fails before fix: ScreenLayout only on 4 of 14 drawer tsx",
      "verify": "test \"$(grep -rl 'ScreenLayout' 'app/(drawer)/' --include='*.tsx' | wc -l | tr -d ' ')\" = \"4\"",
      "maps_to_ac": "AC-2",
      "scenario": null
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "primary": false,
      "description": "Interactive loading/error chrome on detail routes has testID and accessibilityLabel",
      "verify": "rg -n 'accessibilityLabel=|testID=' app/\\(drawer\\)/research/\\[sessionId\\].tsx app/\\(drawer\\)/whats-new/\\[reportId\\].tsx app/\\(drawer\\)/improvements/\\[requestId\\].tsx app/\\(drawer\\)/chat/\\[conversationId\\].tsx",
      "maps_to_ac": "AC-3",
      "scenario": null
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "primary": false,
      "description": "Cited spacing/typography hotspots no longer use banned raw numeric literals",
      "verify": "rg -n 'padding:\\s*16|gap:\\s*12|padding:\\s*20|borderRadius:\\s*12' app/\\(drawer\\)/chat/reference.tsx components/articles/ArticleImportModal.tsx components/deep-research/IterationTimeline.tsx && exit 1 || echo PASS",
      "maps_to_ac": "AC-4",
      "scenario": null
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "primary": false,
      "description": "Client-data-contract and no-convex-client remain PASS after presentation remediations",
      "verify": "holo verify:no-convex-client --roots app,components,hooks,screens && holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "maps_to_ac": "AC-5",
      "scenario": null
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "primary": false,
      "description": "Fresh review-artifact has theme PASS, a11y_mobile_patterns PASS, and overall_verdict PASS",
      "verify": "jq -e '((.categories[] | select(.id==\"theme\") | .verdict)==\"PASS\") and ((.categories[] | select(.id==\"a11y_mobile_patterns\") | .verdict)==\"PASS\") and (.overall_verdict == \"PASS\" or .overall_verdict == \"APPROVED\" or .overall_verdict == \"CLEAN\")' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json",
      "maps_to_ac": "AC-5",
      "scenario": null
    }
  ]
}
-->
