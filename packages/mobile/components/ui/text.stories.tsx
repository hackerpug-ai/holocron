import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from './text'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Text> = {
  title: 'UI/Text',
  component: Text,
  parameters: {
    docs: {
      description: {
        component: 'Text component with semantic variants for consistent typography. Supports body, label, title, heading, and display variants.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['bodyLarge', 'bodyMedium', 'bodySmall', 'labelLarge', 'labelMedium', 'labelSmall', 'titleLarge', 'titleMedium', 'titleSmall', 'headingLarge', 'headingMedium', 'headingSmall', 'displayLarge', 'displayMedium', 'displaySmall'],
      description: 'Text style variant',
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
type Story = StoryObj<typeof Text>

export const Default: Story => {
  render: () => <Text>Default text</Text>
}

export const Body: Story => {
  render: () => (
    <View className="gap-2">
      <Text variant="bodyLarge">Body Large</Text>
      <Text variant="bodyMedium">Body Medium</Text>
      <Text variant="bodySmall">Body Small</Text>
    </View>
  ),
}

export const Label: Story => {
  render: () => (
    <View className="gap-2">
      <Text variant="labelLarge">Label Large</Text>
      <Text variant="labelMedium">Label Medium</Text>
      <Text variant="labelSmall">Label Small</Text>
    </View>
  ),
}

export const Title: Story => {
  render: () => (
    <View className="gap-2">
      <Text variant="titleLarge">Title Large</Text>
      <Text variant="titleMedium">Title Medium</Text>
      <Text variant="titleSmall">Title Small</Text>
    </View>
  ),
}

export const Heading: Story => {
  render: () => (
    <View className="gap-2">
      <Text variant="headingLarge">Heading Large</Text>
      <Text variant="headingMedium">Heading Medium</Text>
      <Text variant="headingSmall">Heading Small</Text>
    </View>
  ),
}

export const Display: Story => {
  render: () => (
    <View className="gap-2">
      <Text variant="displayLarge">Display Large</Text>
      <Text variant="displayMedium">Display Medium</Text>
      <Text variant="displaySmall">Display Small</Text>
    </View>
  ),
}

export const SemanticColors: Story => {
  render: () => (
    <View className="gap-2">
      <Text className="text-foreground">Foreground text</Text>
      <Text className="text-muted-foreground">Muted foreground</Text>
      <Text className="text-primary">Primary text</Text>
      <Text className="text-secondary">Secondary text</Text>
      <Text className="text-destructive">Destructive text</Text>
    </View>
  ),
}

export const CustomStyled: Story => {
  render: () => (
    <View className="gap-2">
      <Text className="text-lg font-bold">Large bold text</Text>
      <Text className="text-sm italic">Small italic text</Text>
      <Text className="underline">Underlined text</Text>
      <Text className="line-through text-muted-foreground">Strikethrough</Text>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-sm font-medium">Display</Text>
        <View className="gap-1">
          <Text variant="displayLarge">Display Large</Text>
          <Text variant="displayMedium">Display Medium</Text>
          <Text variant="displaySmall">Display Small</Text>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Heading</Text>
        <View className="gap-1">
          <Text variant="headingLarge">Heading Large</Text>
          <Text variant="headingMedium">Heading Medium</Text>
          <Text variant="headingSmall">Heading Small</Text>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Title</Text>
        <View className="gap-1">
          <Text variant="titleLarge">Title Large</Text>
          <Text variant="titleMedium">Title Medium</Text>
          <Text variant="titleSmall">Title Small</Text>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Body</Text>
        <View className="gap-1">
          <Text variant="bodyLarge">Body Large</Text>
          <Text variant="bodyMedium">Body Medium</Text>
          <Text variant="bodySmall">Body Small</Text>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Label</Text>
        <View className="gap-1">
          <Text variant="labelLarge">Label Large</Text>
          <Text variant="labelMedium">Label Medium</Text>
          <Text variant="labelSmall">Label Small</Text>
        </View>
      </View>
    </View>
  ),
}

// Content verification test
export const TextVerification: Story => {
  render: () => (
    <View>
      <Text testID="test-text" variant="bodyLarge">
        Test text content
      </Text>
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const text = canvas.getByTestId('test-text')

    // Verify text exists
    await expect(text).toBeTruthy()

    // Verify text content
    await expect(canvas.getByText('Test text content')).toBeTruthy()
  },
}
