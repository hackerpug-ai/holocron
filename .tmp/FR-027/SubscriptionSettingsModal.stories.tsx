import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { SubscriptionSettingsModal } from './SubscriptionSettingsModal'

const meta: Meta<typeof SubscriptionSettingsModal> = {
  title: 'Subscriptions/SubscriptionSettingsModal',
  component: SubscriptionSettingsModal,
  parameters: {
    docs: {
      description: {
        component:
          'Settings modal for feed preferences. Users can configure notifications, display options, and content filters. Settings persist to Convex on change.',
      },
    },
  },
  argTypes: {
    visible: {
      control: { type: 'boolean' },
      description: 'Whether modal is visible',
    },
    onDismiss: {
      action: 'dismissed',
      description: 'Callback when modal is closed',
    },
    onManageSubscriptions: {
      action: 'navigate',
      description: 'Callback when Manage Subscriptions is pressed',
    },
    testID: {
      control: { type: 'text' },
      description: 'Test ID prefix for testing',
    },
  },
  args: {
    visible: true,
    testID: 'settings-modal',
  },
}

export default meta
type Story = StoryObj<typeof SubscriptionSettingsModal>

export const Default: Story = {
  args: {
    visible: true,
    onDismiss: () => console.log('Modal dismissed'),
    onManageSubscriptions: () => console.log('Navigate to subscriptions'),
  },
}

export const AllSettingsOn: Story = {
  args: {
    visible: true,
    onDismiss: () => console.log('Modal dismissed'),
    onManageSubscriptions: () => console.log('Navigate to subscriptions'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Modal with all settings enabled (simulated state - actual settings come from Convex)',
      },
    },
  },
}

export const AllSettingsOff: Story = {
  args: {
    visible: true,
    onDismiss: () => console.log('Modal dismissed'),
    onManageSubscriptions: () => console.log('Navigate to subscriptions'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Modal with minimal settings (simulated state - actual settings come from Convex)',
      },
    },
  },
}

export const WithVideosFilter: Story = {
  args: {
    visible: true,
    onDismiss: () => console.log('Modal dismissed'),
    onManageSubscriptions: () => console.log('Navigate to subscriptions'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Modal with Videos only filter selected (simulated state - actual settings come from Convex)',
      },
    },
  },
}

export const Closed: Story = {
  args: {
    visible: false,
    onDismiss: () => console.log('Modal dismissed'),
    onManageSubscriptions: () => console.log('Navigate to subscriptions'),
  },
}
