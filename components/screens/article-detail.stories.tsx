import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ArticleDetail, type MockArticle } from './article-detail'
import { type CategoryType } from '@/components/CategoryBadge'

const meta = {
  title: 'Screens/ArticleDetail',
  component: ArticleDetail,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ArticleDetail>

export default meta
type Story = StoryObj<typeof meta>

// Mock article data for testing
const mockArticle: MockArticle = {
  id: '1',
  title: 'Understanding Large Language Models',
  category: 'deep-research' as CategoryType,
  date: '2026-02-28T10:30:00Z',
  time: '2026-02-28T10:30:00Z',
  research_type: 'Deep Research',
  content: `Large Language Models (LLMs) represent a significant advancement in artificial intelligence, built upon the transformer architecture introduced in the seminal "Attention Is All You Need" paper.

At their core, LLMs use self-attention mechanisms to understand relationships between words in a sequence. This allows them to capture long-range dependencies that previous architectures like RNNs struggled with.

The training process involves two main phases:

1. **Pre-training**: The model learns from vast amounts of text data, developing an understanding of language patterns, grammar, and general world knowledge.

2. **Fine-tuning**: The pre-trained model is adapted for specific tasks or aligned with human preferences through techniques like RLHF (Reinforcement Learning from Human Feedback).

Modern LLMs contain billions of parameters, with models like GPT-4 estimated to have over a trillion. This scale enables emergent capabilities - abilities that appear suddenly as models grow larger.

Key challenges in LLM development include:
- Reducing hallucinations and improving factual accuracy
- Managing computational costs and environmental impact
- Ensuring safety and alignment with human values
- Addressing bias in training data and outputs

The field continues to evolve rapidly, with new techniques like mixture-of-experts, constitutional AI, and retrieval-augmented generation pushing the boundaries of what's possible.`,
}

const longContentArticle: MockArticle = {
  id: '2',
  title: 'The Complete Guide to React Native Performance Optimization',
  category: 'factual' as CategoryType,
  date: '2026-02-27T14:20:00Z',
  time: '2026-02-27T14:20:00Z',
  research_type: 'Reference',
  content: `# Introduction

Performance optimization in React Native requires understanding both the JavaScript and native sides of the framework. This comprehensive guide covers the most important techniques and best practices.

## 1. List Optimization

### Virtualized Lists

Always use \`FlatList\` or \`SectionList\` instead of \`ScrollView\` with \`map\` for long lists. These components only render items that are currently visible on screen.

\`\`\`typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
/>
\`\`\`

### Key Props

- \`removeClippedSubviews\`: Removes views that are off-screen
- \`maxToRenderPerBatch\`: Limits items rendered per batch
- \`windowSize\`: Controls render window size
- \`getItemLayout\`: Optimizes by providing item dimensions

## 2. Image Optimization

Images are often the biggest performance bottleneck. Use these techniques:

### Proper Sizing

Always size images appropriately for their display dimensions:

\`\`\`typescript
<Image
  source={{ uri: imageUrl }}
  style={{ width: 200, height: 200 }}
  resizeMode="cover"
/>
\`\`\`

### Caching

Use FastImage for advanced caching:

\`\`\`typescript
import FastImage from 'react-native-fast-image'

<FastImage
  source={{
    uri: imageUrl,
    priority: FastImage.priority.high,
  }}
  resizeMode={FastImage.resizeMode.contain}
/>
\`\`\`

## 3. Memoization

### React.memo

Prevent unnecessary re-renders of pure components:

\`\`\`typescript
const ExpensiveComponent = React.memo(({ data }) => {
  return <Text>{data.text}</Text>
})
\`\`\`

### useMemo and useCallback

Use sparingly - only when you've identified a performance issue:

\`\`\`typescript
const expensiveValue = useMemo(() => {
  return heavyComputation(data)
}, [data])

const handlePress = useCallback(() => {
  onPress(item.id)
}, [item.id, onPress])
\`\`\`

## 4. State Management

### Avoid Unnecessary Re-renders

Keep state as close to where it's used as possible. Use Context sparingly and split contexts when they update at different rates.

### Use reducer for coordinated state

When multiple state values change together:

\`\`\`typescript
const [state, dispatch] = useReducer(reducer, initialState)
\`\`\`

## 5. Navigation Optimization

### Lazy Loading

Load screens only when needed:

\`\`\`typescript
const LazyScreen = lazy(() => import('./LazyScreen'))
\`\`\`

### Prevent Unmount

Keep screens mounted in the background:

\`\`\`typescript
<Tabs.Screen
  options={{
    lazy: false,
    unmountOnBlur: false,
  }}
/>
\`\`\`

## 6. Animation Performance

### Use Native Driver

Always use the native driver for animations when possible:

\`\`\`typescript
Animated.timing(animatedValue, {
  toValue: 1,
  duration: 300,
  useNativeDriver: true,
}).start()
\`\`\`

### Layout Animations

Use \`LayoutAnimation\` for layout changes:

\`\`\`typescript
LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
setState({ expanded: !expanded })
\`\`\`

## 7. Bundle Size

### Code Splitting

Split your code into smaller chunks:

\`\`\`typescript
const HeavyModule = lazy(() => import('./HeavyModule'))
\`\`\`

### Tree Shaking

Ensure your bundler is configured for tree shaking.

## 8. Debugging

### Profiler

Use React Profiler to identify performance issues:

\`\`\`typescript
<Profiler id="MyComponent" onRender={onRenderCallback}>
  <MyComponent />
</Profiler>
\`\`\`

### Performance Monitor

Use React Native's built-in performance monitor:

\`\`\`typescript
import { Performance } from 'react-native'
\`\`\`

## Conclusion

Performance optimization is an iterative process. Profile first, identify bottlenecks, then apply targeted optimizations. Remember: premature optimization is the root of all evil.

Always measure the impact of your optimizations to ensure they're actually improving performance.`,
}

const codeBlockArticle: MockArticle = {
  id: '3',
  title: 'TypeScript Best Practices for React Native',
  category: 'academic' as CategoryType,
  date: '2026-02-26T09:15:00Z',
  time: '2026-02-26T09:15:00Z',
  research_type: 'Tutorial',
  content: `# TypeScript Best Practices for React Native

TypeScript adds type safety to React Native development, catching errors at compile time rather than runtime.

## Interface vs Type

Use \`interface\` for object shapes that might be extended:

\`\`\`typescript
interface User {
  id: string
  name: string
}

interface AdminUser extends User {
  permissions: string[]
}
\`\`\`

Use \`type\` for unions and aliases:

\`\`\`typescript
type Status = 'loading' | 'success' | 'error'

type Props = {
  status: Status
  onRetry: () => void
}
\`\`\`

## Component Props

Always define prop interfaces:

\`\`\`typescript
interface ButtonProps {
  title: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export function Button({ title, onPress, disabled, variant = 'primary' }: ButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </Pressable>
  )
}
\`\`\`

## Strict Typing

Avoid \`any\` when possible:

\`\`\`typescript
// Bad
const fetchData = async (url: string): Promise<any> => {
  const response = await fetch(url)
  return response.json()
}

// Good
interface User {
  id: string
  name: string
  email: string
}

const fetchData = async (url: string): Promise<User> => {
  const response = await fetch(url)
  return response.json()
}
\`\`\`

## Type Guards

Use type guards to narrow types:

\`\`\`typescript
function isError(error: unknown): error is Error {
  return error instanceof Error
}

function handleError(error: unknown) {
  if (isError(error)) {
    console.error(error.message)
  } else {
    console.error('Unknown error')
  }
}
\`\`\`

## Generic Components

Create reusable generic components:

\`\`\`typescript
interface ListProps<T> {
  data: T[]
  renderItem: (item: T) => React.ReactNode
  keyExtractor: (item: T) => string
}

export function List<T>({ data, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <FlatList
      data={data}
      renderItem={({ item }) => renderItem(item)}
      keyExtractor={keyExtractor}
    />
  )
}
\`\`\`

## Utility Types

Use TypeScript's utility types:

\`\`\`typescript
// Make all properties optional
type PartialUser = Partial<User>

// Make all properties required
type RequiredUser = Required<User>

// Pick specific properties
type UserSummary = Pick<User, 'id' | 'name'>

// Omit specific properties
type CreateUserInput = Omit<User, 'id'>
\`\`\`

## Conclusion

Following these TypeScript best practices will make your React Native code more maintainable and less error-prone.`,
}

export const Default: Story = {
  args: {
    article: mockArticle,
    visible: true,
    onClose: () => console.log('Close pressed'),
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Story />
      </View>
    ),
  ],
}

