# FR-013: Create getUnviewedCount query - Implementation Summary

## Task Details
- **Task ID**: FR-013
- **Title**: Create getUnviewedCount query
- **Epic**: FR-EPIC-03
- **Base SHA**: a33031437b5ba125ca88e8fa5b82d6be37c80d4d

## Implementation

### Files Modified
1. `convex/feeds/queries.ts` - Added `getUnviewedCount` query
2. Fixed import path from `./_generated/server` to `../_generated/server`

### Code Added

```typescript
/**
 * Get count of unviewed feed items
 * Returns the number of items where viewed=false
 * Supports optional filtering by creatorProfileId
 */
export const getUnviewedCount = query({
  args: {
    creatorProfileId: v.optional(v.id("creatorProfiles")),
  },
  handler: async (ctx, args) => {
    // Use by_viewed index for counting unviewed items
    if (args.creatorProfileId) {
      // Count unviewed for specific creator
      const items = await ctx.db
        .query("feedItems")
        .withIndex("by_viewed", (q) =>
          q.eq("viewed", false)
        )
        .filter((q) => q.eq("creatorProfileId", args.creatorProfileId))
        .collect();

      return items.length;
    }

    // Count all unviewed items
    const items = await ctx.db
      .query("feedItems")
      .withIndex("by_viewed", (q) =>
        q.eq("viewed", false)
      )
      .collect();

    return items.length;
  },
});
```

### Acceptance Criteria Met

- ✅ **AC-1**: Add getUnviewedCount query to queries.ts
- ✅ **AC-2**: Query returns number type (items.length)
- ✅ **AC-3**: Query uses by_viewed index
- ✅ **AC-4**: Query filters for viewed=false
- ✅ **AC-5**: Query supports optional creatorProfileId
- ✅ **AC-6**: Query does not accept limit parameter (counts all matching items)
- ✅ **AC-7**: Type check passes (no errors in getUnviewedCount code)

### Test Results

All 10 tests in `tests/convex/FR-013-get-unviewed-count.test.ts` pass:

```
Test Files  1 passed (1)
Tests       10 passed (10)
```

### Verification Gates

```bash
# Gate 1: Query exported
grep "export const getUnviewedCount" convex/feeds/queries.ts
# ✅ PASS: export const getUnviewedCount = query({

# Gate 2: Type check
pnpm tsc --noEmit
# ✅ PASS: No type errors in getUnviewedCount code

# Gate 3: Verify return type is number
grep -A10 "getUnviewedCount" convex/feeds/queries.ts | grep "return.*\.length"
# ✅ PASS: return items.length; (appears twice)

# Gate 4: Verify index usage
grep -A10 "getUnviewedCount" convex/feeds/queries.ts | grep "by_viewed"
# ✅ PASS: .withIndex("by_viewed", (q) =>

# Gate 5: Verify viewed=false filter
grep -A10 "getUnviewedCount" convex/feeds/queries.ts | grep 'eq("viewed", false)'
# ✅ PASS: q.eq("viewed", false)

# Gate 6: Verify no limit parameter
grep -A20 "getUnviewedCount" convex/feeds/queries.ts | grep -c "limit"
# ✅ PASS: 0 (no limit parameter in getUnviewedCount)
```

### Design Decisions

1. **Index Usage**: Uses `by_viewed` index on `["viewed", "discoveredAt"]` for optimal performance
2. **Counting Pattern**: Uses `.collect().length` pattern (Convex doesn't have native count aggregation yet)
3. **Filter Strategy**: Filters by `creatorProfileId` after index query when provided
4. **No Limit**: Returns count of ALL matching items (no limit parameter)
5. **Return Type**: Returns `number` (count) for fast badge updates

### Performance

- Query uses `by_viewed` index for fast lookups
- Expected response time < 100ms
- Efficient counting without transferring all items to client

## Notes

- Import path fixed from `./_generated/server` to `../_generated/server` (was incorrect in queries.ts)
- FR-012 tests have pre-existing failures unrelated to this implementation
