# US-FB-001: Feedback Buttons on Cards

**Status:** Open
**Assignee:** frontend-designer
**Priority:** P0
**Size:** M
**Depends on:** Epic 2 (Multimedia Card Stream)

---

## Mission

Add thumbs up/down feedback buttons to all card variants in the feed. Buttons must be subtle, accessible, and provide immediate visual feedback on tap.

---

## Context to Read First

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-001, US-FB-005 acceptance criteria
2. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.1 Feedback Buttons on Cards
3. `components/subscriptions/VideoCard.tsx` - existing card structure
4. `components/ui/icons/` - available icons
5. `brain/docs/REACT-RULES.md` - coding standards

---

## Steps

### Step 1: Create shared FeedbackButtons component

Create `components/subscriptions/FeedbackButtons.tsx`:

- Accept `findingId`, `currentFeedback`, `onFeedback` props
- Export `FeedbackType = 'positive' | 'negative' | null`
- Minimum 44x44 hitbox for accessibility
- Thumbs up/down icons with fill/stroke states
- Toggle behavior (tap again to undo)
- Semantic theme tokens for colors
- Accessibility labels: "More like this" / "Less like this"
- testID for E2E testing

### Step 2: Integrate into all card types

Modify each card component to include FeedbackButtons:
- `components/subscriptions/VideoCard.tsx`
- `components/subscriptions/ArticleCard.tsx`
- `components/subscriptions/SocialCard.tsx`
- `components/subscriptions/ReleaseCard.tsx`

Position buttons consistently (top-right or bottom-right).

### Step 3: Add tests

Create `components/subscriptions/__tests__/FeedbackButtons.test.tsx`:
- Test thumbs up toggle
- Test thumbs down toggle
- Test mutual exclusivity
- Test accessibility labels
- Test visual states

### Step 4: Verify visual design

- Check light mode appearance
- Check dark mode appearance
- Verify hitbox minimum 44x44
- Verify buttons don't distract from content

---

## Constraints

### MUST
- Add thumbs up/down buttons to all card variants
- Buttons are small and subtle (don't distract from content)
- Visual feedback on tap (filled icon, color change)
- Toggle behavior (tap again to undo)
- Minimum 44x44 hitbox for accessibility

### NEVER
- Make buttons distract from content
- Block card tap when tapping feedback
- Show full-screen toast on feedback
- Use confusing icons (thumbs up/down are clear)

### STRICTLY
- Position buttons consistently (top-right or bottom-right)
- Use semantic theme tokens for colors
- Include accessibility labels

### WRITE-ALLOWED
- `components/subscriptions/FeedbackButtons.tsx` (NEW)
- `components/subscriptions/VideoCard.tsx` (MODIFY)
- `components/subscriptions/ArticleCard.tsx` (MODIFY)
- `components/subscriptions/SocialCard.tsx` (MODIFY)
- `components/subscriptions/ReleaseCard.tsx` (MODIFY)

### WRITE-PROHIBITED
- `convex/**` - backend work in US-FB-002
- `app/**` - no route changes
- Card layout changes beyond button addition

---

## Completion Criteria

- [ ] FeedbackButtons component created with all props
- [ ] All 4 card types have feedback buttons integrated
- [ ] Tests pass (including new FeedbackButtons tests)
- [ ] Visual verification in both light and dark modes
- [ ] Accessibility inspector passes
- [ ] Code follows REACT-RULES.md standards

---

## References

- Code example in original task file: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-001.md`
