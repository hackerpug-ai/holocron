import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ChatInput } from './ChatInput'

const meta: Meta<typeof ChatInput> = {
  title: 'Components/ChatInput',
  component: ChatInput,
  parameters: {
    docs: {
      description: {
        component:
          'An elegant floating pill input with animated send button. Features multiline support, command hint icon, and smooth spring animations on send.',
      },
    },
  },
  argTypes: {
    onSend: {
      action: 'sent',
      description: 'Callback when message is submitted',
    },
    onSlashCommand: {
      action: 'slashCommand',
      description: 'Callback when slash command is detected',
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

export const WithSlashCommandHandler: Story = {
  args: {
    onSlashCommand: (cmd) => console.log('Slash command detected:', cmd),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Type "/" to trigger the slash command callback. The command icon on the left hints at this functionality.',
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
          'Shows the "/" button on the left side of the input. Tapping opens the slash command menu as an alternative to typing "/".',
      },
    },
  },
}

export const FullFeatured: Story = {
  args: {
    onSlashCommand: (cmd) => console.log('Slash command detected:', cmd),
    onSlashButtonPress: () => console.log('Slash button pressed'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Full-featured input with both slash typing detection and slash button. This is the typical configuration for the main chat screen.',
      },
    },
  },
}
