import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { VideoCard } from './VideoCard'

const meta: Meta<typeof VideoCard> = {
  title: 'Components/Subscriptions/VideoCard',
  component: VideoCard,
  parameters: {
    docs: {
      description: {
        component:
          'Video card component with 16:9 thumbnail, duration overlay, and play icon. Supports fallback UI when thumbnail is missing. Can display feedback buttons when feedItemId is provided.',
      },
    },
  },
  argTypes: {
    thumbnailUrl: {
      control: { type: 'text' },
      description: 'URL to thumbnail image (16:9 aspect ratio)',
    },
    duration: {
      control: { type: 'text' },
      description: 'Duration string in format "MM:SS" or "H:MM:SS"',
    },
    title: {
      control: { type: 'text' },
      description: 'Video title',
    },
    source: {
      control: { type: 'text' },
      description: 'Source name (e.g., "YouTube", "Vimeo")',
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
    feedItemId: {
      control: { type: 'text' },
      description: 'Feed item ID for feedback functionality',
    },
  },
  args: {
    title: 'Understanding React Native Performance',
    duration: '12:34',
    source: 'YouTube',
    publishedAt: '2 days ago',
    testID: 'video-card',
  },
}

export default meta
type Story = StoryObj<typeof VideoCard>

export const Default: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video1/640/360',
  },
}

export const LongTitle: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video2/640/360',
    title:
      'Building Production-Ready React Native Applications with TypeScript, Expo, and Modern Tooling: A Complete Guide to Best Practices',
    duration: '45:21',
    source: 'YouTube',
  },
}

export const NoThumbnail: Story = {
  args: {
    title: 'Video Without Thumbnail',
    duration: '8:15',
    source: 'Vimeo',
    publishedAt: '1 week ago',
  },
}

export const NoDuration: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video3/640/360',
    title: 'Video Without Duration Display',
    source: 'YouTube',
  },
}

export const NoSource: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video4/640/360',
    title: 'Video Without Source Info',
    duration: '23:45',
    publishedAt: '3 days ago',
  },
}

export const Minimal: Story = {
  args: {
    title: 'Minimal Video Card',
  },
}

export const LongDuration: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video5/640/360',
    title: 'Long Form Video Content',
    duration: '1:23:45',
    source: 'YouTube',
  },
}

export const VideoList: Story = {
  render: () => {
    const videos = [
      {
        thumbnailUrl: 'https://picsum.photos/seed/v1/640/360',
        duration: '12:34',
        title: 'React Native Fundamentals',
        source: 'YouTube',
        publishedAt: '2 days ago',
      },
      {
        thumbnailUrl: 'https://picsum.photos/seed/v2/640/360',
        duration: '45:21',
        title: 'Advanced TypeScript Patterns for React Native Development',
        source: 'YouTube',
        publishedAt: '1 week ago',
      },
      {
        duration: '8:15',
        title: 'Video Without Thumbnail',
        source: 'Vimeo',
        publishedAt: '3 days ago',
      },
      {
        thumbnailUrl: 'https://picsum.photos/seed/v4/640/360',
        duration: '1:23:45',
        title: 'Complete Course on Mobile App Architecture',
        source: 'YouTube',
        publishedAt: '1 month ago',
      },
    ]

    return (
      <View style={{ gap: 12, padding: 16 }}>
        {videos.map((video, index) => (
          <VideoCard key={index} {...video} testID={`video-card-${index}`} />
        ))}
      </View>
    )
  },
}

export const DarkMode: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video6/640/360',
    title: 'Dark Mode Video Card',
    duration: '15:30',
    source: 'YouTube',
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
    thumbnailUrl: 'https://picsum.photos/seed/video7/640/360',
    title: 'Interactive Video Card',
    duration: '22:18',
    source: 'YouTube',
    onPress: () => console.log('Video card pressed'),
  },
}

export const WithFeedback: Story = {
  args: {
    thumbnailUrl: 'https://picsum.photos/seed/video8/640/360',
    title: 'Video Card with Feedback',
    duration: '18:45',
    source: 'YouTube',
    publishedAt: '1 day ago',
    feedItemId: 'feed123' as any,
  },
  parameters: {
    docs: {
      description: {
        story: 'Video card with feedback buttons enabled. The feedback buttons appear in the bottom-right of the metadata section.',
      },
    },
  },
}

export const FeedbackList: Story = {
  render: () => {
    const videos = [
      {
        thumbnailUrl: 'https://picsum.photos/seed/vf1/640/360',
        duration: '12:34',
        title: 'React Native Fundamentals',
        source: 'YouTube',
        publishedAt: '2 days ago',
        feedItemId: 'feed001' as any,
      },
      {
        thumbnailUrl: 'https://picsum.photos/seed/vf2/640/360',
        duration: '45:21',
        title: 'Advanced TypeScript Patterns',
        source: 'YouTube',
        publishedAt: '1 week ago',
        feedItemId: 'feed002' as any,
      },
      {
        thumbnailUrl: 'https://picsum.photos/seed/vf3/640/360',
        duration: '8:15',
        title: 'Video Without Thumbnail',
        source: 'Vimeo',
        publishedAt: '3 days ago',
        feedItemId: 'feed003' as any,
      },
    ]

    return (
      <View style={{ gap: 12, padding: 16 }}>
        {videos.map((video, index) => (
          <VideoCard key={index} {...video} testID={`video-card-${index}`} />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story: 'List of video cards with feedback buttons enabled for each item.',
      },
    },
  },
}
