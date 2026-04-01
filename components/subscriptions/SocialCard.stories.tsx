import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { SocialCard } from './SocialCard'

const meta: Meta<typeof SocialCard> = {
  title: 'Components/Subscriptions/SocialCard',
  component: SocialCard,
  parameters: {
    docs: {
      description: {
        component:
          'Social post card with circular author avatar, content preview, and engagement metrics. Displays social media content from platforms like Twitter/X, Bluesky, etc. The avatar gracefully falls back to initials when no avatar URL is provided.',
      },
    },
  },
  argTypes: {
    authorAvatarUrl: {
      control: { type: 'text' },
      description: 'URL to author avatar image (optional - falls back to initials)',
    },
    authorName: {
      control: { type: 'text' },
      description: 'Display name of the author',
    },
    authorHandle: {
      control: { type: 'text' },
      description: 'Username/handle of the author (without @)',
    },
    contentPreview: {
      control: { type: 'text' },
      description: 'Preview text of the social post content (truncated to 3 lines)',
    },
    likes: {
      control: { type: 'number' },
      description: 'Number of likes on the post',
    },
    comments: {
      control: { type: 'number' },
      description: 'Number of comments on the post',
    },
    source: {
      control: { type: 'text' },
      description: 'Platform source (e.g., "Twitter/X", "Bluesky")',
    },
    publishedAt: {
      control: { type: 'text' },
      description: 'Published timestamp (optional)',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when card is pressed',
    },
    testID: {
      control: { type: 'text' },
      description: 'Test ID prefix for testing',
    },
  },
  args: {
    authorName: 'John Doe',
    authorHandle: 'johndoe',
    contentPreview:
      'Just discovered an amazing new framework for building React Native apps with TypeScript! #reactnative #typescript',
    likes: 24,
    comments: 8,
    source: 'Twitter/X',
    testID: 'social-card',
  },
}

export default meta
type Story = StoryObj<typeof SocialCard>

export const Default: Story = {}

export const WithAvatar: Story = {
  args: {
    authorAvatarUrl: 'https://i.pravatar.cc/150?img=12',
    authorName: 'Jane Smith',
    authorHandle: 'janesmith',
    contentPreview:
      'Excited to announce that I just joined the team at TechCorp! Looking forward to building amazing things together.',
    likes: 142,
    comments: 23,
    source: 'Twitter/X',
  },
}

export const WithoutAvatar: Story = {
  args: {
    authorName: 'Alex Johnson',
    authorHandle: 'alexj',
    contentPreview:
      'Working on a new open source project. Stay tuned for updates! #opensource #coding',
    likes: 56,
    comments: 12,
    source: 'Bluesky',
  },
}

export const LongContent: Story = {
  args: {
    authorName: 'Sarah Williams',
    authorHandle: 'sarahw',
    contentPreview:
      'Today I learned that the best way to learn React Native is to build actual projects. Theory is good, but practice is better. Start small, iterate quickly, and don not be afraid to experiment. The community is incredibly helpful and there are so many great resources available.',
    likes: 89,
    comments: 34,
    source: 'Twitter/X',
  },
}

export const NoEngagementMetrics: Story = {
  args: {
    authorName: 'Mike Chen',
    authorHandle: 'mikechen',
    contentPreview: 'Just posted a new article on my blog. Check it out!',
    source: 'Bluesky',
  },
}

export const OnlyLikes: Story = {
  args: {
    authorName: 'Emily Davis',
    authorHandle: 'emilyd',
    contentPreview:
      'Beautiful sunset today! Sometimes you just need to stop and appreciate the little things.',
    likes: 234,
    source: 'Twitter/X',
  },
}

export const OnlyComments: Story = {
  args: {
    authorName: 'Chris Taylor',
    authorHandle: 'christaylor',
    contentPreview:
      'Question for my followers: What is your favorite VS Code extension? I am looking for recommendations.',
    comments: 67,
    source: 'Bluesky',
  },
}

export const AllVariants: Story = {
  render: () => {
    return (
      <View style={{ padding: 16, gap: 16 }}>
        <SocialCard
          authorAvatarUrl="https://i.pravatar.cc/150?img=12"
          authorName="Jane Smith"
          authorHandle="janesmith"
          contentPreview="With avatar and metrics"
          likes={142}
          comments={23}
          source="Twitter/X"
          testID="social-card-1"
        />
        <SocialCard
          authorName="Alex Johnson"
          authorHandle="alexj"
          contentPreview="Without avatar, with metrics"
          likes={56}
          comments={12}
          source="Bluesky"
          testID="social-card-2"
        />
        <SocialCard
          authorName="Mike Chen"
          authorHandle="mikechen"
          contentPreview="Without avatar, no metrics"
          source="Twitter/X"
          testID="social-card-3"
        />
        <SocialCard
          authorName="Sarah Williams"
          authorHandle="sarahw"
          contentPreview="Long content that should be truncated to three lines. This is a test to see how the truncation works when we have more text than can fit in three lines. The text should be cut off with an ellipsis."
          likes={89}
          comments={34}
          source="Bluesky"
          testID="social-card-4"
        />
      </View>
    )
  },
}
