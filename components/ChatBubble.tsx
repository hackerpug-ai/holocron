import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Bot, User } from '@/components/ui/icons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, View, type ViewProps } from 'react-native'

export type ChatRole = 'user' | 'agent'

interface ChatBubbleProps extends Omit<ViewProps, 'children' | 'role'> {
  /** Message content */
  content: string
  /** Who sent the message */
  sender: ChatRole
  /** Message timestamp */
  timestamp?: Date
  /** Whether the message is being sent */
  isPending?: boolean
}

/**
 * ChatBubble displays a single message in the chat thread.
 * User messages appear on the right with a compact, minimal style.
 * Agent messages appear on the left with a refined, editorial presentation.
 */
export function ChatBubble({
  content,
  sender,
  timestamp,
  isPending = false,
  className,
  ...props
}: ChatBubbleProps) {
  const isUser = sender === 'user'
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(isUser ? 12 : -12)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [fadeAnim, slideAnim])

  const formattedTime = timestamp
    ? timestamp.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : undefined

  return (
    <Animated.View
      className={cn(
        'flex w-full',
        isUser ? 'items-end' : 'items-start',
        className
      )}
      style={{
        opacity: fadeAnim,
        transform: [{ translateX: slideAnim }],
      }}
      testID="chat-bubble"
      {...props}
    >
      <View
        className={cn(
          'flex-row items-start gap-3',
          isUser && 'flex-row-reverse'
        )}
      >
        {/* Avatar indicator */}
        <View
          className={cn(
            'h-7 w-7 items-center justify-center rounded-full',
            isUser
              ? 'bg-primary'
              : 'bg-secondary border-border/50 border'
          )}
        >
          {isUser ? (
            <User size={14} className="text-primary-foreground" strokeWidth={2.5} />
          ) : (
            <Bot size={14} className="text-muted-foreground" strokeWidth={2.5} />
          )}
        </View>

        {/* Message content */}
        <View className="max-w-[75%] gap-1.5">
          <View
            className={cn(
              'rounded-2xl px-4 py-3',
              isUser
                ? 'bg-primary rounded-tr-sm'
                : 'bg-card border-border/40 rounded-tl-sm border',
              isPending && 'opacity-60'
            )}
            testID={`chat-bubble-${sender}`}
          >
            <Text
              className={cn(
                'text-[15px] leading-[22px]',
                isUser ? 'text-primary-foreground' : 'text-foreground'
              )}
            >
              {content}
            </Text>
          </View>

          {/* Timestamp - positioned below bubble */}
          {formattedTime && (
            <Text
              className={cn(
                'text-muted-foreground/70 text-[11px] tracking-wide',
                isUser ? 'text-right pr-1' : 'pl-1'
              )}
            >
              {formattedTime}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  )
}
