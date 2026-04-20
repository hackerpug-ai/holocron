import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { NewsfeedHeroCard } from './NewsfeedHeroCard'

const meta = {
  title: 'Components/NewsfeedHeroCard',
  component: NewsfeedHeroCard,
  parameters: {
    docs: {
      description: {
        component:
          'Elevated presentation for the highest-scored finding. Features 4px left border (vs 3px on regular cards), extra-bold enlarged title, "TOP SIGNAL" eyebrow label, extended summary, and required onPress.',
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
      description: 'Quality score (0-10)',
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
      description: 'Press handler (required)',
    },
  },
  args: {
    title: 'GPT-4 Achieves Human-Level Performance on Professional Certification Exams',
    source: 'OpenAI Research',
    category: 'discovery',
    score: 9.8,
    summary: 'In a groundbreaking study, GPT-4 demonstrates remarkable ability to pass professional bar exams, medical board certifications, and engineering licensing tests with scores above the human median. The research highlights significant implications for AI-assisted professional work and the future of credentialing.',
    publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    engagementVelocity: 5400,
    onPress: () => console.log('Hero card pressed'),
  },
  decorators: [
    (Story) => (
      <View className="bg-background p-4">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof NewsfeedHeroCard>

export default meta
type Story = StoryObj<typeof NewsfeedHeroCard>

export const Default: Story = {}

export const Discovery: Story = {
  args: {
    title: 'Breakthrough in Quantum Error Correction Paves Way for Fault-Tolerant Quantum Computing',
    source: 'Nature Quantum Information',
    category: 'discovery',
    score: 9.9,
    summary: 'Researchers demonstrate a novel approach to quantum error correction that reduces overhead by 90% while maintaining fault tolerance. This breakthrough could accelerate practical quantum computing by years.',
    publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    engagementVelocity: 6200,
    onPress: () => console.log('Discovery hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Discovery category hero card with amber 4px left border (#F59E0B).',
      },
    },
  },
}

export const Release: Story = {
  args: {
    title: 'React 19 Released: Revolutionary Concurrent Rendering and Server Components',
    source: 'React Team',
    category: 'release',
    score: 9.5,
    summary: 'The most significant React release in years introduces production-ready concurrent features, enhanced server components, streamlined Suspense boundaries, and automatic query invalidation. Performance improvements show 40% faster initial loads.',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 4800,
    onPress: () => console.log('Release hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Release category hero card with green 4px left border (#10B981).',
      },
    },
  },
}

export const Trend: Story = {
  args: {
    title: 'The Great Migration: Fortune 500 Companies Shift from Monoliths to Microservices at Record Pace',
    source: 'The Information',
    category: 'trend',
    score: 8.9,
    summary: 'Industry analysis reveals that 67% of Fortune 500 companies are actively migrating to microservices architectures, driven by needs for scalability, team autonomy, and faster deployment cycles. The trend accelerates despite associated complexity challenges.',
    publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 3100,
    onPress: () => console.log('Trend hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Trend category hero card with blue 4px left border (#3B82F6).',
      },
    },
  },
}

export const Discussion: Story = {
  args: {
    title: 'The Technical Debt Crisis: Why Startups Are Choosing Maintainability Over Hypergrowth',
    source: 'Hacker News',
    category: 'discussion',
    score: 8.2,
    summary: 'A compelling debate emerges in the tech community as founders and engineers share real-world experiences about the long-term costs of rapid prototyping. Consensus suggests that sustainable engineering practices lead to better outcomes despite slower initial velocity.',
    publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 2800,
    onPress: () => console.log('Discussion hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Discussion category hero card with gray 4px left border (#6B7280).',
      },
    },
  },
}

export const LongTitle: Story = {
  args: {
    title: 'Comprehensive Analysis of Advanced Machine Learning Techniques for Natural Language Understanding and Generation in Multimodal Contexts with Real-Time Processing Capabilities',
    source: 'ArXiv AI',
    category: 'discovery',
    score: 9.3,
    summary: 'This paper presents a novel approach to multimodal AI that achieves state-of-the-art results across multiple benchmarks.',
    publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 3900,
    onPress: () => console.log('Long title hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Long title truncated to 3 lines with ellipsis.',
      },
    },
  },
}

