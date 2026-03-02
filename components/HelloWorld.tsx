import * as React from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export interface HelloWorldProps {
  title?: string
  subtitle?: string
  variant?: 'default' | 'accent' | 'muted'
  showIcon?: boolean
}

const variantStyles = {
  default: {
    container: 'bg-card border-border',
    title: 'text-foreground',
    subtitle: 'text-muted-foreground',
  },
  accent: {
    container: 'bg-primary border-primary',
    title: 'text-primary-foreground',
    subtitle: 'text-primary-foreground/80',
  },
  muted: {
    container: 'bg-muted border-muted',
    title: 'text-muted-foreground',
    subtitle: 'text-muted-foreground/70',
  },
}

export function HelloWorld({
  title = 'Hello, Holocron',
  subtitle = 'Your research knowledge base is ready.',
  variant = 'default',
  showIcon = true,
}: HelloWorldProps) {
  const styles = variantStyles[variant]

  return (
    <View
      className={cn(
        'rounded-lg border p-6',
        styles.container
      )}
    >
      {showIcon && (
        <View className="mb-4 flex-row items-center gap-3">
          <Text className={cn('text-2xl', styles.title)}>📚</Text>
          <Text className={cn('text-xl', styles.title)}>🗄️</Text>
          <Text className={cn('text-xl', styles.title)}>🔍</Text>
        </View>
      )}
      <Text variant="h3" className={cn('mb-2', styles.title)}>
        {title}
      </Text>
      <Text variant="p" className={cn(styles.subtitle)}>
        {subtitle}
      </Text>
    </View>
  )
}
