import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Label } from './label'
import { Input } from './input'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Label> = {
  title: 'UI/Label',
  component: Label,
  parameters: {
    docs: {
      description: {
        component: 'Label component for form inputs and UI elements. Provides accessibility and proper spacing.',
      },
    },
  },
  argTypes: {
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable label interaction',
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
type Story = StoryObj<typeof Label>

export const Default: Story = {
  render: () => (
    <View className="gap-2">
      <Label>
        <Text>Email</Text>
      </Label>
      <Input placeholder="Enter your email" />
    </View>
  ),
}

export const WithInput: Story = {
  render: () => (
    <View className="gap-2">
      <Label>
        <Text>Username</Text>
      </Label>
      <Input placeholder="Enter username" />
    </View>
  ),
}

export const Disabled: Story = {
  render: () => (
    <View className="gap-2">
      <Label disabled>
        <Text>Disabled Field</Text>
      </Label>
      <Input editable={false} defaultValue="Cannot edit" />
    </View>
  ),
}

export const MultipleLabels: Story = {
  render: () => (
    <View className="gap-4">
      <View className="gap-2">
        <Label>
          <Text>First Name</Text>
        </Label>
        <Input placeholder="John" />
      </View>
      <View className="gap-2">
        <Label>
          <Text>Last Name</Text>
        </Label>
        <Input placeholder="Doe" />
      </View>
      <View className="gap-2">
        <Label>
          <Text>Email</Text>
        </Label>
        <Input placeholder="john.doe@example.com" keyboardType="email-address" />
      </View>
    </View>
  ),
}

export const CustomStyled: Story = {
  render: () => (
    <View className="gap-2">
      <Label className="text-primary">
        <Text>Custom Label Color</Text>
      </Label>
      <Input placeholder="Custom styled label" />
    </View>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <View className="gap-2">
        <Label>
          <Text>Default Label</Text>
        </Label>
        <Input placeholder="Default input" />
      </View>

      <View className="gap-2">
        <Label disabled>
          <Text>Disabled Label</Text>
        </Label>
        <Input editable={false} defaultValue="Disabled input" />
      </View>

      <View className="gap-2">
        <Label className="text-primary">
          <Text>Custom Styled Label</Text>
        </Label>
        <Input placeholder="Custom styled" />
      </View>
    </View>
  ),
}

// Content verification test
export const LabelVerification: Story = {
  render: () => (
    <View className="gap-2">
      <Label testID="test-label">
        <Text>Email Address</Text>
      </Label>
      <Input testID="email-input" placeholder="Enter email" />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify label text is displayed
    await expect(canvas.getByText('Email Address')).toBeTruthy()

    // Verify input exists
    await expect(canvas.getByTestId('email-input')).toBeTruthy()
  },
}
