/**
 * NotificationToast — in-app toast notification
 *
 * Displays a notification with a 3px left accent stripe, icon, title, and body.
 * Tapping navigates to the notification route and marks it as read.
 * Swipe left to dismiss.
 *
 * @example
 * ```tsx
 * <NotificationToast
 *   notification={{ _id, type, title, body, route, read, createdAt }}
 *   onDismiss={() => setVisible(false)}
 * />
 * ```
 */

import * as ToastPrimitive from '@rn-primitives/toast'
import { AlertCircle, Bell, CheckCircle2 } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useRouter } from 'expo-router'
import * as React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = 'research_complete' | 'research_failed' | 'system'

export interface NotificationData {
  _id: string
  type: NotificationType
  title: string
  body: string
  route: string
  read: boolean
  createdAt: number
}

export interface NotificationToastProps {
  /** The notification to display */
  notification: NotificationData
  /** Called when the toast should be hidden */
  onDismiss: () => void
  /** Called when the notification is tapped (after navigation) */
  onMarkRead?: (id: string) => void
  testID?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SWIPE_DISMISS_THRESHOLD = 80
const SWIPE_VELOCITY_THRESHOLD = 500

// ─── Icon per notification type ───────────────────────────────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  {
    Icon: typeof CheckCircle2
    iconClass: string
    accentClass: string
  }
> = {
  research_complete: {
    Icon: CheckCircle2,
    iconClass: 'text-success',
    accentClass: 'bg-success',
  },
  research_failed: {
    Icon: AlertCircle,
    iconClass: 'text-destructive',
    accentClass: 'bg-destructive',
  },
  system: {
    Icon: Bell,
    iconClass: 'text-primary',
    accentClass: 'bg-primary',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationToast({
  notification,
  onDismiss,
  onMarkRead,
  testID = 'notification-toast',
}: NotificationToastProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(true)

  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.system
  const { Icon, iconClass, accentClass } = config

  // ── Animation values ──
  const translateX = useSharedValue(0)
  const opacity = useSharedValue(1)

  const dismiss = React.useCallback(() => {
    opacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(onDismiss)()
    })
  }, [opacity, onDismiss])

  // ── Swipe-to-dismiss gesture (swipe left) ──
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      // Only allow swipe left (negative x)
      if (e.translationX < 0) {
        translateX.value = e.translationX
        opacity.value = 1 + e.translationX / (SWIPE_DISMISS_THRESHOLD * 2)
      }
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationX < -SWIPE_DISMISS_THRESHOLD ||
        e.velocityX < -SWIPE_VELOCITY_THRESHOLD
      if (shouldDismiss) {
        translateX.value = withTiming(-500, { duration: 200 })
        runOnJS(dismiss)()
      } else {
        translateX.value = withSpring(0)
        opacity.value = withSpring(1)
      }
    })

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }))

  // ── Tap handler ──
  const handleTap = React.useCallback(() => {
    onMarkRead?.(notification._id)
    const route = notification.route
    setOpen(false)
    onDismiss()
    // Navigate after dismiss to avoid crash from routing while toast is mounted
    setTimeout(() => {
      router.push(route as Parameters<typeof router.push>[0])
    }, 0)
  }, [notification._id, notification.route, onMarkRead, onDismiss, router])

  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={(val) => {
        if (!val) dismiss()
      }}
      type="foreground"
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Pressable
            testID={testID}
            onPress={handleTap}
            accessibilityRole="button"
            accessibilityLabel={`${notification.title}: ${notification.body}`}
          >
            {/* Card container: frosted bg-card/95, subtle border */}
            <View
              className={cn(
                'bg-card border-border flex-row overflow-hidden rounded-xl border',
                'shadow-black/10 shadow-md'
              )}
              style={styles.card}
            >
              {/* Left accent stripe — 3px, colored by type */}
              <View className={cn('w-[3px] self-stretch', accentClass)} />

              {/* Content row */}
              <View className="flex-1 flex-col gap-1 px-3 py-3">
                {/* Icon + title row */}
                <View className="flex-row items-center gap-2">
                  <Icon size={16} className={iconClass} />
                  <ToastPrimitive.Title asChild>
                    <Text
                      className="text-foreground flex-1 text-sm font-semibold leading-tight"
                      numberOfLines={1}
                    >
                      {notification.title}
                    </Text>
                  </ToastPrimitive.Title>
                </View>

                {/* Body */}
                <ToastPrimitive.Description asChild>
                  <Text
                    className="text-muted-foreground pl-6 text-xs leading-snug"
                    numberOfLines={2}
                  >
                    {notification.body}
                  </Text>
                </ToastPrimitive.Description>
              </View>

              {/* Close button */}
              <ToastPrimitive.Close asChild>
                <Pressable
                  onPress={dismiss}
                  testID={`${testID}-close`}
                  className="items-center justify-center px-3"
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                >
                  <Text className="text-muted-foreground text-lg leading-none">×</Text>
                </Pressable>
              </ToastPrimitive.Close>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </ToastPrimitive.Root>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
})
