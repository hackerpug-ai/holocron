import type { Meta, StoryObj } from '@storybook/react'
import { within, userEvent } from '@storybook/testing-library'
import { expect } from '@storybook/jest'
import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { ChatInput } from './ChatInput'

const meta = {
  title: 'Chat/ChatInput',
  component: ChatInput,
  decorators: [
    (Story) => (
      <View className="bg-background h-96 w-full justify-end p-4">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ChatInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onSend: (content: string) => console.log('Sent:', content),
  },
}

export const WithText: Story = {
  args: {
    defaultValue: 'Hello',
    onSend: (content: string) => console.log('Sent:', content),
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    onSend: (content: string) => console.log('Sent:', content),
  },
}

/**
 * Shows the command panel when input starts with '/'.
 */
export const WithCommandPanel: Story = {
  args: {
    defaultValue: '/',
    onSend: (content: string) => console.log('Sent:', content),
  },
  parameters: {
    docs: {
      description: {
        story: 'Command panel appears when input value starts with "/".',
      },
    },
  },
}

/**
 * Shows filtered commands when typing after '/'.
 */
export const WithFilteredCommandPanel: Story = {
  args: {
    defaultValue: '/re',
    onSend: (content: string) => console.log('Sent:', content),
  },
  parameters: {
    docs: {
      description: {
        story: 'Panel filters to show only matching commands (/research, /resume).',
      },
    },
  },
}

/**
 * Interactive story demonstrating slash button and typing triggers.
 */
export const SlashButtonInteractive: Story = {
  render: () => {
    const [value, setValue] = useState('')
    const [lastSent, setLastSent] = useState<string | null>(null)
    return (
      <View>
        <ChatInput
          value={value}
          onChangeText={setValue}
          onSend={(content: string) => {
            setLastSent(content)
            setValue('')
          }}
        />
        {lastSent && (
          <Text className="text-foreground mt-4" testID="last-sent-message">
            Last sent: {lastSent}
          </Text>
        )}
      </View>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slashButton = canvas.getByTestId('chat-input-slash-button')
    const input = canvas.getByTestId('chat-input-field')

    // Click slash button - should insert '/' and show panel
    await userEvent.click(slashButton)
    await expect(input).toHaveValue('/')

    // Verify command panel is visible
    const commandPanel = canvas.getByTestId('command-panel')
    await expect(commandPanel).toBeInTheDocument()
  },
}

/**
 * Demonstrates real-time filtering as user types after '/'.
 * Panel updates instantly without debounce.
 */
export const FilteringInteractive: Story = {
  render: () => {
    const [value, setValue] = useState('/')
    return (
      <View>
        <ChatInput
          value={value}
          onChangeText={setValue}
          onSend={() => setValue('')}
        />
        <Text className="text-muted-foreground mt-4 text-sm">
          Current filter: "{value}"
        </Text>
      </View>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByTestId('chat-input-field')

    // Panel should be visible with '/' prefix
    let commandPanel = canvas.getByTestId('command-panel')
    await expect(commandPanel).toBeInTheDocument()

    // Type 's' - should filter to search, stats, resume
    await userEvent.type(input, 's')

    // Verify search command is still visible
    const searchCommand = canvas.getByTestId('slash-command-search')
    await expect(searchCommand).toBeInTheDocument()
  },
  parameters: {
    docs: {
      description: {
        story:
          'Real-time filtering: typing after "/" instantly filters the command list.',
      },
    },
  },
}

/**
 * Demonstrates panel auto-hide when no commands match the filter.
 */
export const NoMatchesHidesPanel: Story = {
  args: {
    defaultValue: '/xyz',
    onSend: (content: string) => console.log('Sent:', content),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Panel automatically hides when filter matches no commands (e.g., "/xyz").',
      },
    },
  },
}

/**
 * US-024: Demonstrates command selection with syntax hint.
 * After selecting a command, the syntax hint appears in muted styling.
 */
export const CommandWithSyntaxHint: Story = {
  render: () => {
    const [value, setValue] = useState('/research ')
    return (
      <View>
        <ChatInput
          value={value}
          onChangeText={setValue}
          onSend={() => setValue('')}
        />
        <Text className="text-muted-foreground mt-4 text-sm">
          Note: Syntax hint appears after selecting a command with required arguments.
        </Text>
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'After selecting /research, the syntax hint "<question>" appears in muted styling. Typing clears the hint.',
      },
    },
  },
}

/**
 * US-024: Command without syntax hint (like /help).
 */
export const CommandWithoutSyntaxHint: Story = {
  args: {
    defaultValue: '/help ',
    onSend: (content: string) => console.log('Sent:', content),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Commands like /help have no syntax hint since they take no arguments.',
      },
    },
  },
}

export const Interactive: Story = {
  render: () => {
    const [lastSent, setLastSent] = useState<string | null>(null)
    return (
      <View>
        <ChatInput onSend={setLastSent} />
        {lastSent && (
          <Text className="text-foreground mt-4" testID="last-sent-message">
            Last sent: {lastSent}
          </Text>
        )}
      </View>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByTestId('chat-input-field')
    const sendButton = canvas.getByTestId('chat-input-send-button')

    // Initially disabled
    await expect(sendButton).toBeDisabled()

    // Type text
    await userEvent.type(input, 'Hello world')
    await expect(sendButton).toBeEnabled()

    // Send
    await userEvent.click(sendButton)
    await expect(input).toHaveValue('')
    await expect(canvas.getByText('Last sent: Hello world')).toBeTruthy()
  },
}
