import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Collapsible> = {
  title: 'UI/Collapsible',
  component: Collapsible,
  parameters: {
    docs: {
      description: {
        component: 'Collapsible component for showing/hiding content. Animated expand/collapse functionality.',
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
type Story = StoryObj<typeof Collapsible>

export const Default: Story => {
  render: () => (
    <Collapsible defaultOpen>
      <CollapsibleTrigger>
        <Button>
          <Text>Toggle</Text>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="p-4">
          <Text>Collapsible content</Text>
        </View>
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const WithLongContent: Story => {
  render: () => (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger>
        <Button>
          <Text>Show Details</Text>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="gap-2 p-4">
          <Text>This is a collapsible section with longer content.</Text>
          <Text>You can put multiple elements here.</Text>
          <Text>The content animates smoothly when opening/closing.</Text>
        </View>
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const Controlled: Story => {
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger>
          <Button>
            <Text>{open ? 'Close' : 'Open'}</Text>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <View className="p-4">
            <Text>Controlled collapsible content</Text>
          </View>
        </CollapsibleContent>
      </Collapsible>
    )
  },
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-3">
      <Collapsible defaultOpen>
        <CollapsibleTrigger>
          <Button size="sm">
            <Text>Open by default</Text>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <View className="p-3">
            <Text>Content visible initially</Text>
          </View>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger>
          <Button size="sm">
            <Text>Closed by default</Text>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <View className="p-3">
            <Text>Content hidden initially</Text>
          </View>
        </CollapsibleContent>
      </Collapsible>
    </View>
  ),
}

// Interactive test
export const Toggleable: Story => {
  render: () => (
    <Collapsible testID="test-collapsible" defaultOpen={false}>
      <CollapsibleTrigger testID="collapsible-trigger">
        <Button>
          <Text>Toggle Content</Text>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="p-4">
          <Text testID="collapsible-content">Hidden content</Text>
        </View>
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify trigger exists
    const trigger = canvas.getByTestId('collapsible-trigger')
    await expect(trigger).toBeTruthy()

    // Simulate press event
    await userEvent.click(trigger)
  },
}
