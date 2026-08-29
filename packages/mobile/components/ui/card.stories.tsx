import type { Meta, StoryObj } from '@storybook/react'
import { View, ScrollView } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    docs: {
      description: {
        component: 'Card container with optional header, title, description, content, and footer sections. Useful for grouping related content.',
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
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>Card content with some example text.</Text>
      </CardContent>
    </Card>
  ),
}

export const WithFooter: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Card with Footer</CardTitle>
        <CardDescription>This card has a footer section</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>Card content goes here.</Text>
      </CardContent>
      <CardFooter>
        <Button>
          <Text>Action</Text>
        </Button>
      </CardFooter>
    </Card>
  ),
}

export const Minimal: Story = {
  render: () => (
    <Card>
      <CardContent>
        <Text>Simple card with only content</Text>
      </CardContent>
    </Card>
  ),
}

export const LongContent: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Long Content Card</CardTitle>
        <CardDescription>Demonstrates scrolling within card</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollView style={{ maxHeight: 150 }}>
          <Text className="mb-2">
            This is a card with longer content that might overflow. Lorem ipsum dolor sit amet,
            consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna
            aliqua.
          </Text>
          <Text className="mb-2">
            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
            commodo consequat.
          </Text>
          <Text>
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat
            nulla pariatur.
          </Text>
        </ScrollView>
      </CardContent>
    </Card>
  ),
}

export const CustomStyled: Story = {
  render: () => (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="text-primary">Custom Styled Card</CardTitle>
        <CardDescription>This card has custom styling</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>Card with custom border color</Text>
      </CardContent>
    </Card>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Default Card</CardTitle>
          <CardDescription>Standard card layout</CardDescription>
        </CardHeader>
        <CardContent>
          <Text>Card content</Text>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card with Footer</CardTitle>
        </CardHeader>
        <CardContent>
          <Text>Content area</Text>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="flex-1">
            <Text>Cancel</Text>
          </Button>
          <Button className="flex-1">
            <Text>Confirm</Text>
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardContent>
          <Text>Minimal card - no header</Text>
        </CardContent>
      </Card>
    </View>
  ),
}

// Content verification test
export const ContentVerification: Story = {
  render: () => (
    <Card testID="test-card">
      <CardHeader>
        <CardTitle>Test Card</CardTitle>
        <CardDescription>Test description</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>Test content</Text>
      </CardContent>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify title is displayed
    await expect(canvas.getByText('Test Card')).toBeTruthy()

    // Verify description is displayed
    await expect(canvas.getByText('Test description')).toBeTruthy()

    // Verify content is displayed
    await expect(canvas.getByText('Test content')).toBeTruthy()
  },
}
