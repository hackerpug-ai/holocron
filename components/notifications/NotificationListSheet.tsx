/**
 * NotificationListSheet — bottom sheet showing recent notifications grouped by date.
 *
 * - Slides up from the bottom with pan-to-dismiss gesture
 * - Groups items by "Today", "Yesterday", "Older"
 * - Unread items get bg-accent background
 * - Tap item to navigate + mark read
 * - "Mark all read" button in header
 *
 * Follows the same modal/animation pattern as ImprovementSubmitSheet.
 */

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Text } from '@/components/ui/text'
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Mic,
  Newspaper,
  Rss,
  Sparkles,
  X,
} from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { useMutation, useQuery } from 'convex/react'
import { useRouter } from 'expo-router'
import * as React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─── Animation constants ────────────────────────────────────────────────────

const TIMING_IN = { duration: 300, easing: Easing.out(Easing.cubic) }
const TIMING_OUT = { duration: 250, easing: Easing.in(Easing.cubic) }
const DISMISS_THRESHOLD = 80

// ─── Type config for notification icons ──────────────────────────────────────

type NotificationType =
  | 'research_complete'
  | 'research_failed'
  | 'audio_complete'
  | 'whats_new'
  | 'subscription_update'
  | 'assimilate_complete'
  | 'system'
  | 'feed_digest'

const TYPE_CONFIG: Record<
  NotificationType,
  {
    Icon: typeof CheckCircle2
    iconClass: string
  }
