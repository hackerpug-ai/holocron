import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Loader2, Sparkles } from '@/components/ui/icons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, View, type ViewProps } from 'react-native'
import { Progress } from './ui/progress'

export type ResearchStatus = 'initializing' | 'searching' | 'analyzing' | 'synthesizing' | 'complete' | 'error'

interface ResearchProgressProps extends Omit<ViewProps, 'children'> {
  /** Research query or topic */
  query: string
  /** Current status of the research */
  status: ResearchStatus
  /** Progress percentage (0-100) */
  progress: number
  /** Current iteration for deep research */
  currentIteration?: number
  /** Total iterations for deep research */
  totalIterations?: number
  /** Status message to display */
  statusMessage?: string
}

const statusLabels: Record<ResearchStatus, string> = {
  initializing: 'Initializing research...',
  searching: 'Searching sources...',
  analyzing: 'Analyzing findings...',
  synthesizing: 'Synthesizing results...',
  complete: 'Research complete',
  error: 'Research failed',
}

/**
 * ResearchProgress displays an in-progress research workflow card
 * in the chat stream. Shows current status, progress bar, and
 * iteration info for deep research.
 */
export function ResearchProgress({
  query,
  status,
  progress,
  currentIteration,
  totalIterations,
  statusMessage,
  className,
  ...props
}: ResearchProgressProps) {
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (status === 'complete' || status === 'error') {
      spin.setValue(0)
      return
    }

    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )

    animation.start()

    return () => animation.stop()
  }, [status, spin])

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const isActive = status !== 'complete' && status !== 'error'
  const displayMessage = statusMessage || statusLabels[status]

  return (
    <Card
      className={cn(
        'py-4',
        status === 'error' && 'border-destructive',
        className
      )}
      testID="research-progress"
      {...props}
    >
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          {isActive ? (
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
              <Loader2 size={18} className="text-primary" />
            </Animated.View>
          ) : (
            <Sparkles
              size={18}
              className={cn(
                status === 'complete' ? 'text-primary' : 'text-destructive'
              )}
            />
          )}
          <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
            {query}
          </Text>
        </View>
      </CardHeader>

      <CardContent className="gap-3 pt-0">
        <Progress
          value={progress}
          className="h-2"
          indicatorClassName={cn(
            status === 'error' && 'bg-destructive'
          )}
        />

        <View className="flex-row items-center justify-between">
          <Text
            className={cn(
              'text-sm',
              status === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {displayMessage}
          </Text>

          {currentIteration !== undefined && totalIterations !== undefined && (
            <Text className="text-muted-foreground text-sm">
              Iteration {currentIteration}/{totalIterations}
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  )
}
