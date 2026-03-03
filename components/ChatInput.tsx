import { cn } from '@/lib/utils'
import { Text } from '@/components/ui/text'
import { ArrowUp, Slash } from 'lucide-react-native'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  TextInput,
  View,
  StyleSheet,
  ScrollView,
  type ViewProps,
} from 'react-native'
import {
  useMentions,
  type TriggersConfig,
  type SuggestionsProvidedProps,
} from 'react-native-controlled-mentions'

export interface SlashCommand {
  /** Command name without the leading slash */
  name: string
  /** Brief description of what the command does */
  description: string
  /** Syntax hint (e.g., "<query>") */
  syntax?: string
}

const DEFAULT_COMMANDS: SlashCommand[] = [
  { name: 'search', description: 'Search the knowledge base', syntax: '<query>' },
  { name: 'research', description: 'Start a research workflow', syntax: '<question>' },
  { name: 'deep-research', description: 'Multi-iteration deep research', syntax: '<question>' },
  { name: 'browse', description: 'Browse recent articles' },
  { name: 'stats', description: 'View knowledge base statistics' },
  { name: 'resume', description: 'Resume a previous research session', syntax: '<id>' },
  { name: 'help', description: 'Show all available commands' },
]

interface ChatInputProps extends Omit<ViewProps, 'children'> {
  /** Callback when message is submitted */
  onSend: (message: string) => void
  /** Callback when slash command is selected from the menu */
  onSelectCommand?: (command: SlashCommand) => void
  /** Callback when slash button is tapped (alternative to typing /) */
  onSlashButtonPress?: () => void
  /** Whether input is disabled */
  disabled?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Available commands */
  commands?: SlashCommand[]
}

/**
 * Command suggestions panel for slash commands
 */
function CommandSuggestions({
  keyword,
  onSelect,
  commands,
}: SuggestionsProvidedProps & { commands: SlashCommand[] }) {
  // Don't show if no keyword
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
      style={styles.suggestionsContainer}
      className="bg-popover border-border rounded-2xl border shadow-lg"
    >
      <ScrollView style={styles.suggestionsList} showsVerticalScrollIndicator={false}>
        {filteredCommands.map((command) => {
          const isExactMatch = exactMatch?.name === command.name

          return (
            <Pressable
              key={command.name}
              onPress={() => onSelect({ id: command.name, name: command.name })}
              className={cn(
                'rounded-lg px-3 py-2.5',
                isExactMatch ? 'bg-accent' : 'active:bg-accent'
              )}
              testID={`slash-command-${command.name}`}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-primary font-mono text-sm font-bold">
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

/**
 * ChatInput provides an elegant message input bar for the chat interface.
 * Features a floating pill design with smooth send button animation.
 * Uses react-native-controlled-mentions for slash command support with
 * bold formatting for selected commands.
 */
export function ChatInput({
  onSend,
  onSelectCommand,
  onSlashButtonPress,
  disabled = false,
  placeholder = 'Ask anything...',
  commands = DEFAULT_COMMANDS,
  className,
  ...props
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const sendScale = useRef(new Animated.Value(0.8)).current
  const sendOpacity = useRef(new Animated.Value(0)).current
  const inputRef = useRef<TextInput>(null)

  // Triggers config for slash commands
  const triggersConfig: TriggersConfig<'command'> = useMemo(
    () => ({
      command: {
        trigger: '/',
        textStyle: {
          fontWeight: 'bold' as const,
          color: '#6366f1', // Primary indigo color for commands
        },
        isInsertSpaceAfterMention: true,
      },
    }),
    []
  )

  const { textInputProps, triggers } = useMentions({
    value,
    onChange: setValue,
    triggersConfig,
  })

  const canSend = value.trim().length > 0 && !disabled
  const showCommandPanel = triggers.command.keyword !== undefined

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

  // Handle command selection from suggestions
  const handleCommandSelect = useCallback(
    (suggestion: { id: string; name: string }) => {
      triggers.command.onSelect(suggestion)
      // Notify parent if callback provided
      const selectedCommand = commands.find((cmd) => cmd.name === suggestion.name)
      if (selectedCommand && onSelectCommand) {
        onSelectCommand(selectedCommand)
      }
    },
    [triggers.command, commands, onSelectCommand]
  )

  // Handle slash button press - insert "/" to trigger command menu
  const handleSlashPress = () => {
    if (!value.startsWith('/')) {
      setValue('/')
    }
    onSlashButtonPress?.()
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
      {/* Command Suggestions Panel - positioned above input */}
      {showCommandPanel && (
        <CommandSuggestions
          keyword={triggers.command.keyword}
          onSelect={handleCommandSelect}
          commands={commands}
        />
      )}

      <View className="flex-row items-end gap-2">
        {/* Slash command button */}
        <Pressable
          onPress={handleSlashPress}
          disabled={disabled}
          className={cn(
            'h-10 w-10 items-center justify-center rounded-xl',
            showCommandPanel ? 'bg-primary' : 'bg-muted/50 active:bg-muted'
          )}
          testID="chat-input-slash-button"
        >
          <Slash
            size={18}
            className={showCommandPanel ? 'text-primary-foreground' : 'text-muted-foreground'}
            strokeWidth={2}
          />
        </Pressable>

        {/* Input container */}
        <View
          className={cn(
            'bg-muted/50 flex-1 flex-row items-end gap-2 rounded-2xl px-3 py-2',
            isFocused && 'bg-muted/70',
            disabled && 'opacity-50'
          )}
        >
          {/* Text input - multiline textarea with mentions support */}
          <TextInput
            ref={inputRef}
            {...textInputProps}
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
    </View>
  )
}

const styles = StyleSheet.create({
  suggestionsContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: 8,
    maxHeight: 256,
    overflow: 'hidden',
  },
  suggestionsList: {
    padding: 8,
  },
})
