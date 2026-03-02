import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react-native'
import { View, type ViewProps } from 'react-native'

interface StatCardProps extends Omit<ViewProps, 'children'> {
  /** Stat label */
  label: string
  /** Stat value (number or string) */
  value: number | string
  /** Optional icon to display */
  icon?: LucideIcon
  /** Optional trend indicator (+5, -3, etc.) */
  trend?: number
  /** Whether the stat is loading */
  loading?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * StatCard displays a single statistic with label, value, and optional icon/trend.
 * Used for displaying holocron statistics on the home screen.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  loading = false,
  size = 'md',
  className,
  ...props
}: StatCardProps) {
  const valueSize = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  }[size]

  const iconSize = {
    sm: 16,
    md: 20,
    lg: 24,
  }[size]

  const paddingClass = {
    sm: 'py-3',
    md: 'py-4',
    lg: 'py-5',
  }[size]

  const formattedValue =
    typeof value === 'number' ? value.toLocaleString() : value

  return (
    <Card className={cn(paddingClass, className)} testID="stat-card" {...props}>
      <CardContent className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
            {label}
          </Text>
          <View className="flex-row items-baseline gap-2">
            {loading ? (
              <View className="bg-muted h-7 w-16 animate-pulse rounded" />
            ) : (
              <Text className={cn('text-foreground font-bold', valueSize)}>
                {formattedValue}
              </Text>
            )}
            {!loading && trend !== undefined && (
              <Text
                className={cn(
                  'text-sm font-medium',
                  trend > 0 && 'text-green-600',
                  trend < 0 && 'text-red-600',
                  trend === 0 && 'text-muted-foreground'
                )}
              >
                {trend > 0 ? '+' : ''}
                {trend}
              </Text>
            )}
          </View>
        </View>
        {Icon && (
          <View className="bg-muted rounded-lg p-2">
            <Icon size={iconSize} className="text-muted-foreground" />
          </View>
        )}
      </CardContent>
    </Card>
  )
}
