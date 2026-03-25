import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  Youtube,
  Twitter,
  Github,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
} from '@/components/ui/icons'

export type PlatformType = 'youtube' | 'twitter' | 'bluesky' | 'github' | 'website'

export interface PlatformBadgeProps {
  platform: PlatformType
  handle: string
  verified?: boolean
  selected?: boolean
  loading?: boolean
  onPress?: () => void
  className?: string
}

const platformConfig: Record<
  PlatformType,
  { label: string; icon: typeof Youtube; color: string }
> = {
  youtube: { label: 'YouTube', icon: Youtube, color: 'text-red-500' },
  twitter: { label: 'Twitter/X', icon: Twitter, color: 'text-sky-500' },
  bluesky: { label: 'Bluesky', icon: Twitter, color: 'text-blue-500' },
  github: { label: 'GitHub', icon: Github, color: 'text-foreground' },
  website: { label: 'Website', icon: Globe, color: 'text-emerald-500' },
}

/**
 * PlatformBadge - displays a platform with its handle and verification status
 *
 * Used in subscription suggestion cards to show which platforms are available
 * for a creator. Can be pressed to toggle selection for granular subscribe.
 */
export function PlatformBadge({
  platform,
  handle,
  verified,
  selected,
  loading,
  onPress,
  className,
}: PlatformBadgeProps) {
  const config = platformConfig[platform]
  const PlatformIcon = config.icon

  return (
    <View
      className={cn(
        'flex-row items-center gap-2 rounded-full border bg-card px-3 py-1.5',
        selected ? 'border-primary bg-primary/10' : 'border-border',
        onPress && 'pressable-opacity',
        className
      )}
      testID={`platform-badge-${platform}`}
    >
      {/* Platform icon */}
      <PlatformIcon size={14} className={config.color} />

      {/* Handle */}
      <Text className="text-sm font-medium text-foreground">{handle}</Text>

      {/* Status indicator */}
      {loading ? (
        <Loader2 size={14} className="text-muted-foreground animate-spin" />
      ) : verified !== undefined ? (
        verified ? (
          <CheckCircle2 size={14} className="text-emerald-500" />
        ) : (
          <XCircle size={14} className="text-muted-foreground" />
        )
      ) : null}
    </View>
  )
}
