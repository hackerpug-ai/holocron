import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Loader2, AlertCircle } from '@/components/ui/icons'

export interface PlatformProgress {
  platform: string
  status: 'pending' | 'in_progress' | 'success' | 'error'
  error?: string
}

// Chat card data type (snake_case to match backend)
export interface SubscriptionProgressCardData {
  card_type: 'subscription_progress'
  creator_name: string
  platforms: Array<{
    platform: string
    status: 'pending' | 'in_progress' | 'success' | 'error'
    error?: string
  }>
}

export interface SubscriptionProgressCardProps {
  data?: SubscriptionProgressCardData
  creatorName?: string
  platforms?: PlatformProgress[]
  onComplete?: () => void
  onRetry?: (platform: string) => void
  className?: string
  testID?: string
}

/**
 * SubscriptionProgressCard - real-time progress of batch subscription
 *
 * Shows individual platform subscription status with success/error
 * indicators. Displays error messages with retry buttons for failures.
 *
 * Used in chat after user taps "Subscribe" to show the progress of
 * subscribing to multiple platforms.
 */
export function SubscriptionProgressCard({
  data,
  creatorName,
  platforms,
  onComplete,
  onRetry,
  className,
  testID,
}: SubscriptionProgressCardProps) {
  // Support both `data` prop (from chat cards) and individual props
  const effectiveCreatorName = creatorName ?? data?.creator_name ?? ''
  const effectivePlatforms = platforms ?? data?.platforms ?? []

  // Calculate overall status
  const totalPlatforms = effectivePlatforms.length
  const successCount = effectivePlatforms.filter((p) => p.status === 'success').length
  const errorCount = effectivePlatforms.filter((p) => p.status === 'error').length

  const isComplete = effectivePlatforms.every(
    (p) => p.status === 'success' || p.status === 'error'
  )

  const hasErrors = errorCount > 0
  const allSuccess = successCount === totalPlatforms && totalPlatforms > 0

  return (
    <View
      className={cn('rounded-xl border border-border bg-card p-4', className)}
      testID={testID ?? 'subscription-progress-card'}
    >
      {/* Header */}
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">
          Subscribing to {effectiveCreatorName}
        </Text>
        {isComplete && (
          <Text
            className={cn(
              'text-sm font-medium',
              allSuccess ? 'text-emerald-500' : 'text-muted-foreground'
            )}
          >
            {successCount}/{totalPlatforms}
          </Text>
        )}
      </View>

      {/* Platform list */}
      <View className="gap-2">
        {effectivePlatforms.map((platform) => {
          const statusIcon =
            platform.status === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-500" />
            ) : platform.status === 'error' ? (
              <XCircle size={18} className="text-destructive" />
            ) : platform.status === 'in_progress' ? (
              <Loader2 size={18} className="text-primary animate-spin" />
            ) : (
              <View className="h-4.5 w-4.5 rounded-full border-2 border-muted-foreground/30" />
            )

          const statusText =
            platform.status === 'success'
              ? 'Subscribed'
              : platform.status === 'error'
              ? 'Failed'
              : platform.status === 'in_progress'
              ? 'Subscribing...'
              : 'Pending'

          return (
            <View
              key={platform.platform}
              className="flex-row items-center gap-3 rounded-lg bg-muted/50 px-3 py-2"
              testID={`platform-progress-${platform.platform}`}
            >
              {/* Status icon */}
              <View className="h-6 w-6 items-center justify-center">
                {statusIcon}
              </View>

              {/* Platform name and status */}
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-medium text-foreground capitalize">
                    {platform.platform}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {statusText}
                  </Text>
                </View>

                {/* Error message */}
                {platform.status === 'error' && platform.error && (
                  <View className="mt-1 flex-row items-center gap-2">
                    <AlertCircle size={12} className="text-destructive" />
                    <Text className="text-xs text-destructive">
                      {platform.error}
                    </Text>
                  </View>
                )}
              </View>

              {/* Retry button for errors */}
              {platform.status === 'error' && onRetry && (
                <Button
                  onPress={() => onRetry(platform.platform)}
                  variant="outline"
                  size="sm"
                  className="px-3 py-1"
                  testID={`retry-${platform.platform}`}
                >
                  <Text className="text-xs font-medium text-foreground">
                    Retry
                  </Text>
                </Button>
              )}
            </View>
          )
        })}
      </View>

      {/* Footer - completion message */}
      {isComplete && (
        <View className="mt-4 items-center">
          {allSuccess ? (
            <Text className="text-center text-sm text-emerald-500">
              ✓ Successfully subscribed to all platforms
            </Text>
          ) : hasErrors ? (
            <Text className="text-center text-sm text-muted-foreground">
              Subscribed to {successCount} of {totalPlatforms} platforms.
              Tap Retry above to try failed subscriptions again.
            </Text>
          ) : null}

          {onComplete && (
            <Button
              onPress={onComplete}
              variant="ghost"
              className="mt-2"
              testID="complete-button"
            >
              <Text className="font-medium text-foreground">Done</Text>
            </Button>
          )}
        </View>
      )}
    </View>
  )
}
