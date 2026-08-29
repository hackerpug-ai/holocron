import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { ToggleGroup, ToggleGroupItem } from './toggle-group'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof ToggleGroup> = {
  title: 'UI/ToggleGroup',
  component: ToggleGroup,
  parameters: {
    docs: {
      description: {
        component: 'Toggle group component for single or multiple selection from a set of options. Supports both single and multiple selection modes.',
      },
    },
  },
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['single', 'multiple'],
      description: 'Selection mode',
    },
    value: {
      control: { type: 'text' },
      description: 'Currently selected value(s)',
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
type Story = StoryObj<typeof ToggleGroup>

export const Default: Story => {
  render: () => (
    <ToggleGroup type="single" defaultValue="center">
      <ToggleGroupItem value="left" aria-label="Left aligned">
        <Text>Left</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Center aligned">
        <Text>Center</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Right aligned">
        <Text>Right</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Multiple: Story => {
  render: () => (
    <ToggleGroup type="multiple">
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Text>Bold</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Text>Italic</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Text>Underline</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Outline: Story => {
  render: () => (
    <ToggleGroup type="single" variant="outline" defaultValue="item2">
      <ToggleGroupItem value="item1" aria-label="Item 1">
        <Text>Item 1</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="item2" aria-label="Item 2">
        <Text>Item 2</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="item3" aria-label="Item 3">
        <Text>Item 3</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const WithIcons: Story => {
  render: () => (
    <ToggleGroup type="single" defaultValue="phone">
      <ToggleGroupItem value="email" aria-label="Email">
        <Text>📧</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="phone" aria-label="Phone">
        <Text>📱</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="video" aria-label="Video">
        <Text>📹</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Justified: Story => {
  render: () => (
    <View className="w-full max-w-sm">
      <ToggleGroup type="single" defaultValue="month" className="w-full">
        <ToggleGroupItem value="week" aria-label="Week view" className="flex-1">
          <Text>Week</Text>
        </ToggleGroupItem>
        <ToggleGroupItem value="month" aria-label="Month view" className="flex-1">
          <Text>Month</Text>
        </ToggleGroupItem>
        <ToggleGroupItem value="year" aria-label="Year view" className="flex-1">
          <Text>Year</Text>
        </ToggleGroupItem>
      </ToggleGroup>
    </View>
  ),
}

export const Disabled: Story => {
  render: () => (
    <ToggleGroup type="single" defaultValue="option1" disabled>
      <ToggleGroupItem value="option1" aria-label="Option 1">
        <Text>Option 1</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="option2" aria-label="Option 2">
        <Text>Option 2</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="option3" aria-label="Option 3">
        <Text>Option 3</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-sm font-medium">Single Selection</Text>
        <ToggleGroup type="single" defaultValue="left">
          <ToggleGroupItem value="left" aria-label="Left">
            <Text>Left</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center">
            <Text>Center</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Right">
            <Text>Right</Text>
          </ToggleGroupItem>
        </ToggleGroup>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Multiple Selection</Text>
        <ToggleGroup type="multiple">
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Text>Bold</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Text>Italic</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <Text>Underline</Text>
          </ToggleGroupItem>
        </ToggleGroup>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Outline Variant</Text>
        <ToggleGroup type="single" variant="outline" defaultValue="1">
          <ToggleGroupItem value="1" aria-label="Option 1">
            <Text>1</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="2" aria-label="Option 2">
            <Text>2</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="3" aria-label="Option 3">
            <Text>3</Text>
          </ToggleGroupItem>
        </ToggleGroup>
      </View>
    </View>
  ),
}

// Interactive test
export const Selectable: Story => {
  render: () => (
    <ToggleGroup type="single" defaultValue="option1" testID="test-toggle-group">
      <ToggleGroupItem value="option1" testID="item-1" aria-label="Option 1">
        <Text>Option 1</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="option2" testID="item-2" aria-label="Option 2">
        <Text>Option 2</Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="option3" testID="item-3" aria-label="Option 3">
        <Text>Option 3</Text>
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify toggle group items exist
    await expect(canvas.getByTestId('item-1')).toBeTruthy()
    await expect(canvas.getByTestId('item-2')).toBeTruthy()
    await expect(canvas.getByTestId('item-3')).toBeTruthy()
  },
}
