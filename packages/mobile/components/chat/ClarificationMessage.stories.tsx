import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent, expect, fn } from '@storybook/test'
import { View } from 'react-native'
import { ClarificationMessage } from './ClarificationMessage'

const meta = {
  title: 'Chat/ClarificationMessage',
  component: ClarificationMessage,
  args: {
    question: 'Where are you located?',
    quickReplies: ['San Francisco', 'New York', 'Los Angeles'],
    onQuickReply: fn(),
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ClarificationMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithQuickReplies: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByTestId('quick-reply-chip-0')
    await userEvent.press(chip)
    await expect(args.onQuickReply).toHaveBeenCalledWith('San Francisco')
  },
}

export const WithMaximumChips: Story = {
  args: {
    quickReplies: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
  },
}

export const Answered: Story = {
  args: {
    answered: true,
    quickReplies: ['San Francisco', 'New York', 'Los Angeles'],
  },
}

export const WithUserResponse: Story = {
  args: {
    userResponse: 'San Francisco',
    answered: true,
  },
}

export const LongQuestion: Story = {
  args: {
    question: 'What is your preferred location for in-person coaching sessions? Please select from the options below.',
  },
}
