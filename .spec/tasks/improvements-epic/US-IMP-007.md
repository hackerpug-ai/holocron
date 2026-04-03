# US-IMP-007: AI Feedback System for News

> Task ID: US-IMP-007
> Type: FEATURE
> Priority: P2
> Estimate: 180 minutes
> Assignee: backend-implementer

## CRITICAL CONSTRAINTS

### MUST
- Implement "more like this" and "less like this" feedback for What's New items
- Backend AI agent adjusts news suggestions based on feedback
- Feedback must persist across sessions

### NEVER
- Send user feedback to external APIs without anonymization
- Break existing What's New feed generation

### STRICTLY
- Feedback MUST influence future What's New curation
- Both positive and negative feedback must be tracked

## SPECIFICATION

**Objective:** Add "more like this / less like this" feedback buttons to What's New cards, with backend AI agent adjusting news suggestions accordingly.

**Success looks like:** Users can thumbs-up/thumbs-down What's New items, and the AI learns their preferences over time, showing more relevant news.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User views What's New card | Card renders | "More like this" and "Less like this" buttons visible | Check What's New card DOM for feedback buttons |
| 2 | User clicks feedback button | Button press | Feedback is recorded and persisted | `npx convex run feeds/queries:getRecentFeedback | jq '.[] | select(.type=="more_like")' | wc -l | grep -q '[1-9]'` |
| 3 | What's New feed refreshes | After feedback | Feed items adjust based on feedback history | `npx convex run feeds/queries:getFeed | jq '.[].score' | grep -q '[0-9]'` |
| 4 | User provides repeated feedback | Multiple sessions | AI suggestion accuracy improves over time | Compare feed relevance scores over time |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | What's New cards have feedback buttons when rendered | AC-1 | `Check card DOM for feedback button elements` | [ ] TRUE [ ] FALSE |
| 2 | Feedback is saved to database when user clicks button | AC-2 | `npx convex run feeds/queries:getRecentFeedback | jq 'length' | grep -q '[1-9]'` | [ ] TRUE [ ] FALSE |
| 3 | Feed items show relevance scores when fetched after feedback | AC-3 | `npx convex run feeds/queries:getFeed | jq '.[].relevanceScore' | grep -q '[0-9]'` | [ ] TRUE [ ] FALSE |
| 4 | Feed relevance increases with more feedback when comparing sessions | AC-4 | `Check feed item scores before/after feedback accumulation` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `components/feed/NewsCard.tsx` (MODIFY) - Add feedback buttons
- `convex/feeds/mutations.ts` (MODIFY) - Add submitFeedback function
- `convex/feeds/internal.ts` (MODIFY) - Add feedback processing
- `convex/feeds/ai_scoring.ts` (NEW or MODIFY) - AI suggestion logic

### WRITE-PROHIBITED
- `convex/schema.ts` - Schema changes need approval
- External APIs - Feedback processing should be internal

## DESIGN

### References
- Current NewsCard component (created in US-IMP-005)
- Feed queries in `convex/feeds/queries.ts`
- AI scoring in `convex/subscriptions/ai_scoring.ts`

### Interaction Notes
- Feedback buttons should be subtle (don't clutter card)
- Consider thumb icons or heart/ban icons
- Feedback should be instant (no loading state)
- Show visual feedback when button pressed (animation)

### Code Pattern
Feedback submission:
```typescript
export const submitFeedback = mutation({
  args: {
    feedItemId: v.id("feedItems"),
    feedbackType: v.union(v.literal("more_like"), v.literal("less_like")),
  },
  handler: async (ctx, args) => {
    const feedItem = await ctx.db.get(args.feedItemId);
    if (!feedItem) throw new Error("Feed item not found");

    await ctx.db.insert("feedFeedback", {
      feedItemId: args.feedItemId,
      type: args.feedbackType,
      timestamp: Date.now(),
      // Extract features for AI learning
      features: extractFeatures(feedItem),
    });

    // Trigger re-score for related content
    await ctx.scheduler.runAfter(0, api.feeds.ai_scoring.scoreContentRelevance);

    return { success: true };
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Ignore feedback
const feedback = await saveFeedback(args);
return feedback;

// DO: Act on feedback immediately
await saveFeedback(args);
await rescoreRelatedContent(feedItem.features);
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Feedback buttons need testID
  - Pressable with proper accessibility
- **brain/docs/THEME-RULES.md**:
  - Use semantic colors for feedback (success/danger)

## DEPENDENCIES

**Depends On:**
- US-IMP-005 (What's New redesign) - Needs NewsCard component from that task

## REQUIRED READING

1. `components/feed/NewsCard.tsx` - ALL
   Focus: Card component structure (created in US-IMP-005)

2. `convex/feeds/mutations.ts` - ALL
   Focus: Current feed mutation patterns

3. `convex/subscriptions/ai_scoring.ts` - ALL
   Focus: Existing AI scoring patterns

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Feature extraction: topics, sources, keywords from feed items
- Feedback should influence content scoring (not just filter)
- Consider "not interested" option to hide entire topics/sources
- AI should learn from both positive and negative feedback
- Test with 10+ feedback actions to verify learning effect
