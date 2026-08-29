import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
} from './dropdown-menu'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof DropdownMenu> = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    docs: {
      description: {
        component: 'Dropdown menu component for contextual actions. Supports items, separators, checkboxes, and radio groups.',
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
type Story = StoryObj<typeof DropdownMenu>

export const Default: Story => {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button>
          <Text>Open Menu</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>
          <Text>New Tab</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Text>New Window</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Text>Disconnect</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithLabel: Story => {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button>
          <Text>Options</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <Text>Account</Text>
        </DropdownMenuLabel>
        <DropdownMenuItem>
          <Text>Profile</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Text>Settings</Text>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Text>Logout</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithShortcuts: Story => {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button>
          <Text>Edit</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>
          <Text>Cut</Text>
          <DropdownMenuShortcut>
            <Text>⌘X</Text>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Text>Copy</Text>
          <DropdownMenuShortcut>
            <Text>⌘C</Text>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Text>Paste</Text>
          <DropdownMenuShortcut>
            <Text>⌘V</Text>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithCheckboxes: Story => {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button>
          <Text>View</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem checked>
          <Text>Show Status Bar</Text>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>
          <Text>Show Toolbar</Text>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>
          <Text>Show Sidebar</Text>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithRadioGroup: Story => {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button>
          <Text>Theme</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup defaultValue="light">
          <DropdownMenuRadioItem value="light">
            <Text>Light</Text>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Text>Dark</Text>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Text>System</Text>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const Destructive: Story => {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button>
          <Text>Actions</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>
          <Text>Edit</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Text>Duplicate</Text>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Text>Delete</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

// All variants grid
export const AllVariants: Story => {
  render: () => (
    <View className="gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button size="sm">
            <Text>Items</Text>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Text>Item 1</Text>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Text>Item 2</Text>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Text>Item 3</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button size="sm" variant="outline">
            <Text>With Label</Text>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <Text>Menu</Text>
          </DropdownMenuLabel>
          <DropdownMenuItem>
            <Text>Option 1</Text>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Text>Option 2</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  ),
}

// Interactive test
export const Interactive: Story => {
  render: () => (
    <DropdownMenu testID="test-dropdown">
      <DropdownMenuTrigger testID="dropdown-trigger">
        <Button>
          <Text>Open Menu</Text>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem testID="menu-item-1">
          <Text>Item 1</Text>
        </DropdownMenuItem>
        <DropdownMenuItem testID="menu-item-2">
          <Text>Item 2</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify trigger exists
    const trigger = canvas.getByTestId('dropdown-trigger')
    await expect(trigger).toBeTruthy()
  },
}
