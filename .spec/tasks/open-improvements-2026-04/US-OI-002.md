# US-OI-002: Fix agentPlans messageId Validation

> Task ID: US-OI-002
> Type: BUG
> Priority: P1
> Estimate: 60 minutes
> Assignee: general-purpose
> Status: ✅ Completed
> Completed: 2026-04-06T12:30:00Z
> Commit: 9cb62892ef893f40cd08db92e44d1d659248d704
> Reviewer: code-reviewer

## CRITICAL CONSTRAINTS

### MUST
- Read `convex/agentPlans/mutations.ts` and `convex/schema.ts` before modifying
- Ensure existing agent plans continue to work after the change
- Maintain the relationship between agentPlans and chatMessages

### NEVER
- Break existing agent plan creation flows
- Remove the messageId field entirely (it's used by queries and indexes)
- Migrate existing data unless absolutely necessary

### STRICTLY
- The fix must eliminate the unsafe empty string cast to `Id<"chatMessages">`
- Schema changes must be backward-compatible with existing data

## SPECIFICATION

**Objective:** Fix the agentPlans creation pattern that casts empty string `""` to `Id<"chatMessages">`, which violates schema validation and creates data integrity risk.

**Root Cause:** In `convex/agentPlans/mutations.ts` (line 59), the creation flow:
1. Inserts a plan with `messageId: "" as unknown as Id<"chatMessages">` (unsafe cast)
2. Creates a chatMessage referencing the plan
3. Back-patches the plan's messageId

If step 2 or 3 fails, the plan has an invalid messageId. The schema requires `v.id("chatMessages")` but receives an empty string.

**Success looks like:** Agent plans are created without unsafe type casts, and the messageId is always valid or explicitly optional.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Agent plan creation flow | Plan is created | No unsafe type cast (`as unknown as`) used for messageId | `grep -c 'as unknown as' convex/agentPlans/mutations.ts` returns 0 |
| 2 | Agent plan creation flow | Plan and message are created | messageId is a valid Id or explicitly optional | Read mutations.ts and verify messageId handling |
| 3 | Existing agent plans | Plans are queried | Existing plans with valid messageIds still resolve correctly | `npx convex run agentPlans/queries:list` returns results |
| 4 | Plan creation fails mid-flow | Step 2 or 3 throws | No orphaned plan with invalid messageId remains | Review error handling in creation flow |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | No `as unknown as` cast exists in agentPlans mutations for messageId | AC-1 | `grep -c 'as unknown as' convex/agentPlans/mutations.ts` returns 0 | [x] TRUE [ ] FALSE |
| 2 | Schema defines messageId as optional OR creation flow inserts with valid ID | AC-2 | `grep 'messageId' convex/schema.ts | grep -q 'optional'` OR review mutations.ts for valid ID-first pattern | [x] TRUE [ ] FALSE |
| 3 | TypeScript compiles without errors | AC-1-4 | `pnpm tsc --noEmit` exits 0 | [x] TRUE [ ] FALSE |
| 4 | All existing tests pass | AC-3 | `pnpm vitest run` exits 0 | [x] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/agentPlans/mutations.ts` (MODIFY) - Fix creation pattern
- `convex/schema.ts` (MODIFY) - Make messageId optional if needed
- `convex/agentPlans/queries.ts` (MODIFY) - Update queries if messageId becomes optional

### WRITE-PROHIBITED
- `convex/chatMessages/*` - Chat message handling should not change
- `app/*` - No UI changes needed

## DESIGN

### Recommended Approach: Make messageId optional in schema

```typescript
// convex/schema.ts - Change messageId to optional
messageId: v.optional(v.id("chatMessages")),

// convex/agentPlans/mutations.ts - Create without messageId, then patch
const planId = await ctx.db.insert("agentPlans", {
  // ...other fields, NO messageId
});

const messageId = await ctx.db.insert("chatMessages", {
  conversationId,
  cardData: { plan_id: planId },
  // ...
});

// Back-patch with valid ID
await ctx.db.patch(planId, { messageId });
```

### Alternative: Create message first
```typescript
// Create message first (with placeholder), then create plan with valid messageId
// Less preferred: message exists before plan, may confuse ordering
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**: N/A (backend only)
- **CLAUDE.md**: Commit automatically, run all pre-commit checks

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/agentPlans/mutations.ts` - ALL
   Focus: Plan creation flow, the unsafe cast at line ~59

2. `convex/schema.ts` - Search for "agentPlans" table definition
   Focus: messageId field type, indexes using messageId

3. `convex/agentPlans/queries.ts` - ALL
   Focus: How messageId is used in queries/filters
