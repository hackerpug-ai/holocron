import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Skeleton } from './skeleton'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Skeleton',
  component: Skeleton,
  parameters: {
    docs: {
      description: {
        component: 'Skeleton loading placeholder component for displaying during content loading. Animated pulse effect.',
      },
    },
  },
  argTypes: {
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes for custom sizing',
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
type Story = StoryObj<typeof Skeleton>

export const Default: Story = {
  render: () => <Skeleton className="h-12 w-32" />,
}

export const Circle: Story = {
  render: () => <Skeleton className="size-12 rounded-full" />,
}

export const CustomSize: Story => {
  render: () => <Skeleton className="h-24 w-full max-w-sm" />,
}

export const CardSkeleton: Story = {
  render: () => (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <View className="flex-1 gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </View>
      </View>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </View>
  ),
}

export const ListSkeleton: Story => {
  render: () => (
    <View className="gap-3">
      {[1, 2, 3].map((i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </View>
        </View>
      ))}
    </View>
  ),
}

export const FormSkeleton: Story => {
  render: () => (
    <View className="gap-4">
      <View className="gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </View>
      <View className="gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </View>
      <View className="gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </View>
      <Skeleton className="h-10 w-32" />
    </View>
  ),
}

export const ProfileSkeleton: Story => {
  render: () => (
    <View className="items-center gap-4">
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <View className="flex-row gap-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </View>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-sm font-medium">Basic Shapes</Text>
        <View className="flex-row items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-12 w-32" />
          <Skeleton className="size-10 rounded-full" />
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Card Skeleton</Text>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </View>
          </View>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">List Skeleton</Text>
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </View>
          </View>
          <View className="flex-row items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </View>
          </View>
        </View>
      </View>
    </View>
  ),
}

// Content verification test
export const SkeletonVerification: Story = {
  render: () => (
    <View className="gap-3">
      <Skeleton testID="skeleton-1" className="h-12 w-32" />
      <Skeleton testID="skeleton-2" className="size-10 rounded-full" />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify skeleton elements exist
    await expect(canvas.getByTestId('skeleton-1')).toBeTruthy()
    await expect(canvas.getByTestId('skeleton-2')).toBeTruthy()
  },
}
