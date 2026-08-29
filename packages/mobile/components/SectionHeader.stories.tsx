import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { SectionHeader } from './SectionHeader'

const meta: Meta<typeof SectionHeader> = {
  title: 'Components/SectionHeader',
  component: SectionHeader,
  parameters: {
    docs: {
      description: {
        component:
          'Section title with optional action button. Used to introduce content sections with a consistent header pattern.',
      },
    },
  },
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'Section title text',
    },
    actionLabel: {
      control: { type: 'text' },
      description: 'Optional action button label',
    },
    onActionPress: {
      action: 'pressed',
      description: 'Callback when action button is pressed',
    },
    showChevron: {
      control: { type: 'boolean' },
      description: 'Whether to show chevron icon with action',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
  },
  args: {
    title: 'Recent Articles',
    showChevron: true,
    size: 'md',
  },
}

export default meta
type Story = StoryObj<typeof SectionHeader>

export const Default: Story = {}

export const WithAction: Story = {
  args: {
    title: 'Recent Articles',
    actionLabel: 'See all',
    onActionPress: () => console.log('Action pressed'),
  },
}

export const NoChevron: Story = {
  args: {
    title: 'Settings',
    actionLabel: 'Edit',
    showChevron: false,
  },
}

export const Small: Story = {
  args: {
    title: 'Related',
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    title: 'Knowledge Base',
    actionLabel: 'Browse',
    size: 'lg',
  },
}

export const AllSizes: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <SectionHeader title="Small Section" size="sm" actionLabel="View" />
      <SectionHeader title="Medium Section" size="md" actionLabel="View" />
      <SectionHeader title="Large Section" size="lg" actionLabel="View" />
    </View>
  ),
}
