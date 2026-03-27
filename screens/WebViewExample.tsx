/**
 * Example: How to integrate the WebView screen into your app
 *
 * This file demonstrates various ways to use the WebViewScreen component
 * and the useWebView hook throughout your application.
 */

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useWebView } from '@/hooks/useWebView'
import { View } from 'react-native'

/**
 * Example 1: Basic usage with the useWebView hook
 */
export function BasicWebViewExample() {
  const { openUrl } = useWebView()

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text variant="h3">Open URLs in WebView</Text>

      <Button onPress={() => openUrl('https://reactnative.dev')}>
        <Text>React Native Docs</Text>
      </Button>

      <Button onPress={() => openUrl('https://expo.dev')}>
        <Text>Expo Docs</Text>
      </Button>

      <Button onPress={() => openUrl('https://github.com')}>
        <Text>GitHub</Text>
      </Button>
    </View>
  )
}

/**
 * Example 2: Opening article sources
 */
interface Article {
  title: string
  content: string
  sourceUrl?: string
}

export function ArticleWithSource({ article }: { article: Article }) {
  const { openUrl } = useWebView()

  return (
    <View style={{ padding: 16 }}>
      <Text variant="h2">{article.title}</Text>
      <Text variant="p">{article.content}</Text>

      {article.sourceUrl && (
        <Button
          onPress={() => openUrl(article.sourceUrl!)}
          style={{ marginTop: 16 }}
        >
          <Text>View Original Source</Text>
        </Button>
      )}
    </View>
  )
}

/**
 * Example 3: Opening links from chat messages
 */
interface ChatMessage {
  id: string
  text: string
  links?: string[]
}

export function ChatMessageWithLinks({ message }: { message: ChatMessage }) {
  const { openUrl } = useWebView()

  return (
    <View style={{ padding: 16 }}>
      <Text>{message.text}</Text>

      {message.links && message.links.length > 0 && (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text variant="small">Links:</Text>
          {message.links.map((link, index) => (
            <Button
              key={index}
              variant="ghost"
              onPress={() => openUrl(link)}
            >
              <Text>{link}</Text>
            </Button>
          ))}
        </View>
      )}
    </View>
  )
}

/**
 * Example 4: Direct router usage (for more control)
 */
import { useRouter } from 'expo-router'

export function DirectRouterExample() {
  const router = useRouter()

  const handleOpenUrl = (url: string) => {
    // Encode the URL to safely pass it through the route
    const encodedUrl = encodeURIComponent(url)
    router.push(`/webview/${encodedUrl}`)
  }

  return (
    <View style={{ padding: 16 }}>
      <Text variant="h3">Custom Navigation</Text>
      <Button onPress={() => handleOpenUrl('https://example.com')}>
        <Text>Open with Router</Text>
      </Button>
    </View>
  )
}

/**
 * Example 5: Markdown link handler integration
 */
import { MarkdownView } from '@/components/markdown/MarkdownView'

export function MarkdownWithWebViewLinks() {
  const { openUrl } = useWebView()

  const markdownContent = `
# Article Title

Check out these resources:
- [React Native](https://reactnative.dev)
- [Expo](https://expo.dev)
- [TypeScript](https://typescriptlang.org)
  `

  return (
    <MarkdownView
      content={markdownContent}
      onLinkPress={(url) => {
        // Open links in WebView instead of external browser
        openUrl(url)
        return true // Prevent default behavior
      }}
    />
  )
}

/**
 * Example 6: Conditional rendering based on URL type
 */
export function SmartLinkHandler({ url }: { url: string }) {
  const { openUrl } = useWebView()

  const handlePress = () => {
    // You could add logic here to decide whether to:
    // 1. Open in WebView (internal browser)
    // 2. Open in external browser (Linking.openURL)
    // 3. Navigate to an internal screen

    if (url.includes('docs') || url.includes('github')) {
      // Open documentation in WebView
      openUrl(url)
    } else {
      // TODO: use Linking.openURL for external links
    }
  }

  return (
    <Button onPress={handlePress}>
      <Text>Open Link</Text>
    </Button>
  )
}
