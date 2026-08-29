import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Popover> = {
  title: 'UI/Popover',
  component: Popover,
  parameters: {
    docs: {
      description: {
        component: 'Popover component for displaying rich content in a floating container. Positioned relative to trigger element.',
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
type Story = StoryObj<typeof Popover>

export const Default: Story => {
  render: () => (
    <Popover>
      <PopoverTrigger>
        <Button>
          <Text>Open Popover</Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <View className="gap-2">
          <Text className="font-medium">Popover Content</Text>
          <Text className="text-sm">This is a popover with some content.</Text>
        </View>
      </PopoverContent>
    </Popover>
  ),
}

export const LongContent: Story => {
  render: () => (
    <Popover>
      <PopoverTrigger>
        <Button>
          <Text>Open Popover</Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <View className="gap-2">
          <Text className="font-medium">Detailed Information</Text>
          <Text className="text-sm">
            This popover contains longer content with multiple paragraphs of text to demonstrate
            how the popover handles more substantial content.
          </Text>
          <Text className="text-sm">
            The popover automatically sizes to fit its content while maintaining readability.
          </Text>
        </View>
      </PopoverContent>
    </Popover>
  ),
}

export const WithActions: Story => {
  render: () => (
    <Popover>
      <PopoverTrigger>
        <Button>
          <Text>Actions</Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <View className="gap-3">
          <Text className="font-medium">Quick Actions</Text>
          <View className="gap-2">
            <Button size="sm" variant="outline" className="w-full">
              <Text>Edit</Text>
            </Button>
            <Button size="sm" variant="outline" className="w-full">
              <Text>Duplicate</Text>
            </Button>
            <Button size="sm" variant="destructive" className="w-full">
              <Text>Delete</Text>
            </Button>
          </View>
        </View>
      </PopoverContent>
    </Popover>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-3">
      <Popover>
        <PopoverTrigger>
          <Button size="sm">
            <Text>Simple</Text>
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <Text>Simple popover content</Text>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger>
          <Button size="sm" variant="outline">
            <Text>With Title</Text>
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <View className="gap-2">
            <Text className="font-medium">Title</Text>
            <Text className="text-sm">Content description</Text>
          </View>
        </PopoverContent>
      </Popover>
    </View>
  ),
}

// Interactive test
export const Interactive: Story => {
  render: () => (
    <Popover testID="test-popover">
      <PopoverTrigger testID="popover-trigger">
        <Button>
          <Text>Open</Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent testID="popover-content">
        <Text testID="popover-text">Popover content</Text>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify trigger exists
    const trigger = canvas.getByTestId('popover-trigger')
    await expect(trigger).toBeTruthy()
  },
}
