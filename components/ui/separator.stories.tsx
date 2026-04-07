import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Separator } from './separator'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Separator> = {
  title: 'UI/Separator',
  component: Separator,
  parameters: {
    docs: {
      description: {
        component: 'Visual separator/divider component for organizing content. Supports horizontal and vertical orientations.',
      },
    },
  },
  argTypes: {
    orientation: {
      control: { type: 'select' },
      options: ['horizontal', 'vertical'],
      description: 'Separator orientation',
    },
    decorative: {
      control: { type: 'boolean' },
      description: 'Whether separator is decorative (no semantic meaning)',
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
type Story = StoryObj<typeof Separator>

export const Default: Story = {
  render: () => (
    <View className="gap-4 w-full max-w-sm">
      <View>
        <Text>Content above separator</Text>
      </View>
      <Separator />
      <View>
        <Text>Content below separator</Text>
      </View>
    </View>
  ),
}

export const Vertical: Story = {
  render: () => (
    <View className="flex-row items-center gap-4">
      <Text>Left content</Text>
      <Separator orientation="vertical" className="h-8" />
      <Text>Right content</Text>
    </View>
  ),
}

export const Multiple: Story = {
  render: () => (
    <View className="gap-2 w-full max-w-sm">
      <Text>Section 1</Text>
      <Separator />
      <Text>Section 2</Text>
      <Separator />
      <Text>Section 3</Text>
      <Separator />
      <Text>Section 4</Text>
    </View>
  ),
}

export const WithLabels: Story = {
  render: () => (
    <View className="gap-2 w-full max-w-sm">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-medium">Personal Info</Text>
      </View>
      <Separator />
      <View className="gap-2">
        <Text>Name: John Doe</Text>
        <Text>Email: john@example.com</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-medium">Address</Text>
      </View>
      <Separator />
      <View className="gap-2">
        <Text>123 Main St</Text>
        <Text>City, State 12345</Text>
      </View>
    </View>
  ),
}

export const VerticalGroup: Story => {
  render: () => (
    <View className="flex-row items-center gap-4">
      <Text>Item 1</Text>
      <Separator orientation="vertical" className="h-8" />
      <Text>Item 2</Text>
      <Separator orientation="vertical" className="h-8" />
      <Text>Item 3</Text>
      <Separator orientation="vertical" className="h-8" />
      <Text>Item 4</Text>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-6">
      <View>
        <Text className="mb-2 text-sm font-medium">Horizontal Separators</Text>
        <View className="gap-2 w-full max-w-sm">
          <Text>Content 1</Text>
          <Separator />
          <Text>Content 2</Text>
          <Separator />
          <Text>Content 3</Text>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Vertical Separators</Text>
        <View className="flex-row items-center gap-4">
          <Text>Left</Text>
          <Separator orientation="vertical" className="h-8" />
          <Text>Center</Text>
          <Separator orientation="vertical" className="h-8" />
          <Text>Right</Text>
        </View>
      </View>
    </View>
  ),
}

// Content verification test
export const SeparatorVerification: Story = {
  render: () => (
    <View className="gap-4 w-full max-w-sm">
      <Text testID="above-text">Above separator</Text>
      <Separator testID="separator" />
      <Text testID="below-text">Below separator</Text>
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify content above separator
    await expect(canvas.getByTestId('above-text')).toBeTruthy()

    // Verify separator exists
    await expect(canvas.getByTestId('separator')).toBeTruthy()

    // Verify content below separator
    await expect(canvas.getByTestId('below-text')).toBeTruthy()
  },
}
