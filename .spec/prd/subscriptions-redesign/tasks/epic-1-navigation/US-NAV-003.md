# US-NAV-003: Navigation Change Tooltip

> Task ID: US-NAV-003
> Type: FEATURE
> Priority: P1
> Estimate: 90 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Show tooltip on first visit after navigation update
- Tooltip explains: "Subscriptions moved to Settings. What's New is now your content feed."
- "Got it" button dismisses tooltip permanently
- Store dismissal state in Convex user preferences

### NEVER
- Show tooltip on every visit (must be one-time)
- Block navigation while tooltip is visible
- Show tooltip to users who never saw old navigation

### STRICTLY
- Follow existing tooltip/modal patterns
- Use semantic theme tokens
- Keep tooltip content concise

## SPECIFICATION

**Objective:** Create a one-time tooltip that informs users about the navigation restructuring

**Success looks like:** User opens app after update, sees tooltip explaining navigation change, taps "Got it", never sees tooltip again

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | First visit after update | What's New screen loads | Tooltip appears with explanation | `getByTestId('nav-change-tooltip')` exists |
| 2 | User taps "Got it" | onPress fires | Tooltip dismisses, state saved to Convex | `query userPreferences.tooltipDismissed` is true |
| 3 | User returns to app | What's New screen loads | Tooltip does NOT appear (already dismissed) | `queryByTestId('nav-change-tooltip')` is null |
| 4 | Tooltip visible | User taps outside | Tooltip remains (must use "Got it" button) | Tooltip still visible |
| 5 | Dark mode active | Tooltip renders | Colors use semantic theme | Visual verification |

## GUARDRAILS

### WRITE-ALLOWED
- `components/NavigationChangeTooltip.tsx` (NEW)
- `app/(drawer)/whats-new.tsx` (MODIFY) - integrate tooltip
- `convex/userPreferences/mutations.ts` (MODIFY) - add tooltip dismissal
- `convex/userPreferences/queries.ts` (MODIFY) - check tooltip status

### WRITE-PROHIBITED
- `app/(drawer)/_layout.tsx` - layout changes in other tasks
- Other navigation components
- `convex/schema.ts` - use existing userPreferences table

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-003 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-1.3 Navigation Change Tooltip

### Interaction Notes
- Tooltip should overlay near "What's New" title or drawer
- "Got it" button should be prominent
- Animation: fade in/out, slight scale
- Should not block interaction with feed (non-modal or easily dismissible)

### Code Pattern

```typescript
// Pattern: One-time tooltip with Convex persistence
import { View, Modal, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function NavigationChangeTooltip() {
  const { colors } = useTheme()
  const tooltipDismissed = useQuery(api.userPreferences.queries.getTooltipDismissed, { 
    tooltip: 'nav-change-2026-04' 
  })
  const dismissTooltip = useMutation(api.userPreferences.mutations.setTooltipDismissed)

  const handleDismiss = async () => {
    await dismissTooltip({ tooltip: 'nav-change-2026-04', dismissed: true })
  }

  if (tooltipDismissed === true) return null
  if (tooltipDismissed === undefined) return null // Loading

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      testID="nav-change-tooltip"
    >
      <View className="flex-1 bg-black/50 items-center justify-center p-6">
        <View 
          className="bg-card rounded-2xl p-6 gap-4 max-w-sm w-full"
          style={{ borderColor: colors.border, borderWidth: 1 }}
        >
          <Text variant="h2" className="text-foreground text-center">
            Navigation Updated
          </Text>
          <Text variant="body" className="text-muted-foreground text-center">
            Subscriptions moved to Settings. What's New is now your content feed.
          </Text>
          <Pressable
            onPress={handleDismiss}
            className="bg-primary rounded-xl py-3 px-6"
            testID="nav-tooltip-got-it"
          >
            <Text variant="bodyMedium" className="text-primary-foreground text-center font-semibold">
              Got it
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Using AsyncStorage (not synced), blocking modal
import AsyncStorage from '@react-native-async-storage/async-storage'
await AsyncStorage.setItem('tooltip_dismissed', 'true') // Not synced across devices!
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens
  - Include testID for E2E testing
  - Handle loading states gracefully

## DEPENDENCIES

Depends on:
- US-NAV-001 (Access What's New from Main Navigation) - requires What's New screen to exist

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-003 acceptance criteria
2. `convex/userPreferences/` - existing user preferences patterns
3. `components/` - check for existing tooltip/modal patterns

## NOTES

The tooltip key should include a date or version identifier (e.g., 'nav-change-2026-04') so that future navigation changes can have their own tooltips. Consider whether this should be a modal (blocks interaction) or a less intrusive overlay (like a banner or callout).
