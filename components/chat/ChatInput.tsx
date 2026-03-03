import { View, TextInput, Pressable, useColorScheme } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react-native'
import { colors } from '@/lib/theme'
import { CommandPanel, type SlashCommand } from './CommandPanel'

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
  const colorScheme = useColorScheme()
  const themeColors = colorScheme === 'dark' ? colors.dark : colors.light

  // Support both controlled and uncontrolled modes
  const isControlled = controlledValue !== undefined && onChangeText !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue)

  // Syntax hint state for US-024
  const [syntaxHint, setSyntaxHint] = useState<string | null>(null)
  const commandBaseRef = useRef<string>('')

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

  // Command panel visibility - derived from whether input starts with '/'
  const showCommandPanel = value.startsWith('/')

  // Extract filter for command panel (the full text starting with '/')
  const commandFilter = value.startsWith('/') ? value : ''

  // Clear syntax hint when user types beyond the command base
  useEffect(() => {
    if (syntaxHint && commandBaseRef.current) {
      // If user has typed beyond the command base, clear the hint
      if (value.length > commandBaseRef.current.length) {
        setSyntaxHint(null)
        commandBaseRef.current = ''
      }
      // If user backspaced into the command, clear the hint
      if (!value.startsWith(commandBaseRef.current.slice(0, -1))) {
        setSyntaxHint(null)
        commandBaseRef.current = ''
      }
    }
  }, [value, syntaxHint])

  // Handle text change - panel visibility is derived from value
  const handleTextChange = (text: string) => {
    setValue(text)
  }

  // Handle '/' button press - insert '/' if not already present
  const handleSlashButtonPress = () => {
    if (!value.startsWith('/')) {
      setValue('/')
    }
  }

  // Handle command selection - US-024: insert command with syntax hint
  const handleCommandSelect = (command: SlashCommand) => {
    const commandText = `/${command.name} `
    setValue(commandText)
    commandBaseRef.current = commandText

    // Set syntax hint if command has one
    if (command.syntax) {
      setSyntaxHint(command.syntax)
    } else {
      setSyntaxHint(null)
    }
  }

  // Handle panel dismiss
  const handlePanelDismiss = () => {
    // Clear the '/' prefix to hide panel
    if (value.startsWith('/')) {
      setValue('')
    }
    setSyntaxHint(null)
    commandBaseRef.current = ''
  }

  const handleSend = () => {
    if (canSend && onSend) {
      // Clear syntax hint on send
      setSyntaxHint(null)
      commandBaseRef.current = ''

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
    <View testID={testID} className="relative">
      {/* Command Panel - positioned above input */}
      <CommandPanel
        visible={showCommandPanel}
        filter={commandFilter}
        onSelect={handleCommandSelect}
        onDismiss={handlePanelDismiss}
      />

      {/* Input Row */}
      <View className="flex-row items-center gap-2 border-t border-border bg-background px-4 py-2">
        {/* Slash Button */}
        <Pressable
          testID="chat-input-slash-button"
          onPress={handleSlashButtonPress}
          disabled={disabled}
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            showCommandPanel ? 'bg-primary' : 'bg-muted'
          )}
        >
          <Text
            className={cn(
              'font-mono text-lg',
              showCommandPanel ? 'text-primary-foreground' : 'text-foreground'
            )}
          >
            /
          </Text>
        </Pressable>

        {/* Text Input Container with Syntax Hint */}
        <View className="relative flex-1">
          <TextInput
            testID="chat-input-field"
            className="w-full rounded-full bg-muted px-4 py-2 text-foreground"
            placeholder={placeholder}
            placeholderTextColor={themeColors.mutedForeground}
            value={value}
            onChangeText={handleTextChange}
            onSubmitEditing={handleSend}
            editable={!disabled}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          {/* Syntax Hint Overlay - US-024 */}
          {syntaxHint && (
            <View
              testID="chat-input-syntax-hint-container"
              pointerEvents="none"
              className="absolute inset-0 flex-row items-center px-4"
            >
              {/* Invisible text to match input value width */}
              <Text className="font-sans text-base text-transparent">{value}</Text>
              {/* Visible syntax hint in muted color */}
              <Text
                testID="chat-input-syntax-hint"
                className="font-mono text-sm text-muted-foreground"
              >
                {syntaxHint}
              </Text>
            </View>
          )}
        </View>

        {/* Send Button */}
        <Pressable
          testID="chat-input-send-button"
          onPress={handleSend}
          disabled={!canSend}
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            canSend ? 'bg-primary' : 'bg-muted'
          )}
        >
          <Send
            size={20}
            color={canSend ? themeColors.primaryForeground : themeColors.mutedForeground}
          />
        </Pressable>
      </View>
    </View>
  )
}
