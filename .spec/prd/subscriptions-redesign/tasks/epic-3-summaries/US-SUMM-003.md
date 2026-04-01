# US-SUMM-003: Summary Display on Cards

> Task ID: US-SUMM-003
> Type: FEATURE
> Priority: P0
> Estimate: 90 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Display summary below title on all card variants (2-3 lines max)
- Truncate long summaries with ellipsis
- "Read more" button when summary is truncated
- Tap "Read more" to expand, "Show less" to collapse
- Fallback to title-only if summary missing

### NEVER
- Show "No summary available" message (just use title)
- Truncate mid-word (break at word boundary)
- Block card rendering waiting for summary
- Show summary above title

### STRICTLY
- Use consistent truncation across all card types
- Store expansion state per-card (not global)
- Smooth expand/collapse animation

## SPECIFICATION

**Objective:** Display AI-generated summaries on feed cards with expand/collapse functionality

**Success looks like:** Each card shows a 2-3 line summary below the title, user can expand to read full summary, cards without summaries show title only

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Card with summary | Card renders | Summary displays below title (2-3 lines, truncated) | `getByTestId('card-summary')` exists |
| 2 | Summary > 150 chars | Card renders | Summary truncated with "..." and "Read more" button | `getByText('Read more')` exists |
| 3 | User taps "Read more" | onPress fires | Summary expands to show full text, "Show less" button appears | `getByText('Show less')` exists |
| 4 | User taps "Show less" | onPress fires | Summary collapses to 2-3 lines | Summary is truncated again |
| 5 | Card without summary | Card renders | Only title shows (no empty space, no error) | `queryByTestId('card-summary')` is null |
| 6 | Expanded card | User refreshes feed | Expansion state resets (default collapsed) | Cards start collapsed |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/VideoCard.tsx` (MODIFY) - add summary display
- `components/subscriptions/ArticleCard.tsx` (MODIFY) - add summary display
- `components/subscriptions/SocialCard.tsx` (MODIFY) - add summary display
- `components/subscriptions/ReleaseCard.tsx` (MODIFY) - add summary display
- `components/subscriptions/SummaryText.tsx` (NEW) - shared summary component

### WRITE-PROHIBITED
- `convex/**` - backend work in US-SUMM-001, US-SUMM-002
- `app/**` - no route changes
- `components/subscriptions/FeedCard.tsx` - router only, summary in individual cards

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-001, US-SUMM-002 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-3.3 Summary Display on Cards
- Epic 2 card components - existing card structure

### Interaction Notes
- Summary text should use `variant="bodySmall"` or `variant="bodyMedium"`
- "Read more" / "Show less" should be subtle (small text, muted color)
- Expansion animation should be smooth (LayoutAnimation or Reanimated)
- Track expansion state locally per card (not in global state)

### Code Pattern

```typescript
// components/subscriptions/SummaryText.tsx (NEW)
import { useState } from 'react'
import { Pressable, LayoutAnimation, Platform, UIManager } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface SummaryTextProps {
  summary?: string
  title: string // Fallback if no summary
  maxLines?: number
  maxLength?: number
  testID?: string
}

export function SummaryText({ 
  summary, 
  title, 
  maxLines = 3, 
  maxLength = 150,
  testID = 'card-summary' 
}: SummaryTextProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Fallback to title if no summary
  const displayText = summary ?? title
  const shouldTruncate = displayText.length > maxLength && !isExpanded
  
  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setIsExpanded(!isExpanded)
  }
  
  if (!summary) {
    // No summary available - just show title (already shown elsewhere, so skip)
    return null
  }
  
  return (
    <Pressable 
      onPress={shouldTruncate ? toggleExpand : undefined}
      className="gap-1"
      testID={testID}
    >
      <Text 
        variant="bodySmall" 
        className="text-muted-foreground"
        numberOfLines={isExpanded ? undefined : maxLines}
      >
        {shouldTruncate ? displayText.slice(0, maxLength) + '...' : displayText}
      </Text>
      {summary.length > maxLength && (
        <Text 
          variant="labelSmall" 
          className="text-primary"
          onPress={toggleExpand}
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </Text>
      )}
    </Pressable>
  )
}

// Usage in card component
// components/subscriptions/VideoCard.tsx
import { SummaryText } from './SummaryText'

export function VideoCard({ title, summary, ...props }: VideoCardProps) {
  return (
    <Pressable onPress={onPress} className="gap-2">
      {/* Thumbnail */}
      <View>...</View>
      
      {/* Metadata */}
      <View className="p-3 gap-1">
        <Text variant="titleMedium" numberOfLines={2}>{title}</Text>
        <SummaryText summary={summary} title={title} />
        <Text variant="labelSmall" className="text-muted-foreground">{source}</Text>
      </View>
    </Pressable>
  )
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Showing error message, no fallback
{summary ? <Text>{summary}</Text> : <Text>No summary available</Text>}

// ❌ WRONG: Global expansion state
const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set()) // Over-engineering

// ❌ WRONG: Breaking mid-word
displayText.slice(0, maxLength) // Could break "implementation" → "implementatio..."
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens (text-muted-foreground)
  - Include testID for E2E testing
  - Smooth animations with LayoutAnimation

## DEPENDENCIES

Depends on:
- US-SUMM-001 (Summary Generation Pipeline) - summaries must be generated
- US-SUMM-002 (Summary Storage & Retrieval) - summaries must be queryable
- Epic 2 (Multimedia Card Stream) - card components must exist

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-SUMM-001, US-SUMM-002 acceptance criteria
2. `components/subscriptions/VideoCard.tsx` - existing card structure
3. `components/subscriptions/ArticleCard.tsx` - existing card structure

## NOTES

Create a shared SummaryText component to avoid duplicating truncation logic across all card types. This component handles the expand/collapse state and animation. Individual cards just need to pass summary and title props.
