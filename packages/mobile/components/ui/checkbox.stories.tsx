import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Checkbox } from './checkbox'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  parameters: {
    docs: {
      description: {
        component: 'Checkbox component for binary selection. Supports checked, unchecked, indeterminate, and disabled states.',
      },
    },
  },
  argTypes: {
    checked: {
      control: { type: 'boolean' },
      description: 'Whether checkbox is checked',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable checkbox interaction',
    },
    onCheckedChange: {
      action: 'changed',
      description: 'Callback when checkbox state changes',
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
type Story = StoryObj<typeof Checkbox>

export const Default: Story = {
  args: {
    checked: false,
  },
}

export const Checked: Story = {
  args: {
    checked: true,
  },
}

export const Disabled: Story = {
  args: {
    checked: false,
    disabled: true,
  },
}

export const DisabledChecked: Story = {
  args: {
    checked: true,
    disabled: true,
  },
}

// With labels
export const WithLabel: Story = {
  render: () => (
    <View className="flex-row items-center gap-3">
      <Checkbox checked={false} />
      <Text>Accept terms and conditions</Text>
    </View>
  ),
}

export const WithLabelChecked: Story = {
  render: () => (
    <View className="flex-row items-center gap-3">
      <Checkbox checked={true} />
      <Text>Remember me</Text>
    </View>
  ),
}

// All states grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Checkbox checked={false} />
        <Text>Unchecked</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={true} />
        <Text>Checked</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={false} disabled={true} />
        <Text>Disabled unchecked</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={true} disabled={true} />
        <Text>Disabled checked</Text>
      </View>
    </View>
  ),
}

// Interactive test
export const Checkable: Story = {
  args: {
    checked: false,
    testID: 'test-checkbox',
    onCheckedChange: (checked: boolean) => console.log('Checkbox changed:', checked),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByTestId('test-checkbox')

    // Verify checkbox exists
    await expect(checkbox).toBeTruthy()

    // Simulate check event
    await userEvent.click(checkbox)
  },
}

export const DisabledCheck: Story = {
  args: {
    checked: false,
    disabled: true,
    testID: 'disabled-checkbox',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByTestId('disabled-checkbox')

    // Verify checkbox exists but is disabled
    await expect(checkbox).toBeTruthy()
    await expect(checkbox.props.disabled).toBe(true)
  },
}

// Checkbox group example
export const CheckboxGroup: Story = {
  render: () => (
    <View className="gap-3">
      <Text className="mb-2 text-lg font-semibold">Select options:</Text>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={true} />
        <Text>Option 1</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={false} />
        <Text>Option 2</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={true} />
        <Text>Option 3</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Checkbox checked={false} disabled={true} />
        <Text>Option 4 (disabled)</Text>
      </View>
    </View>
  ),
}
