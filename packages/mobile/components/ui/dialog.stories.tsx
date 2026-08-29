import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Dialog> = {
  title: 'UI/Dialog',
  component: Dialog,
  parameters: {
    docs: {
      description: {
        component: 'Modal dialog component for focused interactions. Supports header, description, and footer sections.',
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
type Story = StoryObj<typeof Dialog>

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger>
        <Button>
          <Text>Open Dialog</Text>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>This is a dialog description.</DialogDescription>
        </DialogHeader>
        <View>
          <Text>Dialog content goes here.</Text>
        </View>
      </DialogContent>
    </Dialog>
  ),
}

export const WithFooter: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger>
        <Button>
          <Text>Open Dialog</Text>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogDescription>Are you sure you want to proceed?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">
            <Text>Cancel</Text>
          </Button>
          <Button>
            <Text>Confirm</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const LongContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger>
        <Button>
          <Text>Open Long Dialog</Text>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms and Conditions</DialogTitle>
          <DialogDescription>Please read these terms carefully.</DialogDescription>
        </DialogHeader>
        <View className="gap-2">
          <Text className="text-sm">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
            labore et dolore magna aliqua.
          </Text>
          <Text className="text-sm">
            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
            commodo consequat.
          </Text>
          <Text className="text-sm">
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat
            nulla pariatur.
          </Text>
        </View>
        <DialogFooter>
          <Button>
            <Text>Accept</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const Minimal: Story => {
  render: () => (
    <Dialog>
      <DialogTrigger>
        <Button>
          <Text>Open Minimal Dialog</Text>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Text>This is a minimal dialog without header or footer.</Text>
      </DialogContent>
    </Dialog>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3">
      <Dialog>
        <DialogTrigger>
          <Button>
            <Text>Default Dialog</Text>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Default</DialogTitle>
            <DialogDescription>Standard dialog layout</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger>
          <Button variant="outline">
            <Text>Dialog with Footer</Text>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>With Footer</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline">
              <Text>Cancel</Text>
            </Button>
            <Button>
              <Text>Confirm</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </View>
  ),
}

// Interactive test
export const Interactive: Story = {
  render: () => (
    <Dialog testID="test-dialog">
      <DialogTrigger testID="dialog-trigger">
        <Button>
          <Text>Open Dialog</Text>
        </Button>
      </DialogTrigger>
      <DialogContent testID="dialog-content">
        <DialogHeader>
          <DialogTitle testID="dialog-title">Test Dialog</DialogTitle>
          <DialogDescription testID="dialog-description">Test description</DialogDescription>
        </DialogHeader>
        <View>
          <Text testID="dialog-body">Dialog body content</Text>
        </View>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify trigger button exists
    const trigger = canvas.getByTestId('dialog-trigger')
    await expect(trigger).toBeTruthy()

    // Note: Full interaction testing would require Storybook's interaction addon
    // which may not be available in all setups
  },
}
