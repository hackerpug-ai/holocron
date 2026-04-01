# US-SUMM-001: Summary Generation Pipeline

> Task ID: US-SUMM-001
> Type: FEATURE
> Priority: P0
> Estimate: 120 minutes
> Assignee: convex-implementer

## CRITICAL CONSTRAINTS

### MUST
- Generate 2-3 line summary (80-150 characters) for each finding during report synthesis
- Capture key technical insight in summary
- Maintain neutral, factual tone (no marketing language)
- Handle failures gracefully (no summary = title only, not error)

### NEVER
- Hallucinate or add details not in source content
- Use marketing language or clickbait style
- Block report generation if summary fails
- Generate summaries longer than 150 characters

### STRICTLY
- Add summary generation to existing LLM synthesis flow
- Use existing LLM infrastructure (Claude via OpenRouter)
- Log summary generation success/failure for monitoring

## SPECIFICATION

**Objective:** Add AI summary generation to the What's New report synthesis pipeline, creating 2-3 line summaries for each finding

**Success looks like:** When a What's New report is generated, each finding includes a concise summary that captures the key insight without hallucination

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Report synthesis runs | LLM generates findings | Each finding has `summary` field (80-150 chars) | Query findings, check `summary` field exists and length |
| 2 | Source content available | Summary generated | Summary captures key insight accurately | Manual quality review of 10 random findings |
| 3 | LLM fails to generate summary | Synthesis continues | Finding created with `summary: undefined`, no error | Check report with failed summary exists |
| 4 | Summary > 150 chars | LLM returns long summary | Summary truncated to 150 chars with ellipsis | Test with long content |
| 5 | Source is video | Summary generated | Summary captures video topic without watching | Video findings have summaries |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/whatsNew/llm.ts` (MODIFY) - add summary generation
- `convex/whatsNew/actions.ts` (MODIFY) - integrate summary into synthesis flow
- `convex/whatsNew/index.ts` (MODIFY if needed) - export new functions

### WRITE-PROHIBITED
- `convex/schema.ts` - use existing findingsJson field for storage
- `components/**` - display in separate task
- `app/**` - no route changes

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-001, US-SUMM-003 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-3.1 Summary Generation Pipeline
- `convex/whatsNew/llm.ts` - existing LLM patterns

### Prompt Template

```
Summarize this content in 2-3 sentences (max 150 chars) for an AI engineer:

Title: {title}
Source: {source}
Content Preview: {preview}

Focus on: What is this? Why does it matter to an AI engineer? What can I do with this?

Respond with ONLY the summary text, no additional formatting.
```

### Code Pattern

Source: `convex/whatsNew/llm.ts:1-100`

```typescript
// Pattern: Add summary generation to existing synthesis
import { internalAction } from '../_generated/api'
import { internal } from '../_generated/api'

// Add to existing finding synthesis
async function generateFindingSummary(
  ctx: any,
  finding: { title: string; source: string; content?: string }
): Promise<string | undefined> {
  try {
    const prompt = `Summarize this content in 2-3 sentences (max 150 chars) for an AI engineer:

Title: ${finding.title}
Source: ${finding.source}
Content Preview: ${finding.content?.slice(0, 500) || 'N/A'}

Focus on: What is this? Why does it matter to an AI engineer? What can I do with this?

Respond with ONLY the summary text, no additional formatting.`

    const response = await ctx.runAction(internal.llm.chat, {
      prompt,
      maxTokens: 100,
    })

    const summary = response?.text?.trim()
    
    // Enforce length limit
    if (summary && summary.length > 150) {
      return summary.slice(0, 147) + '...'
    }
    
    return summary
  } catch (error) {
    // Log but don't fail - summary is optional
    console.error('[Summary Generation] Failed:', error)
    return undefined
  }
}

// Integrate into synthesis
export const synthesizeFindings = internalAction({
  handler: async (ctx, { findings }) => {
    const enrichedFindings = await Promise.all(
      findings.map(async (finding) => {
        const summary = await generateFindingSummary(ctx, finding)
        return { ...finding, summary }
      })
    )
    return enrichedFindings
  }
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Blocking on summary failure, no length limit
const summary = await generateSummary(finding) // Could throw
return { ...finding, summary } // Missing summary = broken report

// ❌ WRONG: Marketing language
const summary = "Amazing breakthrough that will revolutionize AI!" // Not factual
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Handle errors gracefully
  - Log for debugging
  - Don't block main flow

## DEPENDENCIES

No task dependencies (foundational backend work).

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-001, US-SUMM-003 acceptance criteria
2. `convex/whatsNew/llm.ts` - existing LLM patterns
3. `convex/whatsNew/actions.ts` - report synthesis flow

## NOTES

Summary generation is an enhancement, not a requirement. The system should work perfectly even if summaries fail. Focus on reliability over quality initially - quality will improve through prompt iteration and monitoring.