export const LongContent: Story = {
  args: {
    article: longContentArticle,
    visible: true,
    onClose: () => console.log('Close pressed'),
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Story />
      </View>
    ),
  ],
}

export const WithCodeBlocks: Story = {
  args: {
    article: codeBlockArticle,
    visible: true,
    onClose: () => console.log('Close pressed'),
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Story />
      </View>
    ),
  ],
}

export const AllCategories: Story = {
  args: {
    article: mockArticle,
    visible: true,
    onClose: () => console.log('Close pressed'),
  },
  decorators: [
    (Story) => {
      const categories: CategoryType[] = [
        'research',
        'deep-research',
        'factual',
        'academic',
        'entity',
        'url',
        'general',
      ]

      return (
        <View style={{ flex: 1, backgroundColor: '#f5f5f5', padding: 20 }}>
          {categories.map((category) => (
            <View key={category} style={{ marginBottom: 20 }}>
              <Story args={{ article: { ...mockArticle, category } }} />
            </View>
          ))}
        </View>
      )
    },
  ],
}

// Interactive story with play function for close button
export const CloseButton: Story = {
  args: {
    article: mockArticle,
    visible: true,
    onClose: () => console.log('Close pressed'),
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Story />
      </View>
    ),
  ],
}

// Interactive story with play function for swipe-to-dismiss
export const SwipeToDismiss: Story = {
  args: {
    article: mockArticle,
    visible: true,
    onClose: () => console.log('Swipe to dismiss triggered'),
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <Story />
      </View>
    ),
  ],
}
