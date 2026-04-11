/**
 * NewsStream - Lazy-loading card stream for What's New
 *
 * Efficiently renders news cards with FlatList for optimal performance.
 * Supports infinite scroll with onEndReached callback.
 */

import { View, FlatList, StyleSheet, ListRenderItem } from 'react-native'
import { NewsCard } from './NewsCard'
import { useTheme } from '@/hooks/use-theme'

export interface NewsItem {
  id: string
  title: string
  summary?: string
  imageUrl?: string
  source?: string
  publishedAt?: number
  url?: string
}

export interface NewsStreamProps {
  items: NewsItem[]
  onLoadMore?: () => void
  isLoadingMore?: boolean
  testID?: string
  onCardPress?: (itemId: string, url?: string) => void
}

/**
 * NewsStream component with lazy loading
 */
export function NewsStream({
  items,
  onLoadMore,
  isLoadingMore = false,
  testID = 'news-stream',
  onCardPress,
}: NewsStreamProps) {
  const { spacing: semanticSpacing } = useTheme()

  const renderItem: ListRenderItem<NewsItem> = ({ item, index }) => {
    return (
      <View
        style={[
          styles.cardContainer,
          {
            marginBottom: index < items.length - 1 ? semanticSpacing.lg : 0,
          },
        ]}
      >
        <NewsCard
          title={item.title}
          summary={item.summary}
          imageUrl={item.imageUrl}
          source={item.source}
          publishedAt={item.publishedAt}
          url={item.url}
          testID={`news-card-${index}`}
          onPress={() => onCardPress?.(item.id, item.url)}
        />
      </View>
    )
  }

  const renderFooter = () => {
    if (!isLoadingMore) return null
    return (
      <View style={[styles.footer, { padding: semanticSpacing.lg }]} testID={`${testID}-loading-more`}>
        <View className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </View>
    )
  }

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        <View style={styles.empty} testID={`${testID}-empty`}>
          {/* Empty state handled by parent component */}
        </View>
      }
      ListFooterComponent={renderFooter}
      contentContainerStyle={[
        styles.contentContainer,
        { padding: semanticSpacing.md },
      ]}
      testID={testID}
    />
  )
}

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
  },
  cardContainer: {
    width: '100%',
  },
  footer: {
    alignItems: 'center',
  },
  empty: {
    flex: 1,
  },
})
