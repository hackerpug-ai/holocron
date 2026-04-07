import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Alert, AlertTitle, AlertDescription } from './alert'
import { AlertCircle, Info } from '@/components/ui/icons'
import { within, expect } from '@storybook/test'

const meta: Meta<typeof Alert> = {
  title: 'UI/Alert',
  component: Alert,
  parameters: {
    docs: {
      description: {
        component: 'Alert component for displaying important messages. Supports default and destructive variants with optional icons.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'destructive'],
      description: 'Alert style variant',
    },
    icon: {
      control: { type: 'object' },
      description: 'Optional icon component to display',
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
type Story = StoryObj<typeof Alert>

export const Default: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>This is a default alert message.</AlertDescription>
    </Alert>
  ),
}

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Something went wrong. Please try again.</AlertDescription>
    </Alert>
  ),
}

export const WithIcon: Story = {
  render: () => (
    <Alert icon={Info}>
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
    </Alert>
  ),
}

export const DestructiveWithIcon: Story = {
  render: () => (
    <Alert variant="destructive" icon={AlertCircle}>
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
    </Alert>
  ),
}

export const Minimal: Story = {
  render: () => (
    <Alert>
      <AlertDescription>This is a minimal alert without a title.</AlertDescription>
    </Alert>
  ),
}

// All variants grid
export const AllVariants: Story = {
  render: () => (
    <View className="gap-3">
      <Alert>
        <AlertTitle>Default Alert</AlertTitle>
        <AlertDescription>This is a standard informational alert.</AlertDescription>
      </Alert>

      <Alert icon={Info}>
        <AlertTitle>With Icon</AlertTitle>
        <AlertDescription>This alert includes an icon for visual emphasis.</AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertTitle>Destructive Alert</AlertTitle>
        <AlertDescription>This alert indicates an error or warning.</AlertDescription>
      </Alert>

      <Alert variant="destructive" icon={AlertCircle}>
        <AlertTitle>Destructive with Icon</AlertTitle>
        <AlertDescription>This alert uses both destructive styling and an icon.</AlertDescription>
      </Alert>

      <Alert>
        <AlertDescription>Minimal alert without title</AlertDescription>
      </Alert>
    </View>
  ),
}

// Content verification test
export const ContentVerification: Story = {
  render: () => (
    <Alert testID="test-alert">
      <AlertTitle>Test Alert</AlertTitle>
      <AlertDescription>This is a test alert description.</AlertDescription>
    </Alert>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify title is displayed
    await expect(canvas.getByText('Test Alert')).toBeTruthy()

    // Verify description is displayed
    await expect(canvas.getByText('This is a test alert description.')).toBeTruthy()

    // Verify alert has role="alert"
    const alert = canvas.getByRole('alert')
    await expect(alert).toBeTruthy()
  },
}

export const DestructiveContentVerification: Story = {
  render: () => (
    <Alert variant="destructive" testID="destructive-alert">
      <AlertTitle>Error Occurred</AlertTitle>
      <AlertDescription>Failed to load data from server.</AlertDescription>
    </Alert>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Verify title is displayed
    await expect(canvas.getByText('Error Occurred')).toBeTruthy()

    // Verify description is displayed
    await expect(canvas.getByText('Failed to load data from server.')).toBeTruthy()

    // Verify alert has role="alert"
    const alert = canvas.getByTestId('destructive-alert')
    await expect(alert).toBeTruthy()
  },
}
