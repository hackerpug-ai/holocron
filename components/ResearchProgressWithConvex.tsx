import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { researchSessionById } from '@/app/zero/queries';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertCircle, Loader2, Sparkles } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Progress } from './ui/progress';

export type ResearchStatus =
  | 'pending'
  | 'searching'
  | 'analyzing'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface ResearchProgressWithConvexProps {
  /** Research session ID (Zero research_sessions row) */
  sessionId: string;
  /** Optional test ID */
  testID?: string;
  /** Optional class name */
  className?: string;
}

const statusLabels: Record<ResearchStatus, string> = {
  pending: 'Starting research...',
  searching: 'Searching sources...',
  analyzing: 'Analyzing findings...',
  synthesizing: 'Synthesizing results...',
  completed: 'Research complete',
  failed: 'Research failed',
  cancelled: 'Research cancelled',
};

type SessionRow = {
  id: string;
  query?: string | null;
  topic?: string | null;
  status: string;
  current_iteration?: number | null;
  max_iterations?: number | null;
  coverage_score?: number | null;
  error_text?: string | null;
};

/**
 * ResearchProgressWithConvex displays real-time research progress
 * by watching the Zero research_sessions row (researchSessionById).
 *
 * Component name retained for import stability; data plane is Zero.
 */
export function ResearchProgressWithConvex({
  sessionId,
  testID = 'research-progress',
  className,
}: ResearchProgressWithConvexProps) {
  const [session] = useZeroQuery(researchSessionById(sessionId));

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

  const row = session as SessionRow;
  const status = row.status as ResearchStatus;
  const isActive = status !== 'completed' && status !== 'failed' && status !== 'cancelled';
  const queryLabel = row.query ?? row.topic ?? '';

  if (status === 'pending') {
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
        session={row}
        queryLabel={queryLabel}
        testID={testID}
        className={className}
      />
    );
  }

  if (status === 'completed') {
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
          {row.coverage_score != null && (
            <Text className="text-muted-foreground text-sm">
              Coverage Score: {row.coverage_score}/5
            </Text>
          )}
        </CardContent>
      </Card>
    );
  }

  if (status === 'failed') {
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
          {row.error_text && <Text className="text-destructive text-sm">{row.error_text}</Text>}
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
}

function RunningProgress({
  session,
  queryLabel,
  testID,
  className,
}: {
  session: SessionRow;
  queryLabel: string;
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

  const status = session.status as ResearchStatus;
  const progress = calculateProgress(session);

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
        <Progress value={progress} className="h-2" testID={`${testID}-bar`} />

        <View className="flex-row items-center justify-between">
          <Text className="text-muted-foreground text-sm">{statusLabels[status]}</Text>

          {session.current_iteration != null && session.max_iterations != null && (
            <Text className="text-muted-foreground text-sm">
              Iteration {session.current_iteration}/{session.max_iterations}
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function calculateProgress(session: SessionRow): number {
  if (session.current_iteration && session.max_iterations) {
    return (session.current_iteration / session.max_iterations) * 100;
  }

  const statusProgress: Record<ResearchStatus, number> = {
    pending: 0,
    searching: 25,
    analyzing: 50,
    synthesizing: 75,
    completed: 100,
    failed: 0,
    cancelled: 0,
  };

  return statusProgress[session.status as ResearchStatus] || 0;
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
