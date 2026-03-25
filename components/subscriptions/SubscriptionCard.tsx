import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { PlatformBadge, type PlatformType } from './PlatformBadge'
import { Switch } from '@/components/ui/switch'
import { Trash2 } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import type { Doc } from '@/convex/_generated/dataModel'

export type SubscriptionSource = Doc<'subscriptionSources'>

export interface SubscriptionCardProps {
  subscription: SubscriptionSource
  selected?: boolean
  onToggleAutoResearch?: (id: string) => void
  onUnsubscribe?: (id: string) => void
  onPress?: () => void
  className?: string
}

/**
 * SubscriptionCard - displays a single subscription with controls
 *
 * Shows the subscription name/identifier, platform badge, and
 * provides quick actions for toggling auto-research and unsubscribing.
 */
export function SubscriptionCard({
  subscription,
  selected = false,
  onToggleAutoResearch,
  onUnsubscribe,
  onPress,
  className,
}: SubscriptionCardProps) {
  const { _id: id, sourceType, identifier, name, autoResearch, createdAt } = subscription

  // Format the subscription name/identifier
  const displayName = name || identifier

  // Format timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-xl border bg-card p-4',
        selected ? 'border-primary' : 'border-border',
        className
      )}
      testID={`subscription-card-${id}`}
    >
      <View className="flex-row items-start gap-3">
        {/* Left: Icon + Info */}
        <View className="flex-1 gap-2">
          {/* Header: Name + Type */}
          <View className="flex-row items-center gap-2">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
              {displayName}
            </Text>
            <PlatformBadge
              platform={sourceType as PlatformType}
              handle={identifier}
              selected={false}
              onPress={undefined}
              className="pressable-opacity"
            />
          </View>

          {/* Subtitle: Auto-research status + Last checked */}
          <View className="flex-row items-center gap-2">
            <View
              className={cn(
                'rounded-full px-2 py-0.5',
                autoResearch ? 'bg-emerald-500/10' : 'bg-muted'
              )}
            >
              <Text
                className={cn(
                  'text-xs',
                  autoResearch ? 'text-emerald-500' : 'text-muted-foreground'
                )}
              >
                {autoResearch ? 'Auto-research ON' : 'Manual only'}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              Added {formatDate(createdAt)}
            </Text>
          </View>
        </View>

        {/* Right: Actions */}
        <View className="flex-col items-end gap-2">
          {/* Auto-research toggle */}
          {onToggleAutoResearch && (
            <Switch
              checked={autoResearch ?? false}
              onCheckedChange={() => onToggleAutoResearch(id)}
              testID={`toggle-auto-research-${id}`}
            />
          )}

          {/* Unsubscribe button */}
          {onUnsubscribe && (
            <Button
              onPress={() => onUnsubscribe(id)}
              variant="ghost"
              size="sm"
              className="px-2 py-1"
              testID={`unsubscribe-${id}`}
            >
              <Trash2 size={16} className="text-destructive" />
            </Button>
          )}
        </View>
      </View>
    </Pressable>
  )
}
