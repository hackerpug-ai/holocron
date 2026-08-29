import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { AspectRatio } from './aspect-ratio'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof AspectRatio> = {
  title: 'UI/AspectRatio',
  component: AspectRatio,
  parameters: {
    docs: {
      description: {
        component: 'Aspect ratio container for maintaining consistent proportions. Useful for images, videos, and embedded content.',
      },
    },
  },
  argTypes: {
    ratio: {
      control: { type: 'number' },
      description: 'Aspect ratio (width / height)',
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
type Story = StoryObj<typeof AspectRatio>

export const Default: Story => {
  render: () => (
    <AspectRatio ratio={16 / 9}>
      <View className="h-full w-full items-center justify-center bg-muted">
        <Text>16:9</Text>
      </View>
    </AspectRatio>
  ),
}

export const Square: Story => {
  render: () => (
    <AspectRatio ratio={1}>
      <View className="h-full w-full items-center justify-center bg-primary">
        <Text className="text-primary-foreground">1:1 Square</Text>
      </View>
    </AspectRatio>
  ),
}

export const Video: Story => {
  render: () => (
    <AspectRatio ratio={16 / 9}>
      <View className="h-full w-full items-center justify-center bg-black">
        <Text className="text-white">Video Placeholder (16:9)</Text>
      </View>
    </AspectRatio>
  ),
}

export const Photo: Story => {
  render: () => (
    <AspectRatio ratio={4 / 3}>
      <View className="h-full w-full items-center justify-center bg-muted">
        <Text>Photo (4:3)</Text>
      </View>
    </AspectRatio>
  ),
}

export const Portrait: Story => {
  render: () => (
    <AspectRatio ratio={3 / 4}>
      <View className="h-full w-full items-center justify-center bg-secondary">
        <Text>Portrait (3:4)</Text>
      </View>
    </AspectRatio>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-4 w-full max-w-sm">
      <View>
        <Text className="mb-2 text-sm font-medium">16:9 (Video)</Text>
        <AspectRatio ratio={16 / 9}>
          <View className="h-full w-full items-center justify-center bg-muted">
            <Text>16:9</Text>
          </View>
        </AspectRatio>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">4:3 (Photo)</Text>
        <AspectRatio ratio={4 / 3}>
          <View className="h-full w-full items-center justify-center bg-muted">
            <Text>4:3</Text>
          </View>
        </AspectRatio>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">1:1 (Square)</Text>
        <AspectRatio ratio={1}>
          <View className="h-full w-full items-center justify-center bg-muted">
            <Text>1:1</Text>
          </View>
        </AspectRatio>
      </View>
    </View>
  ),
}

// Content verification test
export const AspectRatioVerification: Story => {
  render: () => (
    <AspectRatio ratio={16 / 9} testID="test-aspect-ratio">
      <View className="h-full w-full items-center justify-center bg-muted">
        <Text testID="aspect-ratio-content">Content</Text>
      </View>
    </AspectRatio>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify aspect ratio container exists
    await expect(canvas.getByTestId('test-aspect-ratio')).toBeTruthy()

    // Verify content exists
    await expect(canvas.getByTestId('aspect-ratio-content')).toBeTruthy()
  },
}
