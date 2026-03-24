import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Loader2, Sparkles, AlertCircle } from '@/components/ui/icons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'
import { Progress } from './ui/progress'

export type ResearchStatus =
  | 'pending'
  | 'searching'
  | 'analyzing'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface ResearchProgressWithConvexProps {
  /** Research session ID from Convex */
  sessionId: string
  /** Optional test ID */
  testID?: string
  /** Optional class name */
  className?: string
}

const statusLabels: Record<ResearchStatus, string> = {
  pending: 'Starting research...',
  searching: 'Searching sources...',
  analyzing: 'Analyzing findings...',
  synthesizing: 'Synthesizing results...',
  completed: 'Research complete',
  failed: 'Research failed',
  cancelled: 'Research cancelled',
}

/**
 * ResearchProgressWithConvex displays real-time research progress
 * by watching the Convex session entity directly.
 *
 * This implements US-060: Direct session entity watching via useQuery
 * Convex automatically pushes updates when the session status changes.
 */
export function ResearchProgressWithConvex({
  sessionId,
  testID = 'research-progress',
  className,
}: ResearchProgressWithConvexProps) {
  // Direct query - Convex auto-updates when entity changes!
  const session = useQuery(api.researchSessions.queries.get, { id: sessionId as any })

  // Handle loading state (query is loading)
  if (session === undefined) {
    return (
      <Card className={cn('py-4', className)} testID={`${testID}-loading`}>
        <CardContent className="pt-0">
          <View className="flex-row items-center gap-3">
            <Loader2 size={18} className="text-muted-foreground" />
            <Text className="text-muted-foreground">Loading research session...</Text>
          </View>
        </CardContent>
      </Card>
    )
  }

  const status = session.status as ResearchStatus
  const isActive = status !== 'completed' && status !== 'failed' && status !== 'cancelled'

  // AC-1: Research started → Shows waiting indicator
  if (status === 'pending') {
    return (
      <Card className={cn('py-4', className)} testID={`${testID}-waiting`}>
        <CardHeader className="pb-3">
          <View className="flex-row items-center gap-2">
            <ActivityIndicator />
            <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
              {session.query}
            </Text>
          </View>
        </CardHeader>
        <CardContent className="gap-3 pt-0">
          <Text className="text-muted-foreground text-sm">
            {statusLabels.pending}
          </Text>
        </CardContent>
      </Card>
    )
  }

  // AC-2: Research running → Progress bar animates
  if (isActive) {
    return <RunningProgress session={session} testID={testID} className={className} />
  }

  // AC-3: Research complete → Shows results
  if (status === 'completed') {
    return (
      <Card className={cn('py-4', className)} testID={`${testID}-results`}>
        <CardHeader className="pb-3">
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
              {session.query}
            </Text>
          </View>
        </CardHeader>
        <CardContent className="gap-3 pt-0">
          <Text className="text-muted-foreground text-sm">
            {statusLabels.completed}
          </Text>
          {session.coverageScore && (
            <Text className="text-muted-foreground text-sm">
              Coverage Score: {session.coverageScore}/5
            </Text>
          )}
        </CardContent>
      </Card>
    )
  }

  // AC-4: Research fails → Shows error message
  if (status === 'failed') {
    return (
      <Card className={cn('py-4 border-destructive', className)} testID={`${testID}-error`}>
        <CardHeader className="pb-3">
          <View className="flex-row items-center gap-2">
            <AlertCircle size={18} className="text-destructive" />
            <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
              {session.query}
            </Text>
          </View>
        </CardHeader>
        <CardContent className="gap-3 pt-0">
          <Text className="text-destructive text-sm">
            {statusLabels.failed}
          </Text>
          {session.errorText && (
            <Text className="text-destructive text-sm">
              {session.errorText}
            </Text>
          )}
        </CardContent>
      </Card>
    )
  }

  // Cancelled state
  return (
    <Card className={cn('py-4', className)} testID={`${testID}-cancelled`}>
      <CardContent className="pt-0">
        <Text className="text-muted-foreground text-sm">
          {statusLabels.cancelled}
        </Text>
      </CardContent>
    </Card>
  )
}

/**
 * RunningProgress shows animated progress bar for active research
 */
function RunningProgress({
  session,
  testID,
  className,
}: {
  session: any
  testID: string
  className?: string
}) {
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
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
  }, [spin])

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const status = session.status as ResearchStatus
  const progress = calculateProgress(session)

  return (
    <Card className={cn('py-4', className)} testID={`${testID}-running`}>
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
            <Loader2 size={18} className="text-primary" />
          </Animated.View>
          <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
            {session.query}
          </Text>
        </View>
      </CardHeader>

      <CardContent className="gap-3 pt-0">
        <Progress
          value={progress}
          className="h-2"
          testID={`${testID}-bar`}
        />

        <View className="flex-row items-center justify-between">
          <Text className="text-muted-foreground text-sm">
            {statusLabels[status]}
          </Text>

          {session.currentIteration !== undefined && session.maxIterations !== undefined && (
            <Text className="text-muted-foreground text-sm">
              Iteration {session.currentIteration}/{session.maxIterations}
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  )
}

/**
 * Calculate progress percentage based on session state
 */
function calculateProgress(session: any): number {
  if (session.currentIteration && session.maxIterations) {
    return (session.currentIteration / session.maxIterations) * 100
  }

  // Default progress based on status
  const statusProgress: Record<ResearchStatus, number> = {
    pending: 0,
    searching: 25,
    analyzing: 50,
    synthesizing: 75,
    completed: 100,
    failed: 0,
    cancelled: 0,
  }

  return statusProgress[session.status as ResearchStatus] || 0
}

/**
 * ActivityIndicator component for loading state
 */
function ActivityIndicator() {
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
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
  }, [spin])

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
      <Loader2 size={18} className="text-primary" />
    </Animated.View>
  )
}
