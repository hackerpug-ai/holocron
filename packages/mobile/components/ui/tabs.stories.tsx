import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
import { within, userEvent, expect } from '@storybook/test'

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: {
    docs: {
      description: {
        component: 'Tabs component for organizing content into switchable panels. Supports controlled and uncontrolled modes.',
      },
    },
  },
  argTypes: {
    value: {
      control: { type: 'text' },
      description: 'Currently active tab value',
    },
    defaultValue: {
      control: { type: 'text' },
      description: 'Initial active tab value',
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
type Story = StoryObj<typeof Tabs>

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">
          <Text>Tab 1</Text>
        </TabsTrigger>
        <TabsTrigger value="tab2">
          <Text>Tab 2</Text>
        </TabsTrigger>
        <TabsTrigger value="tab3">
          <Text>Tab 3</Text>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <View className="p-4">
          <Text>Content for Tab 1</Text>
        </View>
      </TabsContent>
      <TabsContent value="tab2">
        <View className="p-4">
          <Text>Content for Tab 2</Text>
        </View>
      </TabsContent>
      <TabsContent value="tab3">
        <View className="p-4">
          <Text>Content for Tab 3</Text>
        </View>
      </TabsContent>
    </Tabs>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = React.useState('tab1')
    return (
      <Tabs value={value} onValueChange={setValue}>
        <TabsList>
          <TabsTrigger value="tab1">
            <Text>Account</Text>
          </TabsTrigger>
          <TabsTrigger value="tab2">
            <Text>Password</Text>
          </TabsTrigger>
          <TabsTrigger value="tab3">
            <Text>Settings</Text>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">
          <View className="p-4">
            <Text>Account settings content</Text>
          </View>
        </TabsContent>
        <TabsContent value="tab2">
          <View className="p-4">
            <Text>Password change content</Text>
          </View>
        </TabsContent>
        <TabsContent value="tab3">
          <View className="p-4">
            <Text>General settings content</Text>
          </View>
        </TabsContent>
      </Tabs>
    )
  },
}

export const WithDisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">
          <Text>Enabled</Text>
        </TabsTrigger>
        <TabsTrigger value="tab2" disabled>
          <Text>Disabled</Text>
        </TabsTrigger>
        <TabsTrigger value="tab3">
          <Text>Enabled</Text>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <View className="p-4">
          <Text>Content for tab 1</Text>
        </View>
      </TabsContent>
      <TabsContent value="tab3">
        <View className="p-4">
          <Text>Content for tab 3</Text>
        </View>
      </TabsContent>
    </Tabs>
  ),
}

// Interactive test
export const Switchable: Story = {
  render: () => (
    <Tabs defaultValue="tab1" testID="test-tabs">
      <TabsList>
        <TabsTrigger value="tab1" testID="tab1-trigger">
          <Text>Tab 1</Text>
        </TabsTrigger>
        <TabsTrigger value="tab2" testID="tab2-trigger">
          <Text>Tab 2</Text>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <View className="p-4">
          <Text testID="tab1-content">Content for Tab 1</Text>
        </View>
      </TabsContent>
      <TabsContent value="tab2">
        <View className="p-4">
          <Text testID="tab2-content">Content for Tab 2</Text>
        </View>
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify initial tab content is visible
    await expect(canvas.getByTestId('tab1-content')).toBeTruthy()

    // Click on second tab trigger
    await userEvent.click(canvas.getByTestId('tab2-trigger'))

    // Verify second tab content is now visible
    await expect(canvas.getByTestId('tab2-content')).toBeTruthy()
  },
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-sm font-medium">Default Tabs</Text>
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">
              <Text>Tab 1</Text>
            </TabsTrigger>
            <TabsTrigger value="tab2">
              <Text>Tab 2</Text>
            </TabsTrigger>
            <TabsTrigger value="tab3">
              <Text>Tab 3</Text>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <View className="p-4">
              <Text>Content 1</Text>
            </View>
          </TabsContent>
          <TabsContent value="tab2">
            <View className="p-4">
              <Text>Content 2</Text>
            </View>
          </TabsContent>
          <TabsContent value="tab3">
            <View className="p-4">
              <Text>Content 3</Text>
            </View>
          </TabsContent>
        </Tabs>
      </View>

      <View>
        <Text className="mb-2 text-sm font-medium">Tabs with Disabled Tab</Text>
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">
              <Text>Enabled</Text>
            </TabsTrigger>
            <TabsTrigger value="tab2" disabled>
              <Text>Disabled</Text>
            </TabsTrigger>
            <TabsTrigger value="tab3">
              <Text>Enabled</Text>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <View className="p-4">
              <Text>Content for enabled tab</Text>
            </View>
          </TabsContent>
          <TabsContent value="tab3">
            <View className="p-4">
              <Text>Content for other enabled tab</Text>
            </View>
          </TabsContent>
        </Tabs>
      </View>
    </View>
  ),
}
