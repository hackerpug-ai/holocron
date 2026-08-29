import type { Meta, StoryObj } from '@storybook/react-native'
import { RecommendationSources } from './RecommendationSources'

const meta = {
  title: 'Cards/RecommendationSources',
  component: RecommendationSources,
} satisfies Meta<typeof RecommendationSources>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    sources: [
      { name: 'Yelp', type: 'article', url: 'https://yelp.com' },
      { name: 'Reddit', type: 'conversation', url: 'https://reddit.com/r/autism' },
    ],
  },
}

export const NoSources: Story = {
  args: {
    sources: [],
  },
}

export const ManySources: Story = {
  args: {
    sources: [
      { name: 'Psychology Today', type: 'article', url: 'https://psychologytoday.com' },
      { name: 'Yelp', type: 'article', url: 'https://yelp.com' },
      { name: 'Google Reviews', type: 'article', url: 'https://google.com/reviews' },
      { name: 'Reddit', type: 'conversation', url: 'https://reddit.com' },
      { name: 'Twitter/X', type: 'conversation', url: 'https://x.com' },
    ],
  },
}

export const WithCustomPressHandler: Story = {
  args: {
    sources: [
      { name: 'Yelp', type: 'article', url: 'https://yelp.com' },
    ],
    onSourcePress: (source) => {
      console.log('Custom press handler for:', source.name)
    },
  },
}
