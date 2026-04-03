# US-REM-003: Integrate FeedbackButtons into SocialCard & ReleaseCard

> Task ID: US-REM-003
> Type: FEATURE
> Priority: P0
> Estimate: 45 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Apply exact same pattern as US-REM-002 (VideoCard integration)
- Use semantic theme tokens (no hardcoded colors)
- Include testID on all interactive elements
- Use Convex useQuery and useMutation for feedback data

### NEVER
- Deviate from VideoCard integration pattern
- Duplicate FeedbackButtons logic
- Modify FeedbackButtons component

### STRICTLY
- Follow VideoCard feedback integration exactly
- Place FeedbackButtons in card footer
- Map Convex "up"/"down" to FeedbackButtons "positive"/"negative"

## SPECIFICATION

**Objective:** Add feedback functionality to SocialCard and ReleaseCard using the same integration pattern as VideoCard.

**Success looks like:** Both card types display thumbs up/down buttons with working state management and Convex persistence.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | SocialCard with feedItemId prop | Component renders | FeedbackButtons visible in footer | `getByTestId('social-card-feedback')` exists |
| 2 | ReleaseCard with feedItemId prop | Component renders | FeedbackButtons visible in footer | `getByTestId('release-card-feedback')` exists |
| 3 | User taps feedback on SocialCard | onPress fires | Mutation called, state updates | `api.feeds.submitFeedback` called |
| 4 | User taps feedback on ReleaseCard | onPress fires | Mutation called, state updates | `api.feeds.submitFeedback` called |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | FeedbackButtons renders in SocialCard footer when feedItemId provided | AC-1 | Visual inspection | [ ] TRUE [ ] FALSE |
| 2 | FeedbackButtons renders in ReleaseCard footer when feedItemId provided | AC-2 | Visual inspection | [ ] TRUE [ ] FALSE |
| 3 | submitFeedback mutation called when user taps SocialCard feedback | AC-3 | Mutation invoked | [ ] TRUE [ ] FALSE |
| 4 | submitFeedback mutation called when user taps ReleaseCard feedback | AC-4 | Mutation invoked | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/SocialCard.tsx` (MODIFY)
- `components/subscriptions/ReleaseCard.tsx` (MODIFY)
- `components/subscriptions/SocialCard.stories.tsx` (MODIFY)
- `components/subscriptions/ReleaseCard.stories.tsx` (MODIFY)

### WRITE-PROHIBITED
- `components/subscriptions/FeedbackButtons.tsx` - use as-is
- `components/subscriptions/VideoCard.tsx` - already done in US-REM-002
- `convex/feeds/**` - backend already exists

## DESIGN

### References
- `components/subscriptions/VideoCard.tsx` - TEMPLATE: copy integration from here
- `components/subscriptions/SocialCard.tsx` - target file 1
- `components/subscriptions/ReleaseCard.tsx` - target file 2
- US-REM-002 task file - detailed pattern specification

### Interaction Notes
- Copy exact pattern from VideoCard integration
- Same positioning (footer, bottom-right)
- Same state management approach
- Same error handling

### Code Pattern

Source: US-REM-002 (VideoCard integration)

**Apply this exact pattern to both SocialCard and ReleaseCard:**

1. Add props to interface:
```typescript
feedItemId?: Id<'feedItems'>
currentFeedback?: 'up' | 'down' | null
onFeedback?: (type: 'up' | 'down' | null) => void
```

2. Add imports:
```typescript
import { FeedbackButtons } from './FeedbackButtons'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
```

3. Add state fetching (same as VideoCard)

4. Add handler (same as VideoCard)

5. Render in footer (same as VideoCard)

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Different implementation per card
// SocialCard uses one pattern, ReleaseCard uses another

// ✅ CORRECT: Exact same pattern across all cards
// Copy-paste from VideoCard, change only testID prefixes
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Consistent patterns across components
  - Use useQuery/useMutation for Convex data

## DEPENDENCIES

This task depends on:
- **US-REM-001** - getFeedItemFeedback query must exist
- **US-REM-002** - VideoCard integration pattern must be complete

## REQUIRED READING

1. `components/subscriptions/VideoCard.tsx` - Reference implementation
2. `US-REM-002.md` - VideoCard integration task (copy this pattern)
3. `components/subscriptions/SocialCard.tsx` - Target file
4. `components/subscriptions/ReleaseCard.tsx` - Target file

## NOTES

This task is simpler than US-REM-002 because the pattern is already established. Just copy the VideoCard integration to SocialCard and ReleaseCard, changing only testID prefixes.

Estimated time: 45 minutes (not 60) because pattern is known.
