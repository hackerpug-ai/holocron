import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { CommandBadge } from '@/components/CommandBadge'

export interface SlashCommandMessageProps {
  /** The slash command (e.g., '/search', '/research') */
  command: string
  /** Optional arguments following the command */
  args?: string
  /** Optional timestamp to display */
  timestamp?: string
  /** testID for testing */
  testID?: string
}

/**
 * SlashCommandMessage renders a user-submitted slash command
 * with distinct styling from regular messages.
 *
 * @see US-021 - Design SlashCommandMessage component
 */
export function SlashCommandMessage({
  command,
  args,
  timestamp,
  testID = 'slash-command-message',
}: SlashCommandMessageProps) {
  return (
    <View testID={testID} className="my-1 items-end px-4">
      <View
        testID={`${testID}-container`}
        className="max-w-[80%] rounded-lg border border-border bg-muted/30 p-3"
      >
        <View className="flex-row flex-wrap items-center gap-2">
          <CommandBadge command={command} />
          {args && (
            <Text
              testID={`${testID}-args`}
              className="font-mono text-sm text-foreground"
            >
              {args}
            </Text>
          )}
        </View>
      </View>
      {timestamp && (
        <Text
          testID={`${testID}-timestamp`}
          className="mt-0.5 text-xs text-muted-foreground"
        >
          {timestamp}
        </Text>
      )}
    </View>
  )
}
