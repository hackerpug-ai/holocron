import { useMemo } from 'react'
import { colors, spacing, radius, typography } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'

/**
 * Hook to access theme tokens based on current color scheme.
 * Uses NativeWind's color scheme so inline styles stay in sync
 * with Tailwind className-based styles.
 */
export function useTheme() {
  const { isDarkColorScheme } = useColorScheme()

  return useMemo(
    () => ({
      colors: isDarkColorScheme ? colors.dark : colors.light,
      spacing,
      radius,
      typography,
      isDark: isDarkColorScheme,
    }),
    [isDarkColorScheme]
  )
}
