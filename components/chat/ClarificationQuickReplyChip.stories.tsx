import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent, expect, fn } from '@storybook/test'
import { View } from 'react-native'
import { ClarificationQuickReplyChip } from './ClarificationQuickReplyChip'

const meta = {
  title: 'Chat/ClarificationQuickReplyChip',
  component: ClarificationQuickReplyChip,
  args: {
    label: 'San Francisco',
    index: 0,
    onQuickReply: fn(),
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 16 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ClarificationQuickReplyChip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByTestId('quick-reply-chip-0')
    await userEvent.press(chip)
    await expect(args.onQuickReply).toHaveBeenCalledWith('San Francisco')
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

export const LongLabel: Story = {
  args: {
    label: 'The incredibly long clarification option that might wrap to multiple lines on smaller screens',
    index: 1,
  },
}
