import { View, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { Send, WandSparkles } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import {
  useMentions,
  replaceTriggerValues,
  type TriggersConfig,
  type SuggestionsProvidedProps,
} from 'react-native-controlled-mentions'
import { VoiceMicButton } from '@/components/voice/VoiceMicButton'
import type { VoiceState } from '@/hooks/use-voice-session-state'

export interface SlashCommand {
  /** Command name without the leading slash */
  name: string
  /** Brief description of what the command does */
  description: string
  /** Syntax hint (e.g., "<query>") */
  syntax?: string
}

export interface ChatInputProps {
  /** Callback when user sends a message - receives trimmed content */
  onSend?: ((_content: string) => void) | (() => void)
  /** Callback when slash command is selected from the menu */
  onSelectCommand?: (_command: SlashCommand) => void
  /** Callback when slash button is tapped (alternative to typing /) */
  onSlashButtonPress?: () => void
  /** Placeholder text for input */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Default value for the input (uncontrolled mode) */
  defaultValue?: string
  /** Controlled value prop (for backward compatibility) */
  value?: string
  /** Controlled onChange prop (for backward compatibility) */
  onChangeText?: (_text: string) => void
  /** testID for the root element */
  testID?: string
  /** Available commands */
  commands?: SlashCommand[]
  /** Whether a plan is currently pending approval */
  planPending?: boolean
  /** Custom placeholder when plan is pending */
  planPendingPlaceholder?: string
  /** Whether to show the voice button */
  showVoiceButton?: boolean
  /** Current voice session state */
  voiceState?: VoiceState
  /** Callback when voice session should start */
  onVoiceStart?: () => void
  /** Callback when voice session should stop */
  onVoiceStop?: () => void
  /** Whether a warm WebRTC connection is available for fast re-activation */
  isWarm?: boolean
}

const DEFAULT_COMMANDS: SlashCommand[] = [
  { name: 'search', description: 'Search the knowledge base', syntax: '<query>' },
  { name: 'shop', description: 'Search for product deals', syntax: '<product>' },
  { name: 'research', description: 'Start a research workflow', syntax: '<question>' },
  { name: 'deep-research', description: 'Multi-iteration deep research', syntax: '<question>' },
  { name: 'browse', description: 'Browse recent articles' },
  { name: 'stats', description: 'View knowledge base statistics' },
  { name: 'resume', description: 'Resume a previous research session', syntax: '<id>' },
  { name: 'subscribe', description: 'Add a subscription source', syntax: '<type> <id> [name]' },
  { name: 'unsubscribe', description: 'Remove a subscription', syntax: '<id>' },
  { name: 'subscriptions', description: 'List your subscriptions', syntax: '[type]' },
  { name: 'check-subs', description: 'Check subscriptions for new content' },
  { name: 'whats-new', description: 'Get AI news briefing', syntax: '[days]' },
  { name: 'toolbelt', description: 'Search or add tools', syntax: '<query or url>' },
  { name: 'save', description: 'Save document to knowledge base', syntax: '<title> [category]' },
  { name: 'help', description: 'Show all available commands' },
]

/**
 * Command suggestions component for the mentions input
 */
function CommandSuggestions({
  keyword,
  onSelect,
  commands,
}: SuggestionsProvidedProps & { commands: SlashCommand[] }) {
  // Don't show if no keyword (triggers shows when user types "/")
  if (keyword === undefined) return null

  // Filter commands based on keyword
  const filterText = keyword.toLowerCase()
  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(filterText) ||
      cmd.description.toLowerCase().includes(filterText)
  )

  if (filteredCommands.length === 0) return null

  // Check for exact match - highlight it
  const exactMatch = commands.find((cmd) => cmd.name.toLowerCase() === filterText)

  return (
    <View
      testID="command-suggestions"
      className="bg-popover border-border absolute bottom-full left-0 right-0 mb-2 max-h-64 rounded-lg border shadow-lg"
    >
      <ScrollView className="p-2" keyboardShouldPersistTaps="handled">
        {filteredCommands.map((command) => {
          const isExactMatch = exactMatch?.name === command.name

          return (
            <Pressable
              key={command.name}
              onPress={() => onSelect({ id: command.name, name: command.name })}
              className={cn(
                'rounded-md px-3 py-2',
                isExactMatch ? 'bg-accent' : 'active:bg-accent'
              )}
              testID={`slash-command-${command.name}`}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-primary font-mono text-sm font-semibold">
                  /{command.name}
                </Text>
                {command.syntax && (
                  <Text className="text-muted-foreground font-mono text-xs">
                    {command.syntax}
                  </Text>
                )}
              </View>
              <Text className="text-muted-foreground mt-0.5 text-sm">
                {command.description}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

export function ChatInput({
  onSend,
  onSelectCommand,
  onSlashButtonPress,
  placeholder = 'Type a message...',
  disabled = false,
  defaultValue = '',
  value: controlledValue,
  onChangeText,
  testID = 'chat-input',
  commands = DEFAULT_COMMANDS,
  planPending = false,
  planPendingPlaceholder = 'Waiting for plan approval...',
  showVoiceButton = false,
  voiceState = 'idle',
  onVoiceStart,
  onVoiceStop,
  isWarm = false,
}: ChatInputProps) {
  const { colors: themeColors } = useTheme()

  // Support both controlled and uncontrolled modes
  const isControlled = controlledValue !== undefined && onChangeText !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue)

  const value = isControlled ? controlledValue : internalValue
  const setValue = isControlled ? onChangeText : setInternalValue

  // Triggers config for slash commands - memoized to prevent re-renders
  const triggersConfig: TriggersConfig<'command'> = useMemo(
    () => ({
      command: {
        trigger: '/',
        textStyle: {
          fontWeight: 'bold' as const,
          color: themeColors.primary,
        },
        // Keep the trigger character in the text
        isInsertSpaceAfterMention: true,
      },
    }),
    [themeColors.primary]
  )

  const { textInputProps, triggers } = useMentions({
    value,
    onChange: setValue,
    triggersConfig,
  })

  const trimmedValue = value.trim()
  const canSend = trimmedValue.length > 0 && !disabled && !planPending
  const effectiveDisabled = disabled || planPending
  const effectivePlaceholder = planPending ? planPendingPlaceholder : placeholder

  // Track whether the wand button forced the command panel open
  const [forceShowCommands, setForceShowCommands] = useState(false)

  // Show command panel when mentions trigger detects "/" OR when wand button toggled it
  const mentionsActive = triggers.command.keyword !== undefined
  const showCommandPanel = mentionsActive || forceShowCommands

  // Dismiss forced panel when user starts typing
  useEffect(() => {
    if (forceShowCommands && value.length > 0) {
      setForceShowCommands(false)
    }
  }, [value, forceShowCommands])

  // Auto-select command when user types the full command name
  useEffect(() => {
    const keyword = triggers.command.keyword
    if (keyword === undefined) return

    // Check for exact match (case-insensitive)
    const exactMatch = commands.find(
      (cmd) => cmd.name.toLowerCase() === keyword.toLowerCase()
    )

    if (exactMatch) {
      // Auto-select the command - same as clicking it
      triggers.command.onSelect({ id: exactMatch.name, name: exactMatch.name })
      // Notify parent if callback provided
      if (onSelectCommand) {
        onSelectCommand(exactMatch)
      }
    }
  }, [triggers.command.keyword, commands, triggers.command, onSelectCommand])

  // Handle command selection from suggestions
  const handleCommandSelect = useCallback(
    (suggestion: { id: string; name: string }) => {
      setForceShowCommands(false)

      // Check if mentions system is active (user typed "/")
      const mentionsActive = triggers.command.keyword !== undefined

      if (mentionsActive) {
        // Use the mentions system's onSelect (normal flow)
        triggers.command.onSelect(suggestion)
      } else {
        // Wand button forced panel - directly inject command as plain text
        const commandText = `/${suggestion.name} `
        setValue(commandText)
      }
    },
    [triggers.command, setValue]
  )

  // Handle wand button press - toggle command menu without injecting "/"
  const handleSlashButtonPress = () => {
    if (showCommandPanel) {
      // Already showing - dismiss it
      setForceShowCommands(false)
    } else {
      // Show command menu without modifying the input text
      setForceShowCommands(true)
    }
    onSlashButtonPress?.()
  }

  const handleSend = () => {
    if (canSend && onSend) {
      // Convert mention-formatted text back to plain text
      // e.g., "{/}[search](search) query" → "/search query"
      const plainText = replaceTriggerValues(trimmedValue, (mention) => `${mention.trigger}${mention.name}`)

      // Check if onSend expects an argument (new API) or not (old API)
      if (onSend.length > 0) {
        // New API: pass trimmed content
        ;(onSend as (_content: string) => void)(plainText)
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

  // Derive placeholder visibility - hide when there's content
  const showPlaceholder = value.length === 0

  return (
    <View testID={testID} className="relative">
      {/* Command Suggestions Panel - positioned above input */}
      {showCommandPanel && (
        <CommandSuggestions
          keyword={triggers.command.keyword ?? ''}
          onSelect={handleCommandSelect}
          commands={commands}
        />
      )}

      {/* Input Row */}
      <View className="flex-row items-end gap-2 border-t border-border bg-background px-4 py-2">
        {/* Slash Button */}
        <Pressable
          testID="chat-input-slash-button"
          onPress={handleSlashButtonPress}
          disabled={effectiveDisabled}
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            showCommandPanel ? 'bg-primary' : 'bg-muted'
          )}
        >
          <WandSparkles
            size={20}
            color={showCommandPanel ? themeColors.primaryForeground : themeColors.foreground}
          />
        </Pressable>

        {/* Text Input Container */}
        <View className="relative flex-1">
          <View
            className="min-h-[40px] max-h-32 rounded-2xl bg-muted overflow-hidden"
            testID="chat-input-container"
          >
            {/* Placeholder - shown when input is empty */}
            {showPlaceholder && (
              <View pointerEvents="none" style={styles.placeholderContainer}>
                <Text className={cn(
                  'text-muted-foreground',
                  planPending && 'text-warning/70'
                )} style={styles.placeholder}>
                  {effectivePlaceholder}
                </Text>
              </View>
            )}

            {/* Multiline TextInput with mentions support */}
            <TextInput
              {...textInputProps}
              testID="chat-input-field"
              style={[styles.textInput, { color: themeColors.foreground }]}
              multiline
              editable={!effectiveDisabled}
              scrollEnabled
            />
          </View>
        </View>

        {/* Send Button or Voice Mic Button */}
        {showVoiceButton && value.length === 0 ? (
          <VoiceMicButton
            voiceState={voiceState ?? 'idle'}
            onStart={onVoiceStart ?? (() => {})}
            onStop={onVoiceStop ?? (() => {})}
            isWarm={isWarm}
          />
        ) : (
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
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 128,
  },
  placeholderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  placeholder: {
    fontSize: 16,
  },
})
