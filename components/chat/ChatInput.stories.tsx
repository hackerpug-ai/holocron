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
      <View className="w-full bg-background p-4">
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

export const Interactive: Story = {
  render: () => {
    const [lastSent, setLastSent] = useState<string | null>(null)
    return (
      <View>
        <ChatInput onSend={setLastSent} />
        {lastSent && (
          <Text className="mt-4 text-foreground" testID="last-sent-message">
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