> = {
  research_complete: { Icon: CheckCircle2, iconClass: 'text-success' },
  research_failed: { Icon: AlertCircle, iconClass: 'text-destructive' },
  audio_complete: { Icon: Mic, iconClass: 'text-primary' },
  whats_new: { Icon: Sparkles, iconClass: 'text-warning' },
  subscription_update: { Icon: Rss, iconClass: 'text-primary' },
  assimilate_complete: { Icon: CheckCircle2, iconClass: 'text-success' },
  system: { Icon: Bell, iconClass: 'text-primary' },
  feed_digest: { Icon: Newspaper, iconClass: 'text-primary' },
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotificationListSheetProps {
  visible: boolean
  onClose: () => void
  testID?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateGroup(timestamp: number): string {
  const now = new Date()

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000

  if (timestamp >= todayStart) return 'Today'
  if (timestamp >= yesterdayStart) return 'Yesterday'
  return 'Older'
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface GroupedNotification {
  _id: string
  type: string
  title: string
  body: string
  route: string
  read: boolean
  createdAt: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NotificationListSheet({
  visible,
  onClose,
  testID = 'notification-list-sheet',
}: NotificationListSheetProps) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const router = useRouter()

  // ── Convex data ──
  const notifications = useQuery(api.notifications.queries.listRecent, { limit: 20 })
  const markRead = useMutation(api.notifications.mutations.markRead)
  const markAllRead = useMutation(api.notifications.mutations.markAllRead)

  // ── Animation shared values ──
  const translateY = useSharedValue(600)
  const backdropOpacity = useSharedValue(0)

  React.useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_IN)
      backdropOpacity.value = withTiming(1, TIMING_IN)
    } else {
      translateY.value = withTiming(600, TIMING_OUT)
      backdropOpacity.value = withTiming(0, TIMING_OUT)
    }
  }, [visible, backdropOpacity, translateY])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(translateY.value, 0) }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const dismiss = () => {
    translateY.value = withTiming(600, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    setTimeout(onClose, 250)
  }

  // ── Pan gesture ──
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(600, TIMING_OUT)
        backdropOpacity.value = withTiming(0, TIMING_OUT)
        runOnJS(onClose)()
      } else {
        translateY.value = withTiming(0, TIMING_IN)
      }
    })

  // ── Handlers ──
  const handleItemPress = (item: GroupedNotification) => {
    if (!item.read) {
      markRead({ id: item._id as Id<'notifications'> }).catch(() => {})
    }
    // Close modal first, navigate after animation completes to avoid crash
    translateY.value = withTiming(600, TIMING_OUT)
    backdropOpacity.value = withTiming(0, TIMING_OUT)
    setTimeout(() => {
      onClose()
      router.push(item.route as Parameters<typeof router.push>[0])
    }, 250)
  }

  const handleMarkAllRead = () => {
    markAllRead().catch(() => {})
  }

  // ── Group notifications ──
  const groups = React.useMemo(() => {
    if (!notifications) return []
    const groupMap = new Map<string, GroupedNotification[]>()
    const order = ['Today', 'Yesterday', 'Older']

    for (const n of notifications) {
      const group = getDateGroup(n.createdAt)
      if (!groupMap.has(group)) groupMap.set(group, [])
      groupMap.get(group)!.push(n as GroupedNotification)
    }

    return order
      .filter((g) => groupMap.has(g))
      .map((g) => ({ label: g, items: groupMap.get(g)! }))
  }, [notifications])

  const hasUnread = notifications?.some((n) => !n.read) ?? false

  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={dismiss}
      testID={testID}
    >
      <GestureHandlerRootView style={styles.flex}>
        {/* Backdrop */}
        <Pressable
          onPress={dismiss}
          testID={`${testID}-backdrop`}
          style={styles.flex}
        >
          <Animated.View style={[backdropStyle, styles.flex, styles.backdrop]} />
        </Pressable>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              sheetStyle,
              styles.sheet,
              { paddingBottom: insets.bottom, backgroundColor: colors.card },
            ]}
          >
            {/* Drag handle */}
            <View style={styles.handleRow}>
              <View
                style={[styles.handle, { backgroundColor: colors.mutedForeground + '4D' }]}
              />
            </View>

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text className="text-foreground text-base font-semibold">
                Notifications
              </Text>
              <View className="flex-row items-center gap-2">
                {hasUnread && (
                  <Pressable
                    onPress={handleMarkAllRead}
                    testID={`${testID}-mark-all-read`}
                    className="rounded-md px-2 py-1 active:bg-muted"
                    accessibilityRole="button"
                    accessibilityLabel="Mark all as read"
                  >
                    <Text className="text-primary text-xs font-medium">Mark all read</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={dismiss}
                  style={styles.iconButton}
                  className="bg-muted rounded-full"
                  testID={`${testID}-close`}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={18} className="text-muted-foreground" />
                </Pressable>
              </View>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.bodyContent}
              testID={`${testID}-scroll`}
            >
              {(!notifications || notifications.length === 0) && (
                <View style={styles.emptyState}>
                  <Bell size={32} className="text-muted-foreground" />
                  <Text className="text-muted-foreground mt-3 text-sm">
                    No notifications yet
                  </Text>
                </View>
              )}

              {groups.map((group) => (
                <View key={group.label}>
                  {/* Group label */}
                  <Text className="text-muted-foreground mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide">
                    {group.label}
                  </Text>

                  {group.items.map((item) => {
                    const config =
                      TYPE_CONFIG[item.type as NotificationType] ?? TYPE_CONFIG.system
                    const { Icon, iconClass } = config

                    return (
                      <Pressable
                        key={item._id}
                        onPress={() => handleItemPress(item)}
                        testID={`${testID}-item-${item._id}`}
                        className={`flex-row items-start gap-3 rounded-lg px-3 py-3 active:opacity-80 ${
                          !item.read ? 'bg-accent' : ''
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title}: ${item.body}`}
                      >
                        <View className="mt-0.5">
                          <Icon size={18} className={iconClass} />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center justify-between">
                            <Text
                              className="text-foreground flex-1 text-sm font-semibold"
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>
                            <Text className="text-muted-foreground ml-2 text-xs">
                              {formatRelativeTime(item.createdAt)}
                            </Text>
                          </View>
                          <Text
                            className="text-muted-foreground mt-0.5 text-xs leading-snug"
                            numberOfLines={2}
                          >
                            {item.body}
                          </Text>
                        </View>
                        {!item.read && (
                          <View
                            className="bg-primary mt-2 h-2 w-2 rounded-full"
                            accessibilityElementsHidden
                          />
                        )}
                      </Pressable>
                    )
                  })}
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    maxHeight: '75%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
})
