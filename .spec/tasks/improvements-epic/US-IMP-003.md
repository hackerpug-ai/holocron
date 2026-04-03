# US-IMP-003: Sequential Research Context

> Task ID: US-IMP-003
> Type: FEATURE
> Priority: P1
> Estimate: 120 minutes
> Assignee: backend-implementer

## CRITICAL CONSTRAINTS

### MUST
- Pass previous research session context to sequential research iterations
- Maintain conversation history across research sessions
- Preserve context without bloating individual session storage

### NEVER
- Expose full conversation history to external APIs
- Store user PII in research context

### STRICTLY
- Context MUST include previous findings, questions asked, and user feedback
- Each iteration MUST reference prior context in its prompts

## SPECIFICATION

**Objective:** Enable sequential research agents to maintain context from previous chats and research sessions within a conversation.

**Success looks like:** When a user runs multiple research queries in sequence, each new query has access to previous findings and can build upon them, creating a coherent research narrative.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User runs research query | Query completes | Research session stores context for next query | `npx convex run research/queries:get | jq '.hasContext' | grep -q 'true'` |
| 2 | User runs second research query | Same conversation | Second query includes context from first | `npx convex run research/queries:list | jq '.[].contextFromPrevious' | grep -q '[a-z0-9]{24}'` |
| 3 | Research agent generates follow-up | Sequential iteration | Agent references previous findings in report | `npx convex run research/queries:get | jq '.content' | grep -q 'Based on previous'` |
| 4 | User starts new conversation | Fresh conversation | No context carried over from previous conversations | `npx convex run research/queries:get | jq '.contextFromPrevious | length' | grep -q '0'` |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Research session stores context summary when query completes | AC-1 | `npx convex run research/queries:get | jq '.contextSummary | length' | grep -q '[1-9]'` | [ ] TRUE [ ] FALSE |
| 2 | Sequential research query references previous session when executed | AC-2 | `npx convex run research/queries:list | jq '.[].previousSessionId | select(.!=null)' | wc -l | grep -q '[1-9]'` | [ ] TRUE [ ] FALSE |
| 3 | Research report mentions previous findings when sequential | AC-3 | Manual: Check report content for "As previously found" or similar | [ ] TRUE [ ] FALSE |
| 4 | New conversation starts with empty context when created | AC-4 | Create new conversation and check `researchSessions` for null context | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/research/actions.ts` (MODIFY) - Add context passing
- `convex/research/internal.ts` (MODIFY) - Update iteration creation logic
- `convex/conversations/queries.ts` (MODIFY) - Add context retrieval

### WRITE-PROHIBITED
- `convex/schema.ts` - No schema changes required (context fits in existing fields)
- External API calls - Never send full context to external APIs

## DESIGN

### References
- Current research session structure in `convex/schema.ts`
- Conversation management in `convex/conversations/`
- Research iteration creation in `convex/research/internal.ts`

### Interaction Notes
- Context should be summarized (not full previous session)
- Consider context window limits (don't pass unlimited context)
- Allow users to clear context if desired

### Code Pattern
From `convex/research/actions.ts`:
```typescript
export const startDeepResearch = action({
  args: { query: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    // Get previous sessions for context
    const previousSessions = await ctx.runQuery(
      api.research.queries.getByConversation,
      { conversationId: args.conversationId }
    );

    // Build context from previous sessions
    const context = buildContextSummary(previousSessions);

    // Pass context to new research
    return executeResearch(args.query, context);
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Pass full previous sessions
const context = JSON.stringify(previousSessions);

// DO: Summarize and filter relevant context
const context = extractRelevantFindings(previousSessions);
```

## CODING STANDARDS

- **brain/docs/backend-review**:
  - Context must be sanitized before storage
  - No sensitive data in context

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/research/actions.ts` - ALL
   Focus: How research sessions are created

2. `convex/research/queries.ts` - Lines 50-100
   Focus: Research session retrieval

3. `convex/conversations/queries.ts` - ALL
   Focus: Conversation-to-research relationship

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Context summary should be concise (max 500 tokens)
- Include: previous findings, user feedback, unresolved questions
- Consider timestamp relevance (context decay for old sessions)
- Test with 3-4 sequential research queries
