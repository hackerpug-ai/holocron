# US-SUMM-002: Summary Storage & Retrieval

> Task ID: US-SUMM-002
> Type: FEATURE
> Priority: P0
> Estimate: 60 minutes
> Assignee: convex-implementer

## CRITICAL CONSTRAINTS

### MUST
- Store summaries in existing `findingsJson` field (no schema changes)
- Include summary in findings query responses
- Handle missing summaries gracefully (backward compatibility)
- Support summary field on all finding types

### NEVER
- Create new database table for summaries
- Break existing findings queries
- Require summary field (it's optional)
- Migrate existing reports (they work without summaries)

### STRICTLY
- Use existing `whatsNew` table structure
- Update TypeScript types for Finding interface
- Maintain backward compatibility with old reports

## SPECIFICATION

**Objective:** Ensure summaries are stored with findings and retrieved correctly when querying reports

**Success looks like:** When a report with summaries is saved, the summaries are persisted. When querying findings, summaries are included in the response.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Report with summaries | Report saved to database | Summaries persisted in `findingsJson` | Query report, check `findingsJson[0].summary` exists |
| 2 | Query latest findings | Client requests findings | Response includes `summary` field | API response has `summary` in finding objects |
| 3 | Old report without summaries | Client requests findings | Findings return without `summary` (no error) | API handles missing `summary` gracefully |
| 4 | Finding without summary | Card renders | Card shows title only (no broken UI) | Visual verification |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/whatsNew/queries.ts` (MODIFY) - ensure summary in response
- `lib/types/whats-new.ts` (MODIFY if exists) - add summary to Finding type
- `convex/whatsNew/index.ts` (MODIFY if needed) - update exports

### WRITE-PROHIBITED
- `convex/schema.ts` - no schema changes needed
- `convex/_generated/dataModel.ts` - auto-generated, don't modify
- Frontend components - display in separate task

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-002, US-SUMM-004 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-3.2 Summary Storage & Retrieval

### Finding Type Extension

```typescript
// lib/types/whats-new.ts or inline in queries.ts
export interface Finding {
  title: string
  url: string
  source: string
  category: 'discovery' | 'release' | 'trend' | 'discussion'
  publishedAt?: string
  
  // NEW: AI-generated summary (optional for backward compatibility)
  summary?: string // 80-150 chars, may be undefined for old reports
  
  // Video fields
  thumbnailUrl?: string
  duration?: string
  
  // Article fields
  heroImageUrl?: string
  readTime?: string
  
  // Social fields
  authorAvatarUrl?: string
  authorName?: string
  authorHandle?: string
  likes?: number
  comments?: number
  
  // Release fields
  version?: string
  repositoryName?: string
  changelogUrl?: string
}
```

### Code Pattern

```typescript
// convex/whatsNew/queries.ts
export const getLatestReport = query({
  handler: async (ctx): Promise<ReportWithFindings | null> => {
    const report = await ctx.db
      .query('whatsNew')
      .order('desc')
      .first()
    
    if (!report) return null
    
    // Findings are stored in findingsJson, summary field already included
    // Just ensure we're returning it
    const findings = report.findingsJson as Finding[]
    
    return {
      ...report,
      findings, // Each finding may have summary: string | undefined
    }
  }
})

// Summary is optional - components should handle undefined
const displaySummary = finding.summary ?? finding.title // Fallback to title
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Requiring summary, breaking backward compat
interface Finding {
  summary: string // Required = breaks old reports
}

// ❌ WRONG: Separate table (over-engineering)
await ctx.db.insert('findingSummaries', { findingId, summary })
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use optional fields for backward compatibility
  - Don't over-engineer storage
  - Keep types accurate

## DEPENDENCIES

Depends on:
- US-SUMM-001 (Summary Generation Pipeline) - summaries must be generated before storage

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-002, US-SUMM-004 acceptance criteria
2. `convex/whatsNew/queries.ts` - existing query patterns
3. `convex/schema.ts` - verify whatsNew table structure

## NOTES

This task is mostly verification that existing storage works. The `findingsJson` field is a JSON blob that can hold any structure. The key is ensuring TypeScript types are accurate and queries return the summary field when present.
