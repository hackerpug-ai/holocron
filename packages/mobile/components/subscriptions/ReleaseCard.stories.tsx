import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ReleaseCard } from './ReleaseCard'

const meta: Meta<typeof ReleaseCard> = {
  title: 'Subscriptions/ReleaseCard',
  component: ReleaseCard,
  parameters: {
    docs: {
      description: {
        component:
          'ReleaseCard displays software release information with a prominent version badge, title, summary, and optional changelog link. Used in subscription feeds for GitHub releases, npm package updates, and other software releases.',
      },
    },
  },
  argTypes: {
    version: {
      control: 'text',
      description: 'Version string (e.g., "v2.1.0", "1.0.0-beta")',
    },
    title: {
      control: 'text',
      description: 'Release title',
    },
    summary: {
      control: 'text',
      description: 'Optional summary/description',
    },
    repositoryName: {
      control: 'text',
      description: 'Repository name (e.g., "facebook/react")',
    },
    source: {
      control: 'text',
      description: 'Source name (fallback when repositoryName is not provided)',
    },
    publishedAt: {
      control: 'text',
      description: 'Optional published timestamp (relative time)',
    },
    changelogUrl: {
      control: 'text',
      description: 'Optional changelog URL',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when card is pressed',
    },
    testID: {
      control: 'text',
      description: 'Test ID prefix for testing',
    },
    feedItemId: {
      control: 'text',
      description: 'Feed item ID for feedback functionality (enables feedback buttons)',
    },
  },
  args: {
    version: 'v2.1.0',
    title: 'New Performance Improvements',
    summary: 'This release includes significant performance improvements and bug fixes for better user experience.',
    repositoryName: 'facebook/react',
    source: 'GitHub',
    publishedAt: '2 days ago',
    changelogUrl: 'https://github.com/facebook/react/releases/tag/v2.1.0',
    testID: 'release-card',
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    version: 'v2.1.0',
    title: 'New Performance Improvements',
    summary: 'This release includes significant performance improvements and bug fixes for better user experience.',
    repositoryName: 'facebook/react',
    source: 'GitHub',
    publishedAt: '2 days ago',
    changelogUrl: 'https://github.com/facebook/react/releases/tag/v2.1.0',
    onPress: () => console.log('Release card pressed'),
  },
}

export const WithoutRepositoryName: Story = {
  args: {
    version: 'v1.0.0',
    title: 'Initial Release',
    summary: 'First stable release of the library with core features.',
    source: 'npm',
    publishedAt: '1 week ago',
    onPress: () => console.log('Release card pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Release card without repositoryName falls back to source name (npm).',
      },
    },
  },
}

export const WithoutSummary: Story = {
  args: {
    version: 'v3.0.0',
    title: 'Major Update',
    repositoryName: 'vercel/next.js',
    source: 'GitHub',
    publishedAt: '3 days ago',
    changelogUrl: 'https://github.com/vercel/next.js/releases/tag/v3.0.0',
    onPress: () => console.log('Release card pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Release card without summary only shows title and version badge.',
      },
    },
  },
}

export const WithoutChangelog: Story = {
  args: {
    version: 'v2.5.0',
    title: 'Bug Fixes Only',
    summary: 'This release fixes several critical bugs reported by the community.',
    repositoryName: 'facebook/react',
    source: 'GitHub',
    publishedAt: '5 hours ago',
    onPress: () => console.log('Release card pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Release card without changelogUrl does not show the "View changelog" button.',
      },
    },
  },
}

export const BetaRelease: Story = {
  args: {
    version: 'v2.0.0-beta.1',
    title: 'Beta Release for Testing',
    summary: 'This is a beta release for early testing and feedback. Includes experimental features.',
    repositoryName: 'tailwindlabs/tailwindcss',
    source: 'GitHub',
    publishedAt: '1 day ago',
    changelogUrl: 'https://github.com/tailwindlabs/tailwindcss/releases/tag/v2.0.0-beta.1',
    onPress: () => console.log('Release card pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Beta release version badge displays correctly with pre-release identifiers.',
      },
    },
  },
}

export const LongSummary: Story = {
  args: {
    version: 'v1.5.0',
    title: 'Feature Release',
    summary: 'This release adds support for custom themes, improves performance, fixes memory leaks, adds new API endpoints, enhances error handling, improves documentation, and includes many other improvements based on community feedback.',
    repositoryName: 'facebook/react',
    source: 'GitHub',
    publishedAt: '4 days ago',
    changelogUrl: 'https://github.com/facebook/react/releases/tag/v1.5.0',
    onPress: () => console.log('Release card pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Long summary text truncates to 3 lines with ellipsis.',
      },
    },
  },
}

export const LongTitle: Story = {
  args: {
    version: 'v2.0.0',
    title: 'This is an extremely long release title that should be truncated to two lines to maintain consistent card height across the feed',
    summary: 'Major update with breaking changes.',
    repositoryName: 'vercel/next.js',
    source: 'GitHub',
    publishedAt: '1 week ago',
    onPress: () => console.log('Release card pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Long title text truncates to 2 lines with ellipsis.',
      },
    },
  },
}

export const MultipleReleases: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <ReleaseCard
        version="v2.1.0"
        title="New Performance Improvements"
        summary="This release includes significant performance improvements."
        repositoryName="facebook/react"
        source="GitHub"
        publishedAt="2 days ago"
        changelogUrl="https://github.com/facebook/react/releases/tag/v2.1.0"
        testID="release-card-1"
      />
      <ReleaseCard
        version="v1.0.0"
        title="Initial Release"
        summary="First stable release with core features."
        source="npm"
        publishedAt="1 week ago"
        testID="release-card-2"
      />
      <ReleaseCard
        version="v3.0.0-beta"
        title="Beta Release"
        repositoryName="vercel/next.js"
        source="GitHub"
        publishedAt="5 hours ago"
        testID="release-card-3"
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Multiple release cards displayed in a feed layout showing different variants.',
      },
    },
  },
}

export const WithFeedback: Story = {
  args: {
    version: 'v2.1.0',
    title: 'New Performance Improvements',
    summary: 'This release includes significant performance improvements and bug fixes for better user experience.',
    repositoryName: 'facebook/react',
    source: 'GitHub',
    publishedAt: '2 days ago',
    changelogUrl: 'https://github.com/facebook/react/releases/tag/v2.1.0',
    feedItemId: 'feed456' as any,
    testID: 'release-card-feedback',
  },
  parameters: {
    docs: {
      description: {
        story: 'Release card with feedback buttons enabled via feedItemId prop.',
      },
    },
  },
}
