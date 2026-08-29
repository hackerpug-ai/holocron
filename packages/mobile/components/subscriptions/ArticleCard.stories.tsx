import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ArticleCard } from './ArticleCard'

const meta: Meta<typeof ArticleCard> = {
  title: 'Components/Subscriptions/ArticleCard',
  component: ArticleCard,
  parameters: {
    docs: {
      description: {
        component:
          'Article card component with 16:9 hero image, summary, source badge, and read time estimate. Supports fallback UI when hero image is missing.',
      },
    },
  },
  argTypes: {
    heroImageUrl: {
      control: { type: 'text' },
      description: 'URL to hero image (16:9 aspect ratio)',
    },
    title: {
      control: { type: 'text' },
      description: 'Article title',
    },
    summary: {
      control: { type: 'text' },
      description: 'Optional summary text (2-3 lines)',
    },
    source: {
      control: { type: 'text' },
      description: 'Source name (e.g., "TechCrunch", "The Verge")',
    },
    readTime: {
      control: { type: 'text' },
      description: 'Read time estimate (e.g., "5 min read")',
    },
    publishedAt: {
      control: { type: 'text' },
      description: 'Published timestamp (relative time display)',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when card is pressed',
    },
    testID: {
      control: { type: 'text' },
      description: 'Test ID for testing',
    },
  },
  args: {
    title: 'The Future of React Native: What\'s Next in 2026',
    summary: 'Explore the latest developments in React Native, including new architecture, performance improvements, and community-driven innovations that are shaping the future of mobile development.',
    source: 'TechCrunch',
    readTime: '5 min read',
    publishedAt: '2 days ago',
    testID: 'article-card',
  },
}

export default meta
type Story = StoryObj<typeof ArticleCard>

export const Default: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article1/640/360',
  },
}

export const LongTitle: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article2/640/360',
    title:
      'Building Production-Ready React Native Applications with TypeScript, Expo, and Modern Tooling: A Complete Guide to Best Practices for Enterprise-Scale Mobile Development',
    summary: 'A comprehensive guide to building scalable React Native applications.',
    readTime: '12 min read',
    source: 'The Verge',
  },
}

export const NoHeroImage: Story = {
  args: {
    title: 'Article Without Hero Image',
    summary: 'This article demonstrates the fallback UI when no hero image is provided.',
    readTime: '3 min read',
    source: 'Hacker News',
    publishedAt: '1 week ago',
  },
}

export const NoSummary: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article3/640/360',
    title: 'Article Without Summary Display',
    readTime: '4 min read',
    source: 'Medium',
  },
}

export const NoReadTime: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article4/640/360',
    title: 'Article Without Read Time Display',
    summary: 'Some articles may not have read time estimates available.',
    source: 'Dev.to',
    publishedAt: '3 days ago',
  },
}

export const Minimal: Story = {
  args: {
    title: 'Minimal Article Card',
    source: 'Blog',
  },
}

export const LongSummary: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article5/640/360',
    title: 'Understanding React Native Performance Optimization',
    summary: 'React Native performance optimization is crucial for delivering smooth user experiences. In this comprehensive guide, we explore various techniques and strategies to optimize your React Native applications, including memoization, lazy loading, image optimization, state management best practices, and much more. Learn how to identify performance bottlenecks and apply effective solutions.',
    readTime: '8 min read',
    source: 'React Native Training',
  },
}

export const ArticleList: Story = {
  render: () => {
    const articles = [
      {
        heroImageUrl: 'https://picsum.photos/seed/a1/640/360',
        title: 'The Future of React Native: What\'s Next in 2026',
        summary: 'Explore the latest developments in React Native ecosystem.',
        source: 'TechCrunch',
        readTime: '5 min read',
        publishedAt: '2 days ago',
      },
      {
        heroImageUrl: 'https://picsum.photos/seed/a2/640/360',
        title: 'Advanced TypeScript Patterns for Mobile Development',
        summary: 'A deep dive into TypeScript patterns that improve type safety and developer experience.',
        source: 'The Verge',
        readTime: '12 min read',
        publishedAt: '1 week ago',
      },
      {
        title: 'Article Without Hero Image',
        summary: 'This article demonstrates the fallback UI when no hero image is provided.',
        source: 'Hacker News',
        readTime: '3 min read',
        publishedAt: '3 days ago',
      },
      {
        heroImageUrl: 'https://picsum.photos/seed/a4/640/360',
        title: 'Complete Guide to Mobile App Architecture',
        summary: 'Learn how to structure large-scale React Native applications.',
        source: 'Medium',
        readTime: '15 min read',
        publishedAt: '1 month ago',
      },
    ]

    return (
      <View style={{ gap: 12, padding: 16 }}>
        {articles.map((article, index) => (
          <ArticleCard key={index} {...article} testID={`article-card-${index}`} />
        ))}
      </View>
    )
  },
}

export const DarkMode: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article6/640/360',
    title: 'Dark Mode Article Card',
    summary: 'Article cards support both light and dark themes seamlessly.',
    readTime: '4 min read',
    source: 'Dark Mode Weekly',
    publishedAt: '5 hours ago',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
}

export const Pressable: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article7/640/360',
    title: 'Interactive Article Card',
    summary: 'This card responds to press events with an opacity change.',
    readTime: '6 min read',
    source: 'Interaction Design',
    onPress: () => console.log('Article card pressed'),
  },
}

export const AllMetadata: Story = {
  args: {
    heroImageUrl: 'https://picsum.photos/seed/article8/640/360',
    title: 'Article with All Metadata Fields',
    summary: 'This article includes all available metadata fields: source, read time, and published date.',
    source: 'The New York Times',
    readTime: '10 min read',
    publishedAt: '3 days ago',
  },
}
