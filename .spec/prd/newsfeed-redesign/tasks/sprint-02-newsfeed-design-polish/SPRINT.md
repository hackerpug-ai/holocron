# Sprint 2: Newsfeed Design Polish

**Sequence:** 2
**Timeline:** Phase 2
**Status:** Planned

---

## Overview

Layer polished micro-interactions and visual refinements onto the Intelligence Briefing screen built in Sprint 1. The four tasks in this sprint add the details that elevate a functional screen to a premium product: an animated freshness pulse, tactile filter pill feedback, animated loading skeletons, and a properly color-graded score dot system with accessibility support.

---

## Human Test Deliverable

Every interactive element in the newsfeed provides polished visual feedback: filter pills show a visual press response, the freshness dot pulses with a subtle breathing animation, the screen shows animated card skeletons during initial load instead of a blank flash, and score dots are color-coded by quality tier with accessibility labels readable by VoiceOver.

**Test Steps:**
1. Open the What's New screen and observe the freshness dot for 3 seconds — confirm it pulses with a subtle breathing scale animation.
2. Tap a filter chip slowly and confirm a visible opacity or color shift occurs on contact before the selection activates.
3. Kill the network connection, restart the app, and navigate to What's New — confirm animated skeleton placeholders appear for the hero and card positions rather than an empty list.
4. Find a high-scoring finding (score ≥ 80) and confirm its score dots appear in the success/green color; find a lower-scored item and confirm muted dots.
5. Enable VoiceOver on the device, navigate to a finding card, and confirm the score dots are announced with a meaningful label (e.g., "relevance score 85 out of 100").

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| DESIGN-003 | Implement freshness dot pulse animation on NewsfeedHeader | frontend-designer | 30 min |
| DESIGN-004 | Implement pressed/active state feedback on NewsfeedFilterBar pills | frontend-designer | 20 min |
| DESIGN-005 | Implement skeleton loading states for FindingCard and HeroCard | frontend-designer | 35 min |
| DESIGN-006 | Score dot color tiers and accessibility labels on NewsfeedFindingCard | frontend-designer | 20 min |

---

## Human Testing Gate

**Gate:** A reviewer can observe: the freshness dot pulsing on load, a visual press response when tapping filter pills, animated skeletons during data fetch, and color-tiered score dots that VoiceOver reads with a meaningful label.

---

## Source Coverage

- `.spec/prd/newsfeed-redesign/README.md` — sections S1, S2, S3, S4
- `components/whats-new/NewsfeedHeader.tsx` — freshness dot target (from Sprint 1)
- `components/whats-new/NewsfeedFilterBar.tsx` — pill press states (from Sprint 1)
- `components/whats-new/NewsfeedFindingCard.tsx` — score dot target (from Sprint 1)
- `components/whats-new/NewsfeedHeroCard.tsx` — skeleton variant (from Sprint 1)

---

## Blocks

- None (final sprint in this feature)
