import type { Meta, StoryObj } from '@storybook/react'
import { expect } from '@storybook/jest'
import { within } from '@storybook/testing-library'
import { useState } from 'react'
import { View } from 'react-native'
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
    value: '',
    onChangeText: () => {},
    onSend: () => console.log('Send pressed'),
    disabled: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sendButton = canvas.getByTestId('chat-input-send-button')
    // Button should be disabled when empty
    await expect(sendButton).toBeDisabled()
  },
}

export const WithText: Story = {
  args: {
    value: 'Hello, can you help me?',
    onChangeText: () => {},
    onSend: () => console.log('Send pressed'),
    disabled: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sendButton = canvas.getByTestId('chat-input-send-button')
    // Button should be enabled when there's text
    await expect(sendButton).not.toBeDisabled()
  },
}

export const Disabled: Story = {
  args: {
    value: 'Some text',
    onChangeText: () => {},
    onSend: () => {},
    disabled: true,
  },
}

export const WhitespaceOnly: Story = {
  args: {
    value: '   ',
    onChangeText: () => {},
    onSend: () => {},
    disabled: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sendButton = canvas.getByTestId('chat-input-send-button')
    // Button should be disabled for whitespace-only
    await expect(sendButton).toBeDisabled()
  },
}

export const Interactive = {
  render: function InteractiveStory() {
    const [value, setValue] = useState('')
    return (
      <ChatInput
        value={value}
        onChangeText={setValue}
        onSend={() => {
          console.log('Sent:', value)
          setValue('')
        }}
      />
    )
  },
} as unknown as Story
