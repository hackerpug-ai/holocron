# US-FB-003: Feedback-Influenced Scoring

**Status:** Open
**Assignee:** convex-implementer
**Priority:** P1
**Size:** L
**Depends on:** US-FB-002

---

## Mission

Implement feedback-driven personalization in the feed ranking algorithm. User feedback signals (thumbs up/down) influence content scoring to show more relevant content over time.

---

## Context to Read First

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-003 acceptance criteria
2. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.3 Feedback-Influenced Scoring
3. `convex/whatsNew/algorithms.ts` - existing scoring logic
4. Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-003.md`

---

## Steps

### Step 1: Create feedback aggregation query

Create `convex/feedback/aggregation.ts`:

- `getUserAffinityScores` - Calculate positive/negative ratios per source/category
- `getPersonalizationBoost` - Return boost factor for finding based on user's feedback history
- Cache results with TTL (5 minutes)

### Step 2: Modify feed scoring algorithm

Update `convex/whatsNew/algorithms.ts`:

- Incorporate personalization boost into base score
- Formula: `finalScore = baseScore * (1 + personalizationBoost)`
- `personalizationBoost` ranges from -0.3 (strong negative) to +0.3 (strong positive)
- Requires 10+ feedback signals for significant boost

### Step 3: Add A/B testing support

Create `convex/whatsNew/variants.ts`:

- Personalization enabled/disabled variant
- Track variant assignment per user
- Metrics: engagement rate, feedback rate, session duration

### Step 4: Create tests

Create `convex/feedback/__tests__/aggregation.test.ts`:
- Test affinity score calculation
- Test boost factor ranges
- Test minimum feedback threshold
- Test cache invalidation

### Step 5: Verify with sample data

- Create test users with varied feedback patterns
- Verify feed ordering changes appropriately
- Check performance (query times)

---

## Constraints

### MUST
- Use feedback signals to influence content ranking
- Require 10+ feedback signals for significant personalization
- Boost range limited to ±30%
- Maintain base score relevance

### NEVER
- Show only feedback-aligned content (keep diversity)
- Override all other scoring signals
- Personalize for anonymous users
- Store raw feedback in scoring cache

### STRICTLY
- Feedback aggregation query with proper indexes
- Personalization boost bounded to reasonable range
- Minimum threshold before applying personalization

### WRITE-ALLOWED
- `convex/feedback/aggregation.ts` (NEW) - affinity scores
- `convex/whatsNew/algorithms.ts` (MODIFY) - incorporate personalization
- `convex/whatsNew/variants.ts` (NEW) - A/B testing

### WRITE-PROHIBITED
- `components/**` - UI work in US-FB-001, US-FB-004
- `convex/feedback/mutations.ts` - storage complete in US-FB-002
- Changes to feed pagination logic

---

## Completion Criteria

- [ ] Affinity score query returns user's preferences
- [ ] Feed scoring incorporates personalization boost
- [ ] Boost factor bounded to ±30%
- [ ] Minimum 10 feedback threshold enforced
- [ ] Tests pass with varied feedback patterns
- [ ] Performance acceptable (<100ms per query)

---

## References

- Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-003.md`
