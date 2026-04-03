# US-FB-006: Personalized Content Over Time

> Task ID: US-FB-006
> Type: FEATURE
> Priority: P1
> Estimate: 60 minutes
> Assignee: convex-implementer
> **Status: NOT DONE** - Blocked by US-FB-002 and US-FB-003

## CRITICAL CONSTRAINTS

### MUST
- Feed ranking improves after 10+ feedback signals
- Content relevance score increases measurably
- Cold start users get quality baseline content
- Personalization doesn't degrade performance
- Can reset personalization in Settings

### NEVER
- Create filter bubbles (diversification required)
- Block content completely (downrank only)
- Share personalization data between users
- Degrade performance for personalization

### STRICTLY
- Measure relevance improvement with feedback count
- Balance personalization with discovery
- Provide reset mechanism

## SPECIFICATION

**Objective:** Ensure personalization improves over time as users provide more feedback, while maintaining content diversity

**Success looks like:** After providing 10+ feedback signals, user sees more relevant content. Cold start users still get quality content. Filter bubbles are prevented.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User with 0 feedback | Report generated | Baseline ranking (quality score only) | Report generated successfully |
| 2 | User with 10+ feedback | Report generated | Content ranked with user preferences | Similarity to feedback higher |
| 3 | User with 50+ feedback | Report generated | Strong personalization but diversity maintained | Category distribution check |
| 4 | User resets personalization | Reset triggered | All feedback cleared, ranking returns to baseline | Feedback count = 0 |
| 5 | Cold start user | Report generated | Quality baseline content (no errors) | Report generated successfully |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/whatsNew/scoring.ts` (MODIFY) - improve personalization
- `convex/feedback/mutations.ts` (MODIFY) - add reset function
- `convex/feedback/analysis.ts` (MODIFY) - enhance preference extraction

### WRITE-PROHIBITED
- `components/**` - UI done
- Frontend changes - purely backend
- Breaking existing scoring

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-006 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.3 Feedback-Influenced Scoring

### Algorithm Enhancement

```typescript
// Enhanced personalization with feedback count weighting
function calculatePersonalizationStrength(feedbackCount: number): number {
  // Ramp up personalization gradually
  // 0-5 feedback: 10% personalization weight
  // 5-20 feedback: linear ramp to 50%
  // 20+ feedback: 50% personalization weight (capped)
  if (feedbackCount < 5) return 0.1
  if (feedbackCount < 20) return 0.1 + (feedbackCount - 5) * 0.027
  return 0.5
}

function scoreFinding(
  finding: Finding,
  userPreferences: UserPreferences,
  reportContext: Finding[],
  feedbackCount: number
): number {
  const baseScore = finding.qualityScore // From LLM
  const personalizationWeight = calculatePersonalizationStrength(feedbackCount)
  
  // User preference component
  const userMultiplier = calculateUserMultiplier(finding, userPreferences)
  
  // Diversity component
  const diversityPenalty = calculateDiversityPenalty(finding, reportContext)
  
  // Weighted combination
  const personalizedScore = baseScore * userMultiplier
  const finalScore = (baseScore * (1 - personalizationWeight)) + 
                     (personalizedScore * personalizationWeight)
  
  return finalScore * diversityPenalty
}

// Reset personalization
export const resetPersonalization = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Not authenticated')
    
    // Delete all user feedback
    const feedback = await ctx.db
      .query('userFeedback')
      .withIndex('by_user', q => q.eq('userId', userId))
      .collect()
    
    await Promise.all(
      feedback.map(f => ctx.db.delete(f._id))
    )
    
    return { deleted: feedback.length }
  }
})
```

### Metrics to Track

```typescript
// For observability
interface PersonalizationMetrics {
  feedbackCount: number
  personalizationWeight: number
  avgSimilarityToPositiveFeedback: number
  avgSimilarityToNegativeFeedback: number
  categoryDiversity: number // entropy of categories
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Immediate full personalization
const weight = feedbackCount > 0 ? 0.5 : 0 // Too aggressive

// ❌ WRONG: No diversity check
return baseScore * userMultiplier // Filter bubble

// ❌ WRONG: No reset option
// User stuck with bad feedback history
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Gradual personalization ramp
  - Diversity maintenance
  - Reset mechanism

## DEPENDENCIES

Depends on:
- US-FB-002 (Feedback Data Storage) - need feedback data
- US-FB-003 (Feedback-Influenced Scoring) - base scoring logic

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-006 acceptance criteria
2. `convex/whatsNew/scoring.ts` - existing scoring logic
3. Research on filter bubbles and diversification

## IMPLEMENTATION STATUS

**NOT DONE** - 2026-04-02

### ❌ Missing
- No gradual personalization ramp (feedback count → weight)
- No `resetPersonalization` mutation
- No personalization metrics tracking
- No cold start baseline verification

### Dependencies
- **Blocked by US-FB-002**: Requires feedback data storage
- **Blocked by US-FB-003**: Requires base scoring algorithm

### Next Steps
1. Complete US-FB-002 and US-FB-003 first
2. Implement gradual personalization strength curve
3. Add reset mechanism in backend
4. Verify cold start experience
5. Add observability metrics

---

## NOTES

The key is gradual personalization that ramps up as users provide more signal. Cold start users should still get quality content. The diversity penalty prevents the "echo chamber" effect where users only see content similar to what they've already liked.
