import { cn } from '@/lib/utils'
import { Send } from 'lucide-react-native'
import { Pressable, TextInput, View, useColorScheme } from 'react-native'
import { colors } from '@/lib/theme'

export interface ChatInputProps {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  testID?: string
}

/**
 * ChatInput provides a simple message input with send button.
 * Features validation to disable send button when input is empty or whitespace-only.
 */
export function ChatInput({
  value,
  onChangeText,
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  testID = 'chat-input',
}: ChatInputProps) {
  const colorScheme = useColorScheme()
  const themeColors = colorScheme === 'dark' ? colors.dark : colors.light
  const isEmpty = value.trim().length === 0
  const canSend = !disabled && !isEmpty

  const handleSubmit = () => {
    if (canSend) {
      onSend()
    }
  }

  return (
    <View
      className={cn('w-full border-t border-border/30 bg-background p-2')}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <TextInput
          className={cn(
            'text-foreground placeholder:text-muted-foreground min-h-[40px] flex-1 text-base',
            disabled && 'opacity-50'
          )}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={handleSubmit}
          placeholder={placeholder}
          placeholderTextColor="hsl(215, 20%, 55%)"
          editable={!disabled}
          returnKeyType="send"
          testID="chat-input-field"
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!canSend}
          testID="chat-input-send-button"
          className={cn(
            'items-center justify-center rounded-full p-2',
            canSend ? 'bg-primary active:bg-primary/90' : 'bg-muted opacity-50'
          )}
        >
          <Send
            size={20}
            className={cn(canSend ? 'text-primary-foreground' : 'text-muted-foreground')}
            strokeWidth={2}
          />
        </Pressable>
      </View>
    </View>
  )
}
