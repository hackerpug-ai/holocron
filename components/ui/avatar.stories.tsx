import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Avatar, AvatarImage, AvatarFallback } from './avatar'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Avatar> = {
  title: 'UI/Avatar',
  component: Avatar,
  parameters: {
    docs: {
      description: {
        component: 'Avatar component for displaying user profile images with fallback support.',
      },
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
type Story = StoryObj<typeof Avatar>

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>
        <Text>JD</Text>
      </AvatarFallback>
    </Avatar>
  ),
}

export const WithImage: Story = {
  render: () => (
    <Avatar>
      <AvatarImage source={{ uri: 'https://i.pravatar.cc/150?img=1' }} />
      <AvatarFallback>
        <Text>JD</Text>
      </AvatarFallback>
    </Avatar>
  ),
}

export const FallbackOnly: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>
        <Text>AB</Text>
      </AvatarFallback>
    </Avatar>
  ),
}

export const CustomSize: Story = {
  render: () => (
    <View className="flex-row items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback>
          <Text>SM</Text>
        </AvatarFallback>
      </Avatar>
      <Avatar className="size-10">
        <AvatarFallback>
          <Text>MD</Text>
        </AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarFallback>
          <Text>LG</Text>
        </AvatarFallback>
      </Avatar>
    </View>
  ),
}

export const AvatarGroup: Story = {
  render: () => (
    <View className="flex-row -space-x-2">
      <Avatar>
        <AvatarImage source={{ uri: 'https://i.pravatar.cc/150?img=1' }} />
        <AvatarFallback>
          <Text>JD</Text>
        </AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage source={{ uri: 'https://i.pravatar.cc/150?img=2' }} />
        <AvatarFallback>
          <Text>AB</Text>
        </AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage source={{ uri: 'https://i.pravatar.cc/150?img=3' }} />
        <AvatarFallback>
          <Text>CD</Text>
        </AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>
          <Text>+3</Text>
        </AvatarFallback>
      </Avatar>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Text className="text-sm font-medium">Fallback:</Text>
        <Avatar>
          <AvatarFallback>
            <Text>JD</Text>
          </AvatarFallback>
        </Avatar>
      </View>

      <View className="flex-row items-center gap-3">
        <Text className="text-sm font-medium">With Image:</Text>
        <Avatar>
          <AvatarImage source={{ uri: 'https://i.pravatar.cc/150?img=1' }} />
          <AvatarFallback>
            <Text>JD</Text>
          </AvatarFallback>
        </Avatar>
      </View>

      <View className="flex-row items-center gap-3">
        <Text className="text-sm font-medium">Sizes:</Text>
        <Avatar className="size-8">
          <AvatarFallback>
            <Text>S</Text>
          </AvatarFallback>
        </Avatar>
        <Avatar className="size-10">
          <AvatarFallback>
            <Text>M</Text>
          </AvatarFallback>
        </Avatar>
        <Avatar className="size-12">
          <AvatarFallback>
            <Text>L</Text>
          </AvatarFallback>
        </Avatar>
      </View>

      <View className="flex-row items-center gap-3">
        <Text className="text-sm font-medium">Group:</Text>
        <View className="flex-row -space-x-2">
          <Avatar>
            <AvatarFallback>
              <Text>A</Text>
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>
              <Text>B</Text>
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>
              <Text>C</Text>
            </AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>
              <Text>+3</Text>
            </AvatarFallback>
          </Avatar>
        </View>
      </View>
    </View>
  ),
}

// Content verification test
export const FallbackVerification: Story = {
  render: () => (
    <Avatar testID="test-avatar">
      <AvatarFallback>
        <Text>JD</Text>
      </AvatarFallback>
    </Avatar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const avatar = canvas.getByTestId('test-avatar')

    // Verify avatar exists
    await expect(avatar).toBeTruthy()

    // Verify fallback text is displayed
    await expect(canvas.getByText('JD')).toBeTruthy()
  },
}

export const ImageVerification: Story = {
  render: () => (
    <Avatar testID="image-avatar">
      <AvatarImage source={{ uri: 'https://i.pravatar.cc/150?img=1' }} />
      <AvatarFallback>
        <Text>JD</Text>
      </AvatarFallback>
    </Avatar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const avatar = canvas.getByTestId('image-avatar')

    // Verify avatar exists
    await expect(avatar).toBeTruthy()
  },
}
