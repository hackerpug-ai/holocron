import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: {
    docs: {
      description: {
        component: 'Tooltip component for displaying additional information on hover or focus. Supports positioning on all sides.',
      },
    },
  },
  argTypes: {
    delayDuration: {
      control: { type: 'number' },
      description: 'Delay before tooltip appears (ms)',
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
type Story = StoryObj<typeof Tooltip>

export const Default: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button>
          <Text>Hover me</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <Text>This is a tooltip</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

export const Top: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button>
          <Text>Top tooltip</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <Text>Tooltip appears on top</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

export const Bottom: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button>
          <Text>Bottom tooltip</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <Text>Tooltip appears on bottom</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

export const Left: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button>
          <Text>Left tooltip</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <Text>Tooltip appears on left</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

export const Right: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button>
          <Text>Right tooltip</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <Text>Tooltip appears on right</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

export const LongText: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <Button>
          <Text>Long tooltip</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <Text>This is a longer tooltip with more detailed information.</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

export const WithIcon: Story => {
  render: () => (
    <Tooltip>
      <TooltipTrigger>
        <View className="size-8 items-center justify-center rounded-full bg-muted">
          <Text>?</Text>
        </View>
      </TooltipTrigger>
      <TooltipContent>
        <Text>This provides additional help information</Text>
      </TooltipContent>
    </Tooltip>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="flex-row flex-wrap gap-3">
      <Tooltip>
        <TooltipTrigger>
          <Button size="sm">
            <Text>Top</Text>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <Text>Top tooltip</Text>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button size="sm">
            <Text>Bottom</Text>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Text>Bottom tooltip</Text>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button size="sm">
            <Text>Left</Text>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <Text>Left tooltip</Text>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button size="sm">
            <Text>Right</Text>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <Text>Right tooltip</Text>
        </TooltipContent>
      </Tooltip>
    </View>
  ),
}

// Content verification test
export const TooltipVerification: Story => {
  render: () => (
    <Tooltip testID="test-tooltip">
      <TooltipTrigger testID="tooltip-trigger">
        <Button>
          <Text>Hover me</Text>
        </Button>
      </TooltipTrigger>
      <TooltipContent testID="tooltip-content">
        <Text>Tooltip content</Text>
      </TooltipContent>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify tooltip trigger exists
    const trigger = canvas.getByTestId('tooltip-trigger')
    await expect(trigger).toBeTruthy()

    // Note: Full tooltip interaction testing requires user interaction
    // which may not be available in all testing setups
  },
}
