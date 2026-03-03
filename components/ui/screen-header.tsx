import { cn } from '@/lib/utils'
import { ChevronLeft, Menu } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, View, type ViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './text'

export interface ScreenHeaderProps extends Omit<ViewProps, 'children'> {
  /** Screen title */
  title?: string
  /** Whether to show the back button */
  showBack?: boolean
  /** Custom back button handler (defaults to router.back()) */
  onBack?: () => void
  /** Whether to show the menu/drawer button */
  showMenu?: boolean
  /** Custom menu button handler */
  onMenu?: () => void
  /** Left side content (replaces back/menu buttons if provided) */
  leftContent?: ReactNode
  /** Right side content (action buttons, etc.) */
  rightContent?: ReactNode
  /** Whether to include top safe area inset */
  safeAreaTop?: boolean
  /** Additional test ID */
  testID?: string
}

/**
 * ScreenHeader provides consistent navigation header for screens.
 *
 * Features:
 * - Back button with chevron icon
 * - Menu/drawer toggle button
 * - Centered title
 * - Custom left/right content areas
 * - Safe area handling for status bar
 *
 * @example
 * ```tsx
 * // Simple back navigation
 * <ScreenHeader title="Articles" showBack onBack={() => router.back()} />
 *
 * // With drawer menu
 * <ScreenHeader title="Home" showMenu onMenu={openDrawer} />
 *
 * // With custom right content
 * <ScreenHeader
 *   title="Chat"
 *   showMenu
 *   rightContent={<SettingsButton />}
 * />
 * ```
 */
export function ScreenHeader({
  title,
  showBack = false,
  onBack,
  showMenu = false,
  onMenu,
  leftContent,
  rightContent,
  safeAreaTop = true,
  className,
  style,
  testID = 'screen-header',
  ...props
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets()

  // Default left content based on props
  const resolvedLeftContent = leftContent ?? (
    <>
      {showBack && (
        <Pressable
          onPress={onBack}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
          testID={`${testID}-back-button`}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} className="text-foreground" />
        </Pressable>
      )}
      {showMenu && !showBack && (
        <Pressable
          onPress={onMenu}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
          testID={`${testID}-menu-button`}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Menu size={24} className="text-foreground" />
        </Pressable>
      )}
    </>
  )

  return (
    <View
      className={cn('bg-background border-b border-border', className)}
      style={[safeAreaTop ? { paddingTop: insets.top } : undefined, style]}
      testID={testID}
      {...props}
    >
      <View className="h-14 flex-row items-center justify-between px-2">
        {/* Left side - back/menu button or custom content */}
        <View className="min-w-[48px] flex-row items-center">
          {resolvedLeftContent}
        </View>

        {/* Center - title */}
        {title && (
          <View className="absolute inset-x-0 items-center justify-center pointer-events-none">
            <Text
              variant="large"
              className="font-semibold text-foreground"
              numberOfLines={1}
              testID={`${testID}-title`}
            >
              {title}
            </Text>
          </View>
        )}

        {/* Right side - custom content */}
        <View className="min-w-[48px] flex-row items-center justify-end">
          {rightContent}
        </View>
      </View>
    </View>
  )
}

export default ScreenHeader
