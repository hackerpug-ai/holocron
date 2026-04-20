import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NewsfeedHeader } from './NewsfeedHeader'

const meta: Meta<typeof NewsfeedHeader> = {
  title: 'Components/NewsfeedHeader',
  component: NewsfeedHeader,
  parameters: {
    docs: {
      description: {
        component:
          'Editorial date-and-stats header for Intelligence Briefing. Displays report date, color-coded freshness dot, finding count, source count, and relative generation time.',
      },
    },
  },
  argTypes: {
    report: {
      control: { type: 'object' },
      description: 'Report object with createdAt, findingsCount, and optional summaryJson',
    },
  },
  args: {
    report: {
      createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      findingsCount: 12,
      summaryJson: { sources: [{ url: 'https://example.com' }, { url: 'https://example2.com' }, { url: 'https://example3.com' }] },
    },
  },
  decorators: [
    (Story) => (
      <View className="bg-background p-4">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NewsfeedHeader>

export const Default: Story = {}

export const Fresh: Story = {
  args: {
    report: {
      createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago (< 6h = fresh/green)
      findingsCount: 12,
      summaryJson: { sources: [{ url: 'https://example.com' }, { url: 'https://example2.com' }, { url: 'https://example3.com' }] },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Fresh report (< 6 hours old) with green freshness dot.',
      },
    },
  },
}

export const Aging: Story = {
  args: {
    report: {
      createdAt: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago (< 24h = aging/amber)
      findingsCount: 8,
      summaryJson: { sources: [{ url: 'https://example.com' }, { url: 'https://example2.com' }] },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Aging report (6-24 hours old) with amber freshness dot.',
      },
    },
  },
}

export const Stale: Story = {
  args: {
    report: {
      createdAt: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago (>= 24h = stale/red)
      findingsCount: 5,
      summaryJson: { sources: [{ url: 'https://example.com' }] },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Stale report (24+ hours old) with red freshness dot.',
      },
    },
  },
}

export const NullReport: Story = {
  args: {
    report: null,
  },
  parameters: {
    docs: {
      description: {
        story: 'Null report state - renders empty View with testID.',
      },
    },
  },
}

export const NoSources: Story = {
  args: {
    report: {
      createdAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      findingsCount: 3,
      summaryJson: {},
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Report with findings but no sources (shows 0 sources).',
      },
    },
  },
}

export const FreshnessStates: Story = {
  render: () => {
    const now = Date.now()
    const reports = [
      { createdAt: now - 30 * 60 * 1000, label: 'Fresh (30m ago)' },
      { createdAt: now - 5 * 60 * 60 * 1000, label: 'Fresh (5h ago)' },
      { createdAt: now - 12 * 60 * 60 * 1000, label: 'Aging (12h ago)' },
      { createdAt: now - 23 * 60 * 60 * 1000, label: 'Aging (23h ago)' },
      { createdAt: now - 36 * 60 * 60 * 1000, label: 'Stale (36h ago)' },
      { createdAt: now - 72 * 60 * 60 * 1000, label: 'Stale (3d ago)' },
    ]

    return (
      <View className="gap-4">
        {reports.map((report, index) => (
          <View key={index} className="gap-1">
            <View className="px-4">
              <View className="bg-muted px-2 py-1 rounded">
                <View className="text-xs text-muted-foreground">{report.label}</View>
              </View>
            </View>
            <NewsfeedHeader
              report={{
                createdAt: report.createdAt,
                findingsCount: 10,
                summaryJson: { sources: [{ url: 'https://example.com' }, { url: 'https://example2.com' }] },
              }}
            />
          </View>
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows all freshness states side-by-side for comparison.',
      },
    },
  },
}
