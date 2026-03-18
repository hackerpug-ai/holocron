import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent } from '@storybook/testing-library'
import { expect } from '@storybook/jest'
import { View } from 'react-native'
import { CommandPanel } from './CommandPanel'

const meta: Meta<typeof CommandPanel> = {
  title: 'Chat/CommandPanel',
  component: CommandPanel,
  parameters: {
    docs: {
      description: {
        component:
          'Floating command panel that appears above the chat input. Wraps SlashCommandMenu with chat-specific positioning and dismiss handling.',
      },
    },
  },
  argTypes: {
    visible: {
      control: { type: 'boolean' },
      description: 'Whether the panel is visible',
    },
    filter: {
      control: { type: 'text' },
      description: 'Filter string to narrow down commands',
    },
    onSelect: {
      action: 'selected',
      description: 'Callback when a command is selected',
    },
    onDismiss: {
      action: 'dismissed',
      description: 'Callback when user taps outside to dismiss',
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
type Story = StoryObj<typeof CommandPanel>

/**
 * Default state showing all 7 commands with shadow and border.
 */
export const Default: Story = {
  args: {
    visible: true,
    filter: '',
  },
}

/**
 * Partial match filters to show only /research command.
 */
export const Filtered: Story = {
  args: {
    visible: true,
    filter: '/re',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows /research command that matches the "/re" filter.',
      },
    },
  },
}

/**
 * Exact match shows only the /help command.
 */
export const SingleMatch: Story = {
  args: {
    visible: true,
    filter: '/help',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows only the /help command when filter matches exactly.',
      },
    },
  },
}

/**
 * When filter matches no commands, panel is hidden (returns null).
 */
export const NoMatches: Story = {
  args: {
    visible: true,
    filter: '/xyz',
  },
  parameters: {
    docs: {
      description: {
        story: 'Panel is hidden when filter matches no commands.',
      },
    },
  },
}

/**
 * Panel is not visible when visible=false.
 */
export const Hidden: Story = {
  args: {
    visible: false,
    filter: '',
  },
  parameters: {
    docs: {
      description: {
        story: 'Panel is hidden when visible prop is false.',
      },
    },
  },
}

/**
 * Interactive story with play function to verify tap behavior.
 */
export const Interactive: Story = {
  args: {
    visible: true,
    filter: '',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Find and click the search command
    const searchCommand = canvas.getByTestId('slash-command-search')
    await expect(searchCommand).toBeInTheDocument()

    await userEvent.click(searchCommand)
    // onSelect callback is verified via Storybook action log
  },
  parameters: {
    docs: {
      description: {
        story: 'Clicking a command triggers the onSelect callback.',
      },
    },
  },
}
