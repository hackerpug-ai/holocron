import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { CommandBadge } from './CommandBadge'

const meta: Meta<typeof CommandBadge> = {
  title: 'Components/CommandBadge',
  component: CommandBadge,
  parameters: {
    docs: {
      description: {
        component:
          'Displays a slash command in monospace styling with optional arguments. Used to render commands distinctly from regular message text.',
      },
    },
  },
  argTypes: {
    command: {
      control: { type: 'text' },
      description: 'The slash command text (e.g., "/search", "/research")',
    },
    args: {
      control: { type: 'text' },
      description: 'Optional arguments following the command',
    },
  },
  args: {
    command: '/search',
  },
  decorators: [
    (Story) => (
      <View className="bg-background p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof CommandBadge>

export const Default: Story = {}

export const WithArgs: Story = {
  args: {
    command: '/research',
    args: 'transformer architectures',
  },
}

export const DeepResearch: Story = {
  args: {
    command: '/deep-research',
    args: 'climate change policies',
  },
}

export const Help: Story = {
  args: {
    command: '/help',
  },
}

export const AllCommands: Story = {
  render: () => (
    <View className="gap-2">
      <CommandBadge command="/search" args="<query>" />
      <CommandBadge command="/research" args="<question>" />
      <CommandBadge command="/deep-research" args="<question>" />
      <CommandBadge command="/browse" />
      <CommandBadge command="/stats" />
      <CommandBadge command="/help" />
    </View>
  ),
}
