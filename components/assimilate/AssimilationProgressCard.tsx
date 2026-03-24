/**
 * AssimilationProgressCard
 *
 * Displays iteration progress for an assimilation Ralph Loop.
 * Based on DeepResearchLoadingCard pattern with dimension-specific progress.
 *
 * Borg-themed: purple/green color scheme.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, XCircle } from '@/components/ui/icons'
import type { ViewProps } from 'react-native'
import { View, Animated, Easing, Pressable } from 'react-native'
import { useEffect, useRef } from 'react'

export interface AssimilationProgressCardProps extends Omit<ViewProps, 'children'> {
  sessionId: string
  repositoryName: string
  profile: string
  status: 'in_progress' | 'synthesizing' | 'completed' | 'failed'
  currentIteration: number
  maxIterations: number
  dimensionScores: Record<string, number>
  currentDimension?: string
  estimatedCostUsd?: number
  documentId?: string
  onPress?: () => void
  className?: string
}

const DIMENSIONS = [
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'testing', label: 'Testing' },
] as const

const PROFILE_BADGE = {
  fast: { label: 'FAST', className: 'bg-yellow-500/20 text-yellow-500' },
  standard: { label: 'STANDARD', className: 'bg-purple-500/20 text-purple-500' },
  thorough: { label: 'THOROUGH', className: 'bg-cyan-500/20 text-cyan-500' },
} as const

export function AssimilationProgressCard({
  repositoryName,
  profile,
  status,
  currentIteration,
  maxIterations,
  dimensionScores,
  currentDimension,
  estimatedCostUsd,
  onPress,
  className,
  ...props
}: AssimilationProgressCardProps) {
  const isComplete = status === 'completed'
  const isFailed = status === 'failed'
  const isSynthesizing = status === 'synthesizing'

  const pulseAnim = useRef(new Animated.Value(0)).current
  const rotateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!isComplete && !isFailed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      ).start()

      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start()
    }
  }, [pulseAnim, rotateAnim, isComplete, isFailed])

  const borderOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  })

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const profileConfig =
    PROFILE_BADGE[profile as keyof typeof PROFILE_BADGE] ?? PROFILE_BADGE.standard

  return (
    <Animated.View style={{ opacity: isComplete || isFailed ? 1 : borderOpacity }}>
      <Pressable onPress={onPress} disabled={!isComplete} className="active:opacity-90 w-full">
        <Card
          className={cn(
            'border bg-gradient-to-r from-background to-muted/10 w-full overflow-hidden',
            isComplete ? 'border-success/40' : isFailed ? 'border-destructive/40' : 'border-purple-500/40',
            className
          )}
          testID="assimilation-progress-card"
          {...props}
        >
          <CardContent className="py-3 px-4">
            {/* Profile badge + ASSIMILATE label */}
            <View className="flex-row items-center gap-2 mb-2">
              <View className={cn('px-1.5 py-0.5 rounded', profileConfig.className)}>
                <Text className={cn('text-[10px] font-bold tracking-wider', profileConfig.className)}>
                  {profileConfig.label}
                </Text>
              </View>
              <View className="bg-purple-500/20 px-1.5 py-0.5 rounded">
                <Text className="text-[10px] font-bold tracking-wider text-purple-500">
                  ASSIMILATE
                </Text>
              </View>
            </View>

            {/* Status row */}
            <View className="flex-row items-center gap-3">
              {isComplete ? (
                <CheckCircle2 size={16} className="text-success" />
              ) : isFailed ? (
                <XCircle size={16} className="text-destructive" />
              ) : (
                <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                  <Loader2 size={16} className="text-purple-500" />
                </Animated.View>
              )}
              <Text
                className={cn(
                  'text-sm font-medium flex-1',
                  isComplete ? 'text-success' : isFailed ? 'text-destructive' : 'text-purple-500'
                )}
                numberOfLines={1}
              >
                {isComplete
                  ? 'Assimilation Complete'
                  : isFailed
                    ? 'Assimilation Failed'
                    : isSynthesizing
                      ? 'Synthesizing final report...'
                      : `Analyzing ${currentDimension ?? '...'}`}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {currentIteration}/{maxIterations}
              </Text>
            </View>

            {/* Repo name */}
            <View className="mt-1.5 ml-7">
              <Text className="text-muted-foreground font-mono text-xs" numberOfLines={1}>
                {repositoryName}
              </Text>
            </View>

            {/* Dimension progress */}
            <View className="mt-3 ml-7 gap-1.5">
              {DIMENSIONS.map(({ key, label }) => {
                const score = dimensionScores[key] ?? 0
                const isCurrent = currentDimension === key && !isComplete && !isFailed
                const isDone = score > 0

                return (
                  <View key={key} className="flex-row items-center gap-2">
                    {isCurrent ? (
                      <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                        <Loader2 size={12} className="text-purple-500" />
                      </Animated.View>
                    ) : isDone ? (
                      <CheckCircle2 size={12} className="text-success" />
                    ) : (
                      <View className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                    )}
                    <Text
                      className={cn(
                        'text-xs flex-1',
                        isCurrent
                          ? 'text-purple-500 font-medium'
                          : isDone
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      )}
                    >
                      {label}
                    </Text>
                    {isDone && (
                      <Text className="text-xs text-muted-foreground font-mono">
                        {score}
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>

            {/* Cost estimate */}
            {estimatedCostUsd !== undefined && estimatedCostUsd > 0 && (
              <View className="mt-2 ml-7">
                <Text className="text-muted-foreground text-xs">
                  ~${estimatedCostUsd.toFixed(2)} spent
                </Text>
              </View>
            )}

            {/* Complete hint */}
            {isComplete && onPress && (
              <View className="mt-2 ml-7">
                <Text className="text-muted-foreground text-xs">
                  Tap to view findings →
                </Text>
              </View>
            )}
          </CardContent>
        </Card>
      </Pressable>
    </Animated.View>
  )
}
