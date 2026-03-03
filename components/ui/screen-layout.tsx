import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context'
import { ScreenHeader, type ScreenHeaderProps } from './screen-header'

type SafeAreaEdge = 'top' | 'bottom' | 'left' | 'right'

export interface ScreenLayoutProps extends Omit<ViewProps, 'children'> {
  /** Screen content */
  children: ReactNode
  /**
   * Safe area edges to respect.
   * - 'all': All edges (top, bottom, left, right)
   * - 'horizontal': Left and right only
   * - 'vertical': Top and bottom only
   * - 'top': Top only (for screens with custom bottom handling)
   * - 'bottom': Bottom only (for screens with custom header)
   * - 'none': No safe area insets (content goes edge-to-edge)
   * - Array of specific edges: ['top', 'left', 'right']
   * @default 'all'
   */
  edges?: 'all' | 'horizontal' | 'vertical' | 'top' | 'bottom' | 'none' | SafeAreaEdge[]
  /**
   * Whether to apply padding (true) or margin (false) for safe areas.
   * Padding keeps content inside the safe area.
   * Margin allows background to extend into unsafe areas.
   * @default 'padding'
   */
  mode?: 'padding' | 'margin'
  /**
   * Header configuration. Pass an object with ScreenHeaderProps to show a header.
   * When header is provided, 'top' edge safe area is automatically handled by the header.
   */
  header?: Omit<ScreenHeaderProps, 'safeAreaTop'>
  /** Additional test ID for the layout wrapper */
  testID?: string
}

/**
 * ScreenLayout provides consistent safe area handling for all screens.
 *
 * Use this as the outermost wrapper for screen content to ensure
 * proper spacing around notches, home indicators, and system UI.
 *
 * @example
 * ```tsx
 * // Full safe area protection (default)
 * <ScreenLayout>
 *   <MyScreenContent />
 * </ScreenLayout>
 *
 * // Only top safe area (screen has fixed bottom bar)
 * <ScreenLayout edges="top">
 *   <MyScreenContent />
 * </ScreenLayout>
 *
 * // Custom edges
 * <ScreenLayout edges={['top', 'left', 'right']}>
 *   <MyScreenContent />
 * </ScreenLayout>
 * ```
 */
export function ScreenLayout({
  children,
  edges = 'all',
  mode = 'padding',
  header,
  className,
  style,
  testID,
  ...props
}: ScreenLayoutProps) {
  const insets = useSafeAreaInsets()

  // Convert edge shorthand to array of edges
  let edgeArray = resolveEdges(edges)

  // If header is provided, it handles the top safe area
  if (header) {
    edgeArray = edgeArray.filter((edge) => edge !== 'top')
  }

  // Calculate inset values based on selected edges
  const insetStyles = {
    [mode === 'padding' ? 'paddingTop' : 'marginTop']: edgeArray.includes('top') ? insets.top : 0,
    [mode === 'padding' ? 'paddingBottom' : 'marginBottom']: edgeArray.includes('bottom') ? insets.bottom : 0,
    [mode === 'padding' ? 'paddingLeft' : 'marginLeft']: edgeArray.includes('left') ? insets.left : 0,
    [mode === 'padding' ? 'paddingRight' : 'marginRight']: edgeArray.includes('right') ? insets.right : 0,
  }

  return (
    <View
      className={cn('flex-1 bg-background', className)}
      style={[insetStyles, style]}
      testID={testID}
      {...props}
    >
      {header && <ScreenHeader {...header} safeAreaTop />}
      {children}
    </View>
  )
}

/**
 * Resolves edge shorthand to array of Edge values
 */
function resolveEdges(edges: ScreenLayoutProps['edges']): Edge[] {
  if (edges === 'all') {
    return ['top', 'bottom', 'left', 'right']
  }
  if (edges === 'horizontal') {
    return ['left', 'right']
  }
  if (edges === 'vertical') {
    return ['top', 'bottom']
  }
  if (edges === 'top') {
    return ['top']
  }
  if (edges === 'bottom') {
    return ['bottom']
  }
  if (edges === 'none') {
    return []
  }
  return edges as Edge[]
}

export default ScreenLayout
