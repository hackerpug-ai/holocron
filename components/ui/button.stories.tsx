import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from './button'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component: 'Button component with multiple variants (default, destructive, outline, secondary, ghost, link) and sizes (default, sm, lg, icon). Supports both React Native and web platforms.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: 'Button style variant',
    },
    size: {
      control: { type: 'select' },
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'Button size',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable button interaction',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when button is pressed',
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
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    variant: 'default',
    children: <Text>Default Button</Text>,
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

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: <Text>Secondary</Text>,
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: <Text>Ghost</Text>,
  },
}

export const Link: Story = {
  args: {
    variant: 'link',
    children: <Text>Link</Text>,
  },
}

// Size variants
export const Small: Story = {
  args: {
    size: 'sm',
    variant: 'default',
    children: <Text>Small</Text>,
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    variant: 'default',
    children: <Text>Large</Text>,
  },
}

export const Icon: Story = {
  args: {
    size: 'icon',
    variant: 'default',
    children: <Text>🔥</Text>,
  },
}

// Disabled state
export const Disabled: Story = {
  args: {
    disabled: true,
    children: <Text>Disabled</Text>,
  },
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3">
      <Button variant="default">
        <Text>Default</Text>
      </Button>
      <Button variant="destructive">
        <Text>Destructive</Text>
      </Button>
      <Button variant="outline">
        <Text>Outline</Text>
      </Button>
      <Button variant="secondary">
        <Text>Secondary</Text>
      </Button>
      <Button variant="ghost">
        <Text>Ghost</Text>
      </Button>
      <Button variant="link">
        <Text>Link</Text>
      </Button>
    </View>
  ),
}

// All sizes grid
export const AllSizes: Story = {
  render: () => (
    <View className="gap-3">
      <Button size="sm">
        <Text>Small</Text>
      </Button>
      <Button size="default">
        <Text>Default</Text>
      </Button>
      <Button size="lg">
        <Text>Large</Text>
      </Button>
      <Button size="icon">
        <Text>A</Text>
      </Button>
    </View>
  ),
}

// Interactive test
export const Pressable: Story = {
  args: {
    variant: 'default',
    onPress: () => console.log('Button pressed'),
    children: <Text>Press Me</Text>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button')

    // Verify button exists
    await expect(button).toBeTruthy()

    // Simulate press event
    await userEvent.click(button)
  },
}

export const DisabledPressable: Story = {
  args: {
    disabled: true,
    onPress: () => console.log('This should not fire'),
    children: <Text>Cannot Press</Text>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button')

    // Verify button exists but is disabled
    await expect(button).toBeTruthy()
    await expect(button.props.disabled).toBe(true)
  },
}
