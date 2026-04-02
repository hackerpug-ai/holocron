# US-FB-004: Feedback History Screen

**Status:** Open
**Assignee:** frontend-designer
**Priority:** P2
**Size:** M
**Depends on:** US-FB-002

---

## Mission

Create a Settings screen where users can view their feedback history. Show all items they've given feedback on, with ability to undo feedback and see sentiment trends.

---

## Context to Read First

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-004 acceptance criteria
2. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.4 Feedback History Screen
3. `app/(tabs)/settings/index.tsx` - existing settings screen
4. Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-004.md`

---

## Steps

### Step 1: Create feedback history screen

Create `app/(tabs)/settings/feedback-history.tsx`:

- Fetch user's feedback history via `getHistory` query
- Group by sentiment (positive/negative sections)
- Show finding title, source, timestamp
- Undo button for each item
- Empty state when no feedback given

### Step 2: Add navigation entry

Update `app/(tabs)/settings/index.tsx`:

- Add "Feedback History" list item
- Navigate to feedback history screen
- Show feedback count badge

### Step 3: Create sentiment trend visualization

Create `components/subscriptions/FeedbackTrend.tsx`:

- Simple bar chart showing positive vs negative counts
- Percentage display
- Animated on load

### Step 4: Add tests

Create `app/(tabs)/settings/__tests__/feedback-history.test.tsx`:
- Test screen renders with data
- Test undo button removes item
- Test empty state displays
- Test navigation

### Step 5: Verify design

- Check light mode appearance
- Check dark mode appearance
- Verify undo flow works smoothly
- Check loading states

---

## Constraints

### MUST
- Show all user's feedback with finding details
- Allow undoing feedback from history
- Group by sentiment for clarity
- Show sentiment trend summary

### NEVER
- Show other users' feedback
- Allow editing feedback (only undo)
- Delete finding when feedback undone
- Show raw timestamps (use relative time)

### STRICTLY
- Use semantic theme tokens
- Follow Settings screen design patterns
- Accessible navigation and undo buttons

### WRITE-ALLOWED
- `app/(tabs)/settings/feedback-history.tsx` (NEW)
- `app/(tabs)/settings/index.tsx` (MODIFY) - add navigation
- `components/subscriptions/FeedbackTrend.tsx` (NEW)

### WRITE-PROHIBITED
- `convex/**` - backend complete in US-FB-002
- Other app routes

---

## Completion Criteria

- [ ] Feedback history screen displays all feedback
- [ ] Feedback grouped by sentiment
- [ ] Undo button works and updates list
- [ ] Sentiment trend visualization displays
- [ ] Empty state shows helpful message
- [ ] Tests pass
- [ ] Design verified in both themes

---

## References

- Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-004.md`
