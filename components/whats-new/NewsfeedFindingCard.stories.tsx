import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NewsfeedFindingCard } from './NewsfeedFindingCard'

const meta: Meta<typeof NewsfeedFindingCard> = {
  title: 'Components/NewsfeedFindingCard',
  component: NewsfeedFindingCard,
  parameters: {
    docs: {
      description: {
        component:
          'List-row finding card with left-border accent by category. Displays category label, dot-based score indicator, title, summary, source, engagement velocity, and relative time.',
      },
    },
  },
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'Finding title',
    },
    source: {
      control: { type: 'text' },
      description: 'Source name',
    },
    category: {
      control: { type: 'select' },
      options: ['discovery', 'release', 'trend', 'discussion'],
      description: 'Finding category (determines left border color)',
    },
    score: {
      control: { type: 'number', min: 0, max: 10, step: 0.1 },
      description: 'Quality score (0-10, determines dot count)',
    },
    summary: {
      control: { type: 'text' },
      description: 'Summary text',
    },
    publishedAt: {
      control: { type: 'text' },
      description: 'ISO date string for relative time display',
    },
    engagementVelocity: {
      control: { type: 'number' },
      description: 'Engagement velocity metric',
    },
    onPress: {
      action: 'onPress',
      description: 'Press handler',
    },
  },
  args: {
    title: 'New React Native performance optimization techniques reduce bundle size by 40%',
    source: 'React Native Blog',
    category: 'discovery',
    score: 8.5,
    summary: 'A deep dive into the latest optimization strategies that help reduce JavaScript bundle size and improve app startup time.',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 1250,
  },
  decorators: [
    (Story) => (
      <View className="bg-background">
        <Story />
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NewsfeedFindingCard>

export const Default: Story = {}

export const AllCategories: Story = {
  render: () => {
    const findings = [
      {
        title: 'Revolutionary AI model achieves 99% accuracy on complex reasoning tasks',
        source: 'ArXiv Research',
        category: 'discovery' as const,
        score: 9.2,
        summary: 'Researchers have developed a new transformer architecture that significantly improves performance on multi-step reasoning problems.',
        publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        engagementVelocity: 2500,
      },
      {
        title: 'React 19 released with new concurrent features and improved server components',
        source: 'React Blog',
        category: 'release' as const,
        score: 8.7,
        summary: 'The latest version of React brings enhanced concurrency, better error boundaries, and streamlined server component APIs.',
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        engagementVelocity: 1800,
      },
      {
        title: 'TypeScript adoption surges among Fortune 500 companies',
        source: 'TechCrunch',
        category: 'trend' as const,
        score: 7.5,
        summary: 'Industry analysis shows a significant shift toward TypeScript in enterprise environments, with adoption rates tripling over the past year.',
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        engagementVelocity: 950,
      },
      {
        title: 'Community debate: Is monorepo architecture right for startups?',
        source: 'Hacker News',
        category: 'discussion' as const,
        score: 6.8,
        summary: 'Developers discuss the trade-offs between monorepo and polyrepo strategies for early-stage companies, sharing real-world experiences.',
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        engagementVelocity: 420,
      },
    ]

    return (
      <View className="gap-0">
        {findings.map((finding, index) => (
          <NewsfeedFindingCard key={index} {...finding} />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows all 4 categories with distinct left border colors: discovery (amber), release (green), trend (blue), discussion (gray).',
      },
    },
  },
}

export const Discovery: Story = {
  args: {
    title: 'Breakthrough in quantum computing enables practical error correction',
    source: 'Nature',
    category: 'discovery',
    score: 9.5,
    summary: 'Scientists demonstrate a new approach to quantum error correction that could pave the way for fault-tolerant quantum computers.',
    publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    engagementVelocity: 3200,
  },
  parameters: {
    docs: {
      description: {
        story: 'Discovery category with amber left border (#F59E0B).',
      },
    },
  },
}

export const Release: Story = {
  args: {
    title: 'Node.js 22 LTS released with enhanced performance and security features',
    source: 'Node.js Blog',
    category: 'release',
    score: 8.3,
    summary: 'The latest LTS release includes significant performance improvements, updated V8 engine, and enhanced security defaults.',
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 1500,
  },
  parameters: {
    docs: {
      description: {
        story: 'Release category with green left border (#10B981).',
      },
    },
  },
}

export const Trend: Story = {
  args: {
    title: 'Rust continues to gain traction in systems programming community',
    source: 'The Verge',
    category: 'trend',
    score: 7.8,
    summary: 'Survey data shows Rust is becoming the preferred choice for systems programming, overtaking C++ in several key metrics.',
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 1100,
  },
  parameters: {
    docs: {
      description: {
        story: 'Trend category with blue left border (#3B82F6).',
      },
    },
  },
}

export const Discussion: Story = {
  args: {
    title: 'Opinion: Why microservices might not be the answer for every application',
    source: 'Dev.to',
    category: 'discussion',
    score: 6.5,
    summary: 'A thoughtful analysis of when microservices make sense and when a monolithic architecture might be more appropriate.',
    publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 680,
  },
  parameters: {
    docs: {
      description: {
        story: 'Discussion category with gray left border (#6B7280).',
      },
    },
  },
}

export const HighScore: Story = {
  args: {
    title: 'Revolutionary compression algorithm achieves 10x better ratios',
    source: 'MIT Technology Review',
    category: 'discovery',
    score: 9.9,
    summary: 'New algorithm combines machine learning with traditional compression techniques to achieve unprecedented compression ratios.',
    publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    engagementVelocity: 4500,
  },
  parameters: {
    docs: {
      description: {
        story: 'High score (9.9) showing 5 filled dots (●●●●●).',
      },
    },
  },
}

export const MediumScore: Story = {
  args: {
    title: 'Popular CSS framework releases major update with new components',
    source: 'CSS-Tricks',
    category: 'release',
    score: 5.0,
    summary: 'The update includes 50+ new components, improved accessibility, and better dark mode support.',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 890,
  },
  parameters: {
    docs: {
      description: {
        story: 'Medium score (5.0) showing 3 filled dots (●●●○○).',
      },
    },
  },
}

export const LowScore: Story = {
  args: {
    title: 'Minor bug fix update for legacy browser support',
    source: 'Release Notes',
    category: 'release',
    score: 2.1,
    summary: 'Addresses a rendering issue in older versions of Internet Explorer.',
    publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 120,
  },
  parameters: {
    docs: {
      description: {
        story: 'Low score (2.1) showing 1 filled dot (●○○○○).',
      },
    },
  },
}

export const NoScore: Story = {
  args: {
    title: 'Community meetup scheduled for next month',
    source: 'Meetup.com',
    category: 'discussion',
    summary: 'Join fellow developers for networking and technical discussions.',
    publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  parameters: {
    docs: {
      description: {
        story: 'No score provided - dots section is hidden.',
      },
    },
  },
}

export const NoSummary: Story = {
  args: {
    title: 'Quick announcement about scheduled maintenance',
    source: 'Status Page',
    category: 'release',
    score: 3.5,
    publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  parameters: {
    docs: {
      description: {
        story: 'No summary provided - only title and metadata shown.',
      },
    },
  },
}

export const NoEngagementVelocity: Story = {
  args: {
    title: 'New documentation page published for API reference',
    source: 'Documentation',
    category: 'release',
    score: 6.2,
    summary: 'Comprehensive reference guide for the latest API endpoints and usage examples.',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  parameters: {
    docs: {
      description: {
        story: 'No engagement velocity - velocity badge is hidden.',
      },
    },
  },
}

export const LongTitle: Story = {
  args: {
    title: 'Comprehensive guide to understanding advanced React performance optimization techniques including memoization, code splitting, lazy loading, and efficient state management strategies for large-scale applications',
    source: 'Dev.to',
    category: 'trend',
    score: 7.9,
    summary: 'Learn how to optimize React applications for maximum performance.',
    publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 750,
  },
  parameters: {
    docs: {
      description: {
        story: 'Long title truncated to 2 lines with ellipsis.',
      },
    },
  },
}

export const LongSummary: Story = {
  args: {
    title: 'Deep dive into WebAssembly performance',
    source: 'WebAssembly Weekly',
    category: 'discovery',
    score: 8.8,
    summary: 'This article explores the performance characteristics of WebAssembly in various scenarios, comparing it to JavaScript and native code. We examine compilation strategies, memory management, and optimization techniques that can help you get the most out of WASM in your applications.',
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 1350,
  },
  parameters: {
    docs: {
      description: {
        story: 'Long summary truncated to 3 lines with ellipsis.',
      },
    },
  },
}
