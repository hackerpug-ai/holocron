import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { getWhatsNewTooltipSeen, setWhatsNewTooltipSeen } from '@/lib/storage/navigation'
import { Text } from '@/components/ui/text'
import { X } from '@/components/ui/icons'

/**
 * NavigationTooltip - One-time tooltip for navigation change
 *
 * Displays on first visit to What's New, explaining the rename from "Subscriptions".
 * Uses AsyncStorage to track whether the user has seen it.
 *
 * Features:
 * - Shows only once per user (tracked in AsyncStorage)
 * - Dismissible by tapping anywhere or the "Got it" button
 * - Accessible with screen reader
 * - Follows semantic theme for styling
 */
export function NavigationTooltip() {
  const { colors, spacing, radius } = useTheme()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check if tooltip was already seen on mount
  useEffect(() => {
    async function checkSeen() {
      try {
        const seen = await getWhatsNewTooltipSeen()
        if (!seen) {
          // Show tooltip after a short delay (don't distract on load)
          const delayTimer = setTimeout(() => {
            setVisible(true)
          }, 500)
          return () => clearTimeout(delayTimer)
        }
      } catch (error) {
        console.error('Failed to check tooltip seen status', error)
        // Show tooltip if AsyncStorage fails (better to show than miss)
        const delayTimer = setTimeout(() => {
          setVisible(true)
        }, 500)
        return () => clearTimeout(delayTimer)
      } finally {
        setLoading(false)
      }
    }
    checkSeen()
  }, [])

  const handleDismiss = async () => {
    try {
      await setWhatsNewTooltipSeen()
    } catch (error) {
      console.error('Failed to save tooltip seen status', error)
      // Hide anyway even if save fails
    } finally {
      setVisible(false)
    }
  }

  if (loading || !visible) {
    return null
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      testID="navigation-tooltip-modal"
    >
      <Pressable
        style={styles.overlay}
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tooltip"
      >
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radius['2xl'],
              padding: spacing.xl,
              margin: spacing.xl,
              maxWidth: 320,
              shadowColor: colors.shadow,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
            },
          ]}
          testID="navigation-tooltip-content"
        >
          {/* Close button */}
          <Pressable
            onPress={handleDismiss}
            style={styles.closeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="navigation-tooltip-close"
          >
            <X size={20} color={colors.mutedForeground} />
          </Pressable>

          {/* Content */}
          <Text
            style={{
              color: colors.foreground,
              fontSize: typography.h4.fontSize,
              fontWeight: typography.h4.fontWeight,
              marginBottom: spacing.sm,
            }}
            testID="navigation-tooltip-title"
          >
            What's New
          </Text>

          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              marginBottom: spacing.lg,
            }}
            testID="navigation-tooltip-message"
          >
            Subscriptions has been renamed to "What's New" to better reflect its content. Your subscriptions and settings are unchanged.
          </Text>

          {/* Got it button */}
          <Pressable
            onPress={handleDismiss}
            style={[
              styles.button,
              {
                backgroundColor: colors.primary,
                borderRadius: radius.lg,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            testID="navigation-tooltip-got-it"
          >
            <Text
              style={{
                color: colors.primaryForeground,
                fontSize: typography.body.fontSize,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              Got it
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

// Import typography for inline styles
import { typography } from '@/lib/theme'

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltip: {
    width: '100%',
    borderWidth: 1,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: spacing.xs,
  },
  button: {
    width: '100%',
    alignItems: 'center',
  },
})
