import type { Meta, StoryObj } from '@storybook/react'
import { AlertCircle, FolderOpen } from '@/components/ui/icons'
import { View } from 'react-native'
import { EmptyState } from './EmptyState'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: {
    docs: {
      description: {
        component:
          'Placeholder displayed when no content is available. Supports different types (no-results, no-data, error) with appropriate icons and optional actions.',
      },
    },
  },
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['no-results', 'no-data', 'error', 'custom'],
      description: 'Type of empty state to display',
    },
    title: {
      control: { type: 'text' },
      description: 'Main title text',
    },
    description: {
      control: { type: 'text' },
      description: 'Description text',
    },
    actionLabel: {
      control: { type: 'text' },
      description: 'Action button label',
    },
    onActionPress: {
      action: 'pressed',
      description: 'Callback when action button is pressed',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
  },
  args: {
    type: 'no-data',
    title: 'No articles yet',
    description: 'Start by conducting some research to populate your knowledge base.',
    size: 'md',
  },
}

export default meta
type Story = StoryObj<typeof EmptyState>

export const Default: Story = {}

export const NoResults: Story = {
  args: {
    type: 'no-results',
    title: 'No results found',
    description: 'Try adjusting your search terms or filters.',
  },
}

export const Error: Story = {
  args: {
    type: 'error',
    title: 'Something went wrong',
    description: 'We could not load the data. Please try again.',
    actionLabel: 'Retry',
  },
}

export const WithAction: Story = {
  args: {
    type: 'no-data',
    title: 'No research sessions',
    description: 'Start your first research to begin building your knowledge base.',
    actionLabel: 'Start Research',
  },
}

export const CustomIcon: Story = {
  args: {
    type: 'custom',
    icon: FolderOpen,
    title: 'Folder is empty',
    description: 'Add some files to this folder.',
  },
}

export const Small: Story = {
  args: {
    type: 'no-data',
    title: 'No items',
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    type: 'no-data',
    title: 'Welcome to Holocron',
    description: 'Your personal research knowledge base awaits.',
    actionLabel: 'Get Started',
    size: 'lg',
  },
}

export const AllTypes: Story = {
  render: () => (
    <View style={{ gap: 32 }}>
      <EmptyState type="no-data" title="No data" size="sm" />
      <EmptyState type="no-results" title="No results" size="sm" />
      <EmptyState type="error" title="Error" size="sm" />
    </View>
  ),
}
