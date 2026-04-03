# US-REM-006: Add Navigation Change Tooltip

> Task ID: US-REM-006
> Type: FEATURE
> Priority: P1
> Estimate: 60 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Show tooltip only ONCE per user (first visit to What's New)
- Use AsyncStorage for persistence (track if shown)
- Dismissible with tap or button
- Follow semantic theme for styling
- Accessible with screen reader

### NEVER
- Show tooltip on every visit (must be one-time)
- Block UI with non-dismissible tooltip
- Hardcode "seen" state (must persist)
- Use complex animation (keep simple fade-in/out)

### STRICTLY
- Display on first visit to `/whats-new` only
- Store "seen" flag in AsyncStorage
- Dismiss on tap anywhere or dismiss button
- Keep message clear: "Subscriptions renamed to What's New"

## SPECIFICATION

**Objective:** Add a one-time tooltip explaining the navigation change from "Subscriptions" to "What's New".

**Success looks like:** First-time visitors see a helpful tooltip, returning visitors don't see it again, and users can dismiss it anytime.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User visits What's New for first time | Screen loads | Tooltip appears with explanation | Tooltip visible |
| 2 | User taps tooltip or "Got it" button | Dismiss action | Tooltip disappears, flag saved to AsyncStorage | Tooltip hidden, AsyncStorage updated |
| 3 | User visits What's New again (already seen) | Screen loads | Tooltip does NOT appear | Tooltip not visible |
| 4 | User clears app data and revisits | AsyncStorage empty | Tooltip appears again (fresh start) | Tooltip visible |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Tooltip displays on first visit to /whats-new when AsyncStorage key missing | AC-1 | Fresh app install test | [ ] TRUE [ ] FALSE |
| 2 | Tooltip hides and saves to AsyncStorage when user dismisses | AC-2 | AsyncStorage contains "seen": true | [ ] TRUE [ ] FALSE |
| 3 | Tooltip does NOT display on subsequent visits when AsyncStorage key exists | AC-3 | Navigate away and back | [ ] TRUE [ ] FALSE |
| 4 | Tooltip displays again after AsyncStorage cleared | AC-4 | Clear AsyncStorage and reload | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `components/whats-new/NavigationTooltip.tsx` (NEW)
- `app/(drawer)/whats-new/[reportId].tsx` (MODIFY - integrate tooltip)
- `lib/storage/navigation.ts` (NEW - AsyncStorage wrapper)

### WRITE-PROHIBITED
- `app/(drawer)/whats-new/index.tsx` - feed screen (if exists)
- Other screens - this is What's New specific
- Complex animation libraries - keep simple

## DESIGN

### References
- `screens/DrawerContent.tsx` - Current drawer with "What's New" label
- US-NAV-003 task - Original specification
- AsyncStorage docs - Persistence pattern

### Interaction Notes
- Fade in after 500ms delay (don't distract on load)
- Tap anywhere dismisses (large hit target)
- "Got it" button also dismisses
- Store flag as `whats_new_tooltip_seen: true`
- Keep tooltip brief (2-3 sentences max)

### Code Pattern

Source: AsyncStorage one-time flag pattern

```typescript
/**
 * NavigationTooltip - One-time tooltip for navigation change
 */
import { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet, Modal } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { X } from '@/components/ui/icons'

const STORAGE_KEY = 'whats_new_tooltip_seen'

export function NavigationTooltip() {
  const { colors, spacing } = useTheme()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check if tooltip was already seen
  useEffect(() => {
    async function checkSeen() {
      try {
        const seen = await AsyncStorage.getItem(STORAGE_KEY)
        if (!seen) {
          setVisible(true)
        }
      } catch (error) {
        console.error('Failed to check tooltip seen status', error)
        // Show tooltip if AsyncStorage fails (better to show than miss)
        setVisible(true)
      } finally {
        setLoading(false)
      }
    }
    checkSeen()
  }, [])

  const dismiss = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true')
      setVisible(false)
    } catch (error) {
      console.error('Failed to save tooltip seen status', error)
      // Hide anyway even if save fails
      setVisible(false)
    }
  }

  if (loading || !visible) {
    return null
  }

  return (
    <Modal visible transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={dismiss}>
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: 16,
              padding: spacing.lg,
              margin: spacing.lg,
            },
          ]}
        >
          {/* Close button */}
          <Pressable
            onPress={dismiss}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={20} color={colors.mutedForeground} />
          </Pressable>

          {/* Content */}
          <Text
            style={{ color: colors.foreground }}
            className="text-lg font-semibold mb-2"
          >
            What's New
          </Text>
          <Text
            style={{ color: colors.mutedForeground }}
            className="text-sm leading-relaxed mb-4"
          >
            Subscriptions has been renamed to "What's New" to better reflect its content. Your subscriptions and settings are unchanged.
          </Text>

          {/* Got it button */}
          <Pressable
            onPress={dismiss}
            style={[
              styles.button,
              { backgroundColor: colors.primary, borderRadius: 8 },
            ]}
          >
            <Text
              style={{ color: colors.primaryForeground }}
              className="text-sm font-semibold py-2 text-center"
            >
              Got it
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltip: {
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  button: {
    marginTop: 8,
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Shows every time
useEffect(() => {
  setVisible(true)
}, [])

// ❌ WRONG: No persistence
const dismiss = () => setVisible(false)
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use AsyncStorage for one-time flags
  - Handle AsyncStorage errors gracefully
  - Use Modal for overlay UI

## DEPENDENCIES

This task depends on:
- **US-REM-005** - Deep link redirects should be working first

## REQUIRED READING

1. `screens/DrawerContent.tsx` - Current navigation structure
2. AsyncStorage docs - Persistence patterns
3. US-NAV-003 task - Original specification

## NOTES

This completes Epic 1 (Navigation Restructuring). The drawer was already renamed to "What's New", and deep link redirects are implemented in US-REM-005. This tooltip adds the final piece: user communication about the change.

Keep it simple - don't over-engineer. A brief, dismissible tooltip is sufficient.
