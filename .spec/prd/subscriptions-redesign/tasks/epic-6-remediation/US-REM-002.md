# US-REM-002: Integrate FeedbackButtons into VideoCard

> Task ID: US-REM-002
> Type: FEATURE
> Priority: P0
> Estimate: 60 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Follow existing VideoCard structure and patterns
- Use semantic theme tokens (no hardcoded colors)
- Import FeedbackButtons from `components/subscriptions/FeedbackButtons`
- Use Convex useQuery and useMutation for feedback data
- Include testID on all interactive elements

### NEVER
- Hardcode feedback state (must come from Convex)
- Duplicate FeedbackButtons logic (use existing component)
- Modify FeedbackButtons component (use as-is)
- Block UI while feedback loads

### STRICTLY
- Place FeedbackButtons in card footer (bottom-right)
- Map Convex "up"/"down" to FeedbackButtons "positive"/"negative"
- Follow VideoCard styling patterns
- Keep changes minimal (add props, render FeedbackButtons)

## SPECIFICATION

**Objective:** Add feedback functionality to VideoCard by integrating FeedbackButtons component with Convex backend.

**Success looks like:** VideoCard displays thumbs up/down buttons, shows current feedback state, and updates when user taps.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | VideoCard with feedItemId prop | Component renders | FeedbackButtons visible in card footer | `getByTestId('video-card-feedback')` exists |
| 2 | User has previously liked video | Component loads | Thumbs up button filled/selected | `getByTestId('video-card-feedback-thumbs-up')` has selected state |
| 3 | User taps thumbs up | onPress fires | Mutation called, button state updates | `api.feeds.submitFeedback` called with "up" |
| 4 | User taps thumbs down | onPress fires | Mutation called, button state updates | `api.feeds.submitFeedback` called with "down" |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | FeedbackButtons renders in VideoCard footer when feedItemId prop provided | AC-1 | Visual inspection in Storybook | [ ] TRUE [ ] FALSE |
| 2 | Thumbs up displays as selected when currentFeedback="up" | AC-2 | `currentFeedback` prop passed correctly | [ ] TRUE [ ] FALSE |
| 3 | submitFeedback mutation called with "up" when user taps thumbs up | AC-3 | Mutation called in handler | [ ] TRUE [ ] FALSE |
| 4 | submitFeedback mutation called with "down" when user taps thumbs down | AC-4 | Mutation called in handler | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/VideoCard.tsx` (MODIFY - add feedback props and render)
- `components/subscriptions/VideoCard.stories.tsx` (MODIFY - add feedback story)

### WRITE-PROHIBITED
- `components/subscriptions/FeedbackButtons.tsx` - use as-is
- `convex/feeds/**` - backend already exists
- Other card files - separate task

## DESIGN

### References
- `components/subscriptions/VideoCard.tsx` - existing card structure
- `components/subscriptions/FeedbackButtons.tsx` - feedback component API
- `convex/feeds/queries.ts` - getFeedItemFeedback query (US-REM-001)
- `convex/feeds/mutations.ts` - submitFeedback mutation

### Interaction Notes
- FeedbackButtons positioned in metadata section below source/publishedAt
- Tap toggles selection (tap again to deselect)
- Optimistic update: show selection immediately, revert on error
- Map "up" → "positive", "down" → "negative"

### Code Pattern

Source: `components/subscriptions/VideoCard.tsx` integration pattern

```typescript
import { FeedbackButtons } from './FeedbackButtons'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

export interface VideoCardProps {
  // ... existing props
  /** Feed item ID for feedback functionality */
  feedItemId?: Id<'feedItems'>
  /** Optional feedback state (if already fetched) */
  currentFeedback?: 'up' | 'down' | null
  /** Optional feedback handler */
  onFeedback?: (type: 'up' | 'down' | null) => void
}

export function VideoCard({
  // ... existing props
  feedItemId,
  currentFeedback: propFeedback,
  onFeedback,
}: VideoCardProps) {
  const { colors, spacing } = useTheme()

  // Fetch feedback state if not provided
  const { data: fetchedFeedback } = useQuery(
    api.feeds.getFeedItemFeedback,
    feedItemId ? { feedItemId } : 'skip'
  )
  const currentFeedback = propFeedback ?? fetchedFeedback?.feedback ?? null

  const submitFeedback = useMutation(api.feeds.submitFeedback)

  const handleFeedback = (type: 'positive' | 'negative' | null) => {
    if (!feedItemId) return

    // Map FeedbackButtons type to Convex type
    const feedback = type === 'positive' ? 'up' : type === 'negative' ? 'down' : null

    // Call mutation
    submitFeedback({ feedItemId, feedback })

    // Call parent handler if provided
    onFeedback?.(feedback)
  }

  return (
    <Pressable ...>
      {/* ... existing card content ... */}

      {/* Feedback buttons in footer */}
      {feedItemId && (
        <View style={[styles.feedbackRow, { marginTop: spacing.sm }]}>
          <FeedbackButtons
            feedItemId={feedItemId}
            currentFeedback={
              currentFeedback === 'up' ? 'positive' :
              currentFeedback === 'down' ? 'negative' :
              null
            }
            onFeedback={handleFeedback}
            testID={`${testID}-feedback`}
          />
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // ... existing styles
  feedbackRow: {
    alignSelf: 'flex-end',
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Hardcoded feedback state
const [feedback, setFeedback] = useState(null)

// ❌ WRONG: No error handling
submitFeedback({ feedItemId, feedback })
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use useQuery/useMutation for Convex data
  - Handle loading/error states
  - Use semantic theme tokens

## DEPENDENCIES

This task depends on:
- **US-REM-001** - getFeedItemFeedback query must exist

## REQUIRED READING

1. `components/subscriptions/VideoCard.tsx` - Current card implementation
2. `components/subscriptions/FeedbackButtons.tsx` - Feedback component API
3. `brain/docs/REACT-RULES.md` - React patterns and hooks

## NOTES

This is the template for integrating FeedbackButtons into other cards. Once complete, US-REM-003 will apply the same pattern to SocialCard and ReleaseCard.
