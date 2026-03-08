import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react-native'
import type { ViewProps } from 'react-native'
import { View, Animated, Easing } from 'react-native'
import { useEffect, useRef } from 'react'

export type ResearchStage =
  | 'initializing'
  | 'planning'
  | 'searching'
  | 'analyzing'
  | 'synthesizing'

export type StepStatus = 'completed' | 'in-progress' | 'pending'

export interface ResearchStep {
  /** Unique identifier for the step */
  id: string
  /** Display label for the step */
  label: string
  /** Current status of the step */
  status: StepStatus
  /** Optional detailed message about the step */
  detail?: string
}

export interface DeepResearchLoadingCardProps extends Omit<ViewProps, 'children'> {
  /** The search query/topic being researched */
  query: string
  /** Current research stage */
  stage?: ResearchStage
  /** Optional loading message (overrides stage-based message) */
  message?: string
  /** Optional class name for custom styling */
  className?: string
  /** Current iteration number (optional, for progress tracking) */
  currentIteration?: number
  /** Maximum iterations (optional, for progress tracking) */
  maxIterations?: number
  /** Optional array of steps to display with their status */
  steps?: ResearchStep[]
}

const STAGE_MESSAGES: Record<ResearchStage, string> = {
  initializing: 'Initializing research session',
  planning: 'Planning search strategy',
  searching: 'Searching knowledge sources',
  analyzing: 'Analyzing results',
  synthesizing: 'Synthesizing findings',
}

const STAGE_ICONS: Record<ResearchStage, string> = {
  initializing: '◐',
  planning: '◈',
  searching: '◉',
  analyzing: '◊',
  synthesizing: '◆',
}

/**
 * DeepResearchLoadingCard displays an animated loading state
 * while deep research is initializing or in progress.
 *
 * Design Concept: Refined Minimalism with Kinetic Pulse
 * - Single consolidated card that grows as steps appear
 * - Animated fade-in for new steps (staggered for elegance)
 * - Subtle pulse animation for the active step
 * - Progress shown via step count (no iteration counter)
 * - Maintains cyan accent and terminal aesthetic
 */
export function DeepResearchLoadingCard({
  query,
  stage = 'initializing',
  message,
  className,
  currentIteration,
  maxIterations,
  steps,
  ...props
}: DeepResearchLoadingCardProps) {
  const displayMessage = message || STAGE_MESSAGES[stage]
  const stageIcon = STAGE_ICONS[stage]
  const isCompleted = message?.toLowerCase().includes('completed')
  // Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current
  const glowAnim = useRef(new Animated.Value(0)).current
  const rotateAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Pulse animation for border
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

    // Glow animation for query text
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start()

    // Rotation for spinner
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()
  }, [pulseAnim, glowAnim, rotateAnim])

  const borderOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  })

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  })

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View
      style={{
        opacity: borderOpacity,
      }}
    >
      <Card
        className={cn(
          'border border-cyan-500/50 bg-gradient-to-r from-background to-muted/20 w-full',
          className
        )}
        testID="deep-research-loading-card"
        {...props}
      >
        <CardContent className="py-3 px-4">
          <View className="flex-row items-center gap-3">
            {/* Spinner - only show when not completed */}
            {!isCompleted && (
              <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                <Loader2 size={18} className="text-cyan-500" />
              </Animated.View>
            )}

            {/* Message */}
            <Text
              className="text-cyan-500 text-sm font-semibold"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayMessage}
            </Text>

            {/* Stage icon */}
            <Text className="text-cyan-500 text-lg font-mono">{stageIcon}</Text>

            {/* Query */}
            <Animated.View style={{ opacity: glowOpacity, flex: 1 }}>
              <Text
                className="text-muted-foreground font-mono text-sm"
                numberOfLines={1}
                ellipsizeMode="tail"
                testID="deep-research-loading-query"
              >
                {query}
              </Text>
            </Animated.View>
          </View>

          {/* Steps list */}
          {steps && steps.length > 0 && (
            <View className="mt-3 pt-3 border-t border-cyan-500/20 gap-2">
              {steps.map((step, index) => (
                <StepItem key={step.id} step={step} index={index} />
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </Animated.View>
  )
}

/**
 * StepItem component - displays a single research step with animated appearance
 * Active steps pulse subtly, completed steps are dimmed
 */
interface StepItemProps {
  step: ResearchStep
  index: number
}

function StepItem({ step, index }: StepItemProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  // Fade in animation when step appears
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: index * 100, // Stagger animation
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [fadeAnim, index])

  // Pulse animation for active step
  useEffect(() => {
    if (step.status === 'in-progress') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start()
    } else {
      pulseAnim.setValue(1)
    }
  }, [step.status, pulseAnim])

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: pulseAnim }]
      }}
      testID={`step-${step.id}`}
    >
      <View className="flex-row items-start gap-2">
        {/* Bullet point - simpler than icons */}
        <View className="mt-1.5">
          <View
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              step.status === 'completed' && 'bg-green-500',
              step.status === 'in-progress' && 'bg-cyan-500',
              step.status === 'pending' && 'bg-muted-foreground/30'
            )}
          />
        </View>

        {/* Step content */}
        <View className="flex-1">
          <Text
            className={cn(
              'text-sm leading-5',
              step.status === 'completed' && 'text-muted-foreground',
              step.status === 'in-progress' && 'text-foreground font-medium',
              step.status === 'pending' && 'text-muted-foreground/60'
            )}
            testID={`step-${step.id}-label`}
          >
            {step.label}
          </Text>
          {step.detail && (
            <Text
              className="text-xs text-muted-foreground/70 mt-0.5"
              testID={`step-${step.id}-detail`}
            >
              {step.detail}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  )
}

/**
 * StageIndicator component - displays a single stage in the pipeline
 * with active, completed, and pending states
 */
interface StageIndicatorProps {
  label: string
  active: boolean
  completed: boolean
}

function StageIndicator({ label, active, completed }: StageIndicatorProps) {
  return (
    <View className="flex-row items-center gap-2">
      <View
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          completed && 'bg-cyan-500',
          active && 'bg-cyan-400',
          !active && !completed && 'bg-cyan-500/20'
        )}
      />
      <Text
        className={cn(
          'text-xs font-mono uppercase tracking-wide',
          completed && 'text-cyan-500/60',
          active && 'text-cyan-400 font-semibold',
          !active && !completed && 'text-muted-foreground'
        )}
      >
        {label}
      </Text>
      {active && <AnimatedDots />}
    </View>
  )
}

/**
 * AnimatedDots component - displays animated loading dots
 * with staggered fade-in/out for depth effect
 */
function AnimatedDots() {
  const dot1Anim = useRef(new Animated.Value(0)).current
  const dot2Anim = useRef(new Animated.Value(0)).current
  const dot3Anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      )
    }

    Animated.parallel([
      createDotAnimation(dot1Anim, 0),
      createDotAnimation(dot2Anim, 200),
      createDotAnimation(dot3Anim, 400),
    ]).start()
  }, [dot1Anim, dot2Anim, dot3Anim])

  return (
    <View className="flex-row gap-0.5 ml-1">
      <Animated.View style={{ opacity: dot1Anim }}>
        <Text className="text-cyan-400 font-mono text-xs">.</Text>
      </Animated.View>
      <Animated.View style={{ opacity: dot2Anim }}>
        <Text className="text-cyan-400 font-mono text-xs">.</Text>
      </Animated.View>
      <Animated.View style={{ opacity: dot3Anim }}>
        <Text className="text-cyan-400 font-mono text-xs">.</Text>
      </Animated.View>
    </View>
  )
}
