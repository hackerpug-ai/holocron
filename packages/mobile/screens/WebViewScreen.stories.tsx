import type { Meta, StoryObj } from '@storybook/react-native'
import { WebViewScreen } from './WebViewScreen'
import { View } from 'react-native'

const meta = {
  title: 'Screens/WebViewScreen',
  component: WebViewScreen,
  decorators: [
    (Story) => (
      <View style={{ flex: 1 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof WebViewScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Default WebView screen loading a simple webpage.
 */
export const Default: Story = {
  args: {
    url: 'https://example.com',
    onClose: () => console.log('Close pressed'),
  },
}

/**
 * WebView loading a documentation site.
 */
export const Documentation: Story = {
  args: {
    url: 'https://reactnative.dev/',
    onClose: () => console.log('Close pressed'),
  },
}

/**
 * WebView with custom title.
 */
export const WithCustomTitle: Story = {
  args: {
    url: 'https://expo.dev/',
    title: 'Expo Documentation',
    onClose: () => console.log('Close pressed'),
  },
}

/**
 * WebView loading a search results page.
 */
export const SearchResults: Story = {
  args: {
    url: 'https://duckduckgo.com/?q=react+native',
    onClose: () => console.log('Close pressed'),
  },
}

/**
 * WebView loading GitHub.
 */
export const GitHub: Story = {
  args: {
    url: 'https://github.com',
    onClose: () => console.log('Close pressed'),
  },
}
