# WebViewScreen Component

A full-screen web browser component for Expo React Native that provides navigation controls and follows the app's semantic theme system.

## Features

- **Navigation Controls**
  - Back button (navigates backward in web history)
  - Forward button (navigates forward in web history)
  - Refresh button (reloads the current page)
  - Close button (exits the WebView and returns to the app)

- **User Interface**
  - Dynamic page title display in header
  - Current URL display
  - Loading indicator while pages load
  - Theme-aware styling using semantic tokens
  - Safe area support for notched devices

- **Platform Support**
  - iOS swipe-back gesture support
  - JavaScript and DOM storage enabled
  - Error handling for failed loads

## Installation

The component uses `react-native-webview` which is already installed:

```bash
pnpm add react-native-webview
```

## Usage

### Via Expo Router (Recommended)

Navigate to the WebView screen using the router:

```tsx
import { useRouter } from 'expo-router'

function MyComponent() {
  const router = useRouter()

  const handleOpenUrl = () => {
    const url = 'https://example.com'
    router.push(`/webview/${encodeURIComponent(url)}`)
  }

  return <Button onPress={handleOpenUrl}>Open WebView</Button>
}
```

### Using the useWebView Hook

The easiest way to open URLs:

```tsx
import { useWebView } from '@/hooks/useWebView'

function MyComponent() {
  const { openUrl } = useWebView()

  return (
    <Button onPress={() => openUrl('https://example.com')}>
      Open in Browser
    </Button>
  )
}
```

### Direct Component Usage

For custom implementations:

```tsx
import { WebViewScreen } from '@/screens/WebViewScreen'

function MyCustomScreen() {
  const [visible, setVisible] = useState(false)

  return (
    <>
      <Button onPress={() => setVisible(true)}>Open</Button>
      {visible && (
        <WebViewScreen
          url="https://example.com"
          onClose={() => setVisible(false)}
        />
      )}
    </>
  )
}
```

## API Reference

### WebViewScreen Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `url` | `string` | Yes | Initial URL to load |
| `onClose` | `() => void` | Yes | Callback when close button is pressed |
| `title` | `string` | No | Custom title (defaults to page title) |
| `testID` | `string` | No | Test identifier (default: `'webview-screen'`) |

### useWebView Hook

Returns an object with the following methods:

| Method | Type | Description |
|--------|------|-------------|
| `openUrl` | `(url: string) => void` | Opens a URL in the WebView screen |

## Routing Structure

The WebView is accessible via:

```
/webview/[url]
```

Where `[url]` is a URL-encoded string representing the webpage to load.

**Example routes:**
- `/webview/https%3A%2F%2Fexample.com`
- `/webview/https%3A%2F%2Freactnative.dev%2Fdocs`

## Theme Integration

The component uses the app's semantic theme system (`useTheme` hook) for:
- Background colors
- Border colors
- Text colors
- Spacing values
- Border radius

All theme values automatically adapt to light/dark mode.

## Accessibility

The component includes proper accessibility features:
- All interactive buttons have `accessibilityRole="button"`
- Descriptive `accessibilityLabel` values
- Keyboard navigation support (web)
- VoiceOver/TalkBack support

## Test IDs

For testing and automation, the component provides these test IDs:

- `webview-screen` - Root container
- `webview-screen-close-button` - Close button
- `webview-screen-url-display` - URL text display
- `webview-screen-back-button` - Back navigation button
- `webview-screen-forward-button` - Forward navigation button
- `webview-screen-refresh-button` - Refresh button
- `webview-screen-webview` - WebView component
- `webview-screen-loading` - Loading overlay
- `webview-screen-loading-indicator` - Loading spinner

## Storybook

The component includes Storybook stories for design preview:

```bash
pnpm storybook
```

Available stories:
- **Default** - Basic WebView loading example.com
- **Documentation** - WebView loading React Native docs
- **WithCustomTitle** - WebView with custom title
- **SearchResults** - WebView loading search results
- **GitHub** - WebView loading GitHub

## Security Considerations

- JavaScript is enabled by default (required for most modern websites)
- DOM storage is enabled for session persistence
- Error handling prevents app crashes from failed loads
- HTTPS URLs are recommended for secure connections

## Platform Notes

### iOS
- Swipe-back gesture navigation is enabled (`allowsBackForwardNavigationGestures`)
- Respects safe area insets for notched devices

### Android
- Hardware back button navigates within WebView if history exists
- May require additional permissions in `app.json` for certain features

## Examples

### Opening a documentation link from chat

```tsx
import { useWebView } from '@/hooks/useWebView'

function ChatMessage({ url }) {
  const { openUrl } = useWebView()

  return (
    <Pressable onPress={() => openUrl(url)}>
      <Text>View Documentation</Text>
    </Pressable>
  )
}
```

### Opening article sources

```tsx
import { useWebView } from '@/hooks/useWebView'

function ArticleDetail({ article }) {
  const { openUrl } = useWebView()

  return (
    <View>
      <Text>{article.title}</Text>
      {article.sourceUrl && (
        <Button onPress={() => openUrl(article.sourceUrl)}>
          View Source
        </Button>
      )}
    </View>
  )
}
```

## Related Files

- **Component**: `/screens/WebViewScreen.tsx`
- **Route**: `/app/webview/[url].tsx`
- **Hook**: `/hooks/useWebView.ts`
- **Stories**: `/screens/WebViewScreen.stories.tsx`
- **Theme**: `/lib/theme.ts`
- **Theme Hook**: `/hooks/use-theme.ts`

## Troubleshooting

### WebView not loading
1. Check the URL is valid and accessible
2. Ensure device/emulator has internet connection
3. Check console for error messages

### Styling issues
1. Verify theme tokens are properly imported
2. Check `useTheme()` hook is functioning
3. Restart Metro bundler with `--clear` flag

### Navigation not working
1. Ensure `react-native-gesture-handler` is properly set up
2. Check route parameters are properly encoded/decoded
3. Verify router is accessible in the component context
