# US-FB-003: Feedback-Influenced Scoring

> Task ID: US-FB-003
> Type: FEATURE
> Priority: P1
> Estimate: 180 minutes
> Assignee: convex-implementer
> **Status: NOT DONE** - Blocked by US-FB-002 (no feedback data to analyze)

## CRITICAL CONSTRAINTS

### MUST
- Weight user feedback in quality scoring algorithm
- Positive feedback boosts similar content
- Negative feedback suppresses similar content
- Prevent filter bubbles (diversification algorithm)
- Re-rank feed based on feedback signals

### NEVER
- Create filter bubbles (too much similarity)
- Ignore feedback signals entirely
- Block content completely (downrank, don't hide)
- Share feedback data between users

### STRICTLY
- Update scoring during report synthesis
- Consider feedback from last 30 days
- Balance personalization with discovery

## SPECIFICATION

**Objective:** Use user feedback to influence content ranking in the feed, making it more personalized over time

**Success looks like:** User provides thumbs up/down feedback, subsequent reports show more/less similar content, but discovery of new topics continues

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User has 10+ positive feedback | Report generated | Similar content ranked higher | Query report, check order |
| 2 | User has 10+ negative feedback | Report generated | Similar content ranked lower | Query report, check order |
| 3 | Cold start user (no feedback) | Report generated | Baseline ranking (quality score only) | Report generated successfully |
| 4 | Diversification | Report generated | Content variety maintained (not all same topic) | Check category distribution |
| 5 | Feedback > 30 days old | Report generated | Old feedback weighted less | Time decay applied |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/whatsNew/llm.ts` (MODIFY) - update scoring prompt
- `convex/whatsNew/scoring.ts` (NEW or MODIFY) - feedback-aware scoring
- `convex/feedback/analysis.ts` (NEW) - extract user preferences from feedback

### WRITE-PROHIBITED
- `components/**` - UI work done
- `convex/schema.ts` - schema done in US-FB-002
- Frontend changes - purely backend logic

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-003, US-FB-006 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.3 Feedback-Influenced Scoring

### Algorithm

```
baseScore = qualityScore from LLM (0.0 - 1.0)
userMultiplier = calculateUserPreferenceMultiplier(finding, userFeedback)
diversityPenalty = calculateDiversityPenalty(finding, reportFindingsSoFar)
finalScore = baseScore * userMultiplier * diversityPenalty

// User preference multiplier
function calculateUserPreferenceMultiplier(finding, userFeedback):
  positiveFeedback = filter(userFeedback, sentiment == 'positive')
  negativeFeedback = filter(userFeedback, sentiment == 'negative')
  
  positiveSimilarity = avg(cosineSimilarity(finding, f) for f in positiveFeedback)
  negativeSimilarity = avg(cosineSimilarity(finding, f) for f in negativeFeedback)
  
  // Time decay: recent feedback weighted more
  positiveWeight = applyTimeDecay(positiveFeedback, halfLife=14days)
  negativeWeight = applyTimeDecay(negativeFeedback, halfLife=14days)
  
  multiplier = 1.0 + (positiveSimilarity * positiveWeight * 0.3) 
                     - (negativeSimilarity * negativeWeight * 0.3)
  
  return clamp(multiplier, 0.5, 1.5) // Don't over-amplify

// Diversity penalty prevents filter bubbles
function calculateDiversityPenalty(finding, reportFindingsSoFar):
  if (reportFindingsSoFar.length < 3) return 1.0
  
  similarityToRecent = avg(cosineSimilarity(finding, f) for f in reportFindingsSoFar[-3:])
  
  // Penalize if too similar to recent content
  if (similarityToRecent > 0.7):
    return 0.7 // 30% penalty
  
  return 1.0
```

### Code Pattern

```typescript
// convex/feedback/analysis.ts (NEW)
import { internalQuery } from '../_generated/server'
import { v } from 'convex/values'

// Get user's feedback-derived preferences
export const getUserPreferences = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    
    const feedback = await ctx.db
      .query('userFeedback')
      .withIndex('by_user', q => q.eq('userId', args.userId))
      .filter(q => q.gte(q.field('timestamp'), thirtyDaysAgo))
      .collect()
    
    // Extract preference signals
    const positiveSources = feedback
      .filter(f => f.sentiment === 'positive' && f.findingSource)
      .map(f => f.findingSource!)
    
    const negativeSources = feedback
      .filter(f => f.sentiment === 'negative' && f.findingSource)
      .map(f => f.findingSource!)
    
    return {
      positiveSources: countFrequency(positiveSources),
      negativeSources: countFrequency(negativeSources),
      totalFeedback: feedback.length,
    }
  }
})

function countFrequency(arr: string[]): Record<string, number> {
  return arr.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}

// convex/whatsNew/scoring.ts
export function calculateUserMultiplier(
  finding: Finding,
  preferences: UserPreferences
): number {
  let multiplier = 1.0
  
  // Source preference
  if (finding.source && preferences.positiveSources[finding.source]) {
    multiplier += 0.1 * Math.min(preferences.positiveSources[finding.source], 5)
  }
  if (finding.source && preferences.negativeSources[finding.source]) {
    multiplier -= 0.1 * Math.min(preferences.negativeSources[finding.source], 5)
  }
  
  // Clamp to prevent over-amplification
  return Math.max(0.5, Math.min(1.5, multiplier))
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Complete filtering (creates bubble)
if (negativeFeedback.includes(finding)) return null // Don't hide completely

// ❌ WRONG: No time decay
const allFeedback = await ctx.db.query('userFeedback').collect() // Includes ancient feedback
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use time decay for relevance
  - Implement diversification
  - Don't over-personalize

## DEPENDENCIES

Depends on:
- US-FB-002 (Feedback Data Storage) - need feedback data

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-003, US-FB-006 acceptance criteria
2. `convex/whatsNew/llm.ts` - existing scoring logic
3. `convex/feedback/queries.ts` - feedback access patterns

## IMPLEMENTATION STATUS

**NOT DONE** - 2026-04-02

### ❌ Missing
- No `convex/feedback/analysis.ts` exists
- No `convex/whatsNew/scoring.ts` exists
- No user preference extraction from feedback
- No personalization algorithm in report generation
- No diversity penalty implementation

### Dependencies
- **Blocked by US-FB-002**: Cannot implement scoring without feedback data storage

### Next Steps
1. Complete US-FB-002 first
2. Create preference extraction logic
3. Implement user multiplier calculation
4. Add diversity penalty to prevent filter bubbles
5. Integrate into report synthesis pipeline

---

## NOTES

Start with source-based preferences (simple). Can add embedding-based similarity later if needed. The key is balancing personalization with discovery - users should still see new content, not just variations of what they've liked.
