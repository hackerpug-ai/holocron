import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { SlashCommandMenu, type SlashCommand } from './SlashCommandMenu'

const meta: Meta<typeof SlashCommandMenu> = {
  title: 'Components/SlashCommandMenu',
  component: SlashCommandMenu,
  parameters: {
    docs: {
      description: {
        component:
          'Autocomplete popup for slash commands. Displays when user types "/" in the chat input. Shows available commands with descriptions and syntax hints.',
      },
    },
  },
  argTypes: {
    visible: {
      control: { type: 'boolean' },
      description: 'Whether the menu is visible',
    },
    filter: {
      control: { type: 'text' },
      description: 'Filter string to narrow down commands',
    },
    onSelect: {
      action: 'selected',
      description: 'Callback when a command is selected',
    },
  },
  args: {
    visible: true,
    filter: '',
  },
  decorators: [
    (Story) => (
      <View className="bg-background relative h-80 w-full">
        <View className="absolute bottom-0 left-0 right-0">
          <Story />
        </View>
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SlashCommandMenu>

export const Default: Story = {}

export const FilteredBySearch: Story = {
  args: {
    filter: '/search',
  },
}

export const FilteredByResearch: Story = {
  args: {
    filter: '/res',
  },
  parameters: {
    docs: {
      description: {
        story: 'Partial match filters to "research" command.',
      },
    },
  },
}

export const Hidden: Story = {
  args: {
    visible: false,
  },
}

export const CustomCommands: Story = {
  args: {
    commands: [
      { name: 'summarize', description: 'Summarize selected text', syntax: '<selection>' },
      { name: 'translate', description: 'Translate to another language', syntax: '<lang>' },
      { name: 'explain', description: 'Explain the current topic' },
    ] satisfies SlashCommand[],
  },
}

export const NoMatches: Story = {
  args: {
    filter: '/xyz',
  },
  parameters: {
    docs: {
      description: {
        story: 'When filter matches no commands, menu is hidden.',
      },
    },
  },
}
