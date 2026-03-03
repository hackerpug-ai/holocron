import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ChatInput, type SlashCommand } from './ChatInput'

const meta: Meta<typeof ChatInput> = {
  title: 'Components/ChatInput',
  component: ChatInput,
  parameters: {
    docs: {
      description: {
        component:
          'An elegant floating pill input with animated send button. Features multiline support, integrated slash command suggestions with bold formatting, and smooth spring animations on send.',
      },
    },
  },
  argTypes: {
    onSend: {
      action: 'sent',
      description: 'Callback when message is submitted',
    },
    onSelectCommand: {
      action: 'commandSelected',
      description: 'Callback when a slash command is selected from the menu',
    },
    onSlashButtonPress: {
      action: 'slashButtonPressed',
      description: 'Callback when slash button is tapped',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether input is disabled',
    },
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text for the input',
    },
  },
  args: {
    disabled: false,
    placeholder: 'Ask anything...',
  },
  decorators: [
    (Story) => (
      <View className="bg-background w-full">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ChatInput>

export const Default: Story = {}

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'Search your knowledge base...',
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: 'Processing your request...',
  },
}

export const WithCommandHandler: Story = {
  args: {
    onSelectCommand: (cmd: SlashCommand) => console.log('Command selected:', cmd),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Type "/" to see the command suggestions. Commands are displayed with bold formatting when selected. The onSelectCommand callback fires when a command is chosen from the menu.',
      },
    },
  },
}

export const WithSlashButton: Story = {
  args: {
    onSlashButtonPress: () => console.log('Slash button pressed'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the "/" button on the left side of the input. Tapping inserts "/" and opens the command suggestions as an alternative to typing.',
      },
    },
  },
}

export const FullFeatured: Story = {
  args: {
    onSelectCommand: (cmd: SlashCommand) => console.log('Command selected:', cmd),
    onSlashButtonPress: () => console.log('Slash button pressed'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Full-featured input with command selection callback and slash button. Selected commands appear bold in the input. This is the typical configuration for the main chat screen.',
      },
    },
  },
}
