/**
 * NotificationBellButton — bell icon with animated red dot indicator
 *
 * Shows a bell icon that displays an animated red dot when new notifications
 * arrive. The dot auto-clears after 10 minutes. Tapping the bell clears the
 * dot immediately and calls onPress (to open the notification list sheet).
 *
 * @example
 * ```tsx
 * <NotificationBellButton onPress={() => setSheetVisible(true)} />
 * ```
 */

import { api } from '@/convex/_generated/api'
import { Bell } from '@/components/ui/icons'
import { useMutation, useQuery } from 'convex/react'
import * as React from 'react'
import { Pressable } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationBellButtonProps {
  onPress: () => void
  testID?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBellButton({ onPress, testID }: NotificationBellButtonProps) {
  const lastSeen = useQuery(api.notifications.queries.getLastSeen) ?? 0
  const hasNew = useQuery(api.notifications.queries.hasNewSince, { since: lastSeen })
  const updateLastSeen = useMutation(api.notifications.mutations.updateLastSeen)

  const [showDot, setShowDot] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const dotScale = useSharedValue(0)

  // When hasNew changes, manage dot visibility and 10-min auto-clear timer
  React.useEffect(() => {
    if (hasNew) {
      setShowDot(true)
      dotScale.value = withSpring(1, { damping: 12, stiffness: 200 })

      // Reset timer
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setShowDot(false)
        dotScale.value = withSpring(0)
        updateLastSeen().catch(() => {})
      }, DOT_TIMEOUT_MS)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasNew])

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
  }))

  const handlePress = () => {
    setShowDot(false)
    dotScale.value = withSpring(0)
    if (timerRef.current) clearTimeout(timerRef.current)
    updateLastSeen().catch(() => {})
    onPress()
  }

  return (
    <Pressable
      onPress={handlePress}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
      testID={testID ?? 'notification-bell-button'}
      accessibilityRole="button"
      accessibilityLabel={showDot ? 'Notifications, new items available' : 'Notifications'}
    >
      <Bell size={22} className="text-muted-foreground" />
      {showDot && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 8,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: 4,
            },
            dotStyle,
          ]}
          className="bg-destructive"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
    </Pressable>
  )
}