export const LongSummary: Story = {
  args: {
    title: 'The Future of Web Development: WebAssembly and Beyond',
    source: 'WebAssembly Weekly',
    category: 'trend',
    score: 8.7,
    summary: 'This comprehensive analysis explores the current state and future potential of WebAssembly technology. We examine real-world use cases where WASM delivers 10-100x performance improvements over JavaScript, discuss the growing ecosystem of tools and frameworks, and analyze how browser vendors are investing in WASM as a first-class citizen. The article also covers component model standards, garbage collection proposals, and the intersection of WebAssembly with emerging technologies like WebGPU and WebAI.',
    publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 2250,
    onPress: () => console.log('Long summary hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Long summary truncated to 4 lines with ellipsis.',
      },
    },
  },
}

export const NoSummary: Story = {
  args: {
    title: 'Breaking: Major Cloud Provider Announces 50% Price Reduction',
    source: 'TechCrunch',
    category: 'release',
    score: 9.1,
    publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    engagementVelocity: 7200,
    onPress: () => console.log('No summary hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Hero card without summary - only title and metadata shown.',
      },
    },
  },
}

export const NoEngagementVelocity: Story = {
  args: {
    title: 'Academic Paper: Formal Verification of Distributed Systems',
    source: 'ACM Digital Library',
    category: 'discovery',
    score: 8.5,
    summary: 'Researchers present a new framework for formally verifying distributed consensus algorithms, proving correctness properties for Byzantine fault tolerance under various failure models.',
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    onPress: () => console.log('No velocity hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Hero card without engagement velocity - Zap icon and count hidden.',
      },
    },
  },
}

export const JustNow: Story = {
  args: {
    title: 'Live Coverage: Major Tech Conference Keynote Address',
    source: 'Live Blog',
    category: 'release',
    score: 7.8,
    summary: 'Real-time updates from the keynote as major product announcements are unveiled.',
    publishedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    engagementVelocity: 8500,
    onPress: () => console.log('Just now hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Hero card with very recent timestamp (shows "Just now").',
      },
    },
  },
}

export const DaysAgo: Story = {
  args: {
    title: 'Historic Analysis: The Evolution of JavaScript Frameworks Over the Past Decade',
    source: 'JavaScript Weekly',
    category: 'trend',
    score: 8.0,
    summary: 'A retrospective look at how JavaScript frameworks have evolved, from early jQuery dominance to the modern React/Vue/Svelte ecosystem.',
    publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    engagementVelocity: 1800,
    onPress: () => console.log('Days ago hero pressed'),
  },
  parameters: {
    docs: {
      description: {
        story: 'Hero card with older timestamp (shows "5d ago").',
      },
    },
  },
}

export const AllCategoriesComparison: Story = {
  render: () => {
    const findings = [
      {
        title: 'Discovery: AI Breakthrough',
        source: 'Nature',
        category: 'discovery' as const,
        score: 9.9,
        summary: 'Summary for discovery.',
        publishedAt: new Date().toISOString(),
        engagementVelocity: 5000,
      },
      {
        title: 'Release: Version 2.0',
        source: 'GitHub',
        category: 'release' as const,
        score: 9.5,
        summary: 'Summary for release.',
        publishedAt: new Date().toISOString(),
        engagementVelocity: 4000,
      },
      {
        title: 'Trend: Industry Shift',
        source: 'TechCrunch',
        category: 'trend' as const,
        score: 8.8,
        summary: 'Summary for trend.',
        publishedAt: new Date().toISOString(),
        engagementVelocity: 3000,
      },
      {
        title: 'Discussion: Community Debate',
        source: 'Hacker News',
        category: 'discussion' as const,
        score: 8.2,
        summary: 'Summary for discussion.',
        publishedAt: new Date().toISOString(),
        engagementVelocity: 2000,
      },
    ]

    return (
      <View className="gap-4">
        {findings.map((finding, index) => (
          <NewsfeedHeroCard
            key={index}
            {...finding}
            onPress={() => console.log(`Hero ${index} pressed`)}
          />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all 4 categories showing distinct left border colors (amber, green, blue, gray) with 4px width.',
      },
    },
  },
}
