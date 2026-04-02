# US-FB-002: Feedback Data Storage

**Status:** Open
**Assignee:** convex-implementer
**Priority:** P0
**Size:** M
**Depends on:** US-FB-001

---

## Mission

Create backend storage for user feedback with CRUD operations. Store user feedback per finding, support undo, and provide queries for history and aggregation.

---

## Context to Read First

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-002 acceptance criteria
2. `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.2 Feedback Data Storage
3. `convex/schema.ts` - existing schema structure
4. Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-002.md`

---

## Steps

### Step 1: Add userFeedback table to schema

Modify `convex/schema.ts`:

```typescript
export const userFeedback = defineTable({
  userId: v.id('users'),
  findingId: v.string(), // Finding URL as unique identifier
  sentiment: v.union(v.literal('positive'), v.literal('negative')),
  timestamp: v.number(),
  findingTitle: v.optional(v.string()),
  findingSource: v.optional(v.string()),
})
  .index('by_user', ['userId'])
  .index('by_finding', ['findingId'])
  .index('by_user_finding', ['userId', 'findingId'])
```

### Step 2: Create feedback mutations

Create `convex/feedback/mutations.ts`:

- `record` - Store or update feedback (upsert by userId + findingId)
- `undo` - Delete feedback record
- Handle authentication via `getAuthUserId`

### Step 3: Create feedback queries

Create `convex/feedback/queries.ts`:

- `getHistory` - Get all feedback for a user, sorted by timestamp
- `getByFinding` - Get all feedback for a finding (aggregation)
- `getCurrent` - Get current user's feedback for a specific finding

### Step 4: Create tests

Create `convex/feedback/__tests__/mutations.test.ts`:
- Test record creates new feedback
- Test record updates existing feedback (no duplicates)
- Test undo deletes feedback
- Test queries return correct data

### Step 5: Run migration and verify

- `npx convex dev` to apply schema changes
- Verify indexes are created
- Test mutations in Convex dashboard

---

## Constraints

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

### WRITE-ALLOWED
- `convex/schema.ts` (MODIFY) - add userFeedback table
- `convex/feedback/mutations.ts` (NEW) - record, undo feedback
- `convex/feedback/queries.ts` (NEW) - get history, get by finding
- `convex/feedback/index.ts` (NEW) - exports

### WRITE-PROHIBITED
- `components/**` - UI work in US-FB-001
- `convex/whatsNew/**` - scoring integration in US-FB-003
- `app/**` - no route changes

---

## Completion Criteria

- [ ] Schema updated with userFeedback table and indexes
- [ ] `record` mutation stores/updates feedback
- [ ] `undo` mutation deletes feedback
- [ ] `getHistory` query returns user's feedback sorted
- [ ] `getByFinding` query returns finding's feedback
- [ ] Tests pass
- [ ] Convex dashboard verifies schema

---

## References

- Original task: `.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-002.md`
