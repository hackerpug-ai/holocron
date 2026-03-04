import { ActivityIndicator, type ActivityIndicatorProps, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'

interface NavTaskLoaderProps extends ActivityIndicatorProps {
  /** Whether there are active tasks to display */
  hasActiveTasks: boolean
}

/**
 * NavTaskLoader displays a small ActivityIndicator in navigation
 * to show when background tasks are running.
 *
 * Shows/hides based on active task count from useLongRunningTasks hook.
 *
 * @example
 * ```tsx
 * const { hasActiveTasks } = useLongRunningTasks()
 * <NavTaskLoader hasActiveTasks={hasActiveTasks} />
 * ```
 */
export function NavTaskLoader({ hasActiveTasks, ...props }: NavTaskLoaderProps) {
  const { colors, spacing } = useTheme()

  if (!hasActiveTasks) {
    return null
  }

  return (
    <View style={{ marginRight: spacing.sm }} testID="nav-task-loader">
      <ActivityIndicator
        size="small"
        color={colors.primary}
        {...props}
      />
    </View>
  )
}
