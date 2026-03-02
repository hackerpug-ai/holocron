import { View, TextInput, Pressable } from 'react-native'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Send } from 'lucide-react-native'

export interface ChatInputProps {
  /** Callback when user sends a message - receives trimmed content */
  onSend?: ((content: string) => void) | (() => void)
  /** Placeholder text for input */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Default value for the input (uncontrolled mode) */
  defaultValue?: string
  /** Controlled value prop (for backward compatibility) */
  value?: string
  /** Controlled onChange prop (for backward compatibility) */
  onChangeText?: (text: string) => void
  /** testID for the root element */
  testID?: string
}

export function ChatInput({
  onSend,
  placeholder = 'Type a message...',
  disabled = false,
  defaultValue = '',
  value: controlledValue,
  onChangeText,
  testID = 'chat-input',
}: ChatInputProps) {
  // Support both controlled and uncontrolled modes
  const isControlled = controlledValue !== undefined && onChangeText !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue)

  // Sync internal value when controlled value changes
  useEffect(() => {
    if (isControlled) {
      setInternalValue(controlledValue)
    }
  }, [controlledValue, isControlled])

  const value = isControlled ? controlledValue : internalValue
  const setValue = isControlled ? onChangeText : setInternalValue

  const trimmedValue = value.trim()
  const canSend = trimmedValue.length > 0 && !disabled

  const handleSend = () => {
    if (canSend && onSend) {
      // Check if onSend expects an argument (new API) or not (old API)
      if (onSend.length > 0) {
        // New API: pass trimmed content
        ;(onSend as (content: string) => void)(trimmedValue)
        // Clear input only in uncontrolled mode
        if (!isControlled) {
          setValue('')
        }
      } else {
        // Old API: no arguments
        ;(onSend as () => void)()
      }
    }
  }

  return (
    <View
      testID={testID}
      className="flex-row items-center gap-2 px-4 py-2 border-t border-border bg-background"
    >
      <TextInput
        testID="chat-input-field"
        className="flex-1 bg-muted rounded-full px-4 py-2 text-foreground"
        placeholder={placeholder}
        placeholderTextColor="hsl(var(--muted-foreground))"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={handleSend}
        editable={!disabled}
        returnKeyType="send"
        blurOnSubmit={false}
      />
      <Pressable
        testID="chat-input-send-button"
        onPress={handleSend}
        disabled={!canSend}
        className={cn(
          'w-10 h-10 rounded-full items-center justify-center',
          canSend ? 'bg-primary' : 'bg-muted'
        )}
      >
        <Send
          size={20}
          color={canSend ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'}
        />
      </Pressable>
    </View>
  )
}
