import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Toggle } from './toggle'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Toggle> = {
  title: 'UI/Toggle',
  component: Toggle,
  parameters: {
    docs: {
      description: {
        component: 'Toggle button component for binary on/off states. Can be pressed to toggle between checked and unchecked states.',
      },
    },
  },
  argTypes: {
    pressed: {
      control: { type: 'boolean' },
      description: 'Whether toggle is pressed/active',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable toggle interaction',
    },
    onPressedChange: {
      action: 'toggled',
      description: 'Callback when toggle state changes',
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
type Story = StoryObj<typeof Toggle>

export const Default: Story => {
  render: () => (
    <Toggle>
      <Text>Toggle</Text>
    </Toggle>
  ),
}

export const Pressed: Story => {
  render: () => (
    <Toggle pressed>
      <Text>Pressed</Text>
    </Toggle>
  ),
}

export const Disabled: Story => {
  render: () => (
    <Toggle disabled>
      <Text>Disabled</Text>
    </Toggle>
  ),
}

export const DisabledPressed: Story => {
  render: () => (
    <Toggle pressed disabled>
      <Text>Disabled & Pressed</Text>
    </Toggle>
  ),
}

export const Outline: Story => {
  render: () => (
    <Toggle variant="outline">
      <Text>Outline</Text>
    </Toggle>
  ),
}

export const WithIcon: Story => {
  render: () => (
    <Toggle>
      <Text className="mr-2">🔔</Text>
      <Text>Notifications</Text>
    </Toggle>
  ),
}

export const ToggleGroup: Story => {
  render: () => (
    <View className="flex-row flex-wrap gap-2">
      <Toggle>
        <Text>Bold</Text>
      </Toggle>
      <Toggle pressed>
        <Text>Italic</Text>
      </Toggle>
      <Toggle>
        <Text>Underline</Text>
      </Toggle>
      <Toggle pressed>
        <Text>Strikethrough</Text>
      </Toggle>
    </View>
  ),
}

export const FormatToolbar: Story => {
  render: () => (
    <View className="gap-2 rounded-lg border border-border bg-muted p-2">
      <Text className="mb-1 text-xs font-medium">Format</Text>
      <View className="flex-row flex-wrap gap-2">
        <Toggle pressed>
          <Text>B</Text>
        </Toggle>
        <Toggle>
          <Text>I</Text>
        </Toggle>
        <Toggle>
          <Text>U</Text>
        </Toggle>
        <Toggle pressed>
          <Text>S</Text>
        </Toggle>
      </View>
    </View>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-sm font-medium">Default Toggles</Text>
        <View className="flex-row flex-wrap gap-2">
          <Toggle>
            <Text>Unpressed</Text>
          </Toggle>
          <Toggle pressed>
            <Text>Pressed</Text>
          </Toggle>
          <Toggle disabled>
            <Text>Disabled</Text>
          </Toggle>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Outline Toggles</Text>
        <View className="flex-row flex-wrap gap-2">
          <Toggle variant="outline">
            <Text>Unpressed</Text>
          </Toggle>
          <Toggle variant="outline" pressed>
            <Text>Pressed</Text>
          </Toggle>
          <Toggle variant="outline" disabled>
            <Text>Disabled</Text>
          </Toggle>
        </View>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Toggle Group</Text>
        <View className="flex-row flex-wrap gap-2">
          <Toggle>
            <Text>Option 1</Text>
          </Toggle>
          <Toggle pressed>
            <Text>Option 2</Text>
          </Toggle>
          <Toggle>
            <Text>Option 3</Text>
          </Toggle>
          <Toggle pressed>
            <Text>Option 4</Text>
          </Toggle>
        </View>
      </View>
    </View>
  ),
}

// Interactive test
export const Toggleable: Story => {
  render: () => (
    <Toggle testID="test-toggle" pressed={false}>
      <Text>Toggle Me</Text>
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByTestId('test-toggle')

    // Verify toggle exists
    await expect(toggle).toBeTruthy()

    // Simulate press event
    await userEvent.click(toggle)
  },
}

export const DisabledToggle: Story => {
  render: () => (
    <Toggle testID="disabled-toggle" disabled>
      <Text>Cannot Toggle</Text>
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByTestId('disabled-toggle')

    // Verify toggle exists but is disabled
    await expect(toggle).toBeTruthy()
    await expect(toggle.props.disabled).toBe(true)
  },
}
