import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Pressable, ScrollView, View, type ViewProps } from 'react-native'

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
  { name: 'help', description: 'Show all available commands' },
]

interface SlashCommandMenuProps extends Omit<ViewProps, 'children'> {
  /** Whether the menu is visible */
  visible?: boolean
  /** Available commands (defaults to standard set) */
  commands?: SlashCommand[]
  /** Filter string to narrow down commands */
  filter?: string
  /** Callback when a command is selected */
  onSelect: (_command: SlashCommand) => void
}

/**
 * SlashCommandMenu displays an autocomplete popup for slash commands.
 * Shows when user types "/" in the chat input.
 */
export function SlashCommandMenu({
  visible = true,
  commands = DEFAULT_COMMANDS,
  filter = '',
  onSelect,
  className,
  ...props
}: SlashCommandMenuProps) {
  if (!visible) return null

  // Filter commands based on input (after the /)
  const filterText = filter.startsWith('/') ? filter.slice(1).toLowerCase() : filter.toLowerCase()
  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(filterText) ||
      cmd.description.toLowerCase().includes(filterText)
  )

  if (filteredCommands.length === 0) return null

  return (
    <View
      className={cn(
        'bg-popover border-border absolute bottom-full left-0 right-0 mb-2 max-h-64 rounded-lg border shadow-lg',
        className
      )}
      testID="slash-command-menu"
      {...props}
    >
      <ScrollView className="p-2" testID="slash-command-menu-scroll">
        {filteredCommands.map((command) => (
          <Pressable
            key={command.name}
            onPress={() => onSelect(command)}
            className="active:bg-accent rounded-md px-3 py-2"
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
        ))}
      </ScrollView>
    </View>
  )
}
