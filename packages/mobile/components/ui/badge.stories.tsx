import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Badge } from './badge'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    docs: {
      description: {
        component: 'Badge component for displaying labels, status indicators, or small tags. Available in default, secondary, destructive, and outline variants.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'secondary', 'destructive', 'outline'],
      description: 'Badge style variant',
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
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: {
    variant: 'default',
    children: <Text>Default</Text>,
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: <Text>Secondary</Text>,
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: <Text>Destructive</Text>,
  },
}

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: <Text>Outline</Text>,
  },
}

// Use case examples
export const StatusBadges: Story = {
  render: () => (
    <View className="flex-row flex-wrap gap-2">
      <Badge variant="default">
        <Text>Active</Text>
      </Badge>
      <Badge variant="secondary">
        <Text>Pending</Text>
      </Badge>
      <Badge variant="destructive">
        <Text>Error</Text>
      </Badge>
      <Badge variant="outline">
        <Text>Draft</Text>
      </Badge>
    </View>
  ),
}

export const CategoryTags: Story = {
  render: () => (
    <View className="flex-row flex-wrap gap-2">
      <Badge variant="outline">
        <Text>React</Text>
      </Badge>
      <Badge variant="outline">
        <Text>TypeScript</Text>
      </Badge>
      <Badge variant="outline">
        <Text>Native</Text>
      </Badge>
      <Badge variant="outline">
        <Text>Expo</Text>
      </Badge>
    </View>
  ),
}

export const CountBadges: Story = {
  render: () => (
    <View className="flex-row gap-4">
      <View className="flex-row items-center gap-2">
        <Text>Notifications:</Text>
        <Badge variant="default">
          <Text>12</Text>
        </Badge>
      </View>
      <View className="flex-row items-center gap-2">
        <Text>Messages:</Text>
        <Badge variant="secondary">
          <Text>5</Text>
        </Badge>
      </View>
      <View className="flex-row items-center gap-2">
        <Text>Errors:</Text>
        <Badge variant="destructive">
          <Text>3</Text>
        </Badge>
      </View>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <Badge variant="default">
          <Text>Default</Text>
        </Badge>
        <Badge variant="secondary">
          <Text>Secondary</Text>
        </Badge>
        <Badge variant="destructive">
          <Text>Destructive</Text>
        </Badge>
        <Badge variant="outline">
          <Text>Outline</Text>
        </Badge>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Badge variant="default">
          <Text>New</Text>
        </Badge>
        <Badge variant="secondary">
          <Text>Updated</Text>
        </Badge>
        <Badge variant="destructive">
          <Text>Deleted</Text>
        </Badge>
        <Badge variant="outline">
          <Text>Archived</Text>
        </Badge>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Badge variant="outline">
          <Text>React Native</Text>
        </Badge>
        <Badge variant="outline">
          <Text>Expo</Text>
        </Badge>
        <Badge variant="outline">
          <Text>TypeScript</Text>
        </Badge>
        <Badge variant="outline">
          <Text>Tailwind</Text>
        </Badge>
      </View>
    </View>
  ),
}

// Content verification test
export const ContentVerification: Story = {
  args: {
    variant: 'default',
    testID: 'test-badge',
    children: <Text>Test Badge</Text>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = canvas.getByTestId('test-badge')

    // Verify badge exists
    await expect(badge).toBeTruthy()

    // Verify text content
    await expect(canvas.getByText('Test Badge')).toBeTruthy()
  },
}
