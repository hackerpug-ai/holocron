import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertCircle, Loader2, Sparkles } from '@/components/ui/icons';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { type ResearchProgressStatus, useResearchProgress } from '@/hooks/useResearchProgress';
import { cn } from '@/lib/utils';

interface ResearchProgressWithConvexProps {
  /** Research session ID (Zero research_sessions row) */
  sessionId: string;
  /** Optional test ID root; bar uses research-progress-bar when default */
  testID?: string;
  /** Optional class name */
  className?: string;
  /** Whether to wrap with SafeAreaView (default true for screen surfaces) */
  withSafeArea?: boolean;
}

const statusLabels: Record<string, string> = {
  pending: 'Starting research...',
  searching: 'Searching sources...',
  analyzing: 'Analyzing findings...',
  synthesizing: 'Synthesizing results...',
  running: 'Research in progress...',
  paused: 'Research paused',
  completed: 'Research complete',
  failed: 'Research failed',
  cancelled: 'Research cancelled',
};

/**
 * ResearchProgressWithConvex displays real-time research progress
 * bound to Zero research_sessions via useResearchProgress (researchSessionById).
 *
 * Component name retained for import stability; data plane is Zero (not Convex).
 * Progress advances live as current_iteration/max_iterations update via zero_pub WAL.
 */
export function ResearchProgressWithConvex({
  sessionId,
  testID = 'research-progress',
  className,
  withSafeArea = true,
}: ResearchProgressWithConvexProps) {
  const { session, isLoading, label, progressPercent, status, queryLabel } =
    useResearchProgress(sessionId);

  const body = (() => {
    if (isLoading) {
      return (
        <Card className={cn('py-4', className)} testID={`${testID}-loading`}>
          <CardContent className="pt-0">
            <View className="flex-row items-center gap-3">
              <Loader2 size={18} className="text-muted-foreground" />
              <Text className="text-muted-foreground">Loading research session...</Text>
            </View>
          </CardContent>
        </Card>
      );
    }

    if (session === null) {
      return (
        <Card className={cn('py-4', className)} testID={`${testID}-not-found`}>
          <CardContent className="pt-0">
            <Text className="text-muted-foreground text-sm">Session not found</Text>
          </CardContent>
        </Card>
      );
    }

    const resolvedStatus = (status ?? session.status) as ResearchProgressStatus;
    const isActive =
      resolvedStatus !== 'completed' &&
      resolvedStatus !== 'failed' &&
      resolvedStatus !== 'cancelled';

    if (resolvedStatus === 'pending') {
      return (
        <Card className={cn('py-4', className)} testID={`${testID}-waiting`}>
          <CardHeader className="pb-3">
            <View className="flex-row items-center gap-2">
              <ActivityIndicator />
              <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
                {queryLabel}
              </Text>
            </View>
          </CardHeader>
          <CardContent className="gap-3 pt-0">
            <Text className="text-muted-foreground text-sm">{statusLabels.pending}</Text>
          </CardContent>
        </Card>
      );
    }

    if (isActive) {
      return (
        <RunningProgress
          queryLabel={queryLabel}
          status={resolvedStatus}
          progressPercent={progressPercent}
          label={label}
          testID={testID}
          className={className}
        />
      );
    }

    if (resolvedStatus === 'completed') {
      return (
        <Card className={cn('py-4', className)} testID={`${testID}-results`}>
          <CardHeader className="pb-3">
            <View className="flex-row items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
                {queryLabel}
              </Text>
            </View>
          </CardHeader>
          <CardContent className="gap-3 pt-0">
            <Text className="text-muted-foreground text-sm">{statusLabels.completed}</Text>
            {label != null && (
              <Text className="text-muted-foreground text-sm" testID={`${testID}-label`}>
                {label}
              </Text>
            )}
            {session.coverage_score != null && (
              <Text className="text-muted-foreground text-sm">
                Coverage Score: {session.coverage_score}/5
              </Text>
            )}
          </CardContent>
        </Card>
      );
    }

    if (resolvedStatus === 'failed') {
      return (
        <Card className={cn('py-4 border-destructive', className)} testID={`${testID}-error`}>
          <CardHeader className="pb-3">
            <View className="flex-row items-center gap-2">
              <AlertCircle size={18} className="text-destructive" />
              <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
                {queryLabel}
              </Text>
            </View>
          </CardHeader>
          <CardContent className="gap-3 pt-0">
            <Text className="text-destructive text-sm">{statusLabels.failed}</Text>
            {session.error_text && (
              <Text className="text-destructive text-sm">{session.error_text}</Text>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className={cn('py-4', className)} testID={`${testID}-cancelled`}>
        <CardContent className="pt-0">
          <Text className="text-muted-foreground text-sm">{statusLabels.cancelled}</Text>
        </CardContent>
      </Card>
    );
  })();

  if (!withSafeArea) {
    return body;
  }

  return (
    <SafeAreaView edges={['left', 'right']} testID={`${testID}-safe-area`}>
      {body}
    </SafeAreaView>
  );
}

function RunningProgress({
  queryLabel,
  status,
  progressPercent,
  label,
  testID,
  className,
}: {
  queryLabel: string;
  status: ResearchProgressStatus;
  progressPercent: number;
  label: string | null;
  testID: string;
  className?: string;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => animation.stop();
  }, [spin]);

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Card className={cn('py-4', className)} testID={`${testID}-running`}>
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
            <Loader2 size={18} className="text-primary" />
          </Animated.View>
          <Text className="text-foreground flex-1 font-semibold" numberOfLines={1}>
            {queryLabel}
          </Text>
        </View>
      </CardHeader>

      <CardContent className="gap-3 pt-0">
        {/* Stable Maestro oracle: research-progress-bar (AC-3) */}
        <View
          testID="research-progress-bar"
          accessibilityLabel={label ? `Research progress ${label}` : 'Research progress'}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(progressPercent),
            text: label ?? undefined,
          }}
        >
          <Progress value={progressPercent} className="h-2" />
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-muted-foreground text-sm">
            {statusLabels[status] ?? statusLabels.running}
          </Text>

          {label != null && (
            <Text
              className="text-muted-foreground text-sm font-medium"
              testID="research-progress-label"
            >
              {label}
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function ActivityIndicator() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => animation.stop();
  }, [spin]);

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
      <Loader2 size={18} className="text-primary" />
    </Animated.View>
  );
}
