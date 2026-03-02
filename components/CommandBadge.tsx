import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { View, type ViewProps } from 'react-native'

interface CommandBadgeProps extends Omit<ViewProps, 'children'> {
  /** The slash command text (e.g., "/search", "/research") */
  command: string
  /** Optional arguments following the command */
  args?: string
}

/**
 * CommandBadge renders a slash command in monospace styling.
 * Used to display commands distinctly from regular message text.
 */
export function CommandBadge({
  command,
  args,
  className,
  ...props
}: CommandBadgeProps) {
  // Ensure command starts with /
  const formattedCommand = command.startsWith('/') ? command : `/${command}`

  return (
    <View
      className={cn(
        'bg-muted/50 border-border flex-row items-center gap-1 self-start rounded border px-2 py-1',
        className
      )}
      testID="command-badge"
      {...props}
    >
      <Text
        className="text-primary font-mono text-sm font-semibold"
        testID="command-badge-command"
      >
        {formattedCommand}
      </Text>
      {args && (
        <Text
          className="text-muted-foreground font-mono text-sm"
          testID="command-badge-args"
        >
          {args}
        </Text>
      )}
    </View>
  )
}
