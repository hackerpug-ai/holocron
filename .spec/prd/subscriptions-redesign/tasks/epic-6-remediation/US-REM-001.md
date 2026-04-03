# US-REM-001: Add getFeedItemFeedback Query

> Task ID: US-REM-001
> Type: FEATURE
> Priority: P0
> Estimate: 30 minutes
> Assignee: convex-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow existing Convex query patterns in `convex/feeds/`
- Return `null` for `userFeedback` when no feedback exists
- Include proper TypeScript types for return value
- Handle missing feedItemId gracefully (return null)

### NEVER
- Create new schema fields (feedItems.userFeedback already exists)
- Modify existing submitFeedback mutation
- Add authentication checks (public query)

### STRICTLY
- Query name must be `getFeedItemFeedback`
- Must return `{ feedback: "up" | "down" | null, feedbackAt: number | null }`
- Keep under 30 lines of code

## SPECIFICATION

**Objective:** Add a public query to fetch current feedback state for a single feed item.

**Success looks like:** Cards can query their current feedback state to display thumbs up/down selection on initial render.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Feed item exists with "up" feedback | Query called with feedItemId | Returns `{ feedback: "up", feedbackAt: <timestamp> }` | Query returns feedback: "up" |
| 2 | Feed item exists with no feedback | Query called with feedItemId | Returns `{ feedback: null, feedbackAt: null }` | Query returns feedback: null |
| 3 | Feed item doesn't exist | Query called with invalid ID | Returns `null` | Query returns null |
| 4 | Query is called from frontend | useQuery hook | Data loads without errors | No TypeScript errors |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | getFeedItemFeedback returns "up" when feedItem has userFeedback="up" | AC-1 | `convex dev` + check query result | [ ] TRUE [ ] FALSE |
| 2 | getFeedItemFeedback returns null when feedItem has no userFeedback | AC-2 | `convex dev` + check query result | [ ] TRUE [ ] FALSE |
| 3 | getFeedItemFeedback returns null for non-existent feedItemId | AC-3 | `convex dev` + check query result | [ ] TRUE [ ] FALSE |
| 4 | Query exports from feeds/queries.ts without TypeScript errors | AC-4 | `pnpm tsc --noEmit` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/feeds/queries.ts` (MODIFY - add new query)
- `convex/feeds/index.ts` (MODIFY - export query)

### WRITE-PROHIBITED
- `convex/schema.ts` - no schema changes needed
- `convex/feeds/mutations.ts` - don't modify existing mutation
- `convex/feeds/validators.ts` - no new validators needed

## DESIGN

### References
- `convex/feeds/queries.ts` - existing query patterns
- `convex/schema.ts` lines 795-832 - feedItems schema with userFeedback field

### Interaction Notes
- Query is read-only, no side effects
- Returns null for missing items (no throw)
- Used by cards to initialize feedback button state

### Code Pattern

Source: `convex/feeds/queries.ts` existing query pattern

```typescript
import { query } from './_generated/server'
import { v } from 'convex/values'

export const getFeedItemFeedback = query({
  args: {
    feedItemId: v.id('feedItems'),
  },
  handler: async (ctx, { feedItemId }) => {
    const item = await ctx.db.get(feedItemId)
    if (!item) {
      return null
    }
    return {
      feedback: item.userFeedback ?? null,  // "up" | "down" | null
      feedbackAt: item.userFeedbackAt ?? null,
    }
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Throws error for missing item
if (!item) {
  throw new Error("Item not found")
}
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use v.id() validators for Convex IDs
  - Return null for missing data (don't throw)

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/feeds/queries.ts` - Existing query patterns
2. `convex/schema.ts` - feedItems schema

## NOTES

This query is the missing piece for feedback integration. The mutation (submitFeedback) already exists in `convex/feeds/mutations.ts`. This query completes the read side of the feedback system.
