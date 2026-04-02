# US-FB-005: Unobtrusive Feedback UX

**Status:** Open
**Assignee:** frontend-designer
**Priority:** P0
**Size:** S
**Depends on:** US-FB-001

---

## Mission

Refine the feedback button interaction to be subtle and non-intrusive. Ensure feedback doesn't disrupt the browsing flow and feels like a natural enhancement.

---

## Context to Read First

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-005 acceptance criteria
2. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.5 Unobtrusive Feedback UX
3. `components/subscriptions/FeedbackButtons.tsx` - created in US-FB-001
4. Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-005.md`

---

## Steps

### Step 1: Add subtle animation states

Update `components/subscriptions/FeedbackButtons.tsx`:

- Pressed state: slight scale down (0.95)
- Success state: quick flash then return to normal
- No haptic feedback (too disruptive)
- Smooth color transitions

### Step 2: Position buttons optimally

Update card components:

- Position in top-right corner (least intrusive)
- Maintain margin from card edge
- Don't overlap with other UI elements
- Consistent across all card types

### Step 3: Test interaction flow

- Tap feedback while scrolling → no scroll interruption
- Tap feedback then tap card → both actions work
- Rapid feedback taps → no UI glitches
- Undo feedback → smooth transition

### Step 4: Verify visual hierarchy

- Buttons don't compete with content
- Muted default state (outline icons)
- Active state clear but not distracting
- Works in both light and dark modes

---

## Constraints

### MUST
- Feedback buttons don't interrupt scrolling
- No disruptive haptic or audio feedback
- Visual feedback is subtle (quick flash)
- Undo operation is smooth

### NEVER
- Show toast/notification on feedback
- Require confirmation for feedback
- Block card tap when feedback button tapped
- Use jarring animations

### STRICTLY
- Buttons positioned consistently (top-right)
- Subtle default appearance
- Smooth state transitions

### WRITE-ALLOWED
- `components/subscriptions/FeedbackButtons.tsx` (MODIFY) - refine animations
- Card components (minor position adjustments)

### WRITE-PROHIBITED
- Layout changes to cards
- New components
- Backend changes

---

## Completion Criteria

- [ ] Feedback doesn't interrupt scroll
- [ ] Visual feedback is subtle (<200ms flash)
- [ ] Undo operation smooth
- [ ] No haptic/audio feedback
- [ ] Buttons positioned optimally
- [ ] Verified in both themes

---

## References

- Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-005.md`
