# US-FB-006: Personalized Content Over Time

**Status:** Open
**Assignee:** convex-implementer
**Priority:** P1
**Size:** M
**Depends on:** US-FB-003

---

## Mission

Implement the "content improves over time" effect - as users give more feedback, the feed becomes more personalized. Track personalization metrics and show users their progress.

---

## Context to Read First

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-006 acceptance criteria
2. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.6 Personalized Content Over Time
3. `convex/feedback/aggregation.ts` - created in US-FB-003
4. Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-006.md`

---

## Steps

### Step 1: Create personalization progress query

Create `convex/feedback/progress.ts`:

- `getPersonalizationProgress` - Returns feedback count, progress percentage, estimated improvement
- Progress levels: 0-5 feedback (starting), 6-20 (learning), 21+ (personalized)
- Cache with 1-hour TTL

### Step 2: Add progress indicator to feed

Update feed query to include:

- Current personalization level
- Feedback count
- "Give more feedback to improve" prompt when <10 feedback

### Step 3: Create A/B metrics

Track personalization effectiveness:

- Engagement rate by feedback count
- Session duration by personalization level
- Feedback submission rate

### Step 4: Add tests

Create `convex/feedback/__tests__/progress.test.ts`:
- Test progress calculation
- Test level thresholds
- Test cache behavior

### Step 5: Verify with real usage

- Simulate user giving 20+ feedback
- Verify feed ordering changes
- Check progress updates correctly

---

## Constraints

### MUST
- Show personalization progress to users
- Track feedback count and improvement
- Provide encouragement to give more feedback
- Measure personalization effectiveness

### NEVER
- Share personalization level with others
- Show exact algorithm details
- Make users feel bad about low feedback
- Override user privacy settings

### STRICTLY
- Progress levels clearly defined
- Cached for performance
- Privacy-respecting

### WRITE-ALLOWED
- `convex/feedback/progress.ts` (NEW)
- `convex/whatsNew/queries.ts` (MODIFY) - include progress
- `convex/feedback/metrics.ts` (NEW) - A/B tracking

### WRITE-PROHIBITED
- UI changes (separate task if needed)
- Changes to feedback storage
- Changes to scoring algorithm

---

## Completion Criteria

- [ ] Progress query returns level and count
- [ ] Feed includes personalization progress
- [ ] Progress levels clearly defined
- [ ] A/B metrics tracked
- [ ] Tests pass
- [ ] Verified with simulated usage

---

## References

- Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-006.md`
