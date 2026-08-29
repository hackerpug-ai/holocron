import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { SlashCommandMessage } from './SlashCommandMessage'

const meta: Meta<typeof SlashCommandMessage> = {
  title: 'Chat/SlashCommandMessage',
  component: SlashCommandMessage,
  parameters: {
    docs: {
      description: {
        component:
          'Renders user-submitted slash commands with distinct styling. Shows command badge with monospace arguments and optional timestamp.',
      },
    },
  },
  argTypes: {
    command: {
      control: { type: 'text' },
      description: 'The slash command (e.g., /search)',
    },
    args: {
      control: { type: 'text' },
      description: 'Arguments following the command',
    },
    timestamp: {
      control: { type: 'text' },
      description: 'Timestamp to display below the message',
    },
  },
  decorators: [
    (Story) => (
      <View className="bg-background w-full p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SlashCommandMessage>

/**
 * Command with search query arguments.
 */
export const WithArgs: Story = {
  args: {
    command: '/search',
    args: 'AI transformers',
  },
}

/**
 * Command without arguments (like /help).
 */
export const NoArgs: Story = {
  args: {
    command: '/help',
  },
}

/**
 * Command with long argument text that may wrap.
 */
export const LongArgs: Story = {
  args: {
    command: '/research',
    args: 'What are the latest developments in large language models and how do they compare to traditional NLP approaches?',
  },
}

/**
 * Command with timestamp displayed below.
 */
export const WithTimestamp: Story = {
  args: {
    command: '/stats',
    timestamp: '2:30 PM',
  },
}

/**
 * All 7 supported commands rendered together.
 */
export const AllCommands: Story = {
  render: () => (
    <View className="gap-2">
      <SlashCommandMessage command="/search" args="AI transformers" />
      <SlashCommandMessage command="/research" args="quantum computing advances" />
      <SlashCommandMessage command="/deep-research" args="climate change solutions" />
      <SlashCommandMessage command="/browse" />
      <SlashCommandMessage command="/stats" />
      <SlashCommandMessage command="/help" />
    </View>
  ),
}
