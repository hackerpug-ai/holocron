import type { Meta, StoryObj } from '@storybook/react'
import { BookOpen, FileText, Search, TrendingUp } from '@/components/ui/icons'
import { View } from 'react-native'
import { StatCard } from './StatCard'

const meta: Meta<typeof StatCard> = {
  title: 'Components/StatCard',
  component: StatCard,
  parameters: {
    docs: {
      description: {
        component:
          'Displays a single statistic with label, value, optional icon, and trend indicator. Used for showing holocron statistics like document count, category breakdown, etc.',
      },
    },
  },
  argTypes: {
    label: {
      control: { type: 'text' },
      description: 'Stat label',
    },
    value: {
      control: { type: 'text' },
      description: 'Stat value (number or string)',
    },
    trend: {
      control: { type: 'number' },
      description: 'Optional trend indicator (+5, -3, etc.)',
    },
    loading: {
      control: { type: 'boolean' },
      description: 'Whether the stat is loading',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
  },
  args: {
    label: 'Total Documents',
    value: 1247,
    loading: false,
    size: 'md',
  },
}

export default meta
type Story = StoryObj<typeof StatCard>

export const Default: Story = {}

export const WithIcon: Story = {
  args: {
    label: 'Total Documents',
    value: 1247,
    icon: FileText,
  },
}

export const WithTrend: Story = {
  args: {
    label: 'This Week',
    value: 42,
    trend: 12,
    icon: TrendingUp,
  },
}

export const NegativeTrend: Story = {
  args: {
    label: 'Active Sessions',
    value: 3,
    trend: -2,
  },
}

export const Loading: Story = {
  args: {
    label: 'Loading...',
    value: 0,
    loading: true,
    icon: FileText,
  },
}

export const Small: Story = {
  args: {
    label: 'Categories',
    value: 8,
    icon: BookOpen,
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    label: 'Total Documents',
    value: 1247,
    icon: FileText,
    size: 'lg',
  },
}

export const StringValue: Story = {
  args: {
    label: 'Last Updated',
    value: '2 hours ago',
  },
}

export const StatsDashboard: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <StatCard label="Documents" value={1247} icon={FileText} trend={23} />
        </View>
        <View style={{ flex: 1 }}>
          <StatCard label="Categories" value={8} icon={BookOpen} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <StatCard label="Searches" value={156} icon={Search} trend={-5} />
        </View>
        <View style={{ flex: 1 }}>
          <StatCard label="This Week" value={42} icon={TrendingUp} trend={12} />
        </View>
      </View>
    </View>
  ),
}
