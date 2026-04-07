import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Progress } from './progress'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  parameters: {
    docs: {
      description: {
        component: 'Progress bar component for displaying completion status. Supports 0-100 values with animated fill.',
      },
    },
  },
  argTypes: {
    value: {
      control: { type: 'number' },
      description: 'Progress value (0-100)',
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
type Story = StoryObj<typeof Progress>

export const Default: Story = {
  args: {
    value: 50,
  },
}

export const Zero: Story = {
  args: {
    value: 0,
  },
}

export const TwentyFive: Story = {
  args: {
    value: 25,
  },
}

export const SeventyFive: Story = {
  args: {
    value: 75,
  },
}

export const Complete: Story = {
  args: {
    value: 100,
  },
}

export const WithLabel: Story => {
  render: () => (
    <View className="gap-2 w-full max-w-sm">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium">Upload Progress</Text>
        <Text className="text-sm text-muted-foreground">65%</Text>
      </View>
      <Progress value={65} />
    </View>
  ),
}

export const Indeterminate: Story => {
  render: () => (
    <View className="gap-2 w-full max-w-sm">
      <Text className="text-sm font-medium">Loading...</Text>
      <Progress value={undefined} />
    </View>
  ),
}

export const CustomSize: Story => {
  render: () => (
    <View className="gap-4 w-full max-w-sm">
      <View className="gap-2">
        <Text className="text-sm font-medium">Small</Text>
        <Progress value={60} className="h-1" />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-medium">Default</Text>
        <Progress value={60} />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-medium">Large</Text>
        <Progress value={60} className="h-4" />
      </View>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4 w-full max-w-sm">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium">0%</Text>
        </View>
        <Progress value={0} />
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium">25%</Text>
        </View>
        <Progress value={25} />
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium">50%</Text>
        </View>
        <Progress value={50} />
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium">75%</Text>
        </View>
        <Progress value={75} />
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium">100%</Text>
        </View>
        <Progress value={100} />
      </View>
    </View>
  ),
}

// Content verification test
export const ProgressVerification: Story = {
  args: {
    value: 65,
    testID: 'test-progress',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const progress = canvas.getByTestId('test-progress')

    // Verify progress element exists
    await expect(progress).toBeTruthy()
  },
}
