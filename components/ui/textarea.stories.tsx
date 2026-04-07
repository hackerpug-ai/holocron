import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Textarea } from './textarea'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  parameters: {
    docs: {
      description: {
        component: 'Multiline text input component for longer form content. Supports auto-resize on web.',
      },
    },
  },
  argTypes: {
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text when textarea is empty',
    },
    editable: {
      control: { type: 'boolean' },
      description: 'Whether textarea can be edited',
    },
    numberOfLines: {
      control: { type: 'number' },
      description: 'Number of lines to display',
    },
  },
  decorators: [
    (Story) => (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Textarea>

export const Default: Story = {
  args: {
    placeholder: 'Enter your message...',
  },
}

export const WithValue: Story = {
  args: {
    defaultValue: 'This is some pre-filled text content.',
  },
}

export const Disabled: Story = {
  args: {
    editable: false,
    defaultValue: 'This textarea is disabled.',
  },
}

export const CustomLines: Story = {
  args: {
    placeholder: 'Enter a long description...',
    numberOfLines: 5,
  },
}

export const LongContent: Story = {
  args: {
    defaultValue: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    numberOfLines: 4,
  },
}

export const Minimal: Story = {
  args: {
    placeholder: 'Short note',
    numberOfLines: 2,
  },
}

export const Large: Story = {
  args: {
    placeholder: 'Enter your detailed feedback here...',
    numberOfLines: 8,
  },
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3 w-full max-w-sm">
      <View>
        <Text className="mb-1 text-sm font-medium">Default</Text>
        <Textarea placeholder="Enter your message..." />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">3 Lines</Text>
        <Textarea placeholder="Medium textarea" numberOfLines={3} />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">5 Lines</Text>
        <Textarea placeholder="Large textarea" numberOfLines={5} />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">Disabled</Text>
        <Textarea editable={false} defaultValue="Cannot edit" />
      </View>
    </View>
  ),
}

// Interactive test
export const Typeable: Story = {
  args: {
    placeholder: 'Type something...',
    testID: 'text-textarea',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByTestId('text-textarea')

    // Verify textarea exists
    await expect(textarea).toBeTruthy()

    // Simulate text input
    await userEvent.type(textarea, 'Hello World\nThis is a test.')
  },
}

export const LongTextEntry: Story = {
  args: {
    placeholder: 'Enter a long message...',
    numberOfLines: 5,
    testID: 'long-textarea',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByTestId('long-textarea')

    // Verify textarea exists
    await expect(textarea).toBeTruthy()

    // Simulate longer text input
    const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
    await userEvent.type(textarea, longText)
  },
}
