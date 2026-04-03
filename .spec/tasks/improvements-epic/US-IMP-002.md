# US-IMP-002: Research Agent Specialists

> Task ID: US-IMP-002
> Type: FEATURE
> Priority: P2
> Estimate: 240 minutes
> Assignee: backend-implementer

## CRITICAL CONSTRAINTS

### MUST
- Design specialist system to be extensible for future specialist types
- Each specialist must generate specific report formats for their domain
- Maintain backward compatibility with general research agents

### NEVER
- Break existing research functionality when adding specialists
- Remove or alter the general research agent capability

### STRICTLY
- Specialist agents MUST produce different report formats than general knowledge
- Improvement coordination system must log all specialist-generated improvements

## SPECIFICATION

**Objective:** Add specialist research agents (product finder, service finder, improvement coordinator) that generate domain-specific reports and improvements.

**Success looks like:** Users can request specialized research (e.g., "Find me a laptop for $800") and receive product/service finder reports with specific formatting, plus automatic improvement logging for app/product suggestions.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User requests product/service research | Query matches specialist domain | Appropriate specialist agent handles the request | `npx convex run research/dispatcher:runPlanBasedResearch | jq '.specialist' | grep -q 'product_finder'` |
| 2 | Specialist agent completes research | Report is generated | Report uses specialist-specific format (not general knowledge format) | `npx convex run research/queries:get | jq '.reportType' | grep -q 'product_report'` |
| 3 | Specialist identifies product/service improvements | Agent runs | Improvements are automatically logged to improvements system | `npx convex run improvements/queries:list | jq '.[] | select(.source=="product_finder")' | wc -l | grep -q '[1-9]'` |
| 4 | General research query is submitted | Query doesn't match specialist domain | General research agent handles as before | `npx convex run research/actions:startSimpleResearch | jq '.agentType' | grep -q 'general'` |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Product specialist activates when product research query is submitted | AC-1 | `npx convex run research/actions:startProductResearch '{"query":"laptop under 800"}' | jq '.agentId' | grep -q 'product_finder'` | [ ] TRUE [ ] FALSE |
| 2 | Product report contains product-specific fields when generated | AC-2 | `npx convex run research/queries:get | jq '.reportFields' | grep -q 'price\\|rating\\|specifications'` | [ ] TRUE [ ] FALSE |
| 3 | Improvements are logged by specialist when products are researched | AC-3 | Check improvements list for items with source="product_finder" | [ ] TRUE [ ] FALSE |
| 4 | General research still works when non-specialist query is submitted | AC-4 | `npx convex run research/actions:startSimpleResearch '{"query":"history of Rome"}' | jq '.success' | grep -q 'true'` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/research/dispatcher.ts` (NEW) - Route queries to appropriate specialists
- `convex/research/specialists/` (NEW) - Specialist agent implementations
- `convex/research/internal.ts` (MODIFY) - Add specialist orchestration
- `convex/improvements/internal.ts` (MODIFY) - Log specialist improvements

### WRITE-PROHIBITED
- `convex/schema.ts` - Schema changes need separate approval
- Existing general research actions - Maintain backward compatibility

## DESIGN

### References
- Current research dispatcher in `convex/research/dispatcher.ts`
- Improvements system in `convex/improvements/actions.ts`
- Research session schema in `convex/schema.ts`

### Interaction Notes
- Specialist selection should be automatic based on query analysis
- Users should be able to explicitly request specialist type
- Consider hybrid: general + specialist for complex queries

### Code Pattern
From existing research actions:
```typescript
export const startSimpleResearch = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    // Pattern: spawn specialist based on query type
    const specialist = detectSpecialist(args.query);
    return specialist.execute(args.query);
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Hardcode specialist logic in dispatcher
if (query.includes("laptop")) {
  return productAgent();
}

// DO: Use a registry/pattern matching system
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Specialist reports must use consistent React components
- **brain/docs/backend-review**:
  - All specialist actions must handle errors gracefully

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/research/dispatcher.ts` - ALL
   Focus: Current research routing logic

2. `convex/research/actions.ts` - ALL
   Focus: How research agents are invoked

3. `convex/improvements/actions.ts` - Lines 1-50
   Focus: How improvements are created

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Start with product_finder specialist as proof of concept
- Service finder can be built on same pattern
- Improvement coordinator specialist should suggest app/product improvements
- Consider specialist confidence scores for borderline queries
- Each specialist should have distinct report template
