import { cn } from '@/lib/utils'
import { ArrowUp } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  TextInput,
  View,
  type ViewProps,
} from 'react-native'

interface ChatInputProps extends Omit<ViewProps, 'children'> {
  /** Callback when message is submitted */
  onSend: (message: string) => void
  /** Callback when slash command is detected */
  onSlashCommand?: (command: string) => void
  /** Whether input is disabled */
  disabled?: boolean
  /** Placeholder text */
  placeholder?: string
}

/**
 * ChatInput provides an elegant message input bar for the chat interface.
 * Features a floating pill design with smooth send button animation.
 */
export function ChatInput({
  onSend,
  onSlashCommand,
  disabled = false,
  placeholder = 'Ask anything...',
  className,
  ...props
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const sendScale = useRef(new Animated.Value(0.8)).current
  const sendOpacity = useRef(new Animated.Value(0)).current
  const inputRef = useRef<TextInput>(null)

  const canSend = value.trim().length > 0 && !disabled

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sendScale, {
        toValue: canSend ? 1 : 0.8,
        friction: 8,
        tension: 300,
        useNativeDriver: true,
      }),
      Animated.timing(sendOpacity, {
        toValue: canSend ? 1 : 0.4,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start()
  }, [canSend, sendScale, sendOpacity])

  const handleChangeText = (text: string) => {
    setValue(text)
    if (text.startsWith('/') && onSlashCommand) {
      onSlashCommand(text)
    }
  }

  const handleSend = () => {
    const trimmed = value.trim()
    if (trimmed && !disabled) {
      // Quick scale bounce on send
      Animated.sequence([
        Animated.spring(sendScale, {
          toValue: 0.85,
          friction: 8,
          tension: 400,
          useNativeDriver: true,
        }),
        Animated.spring(sendScale, {
          toValue: 1,
          friction: 8,
          tension: 300,
          useNativeDriver: true,
        }),
      ]).start()

      onSend(trimmed)
      setValue('')
    }
  }

  return (
    <View
      className={cn('bg-background border-border/30 border-t px-3 py-1.5', className)}
      testID="chat-input"
      {...props}
    >
      <View
        className={cn(
          'bg-muted/50 flex-row items-end gap-2 rounded-2xl px-3 py-2',
          isFocused && 'bg-muted/70',
          disabled && 'opacity-50'
        )}
      >
        {/* Text input - multiline textarea */}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="hsl(215, 20%, 55%)"
          editable={!disabled}
          multiline
          maxLength={4000}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          blurOnSubmit={false}
          className="text-foreground flex-1 text-[15px]"
          style={{ minHeight: 20, maxHeight: 100 }}
          testID="chat-input-field"
        />

        {/* Send button */}
        <Animated.View
          style={{
            transform: [{ scale: sendScale }],
            opacity: sendOpacity,
          }}
        >
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className={cn(
              'h-7 w-7 items-center justify-center rounded-full',
              canSend ? 'bg-primary' : 'bg-transparent'
            )}
            testID="chat-input-send"
          >
            <ArrowUp
              size={16}
              className={canSend ? 'text-primary-foreground' : 'text-muted-foreground'}
              strokeWidth={2.5}
            />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  )
}
