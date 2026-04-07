import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Icon } from './icon'
import { Check, X, ChevronRight, Search, Bell, Settings } from '@/components/ui/icons'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Icon> = {
  title: 'UI/Icon',
  component: Icon,
  parameters: {
    docs: {
      description: {
        component: 'Icon component wrapper for Lucide React Native icons. Provides consistent sizing and styling.',
      },
    },
  },
  argTypes: {
    as: {
      control: { type: 'object' },
      description: 'Lucide icon component to render',
    },
    size: {
      control: { type: 'number' },
      description: 'Icon size in pixels',
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
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
type Story = StoryObj<typeof Icon>

export const Default: Story => {
  render: () => <Icon as={Check} />
}

export const CheckIcon: Story => {
  render: () => <Icon as={Check} />,
}

export const XIcon: Story => {
  render: () => <Icon as={X} />,
}

export const ChevronRightIcon: Story => {
  render: () => <Icon as={ChevronRight} />,
}

export const SearchIcon: Story => {
  render: () => <Icon as={Search} />,
}

export const BellIcon: Story => {
  render: () => <Icon as={Bell} />,
}

export const SettingsIcon: Story => {
  render: () => <Icon as={Settings} />,
}

export const Sizes: Story => {
  render: () => (
    <View className="flex-row items-center gap-4">
      <Icon as={Check} size={16} />
      <Icon as={Check} size={20} />
      <Icon as={Check} size={24} />
      <Icon as={Check} size={32} />
    </View>
  ),
}

export const WithText: Story => {
  render: () => (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon as={Search} />
        <Text>Search</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Icon as={Bell} />
        <Text>Notifications</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Icon as={Settings} />
        <Text>Settings</Text>
      </View>
    </View>
  ),
}

export const ColoredIcons: Story => {
  render: () => (
    <View className="flex-row items-center gap-4">
      <Icon as={Check} className="text-green-500" />
      <Icon as={X} className="text-red-500" />
      <Icon as={Search} className="text-blue-500" />
      <Icon as={Bell} className="text-yellow-500" />
    </View>
  ),
}

export const CommonIcons: Story => {
  render: () => (
    <View className="flex-row flex-wrap gap-3">
      <View className="flex-col items-center gap-1">
        <Icon as={Check} />
        <Text className="text-xs">Check</Text>
      </View>
      <View className="flex-col items-center gap-1">
        <Icon as={X} />
        <Text className="text-xs">X</Text>
      </View>
      <View className="flex-col items-center gap-1">
        <Icon as={ChevronRight} />
        <Text className="text-xs">Right</Text>
      </View>
      <View className="flex-col items-center gap-1">
        <Icon as={Search} />
        <Text className="text-xs">Search</Text>
      </View>
      <View className="flex-col items-center gap-1">
        <Icon as={Bell} />
        <Text className="text-xs">Bell</Text>
      </View>
      <View className="flex-col items-center gap-1">
        <Icon as={Settings} />
        <Text className="text-xs">Settings</Text>
      </View>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-sm font-medium">Sizes</Text>
        <View className="flex-row items-center gap-4">
          <View className="flex-col items-center gap-1">
            <Icon as={Check} size={16} />
            <Text className="text-xs">16</Text>
          </View>
          <View className="flex-col items-center gap-1">
            <Icon as={Check} size={20} />
            <Text className="text-xs">20</Text>
          </View>
          <View className="flex-col items-center gap-1">
            <Icon as={Check} size={24} />
            <Text className="text-xs">24</Text>
          </View>
          <View className="flex-col items-center gap-1">
            <Icon as={Check} size={32} />
            <Text className="text-xs">32</Text>
          </View>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">With Text</Text>
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Icon as={Search} />
            <Text>Search items</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Icon as={Bell} />
            <Text>Notifications</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Icon as={Settings} />
            <Text>Settings</Text>
          </View>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Colored</Text>
        <View className="flex-row items-center gap-3">
          <Icon as={Check} className="text-green-500" />
          <Icon as={X} className="text-red-500" />
          <Icon as={Search} className="text-blue-500" />
        </View>
      </View>
    </View>
  ),
}

// Content verification test
export const IconVerification: Story => {
  render: () => (
    <View>
      <Icon as={Check} testID="test-icon" />
    </View>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const icon = canvas.getByTestId('test-icon')

    // Verify icon exists
    await expect(icon).toBeTruthy()
  },
}
