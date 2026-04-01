# US-FB-002: Feedback Data Storage

> Task ID: US-FB-002
> Type: FEATURE
> Priority: P0
> Estimate: 90 minutes
> Assignee: convex-implementer

## CRITICAL CONSTRAINTS

### MUST
- Store user feedback per finding (userId, findingId, sentiment, timestamp)
- Support positive and negative sentiment
- Allow undoing feedback (delete record)
- Query feedback history for a user
- Query feedback for a specific finding

### NEVER
- Store feedback without userId (anonymous not supported)
- Delete finding when feedback deleted (soft delete only)
- Allow duplicate feedback (one sentiment per finding per user)
- Expose feedback to other users (private data)

### STRICTLY
- Create new `userFeedback` table in schema
- Use Convex indexes for efficient queries
- Handle concurrent feedback gracefully

## SPECIFICATION

**Objective:** Create backend storage for user feedback with CRUD operations

**Success looks like:** User can submit feedback, undo feedback, and view their feedback history. Feedback is stored securely and queryable for personalization.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User submits feedback | Mutation called | Feedback stored with userId, findingId, sentiment, timestamp | Query returns stored feedback |
| 2 | User submits duplicate | Mutation called | Existing feedback updated (not duplicated) | Only one record per finding |
| 3 | User undoes feedback | Mutation called | Feedback record deleted | Query returns no feedback for finding |
| 4 | User views history | Query called | All user's feedback returned sorted by timestamp | Array of feedback records |
| 5 | Query by finding | Query called | All feedback for finding returned | Aggregated sentiment data |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/schema.ts` (MODIFY) - add userFeedback table
- `convex/feedback/mutations.ts` (NEW) - record, undo feedback
- `convex/feedback/queries.ts` (NEW) - get history, get by finding
- `convex/feedback/index.ts` (NEW) - exports

### WRITE-PROHIBITED
- `components/**` - UI work in US-FB-001
- `convex/whatsNew/**` - scoring integration in US-FB-003
- `app/**` - no route changes

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-002 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.2 Feedback Data Storage

### Schema

```typescript
// convex/schema.ts - add to existing schema
import { defineTable } from 'convex/server'

export const userFeedback = defineTable({
  userId: v.id('users'),
  findingId: v.string(), // Finding URL as unique identifier
  sentiment: v.union(v.literal('positive'), v.literal('negative')),
  timestamp: v.number(),
  // Optional: store finding metadata for quick access
  findingTitle: v.optional(v.string()),
  findingSource: v.optional(v.string()),
})
  .index('by_user', ['userId'])
  .index('by_finding', ['findingId'])
  .index('by_user_finding', ['userId', 'findingId']) // For uniqueness check
```

### Code Pattern

```typescript
// convex/feedback/mutations.ts
import { mutation } from '../_generated/server'
import { v } from 'convex/values'
import { getAuthUserId } from '../auth/util'

export const record = mutation({
  args: {
    findingId: v.string(),
    sentiment: v.union(v.literal('positive'), v.literal('negative')),
    findingTitle: v.optional(v.string()),
    findingSource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    
    // Check for existing feedback (upsert behavior)
    const existing = await ctx.db
      .query('userFeedback')
      .withIndex('by_user_finding', q => 
        q.eq('userId', userId).eq('findingId', args.findingId)
      )
      .first()
    
    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        sentiment: args.sentiment,
        timestamp: Date.now(),
      })
      return existing._id
    }
    
    // Create new
    return await ctx.db.insert('userFeedback', {
      userId,
      findingId: args.findingId,
      sentiment: args.sentiment,
      timestamp: Date.now(),
      findingTitle: args.findingTitle,
      findingSource: args.findingSource,
    })
  }
})

export const undo = mutation({
  args: { findingId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    
    const existing = await ctx.db
      .query('userFeedback')
      .withIndex('by_user_finding', q => 
        q.eq('userId', userId).eq('findingId', args.findingId)
      )
      .first()
    
    if (existing) {
      await ctx.db.delete(existing._id)
    }
  }
})

// convex/feedback/queries.ts
import { query } from '../_generated/server'
import { v } from 'convex/values'
import { getAuthUserId } from '../auth/util'

export const getHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    
    return await ctx.db
      .query('userFeedback')
      .withIndex('by_user', q => q.eq('userId', userId))
      .order('desc')
      .take(args.limit ?? 50)
  }
})

export const getByFinding = query({
  args: { findingId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    
    return await ctx.db
      .query('userFeedback')
      .withIndex('by_user_finding', q => 
        q.eq('userId', userId).eq('findingId', args.findingId)
      )
      .first()
  }
})

export const getBulkByFindings = query({
  args: { findingIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return {}
    
    const feedback = await Promise.all(
      args.findingIds.map(findingId =>
        ctx.db
          .query('userFeedback')
          .withIndex('by_user_finding', q => 
            q.eq('userId', userId).eq('findingId', findingId)
          )
          .first()
      )
    )
    
    // Return as map for easy lookup
    return Object.fromEntries(
      feedback
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .map(f => [f.findingId, f])
    )
  }
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Storing without user ID (anonymous)
await ctx.db.insert('userFeedback', { findingId, sentiment })

// ❌ WRONG: N+1 query pattern
const feedback = await ctx.db.query('userFeedback').collect()
return feedback.filter(f => f.findingId === args.findingId) // Slow!
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use indexes for efficient queries
  - Handle auth gracefully
  - Use upsert pattern to avoid duplicates

## DEPENDENCIES

Depends on:
- US-FB-001 (Feedback Buttons on Cards) - UI triggers mutations

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-002 acceptance criteria
2. `convex/schema.ts` - existing schema patterns
3. `convex/auth/util.ts` - getAuthUserId pattern

## NOTES

Use finding URL as the findingId (string) since findings are stored as JSON in the whatsNew table and don't have their own IDs. This allows us to track feedback across report regenerations.
