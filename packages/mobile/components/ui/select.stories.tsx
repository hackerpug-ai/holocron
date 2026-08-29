import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  NativeSelectScrollView,
} from './select'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Select> = {
  title: 'UI/Select',
  component: Select,
  parameters: {
    docs: {
      description: {
        component: 'Dropdown select component for choosing from a list of options. Supports groups, separators, and labels.',
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
type Story = StoryObj<typeof Select>

export const Default: Story = {
  render: () => (
    <Select defaultValue="option1">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <NativeSelectScrollView>
          <SelectItem value="option1">
            <Text>Option 1</Text>
          </SelectItem>
          <SelectItem value="option2">
            <Text>Option 2</Text>
          </SelectItem>
          <SelectItem value="option3">
            <Text>Option 3</Text>
          </SelectItem>
        </NativeSelectScrollView>
      </SelectContent>
    </Select>
  ),
}

export const WithLabel: Story => {
  render: () => (
    <View className="gap-2">
      <Label>
        <Text>Choose an option</Text>
      </Label>
      <Select defaultValue="option1">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <NativeSelectScrollView>
            <SelectItem value="option1">
              <Text>Option 1</Text>
            </SelectItem>
            <SelectItem value="option2">
              <Text>Option 2</Text>
            </SelectItem>
            <SelectItem value="option3">
              <Text>Option 3</Text>
            </SelectItem>
          </NativeSelectScrollView>
        </SelectContent>
      </Select>
    </View>
  ),
}

export const WithGroups: Story => {
  render: () => (
    <Select defaultValue="apple">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <NativeSelectScrollView>
          <SelectGroup>
            <SelectLabel>
              <Text>Fruits</Text>
            </SelectLabel>
            <SelectItem value="apple">
              <Text>Apple</Text>
            </SelectItem>
            <SelectItem value="banana">
              <Text>Banana</Text>
            </SelectItem>
            <SelectItem value="orange">
              <Text>Orange</Text>
            </SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>
              <Text>Vegetables</Text>
            </SelectLabel>
            <SelectItem value="carrot">
              <Text>Carrot</Text>
            </SelectItem>
            <SelectItem value="broccoli">
              <Text>Broccoli</Text>
            </SelectItem>
          </SelectGroup>
        </NativeSelectScrollView>
      </SelectContent>
    </Select>
  ),
}

export const WithPlaceholder: Story => {
  render: () => (
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Select an item..." />
      </SelectTrigger>
      <SelectContent>
        <NativeSelectScrollView>
          <SelectItem value="item1">
            <Text>Item 1</Text>
          </SelectItem>
          <SelectItem value="item2">
            <Text>Item 2</Text>
          </SelectItem>
          <SelectItem value="item3">
            <Text>Item 3</Text>
          </SelectItem>
        </NativeSelectScrollView>
      </SelectContent>
    </Select>
  ),
}

export const Disabled: Story => {
  render: () => (
    <Select defaultValue="option1" disabled>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <NativeSelectScrollView>
          <SelectItem value="option1">
            <Text>Option 1</Text>
          </SelectItem>
          <SelectItem value="option2">
            <Text>Option 2</Text>
          </SelectItem>
        </NativeSelectScrollView>
      </SelectContent>
    </Select>
  ),
}

export const SmallSize: Story => {
  render: () => (
    <Select defaultValue="option1">
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <NativeSelectScrollView>
          <SelectItem value="option1">
            <Text>Option 1</Text>
          </SelectItem>
          <SelectItem value="option2">
            <Text>Option 2</Text>
          </SelectItem>
        </NativeSelectScrollView>
      </SelectContent>
    </Select>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-4">
      <View className="gap-2">
        <Label>
          <Text>Default</Text>
        </Label>
        <Select defaultValue="option1">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <NativeSelectScrollView>
              <SelectItem value="option1">
                <Text>Option 1</Text>
              </SelectItem>
              <SelectItem value="option2">
                <Text>Option 2</Text>
              </SelectItem>
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>

      <View className="gap-2">
        <Label>
          <Text>With Placeholder</Text>
        </Label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose..." />
          </SelectTrigger>
          <SelectContent>
            <NativeSelectScrollView>
              <SelectItem value="a">
                <Text>Option A</Text>
              </SelectItem>
              <SelectItem value="b">
                <Text>Option B</Text>
              </SelectItem>
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>

      <View className="gap-2">
        <Label>
          <Text>Disabled</Text>
        </Label>
        <Select defaultValue="option1" disabled>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <NativeSelectScrollView>
              <SelectItem value="option1">
                <Text>Option 1</Text>
              </SelectItem>
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>
    </View>
  ),
}

// Content verification test
export const SelectVerification: Story => {
  render: () => (
    <Select defaultValue="option1" testID="test-select">
      <SelectTrigger testID="select-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <NativeSelectScrollView>
          <SelectItem value="option1" testID="option1">
            <Text>Option 1</Text>
          </SelectItem>
          <SelectItem value="option2" testID="option2">
            <Text>Option 2</Text>
          </SelectItem>
        </NativeSelectScrollView>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify select trigger exists
    const trigger = canvas.getByTestId('select-trigger')
    await expect(trigger).toBeTruthy()
  },
}
