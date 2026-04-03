# US-FB-001: Feedback Buttons on Cards

> Task ID: US-FB-001
> Type: FEATURE
> Priority: P0
> Estimate: 90 minutes
> Assignee: frontend-designer
> **Status: PARTIAL** - FeedbackButtons component exists but is NOT integrated into card components

## CRITICAL CONSTRAINTS

### MUST
- Add thumbs up/down buttons to all card variants
- Buttons are small and subtle (don't distract from content)
- Visual feedback on tap (filled icon, color change)
- Toggle behavior (tap again to undo)
- Minimum 44x44 hitbox for accessibility

### NEVER
- Make buttons distract from content
- Block card tap when tapping feedback
- Show full-screen toast on feedback
- Use confusing icons (thumbs up/down are clear)

### STRICTLY
- Position buttons consistently (top-right or bottom-right)
- Use semantic theme tokens for colors
- Include accessibility labels

## SPECIFICATION

**Objective:** Add thumbs up/down feedback buttons to all card variants in the feed

**Success looks like:** User sees subtle thumbs up/down buttons on each card, taps to provide feedback, sees visual confirmation, can tap again to undo

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Card renders | Component mounts | Thumbs up/down buttons visible | `getByTestId('feedback-thumbs-up')` exists |
| 2 | User taps thumbs up | onPress fires | Button fills (active state), feedback recorded | Visual verification, state check |
| 3 | User taps active thumbs up | onPress fires | Button un-fills (inactive), feedback removed | Visual verification |
| 4 | User taps thumbs down | onPress fires | Button fills, thumbs up un-fills if active | Only one active at a time |
| 5 | Dark mode active | Buttons render | Colors from semantic theme | Visual verification |
| 6 | Screen reader active | User focuses button | "More like this" / "Less like this" announced | Accessibility inspector |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/FeedbackButtons.tsx` (NEW) - shared feedback component
- `components/subscriptions/VideoCard.tsx` (MODIFY) - integrate feedback
- `components/subscriptions/ArticleCard.tsx` (MODIFY) - integrate feedback
- `components/subscriptions/SocialCard.tsx` (MODIFY) - integrate feedback
- `components/subscriptions/ReleaseCard.tsx` (MODIFY) - integrate feedback

### WRITE-PROHIBITED
- `convex/**` - backend work in US-FB-002
- `app/**` - no route changes
- Card layout changes beyond button addition

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-001, US-FB-005 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.1 Feedback Buttons on Cards

### Interaction Notes
- Buttons should appear on the right side of card (top or bottom)
- Default state: outline icons, muted color
- Active state: filled icons, primary/danger color
- Hover/focus: slight scale or opacity change
- Don't overlap with other UI elements

### Code Pattern

```typescript
// components/subscriptions/FeedbackButtons.tsx (NEW)
import { View, Pressable } from 'react-native'
import { ThumbsUp, ThumbsDown } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export type FeedbackType = 'positive' | 'negative' | null

interface FeedbackButtonsProps {
  findingId: string
  currentFeedback?: FeedbackType
  onFeedback: (type: FeedbackType) => void
  testID?: string
}

export function FeedbackButtons({ 
  findingId, 
  currentFeedback, 
  onFeedback,
  testID = 'feedback-buttons' 
}: FeedbackButtonsProps) {
  const handleThumbsUp = () => {
    onFeedback(currentFeedback === 'positive' ? null : 'positive')
  }
  
  const handleThumbsDown = () => {
    onFeedback(currentFeedback === 'negative' ? null : 'negative')
  }
  
  const isPositive = currentFeedback === 'positive'
  const isNegative = currentFeedback === 'negative'
  
  return (
    <View className="flex-row gap-1" testID={testID}>
      <Pressable
        testID="feedback-thumbs-up"
        onPress={handleThumbsUp}
        className={cn(
          'rounded-full p-2 min-h-[44px] min-w-[44px] items-center justify-center',
          'active:opacity-70'
        )}
        accessibilityLabel="More like this"
        accessibilityRole="button"
        accessibilityState={{ selected: isPositive }}
      >
        <ThumbsUp
          size={18}
          className={cn(
            isPositive ? 'text-primary' : 'text-muted-foreground'
          )}
          fill={isPositive ? 'currentColor' : 'none'}
        />
      </Pressable>
      
      <Pressable
        testID="feedback-thumbs-down"
        onPress={handleThumbsDown}
        className={cn(
          'rounded-full p-2 min-h-[44px] min-w-[44px] items-center justify-center',
          'active:opacity-70'
        )}
        accessibilityLabel="Less like this"
        accessibilityRole="button"
        accessibilityState={{ selected: isNegative }}
      >
        <ThumbsDown
          size={18}
          className={cn(
            isNegative ? 'text-destructive' : 'text-muted-foreground'
          )}
          fill={isNegative ? 'currentColor' : 'none'}
        />
      </Pressable>
    </View>
  )
}

// Usage in card component
import { FeedbackButtons } from './FeedbackButtons'

export function VideoCard({ finding, onFeedback, currentFeedback, ...props }: VideoCardProps) {
  return (
    <Pressable onPress={() => openContent(finding.url)} className="gap-2">
      {/* Thumbnail */}
      <FastImage ... />
      
      {/* Content + Feedback row */}
      <View className="flex-row justify-between items-start p-3">
        <View className="flex-1 gap-1">
          <Text variant="titleMedium" numberOfLines={2}>{finding.title}</Text>
          <Text variant="bodySmall" className="text-muted-foreground">{finding.source}</Text>
        </View>
        
        {/* Feedback buttons */}
        <FeedbackButtons
          findingId={finding.url}
          currentFeedback={currentFeedback}
          onFeedback={(type) => onFeedback(finding, type)}
        />
      </View>
    </Pressable>
  )
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Small hitbox, no accessibility
<TouchableOpacity onPress={handleFeedback} style={{ padding: 4 }}>
  <ThumbsUp size={16} />
</TouchableOpacity>

// ❌ WRONG: Blocking toast on feedback
Alert.alert('Thanks for your feedback!') // Disrupts flow
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Minimum 44x44 hitbox
  - Accessibility labels required
  - Semantic theme tokens
  - testID for E2E

## DEPENDENCIES

Depends on:
- Epic 2 (Multimedia Card Stream) - card components must exist

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-001, US-FB-005 acceptance criteria
2. `components/subscriptions/VideoCard.tsx` - existing card structure
3. `components/ui/icons/` - available icons

## IMPLEMENTATION STATUS

**PARTIAL** - 2026-04-02

### ✅ Completed
- `components/subscriptions/FeedbackButtons.tsx` exists with:
  - Toggle behavior (tap to select/deselect)
  - 44x44 minimum hitbox
  - Accessibility labels and hints
  - Theme-appropriate colors
  - Memoized version for performance

### ❌ Missing
- **NOT integrated into card components**:
  - `VideoCard.tsx` - no FeedbackButtons import
  - `SocialCard.tsx` - no FeedbackButtons import
  - `ReleaseCard.tsx` - no FeedbackButtons import
  - Other card types - no integration
- No onFeedback handlers in card components
- No connection to backend mutations

### Next Steps
1. Import FeedbackButtons into each card type
2. Add onFeedback prop handlers
3. Connect to Convex mutations (requires US-FB-002)
4. Add testID attributes for E2E testing

---

## NOTES

Create a shared FeedbackButtons component that can be integrated into all card types. The component manages its own visual state but calls back to parent for data persistence. Parent card handles the Convex mutation.
