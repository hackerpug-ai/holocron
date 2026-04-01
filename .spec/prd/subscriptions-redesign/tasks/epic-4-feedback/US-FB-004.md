# US-FB-004: Feedback History Screen

> Task ID: US-FB-004
> Type: FEATURE
> Priority: P2
> Estimate: 90 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Show list of all feedback provided by user
- Each entry: content title, feedback type (thumbs up/down), timestamp
- Allow undoing individual feedback items
- Allow clearing all feedback
- Show total feedback count

### NEVER
- Show other users' feedback
- Delete finding content when undoing feedback
- Require confirmation for single undo (only for clear all)
- Block UI while loading

### STRICTLY
- Add to Settings as new section
- Follow existing Settings UI patterns
- Use existing feedback queries

## SPECIFICATION

**Objective:** Create a Feedback History screen accessible from Settings where users can view and manage their feedback

**Success looks like:** User opens Settings, taps "Feedback History", sees all their feedback, can undo items or clear all

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Settings screen | User scrolls | "Feedback History" section visible | `getByText('Feedback History')` exists |
| 2 | User taps Feedback History | Navigation fires | Feedback History screen opens | Screen renders |
| 3 | History screen with feedback | Screen loads | List of feedback items shown | `getByTestId('feedback-item-*')` exists |
| 4 | User taps undo on item | onPress fires | Feedback removed, list updates | Item removed from list |
| 5 | User taps "Clear All" | onPress fires | Confirmation dialog, then all feedback cleared | All items removed |
| 6 | Empty feedback history | Screen loads | "No feedback yet" message shown | `getByText('No feedback yet')` exists |

## GUARDRAILS

### WRITE-ALLOWED
- `screens/FeedbackHistoryScreen.tsx` (NEW)
- `screens/settings-screen.tsx` (MODIFY) - add feedback history section
- `app/(drawer)/settings/feedback.tsx` (NEW) - route for feedback history

### WRITE-PROHIBITED
- `convex/**` - queries/mutations done in US-FB-002
- `components/subscriptions/**` - card components done
- Drawer layout - settings already exists

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-004 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.4 Feedback History Screen

### Interaction Notes
- Use same list pattern as other Settings sections
- Swipe-to-delete on individual items (optional)
- Clear All shows confirmation: "Clear all feedback? This cannot be undone."
- Show thumbs up/down icon next to each item

### Code Pattern

```typescript
// screens/FeedbackHistoryScreen.tsx
import { View, ScrollView, Pressable, Alert } from 'react-native'
import { Text } from '@/components/ui/text'
import { ThumbsUp, ThumbsDown, Trash2 } from '@/components/ui/icons'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'

export function FeedbackHistoryScreen() {
  const feedback = useQuery(api.feedback.queries.getHistory, { limit: 100 })
  const undoFeedback = useMutation(api.feedback.mutations.undo)
  const clearAllFeedback = useMutation(api.feedback.mutations.clearAll)
  
  const handleUndo = async (findingId: string) => {
    await undoFeedback({ findingId })
  }
  
  const handleClearAll = () => {
    Alert.alert(
      'Clear All Feedback',
      'This will remove all your feedback history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: async () => {
            await clearAllFeedback({})
          }
        }
      ]
    )
  }
  
  if (!feedback) return <LoadingState />
  
  return (
    <ScrollView className="flex-1 bg-background" testID="feedback-history-screen">
      {/* Header */}
      <View className="p-4 border-b border-border">
        <Text variant="h1">Feedback History</Text>
        <Text variant="bodySmall" className="text-muted-foreground">
          {feedback.length} items
        </Text>
      </View>
      
      {/* Clear All */}
      {feedback.length > 0 && (
        <Pressable 
          onPress={handleClearAll}
          className="p-4 border-b border-border flex-row items-center gap-2"
          testID="clear-all-feedback"
        >
          <Trash2 size={20} className="text-destructive" />
          <Text variant="body" className="text-destructive">Clear All Feedback</Text>
        </Pressable>
      )}
      
      {/* Feedback List */}
      {feedback.length === 0 ? (
        <View className="p-8 items-center gap-2">
          <Text variant="h3" className="text-muted-foreground">No feedback yet</Text>
          <Text variant="bodySmall" className="text-muted-foreground text-center">
            Your thumbs up and thumbs down feedback will appear here
          </Text>
        </View>
      ) : (
        feedback.map((item) => (
          <Pressable
            key={item._id}
            testID={`feedback-item-${item.findingId}`}
            className="p-4 border-b border-border flex-row items-center justify-between"
          >
            <View className="flex-1 gap-1 mr-4">
              <Text variant="bodyMedium" numberOfLines={2}>
                {item.findingTitle || item.findingId}
              </Text>
              <View className="flex-row items-center gap-2">
                {item.sentiment === 'positive' ? (
                  <ThumbsUp size={14} className="text-primary" />
                ) : (
                  <ThumbsDown size={14} className="text-destructive" />
                )}
                <Text variant="labelSmall" className="text-muted-foreground">
                  {item.findingSource} • {formatRelativeTime(item.timestamp)}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => handleUndo(item.findingId)}
              className="p-2"
              testID={`undo-feedback-${item.findingId}`}
            >
              <Text variant="labelMedium" className="text-primary">Undo</Text>
            </Pressable>
          </Pressable>
        ))
      )}
    </ScrollView>
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

// In settings-screen.tsx, add section:
<View className="gap-3">
  <Pressable
    onPress={() => router.push('/settings/feedback')}
    className="rounded-2xl border border-border bg-card p-4 flex-row items-center justify-between"
    testID="settings-feedback-history"
  >
    <View className="flex-row items-center gap-3">
      <ThumbsUp size={20} className="text-muted-foreground" />
      <Text variant="default">Feedback History</Text>
    </View>
    <ChevronRight size={20} className="text-muted-foreground" />
  </Pressable>
</View>
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: No confirmation for clear all
await clearAllFeedback() // Accidental data loss

// ❌ WRONG: Loading state blocks UI
if (!feedback) return <Loading fullScreen /> // Should show skeleton
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Follow existing Settings patterns
  - Include testID for E2E
  - Handle empty state gracefully

## DEPENDENCIES

Depends on:
- US-FB-002 (Feedback Data Storage) - queries must exist

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-004 acceptance criteria
2. `screens/settings-screen.tsx` - existing settings patterns
3. `convex/feedback/queries.ts` - getHistory query

## NOTES

Keep this screen simple - it's a utility for users who want to review or clear their feedback. Not a primary feature, so don't over-engineer.
