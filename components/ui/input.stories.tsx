import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Input } from './input'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    docs: {
      description: {
        component: 'Input component for text entry with support for placeholder, disabled state, and various text input types.',
      },
    },
  },
  argTypes: {
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text when input is empty',
    },
    editable: {
      control: { type: 'boolean' },
      description: 'Whether input can be edited',
    },
    secureTextEntry: {
      control: { type: 'boolean' },
      description: 'Hide text for password input',
    },
    keyboardType: {
      control: { type: 'select' },
      options: ['default', 'email-address', 'numeric', 'phone-pad', 'url'],
      description: 'Keyboard type for input',
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
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
}

export const WithValue: Story = {
  args: {
    defaultValue: 'Sample text',
  },
}

export const Disabled: Story = {
  args: {
    editable: false,
    defaultValue: 'Disabled input',
  },
}

export const Password: Story = {
  args: {
    placeholder: 'Enter password',
    secureTextEntry: true,
  },
}

export const Email: Story = {
  args: {
    placeholder: 'Enter email',
    keyboardType: 'email-address',
  },
}

export const Numeric: Story = {
  args: {
    placeholder: 'Enter number',
    keyboardType: 'numeric',
  },
}

export const Phone: Story = {
  args: {
    placeholder: 'Enter phone number',
    keyboardType: 'phone-pad',
  },
}

export const URL: Story = {
  args: {
    placeholder: 'https://example.com',
    keyboardType: 'url',
  },
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3 w-full max-w-sm">
      <View>
        <Text className="mb-1 text-sm font-medium">Default</Text>
        <Input placeholder="Enter text..." />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">Email</Text>
        <Input placeholder="email@example.com" keyboardType="email-address" />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">Password</Text>
        <Input placeholder="Password" secureTextEntry={true} />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">Numeric</Text>
        <Input placeholder="123" keyboardType="numeric" />
      </View>
      <View>
        <Text className="mb-1 text-sm font-medium">Disabled</Text>
        <Input editable={false} defaultValue="Cannot edit" />
      </View>
    </View>
  ),
}

// Interactive test
export const Typeable: Story = {
  args: {
    placeholder: 'Type something...',
    testID: 'text-input',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByTestId('text-input')

    // Verify input exists
    await expect(input).toBeTruthy()

    // Simulate text input
    await userEvent.type(input, 'Hello World')
  },
}

export const EmailValidation: Story = {
  args: {
    placeholder: 'Enter email address',
    keyboardType: 'email-address',
    testID: 'email-input',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByTestId('email-input')

    // Verify input exists
    await expect(input).toBeTruthy()

    // Simulate email input
    await userEvent.type(input, 'test@example.com')
  },
}
