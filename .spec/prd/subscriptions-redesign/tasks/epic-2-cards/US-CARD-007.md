# US-CARD-007: Feed Screen Integration

> Task ID: US-CARD-007
> Type: FEATURE
> Priority: P0
> Estimate: 90 minutes
> Assignee: react-native-ui-implementer

## CRITICAL CONSTRAINTS

### MUST
- Follow theme system using semantic tokens (no hardcoded colors/spacing)
- Use react-native-paper Text component with variants (no react-native Text)
- Include testID on all interactive elements for E2E testing
- Integrate FeedCard, FeedFilterChips, and pull-to-refresh
- Maintain 60fps scroll performance

### NEVER
- Hardcode colors, spacing, or typography values
- Use react-native Text instead of react-native-paper Text
- Break existing pull-to-refresh functionality
- Block UI during feed loading

### STRICTLY
- Reuse existing SubscriptionFeedScreen patterns
- Use FlatList with performance optimizations
- Handle loading and error states gracefully

## SPECIFICATION

**Objective:** Integrate all card components, filter chips, and pull-to-refresh into a unified feed screen.

**Success looks like:** The feed screen displays findings as multimedia cards, allows filtering by category, supports pull-to-refresh, and scrolls smoothly at 60fps.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | FeedScreen with findings | Screen renders | FlatList displays FeedCard components | `getAllByTestId('feed-card-')` has length > 0 |
| 2 | User pulls down on FlatList | onRefresh fires | "Generating new report..." message appears | `getByText(/Generating/)` exists |
| 3 | User selects category filter | onCategoryChange fires | Feed filtered to selected category | Filtered findings match category |
| 4 | FeedScreen loading | Screen renders | Skeleton placeholders shown | `getAllByTestId('feed-card-skeleton')` has length > 0 |
| 5 | User scrolls feed | Scroll events fire | Feed scrolls at 60fps | Performance profiling shows no dropped frames |
| 6 | FeedScreen with error | Screen renders | Error message with retry button | `getByTestId('feed-error-retry')` exists |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/SubscriptionFeedScreen.tsx` (MODIFY)
- `components/subscriptions/SubscriptionFeedScreen.stories.tsx` (MODIFY)
- `components/subscriptions/SubscriptionFeedScreen.test.tsx` (MODIFY)

### WRITE-PROHIBITED
- `app/**` - routing changes in epic-1
- `convex/**` - backend changes in separate task
- Individual card components - modify only through their own tasks

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-006, US-CARD-007 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-5 Feed Functionality

### Interaction Notes
- Pull-to-refresh should feel responsive
- Category filter should persist across refreshes
- Loading skeleton should match card layout
- Error states should be actionable

### Code Pattern

Source: `components/subscriptions/SubscriptionFeedScreen.tsx`

```typescript
// Pattern: FlatList with pull-to-refresh and filter chips
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'
import { FeedCard, Finding } from './FeedCard'
import { FeedFilterChips } from './FeedFilterChips'

type Category = 'all' | 'video' | 'article' | 'social' | 'release'

export function SubscriptionFeedScreen() {
  const { semantic } = useSemanticTheme()
  const [findings, setFindings] = useState<Finding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category>('all')
  
  // Fetch findings on mount
  useEffect(() => {
    loadFindings()
  }, [])
  
  const loadFindings = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchFindings()
      setFindings(data)
    } catch (err) {
      setError('Failed to load feed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadFindings()
    setIsRefreshing(false)
  }
  
  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category)
  }
  
  const filteredFindings = selectedCategory === 'all'
    ? findings
    : findings.filter(f => {
        // Map filter category to finding type
        if (category === 'video') return f.duration || isVideoSource(f.source)
        if (category === 'article') return !f.duration && !f.authorHandle && !f.version
        if (category === 'social') return f.authorHandle || isSocialSource(f.source)
        if (category === 'release') return f.category === 'release' || f.version
        return true
      })
  
  const categoryCounts = useMemo(() => ({
    all: findings.length,
    video: findings.filter(f => f.duration || isVideoSource(f.source)).length,
    article: findings.filter(f => !f.duration && !f.authorHandle && !f.version).length,
    social: findings.filter(f => f.authorHandle || isSocialSource(f.source)).length,
    release: findings.filter(f => f.category === 'release' || f.version).length,
  }), [findings])
  
  const handleCardPress = (finding: Finding) => {
    // Open in WebViewSheet
    openWebView(finding.url)
  }
  
  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: semantic.color.background.default }]}>
        <Text variant="bodyLarge" style={{ color: semantic.color.onSurface.default }}>
          {error}
        </Text>
        <Button 
          testID="feed-error-retry"
          mode="contained"
          onPress={loadFindings}
        >
          Retry
        </Button>
      </View>
    )
  }
  
  return (
    <View style={[styles.container, { backgroundColor: semantic.color.background.default }]}>
      {/* Filter chips */}
      <FeedFilterChips
        categories={categoryCounts}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
      />
      
      {/* Feed */}
      <FlatList
        testID="feed-flat-list"
        data={isLoading ? Array(5).fill(null) : filteredFindings}
        keyExtractor={(item, index) => item?.url || `skeleton-${index}`}
        renderItem={({ item, index }) => (
          <FeedCard
            testID={`feed-card-${index}`}
            item={item}
            isLoading={isLoading}
            onPress={handleCardPress}
          />
        )}
        contentContainerStyle={[styles.listContent, { padding: semantic.space.md }]}
        ItemSeparatorComponent={() => <View style={{ height: semantic.space.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={semantic.color.primary.default}
          />
        }
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={5}
        getItemType={(item) => item?.category || 'skeleton'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
})
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: No performance optimization, no loading state
<FlatList
  data={findings}
  renderItem={({ item }) => <FeedCard item={item} />}
/>
// ❌ WRONG: Hardcoded refresh colors
<RefreshControl tintColor="#007AFF" />
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic theme tokens for all colors
  - Use react-native-paper Text with variants
  - Include testID on all interactive elements
  - FlatList performance optimizations

## DEPENDENCIES

This task depends on:
- US-CARD-001 (Video Card Component)
- US-CARD-002 (Article Card Component)
- US-CARD-005 (FeedCard Router Component)
- US-CARD-006 (Category Filter Chips)

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-CARD-006, US-CARD-007 acceptance criteria
2. `components/subscriptions/SubscriptionFeedScreen.tsx` - existing implementation
3. `hooks/use-semantic-theme.ts` - Theme hook usage

## NOTES

This is the integration task that brings all card components together into a unified feed. The key is maintaining existing pull-to-refresh behavior while adding the new filter chips and card variants. Performance is critical - the feed must scroll smoothly at 60fps with images loading progressively.
