import { useEffect, useRef } from 'react'
import { View, AccessibilityInfo, Animated } from 'react-native'
import { Text } from '@/components/ui/text'

const PHASE_COPY: Record<string, string> = {
  triage: 'Thinking…',
  clarifying: 'Asking for details…',
  dispatching: 'Deciding approach…',
  synthesis: 'Writing…',
}

const TOOL_COPY: Record<string, string> = {
  find_recommendations: 'Finding recommendations…',
  kb_search: 'Searching your knowledge base…',
  quick_research: 'Researching…',
  deep_research: 'Researching…',
}

interface Props {
  phase: 'idle' | 'triage' | 'clarifying' | 'dispatching' | 'tool_execution' | 'synthesis'
  toolName: string | null
}

export function AgentActivityIndicator({ phase, toolName }: Props) {
  const opacity = useRef(new Animated.Value(1)).current
  const prevLabel = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start()
    })
    return () => {
      cancelled = true
    }
  }, [opacity])

  if (phase === 'idle') return null

  const label =
    phase === 'tool_execution' && toolName
      ? TOOL_COPY[toolName] ?? 'Working…'
      : PHASE_COPY[phase] ?? 'Working…'

  useEffect(() => {
    if (label !== prevLabel.current) {
      AccessibilityInfo.announceForAccessibility(label)
      prevLabel.current = label
    }
  }, [label])

  return (
    <View testID="agent-activity-indicator" className="px-4 py-2 bg-muted/50">
      <Animated.View style={{ opacity }}>
        <Text testID="agent-activity-label" className="text-sm text-muted-foreground">
          {label}
        </Text>
      </Animated.View>
    </View>
  )
}
