import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Switch } from './switch'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  parameters: {
    docs: {
      description: {
        component: 'Toggle switch component for binary on/off states. Supports disabled state and controlled/uncontrolled modes.',
      },
    },
  },
  argTypes: {
    checked: {
      control: { type: 'boolean' },
      description: 'Whether switch is on (true) or off (false)',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable switch interaction',
    },
    onCheckedChange: {
      action: 'toggled',
      description: 'Callback when switch state changes',
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
type Story = StoryObj<typeof Switch>

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
      <Switch checked={false} />
      <Text>Enable notifications</Text>
    </View>
  ),
}

export const WithLabelChecked: Story = {
  render: () => (
    <View className="flex-row items-center gap-3">
      <Switch checked={true} />
      <Text>Dark mode</Text>
    </View>
  ),
}

// All states grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Switch checked={false} />
        <Text>Unchecked</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Switch checked={true} />
        <Text>Checked</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Switch checked={false} disabled={true} />
        <Text>Disabled unchecked</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Switch checked={true} disabled={true} />
        <Text>Disabled checked</Text>
      </View>
    </View>
  ),
}

// Interactive test
export const Toggleable: Story = {
  args: {
    checked: false,
    testID: 'test-switch',
    onCheckedChange: (checked: boolean) => console.log('Switch toggled:', checked),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchElement = canvas.getByTestId('test-switch')

    // Verify switch exists
    await expect(switchElement).toBeTruthy()

    // Simulate toggle event (Note: Switch components use role="switch")
    await userEvent.click(switchElement)
  },
}

export const DisabledToggle: Story = {
  args: {
    checked: false,
    disabled: true,
    testID: 'disabled-switch',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchElement = canvas.getByTestId('disabled-switch')

    // Verify switch exists but is disabled
    await expect(switchElement).toBeTruthy()
    await expect(switchElement.props.disabled).toBe(true)
  },
}
