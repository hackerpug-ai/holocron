# US-SUMM-004: Summary Quality Monitoring

> Task ID: US-SUMM-004
> Type: FEATURE
> Priority: P2
> Estimate: 60 minutes
> Assignee: convex-implementer

## CRITICAL CONSTRAINTS

### MUST
- Log summary generation success/failure rate
- Track summary length distribution
- Store sample summaries for manual review
- Flag low-quality summaries for review

### NEVER
- Block summary generation for monitoring
- Store PII in monitoring logs
- Create complex analytics dashboard (simple logging first)

### STRICTLY
- Use existing logging infrastructure
- Store metrics in Convex (simple counts)
- Review via Convex dashboard or simple query

## SPECIFICATION

**Objective:** Monitor summary generation quality to identify issues and improve prompts over time

**Success looks like:** Admin can query summary success rate, see length distribution, and flag poor summaries for review

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Summary generated | Generation completes | Success logged with length | Query logs, see success entry |
| 2 | Summary generation fails | Failure occurs | Failure logged with error | Query logs, see failure entry |
| 3 | 100 summaries generated | Admin queries metrics | Success rate and length distribution visible | Query returns stats |
| 4 | Summary flagged poor quality | Admin marks summary | Flag stored for review | Query flagged summaries |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/whatsNew/llm.ts` (MODIFY) - add logging
- `convex/whatsNew/quality.ts` (NEW) - quality monitoring functions
- `convex/whatsNew/index.ts` (MODIFY) - export quality functions

### WRITE-PROHIBITED
- `components/**` - no UI for this task
- `app/**` - no routes for this task
- Complex analytics dashboards - keep it simple

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-003 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-3.4 Summary Quality Monitoring

### Code Pattern

```typescript
// convex/whatsNew/quality.ts (NEW)
import { internalMutation, query } from '../_generated/server'
import { v } from 'convex/values'

// Log summary generation result
export const logSummaryGeneration = internalMutation({
  args: {
    findingId: v.string(),
    success: v.boolean(),
    summaryLength: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Store in a simple quality log table or use console.log for now
    console.log('[Summary Quality]', JSON.stringify({
      timestamp: Date.now(),
      findingId: args.findingId,
      success: args.success,
      summaryLength: args.summaryLength,
      error: args.error,
    }))
    
    // TODO: Store in quality_metrics table if needed for analytics
  }
})

// Get summary quality stats
export const getSummaryStats = query({
  handler: async (ctx) => {
    // Query recent reports and calculate stats
    const reports = await ctx.db
      .query('whatsNew')
      .order('desc')
      .take(10)
    
    let totalFindings = 0
    let withSummary = 0
    let lengthSum = 0
    
    for (const report of reports) {
      const findings = report.findingsJson as any[]
      totalFindings += findings.length
      for (const finding of findings) {
        if (finding.summary) {
          withSummary++
          lengthSum += finding.summary.length
        }
      }
    }
    
    return {
      totalFindings,
      withSummary,
      coverageRate: totalFindings > 0 ? (withSummary / totalFindings) * 100 : 0,
      avgLength: withSummary > 0 ? Math.round(lengthSum / withSummary) : 0,
    }
  }
})

// Flag summary for review
export const flagSummary = internalMutation({
  args: {
    findingId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // Log flagged summary for manual review
    console.log('[Summary Flagged]', JSON.stringify(args))
    // TODO: Store in flagged_summaries table if needed
  }
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Complex analytics from the start
await ctx.db.insert('analytics_events', { ... }) // Over-engineering

// ❌ WRONG: Blocking generation for monitoring
if (!await logQuality()) throw new Error('Logging failed') // Don't block
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Keep monitoring simple initially
  - Use console.log for basic logging
  - Don't block main flow for monitoring

## DEPENDENCIES

Depends on:
- US-SUMM-001 (Summary Generation Pipeline) - summaries must be generated to monitor

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-003 acceptance criteria
2. `convex/whatsNew/llm.ts` - where to add logging

## NOTES

Start simple with console.log and basic stats query. Can add proper analytics tables later if needed. The goal is visibility into summary quality without building a full analytics system.
