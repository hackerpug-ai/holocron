import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  BarChart3,
  ChevronRight,
  FileText,
  Folder,
  Search,
  XCircle,
} from 'lucide-react-native'
import { Pressable, View, type ViewProps } from 'react-native'
import { CategoryBadge, type CategoryType } from '../CategoryBadge'

export type CardType = 'article' | 'stats' | 'category_list' | 'no_results' | 'category_not_found'

// Article card data
interface ArticleData {
  title: string
  category: CategoryType
  snippet?: string
  document_id: string
  metadata?: {
    relevance_score?: number
  }
}

// Stats card data
interface StatsData {
  total_count: number
  category_breakdown?: Array<{
    category: string
    count: number
  }>
  recent_documents?: number
}

// Category list card data
interface CategoryListData {
  categories: Array<{
    name: string
    category: CategoryType
    count: number
  }>
}

// No results card data
interface NoResultsData {
  message?: string
}

// Category not found card data
interface CategoryNotFoundData {
  category: string
  valid_categories: string[]
}

export type ResultCardData =
  | ArticleData
  | StatsData
  | CategoryListData
  | NoResultsData
  | CategoryNotFoundData

interface ResultCardProps extends Omit<ViewProps, 'children'> {
  /** Card type determines rendering and layout */
  cardType: CardType
  /** Data object for the card (type varies by cardType) */
  data: ResultCardData
  /** Callback when card is pressed (receives document_id for article cards) */
  onPress?: (documentId?: string) => void
  /** Optional test ID prefix */
  testID?: string
}

const typeIcons: Record<CardType, React.ReactNode> = {
  article: <FileText size={16} className="text-muted-foreground" />,
  stats: <BarChart3 size={16} className="text-primary" />,
  category_list: <Folder size={16} className="text-muted-foreground" />,
  no_results: <Search size={16} className="text-muted-foreground" />,
  category_not_found: <AlertCircle size={16} className="text-destructive" />,
}

/**
 * ResultCard displays different card types for knowledge base results.
 *
 * - **article**: Article with title, category badge, snippet, relevance score
 * - **stats**: Total count with category breakdown
 * - **category_list**: List of categories with counts
 * - **no_results**: Empty search results message
 * - **category_not_found**: Error message with valid category list
 */
export function ResultCard({
  cardType,
  data,
  onPress,
  testID,
  className,
  ...props
}: ResultCardProps) {
  const baseTestID = testID || `result-card-${cardType}`

  // Article card
  if (cardType === 'article') {
    const articleData = data as ArticleData
    const relevanceScore = articleData.metadata?.relevance_score
      ? Math.round(articleData.metadata.relevance_score * 100)
      : undefined

    const content = (
      <Card className={cn('py-4', className)} testID={baseTestID} {...props}>
        <View className="px-6 pb-2">
          <View className="mb-2 flex-row items-center gap-2">
            {typeIcons[cardType]}
            <CategoryBadge category={articleData.category} size="sm" />
          </View>
          <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
            {articleData.title}
          </Text>
        </View>

        {articleData.snippet && (
          <View className="px-6 pb-2">
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {articleData.snippet}
            </Text>
          </View>
        )}

        {relevanceScore !== undefined && (
          <View className="flex-row items-center gap-1 px-6 pb-2">
            <Text className="text-muted-foreground text-xs">Match:</Text>
            <Text
              className={cn(
                'text-xs font-semibold',
                relevanceScore >= 80
                  ? 'text-green-600 dark:text-green-400'
                  : relevanceScore >= 60
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {relevanceScore}%
            </Text>
          </View>
        )}
      </Card>
    )

    if (onPress) {
      return (
        <Pressable
          onPress={() => onPress(articleData.document_id)}
          className="active:opacity-80"
          testID={`${baseTestID}-pressable`}
        >
          {content}
        </Pressable>
      )
    }
    return content
  }

  // Stats card
  if (cardType === 'stats') {
    const statsData = data as StatsData

    const content = (
      <Card className={cn('py-4', className)} testID={baseTestID} {...props}>
        <View className="px-6 pb-2">
          <View className="mb-3 flex-row items-center gap-2">
            {typeIcons[cardType]}
            <Text className="text-foreground font-semibold">Knowledge Base Stats</Text>
          </View>
          <View className="flex-row items-baseline gap-1">
            <Text className="text-foreground text-3xl font-bold">{statsData.total_count}</Text>
            <Text className="text-muted-foreground text-sm">total documents</Text>
          </View>
        </View>

        {statsData.category_breakdown && statsData.category_breakdown.length > 0 && (
          <View className="border-t border-border px-6 pt-3">
            <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
              By Category
            </Text>
            {statsData.category_breakdown.map((item, index) => (
              <View
                key={index}
                className="flex-row items-center justify-between py-1"
              >
                <Text className="text-foreground text-sm">{item.category}</Text>
                <Text className="text-muted-foreground text-sm font-semibold">
                  {item.count}
                </Text>
              </View>
            ))}
          </View>
        )}

        {statsData.recent_documents !== undefined && (
          <View className="border-t border-border px-6 pt-3">
            <View className="flex-row items-center gap-1">
              <Text className="text-muted-foreground text-xs">Recent:</Text>
              <Text className="text-foreground text-sm font-semibold">
                {statsData.recent_documents}
              </Text>
            </View>
          </View>
        )}
      </Card>
    )

    if (onPress) {
      return (
        <Pressable
          onPress={() => onPress()}
          className="active:opacity-80"
          testID={`${baseTestID}-pressable`}
        >
          {content}
        </Pressable>
      )
    }
    return content
  }

  // Category list card
  if (cardType === 'category_list') {
    const categoryData = data as CategoryListData

    const content = (
      <Card className={cn('py-4', className)} testID={baseTestID} {...props}>
        <View className="px-6 pb-2">
          <View className="mb-3 flex-row items-center gap-2">
            {typeIcons[cardType]}
            <Text className="text-foreground font-semibold">Categories</Text>
          </View>
        </View>
        <View className="border-t border-border">
          {categoryData.categories.map((item, index) => (
            <View
              key={index}
              className={cn(
                'flex-row items-center justify-between px-6 py-2',
                index < categoryData.categories.length - 1 && 'border-b border-border'
              )}
            >
              <Text className="text-foreground text-sm">{item.name}</Text>
              <View className="flex-row items-center gap-1">
                <CategoryBadge category={item.category as CategoryType} size="sm" />
                <Text className="text-muted-foreground text-sm font-semibold">
                  {item.count}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
    )

    if (onPress) {
      return (
        <Pressable
          onPress={() => onPress()}
          className="active:opacity-80"
          testID={`${baseTestID}-pressable`}
        >
          {content}
        </Pressable>
      )
    }
    return content
  }

  // No results card
  if (cardType === 'no_results') {
    const noResultsData = data as NoResultsData

    return (
      <Card className={cn('py-6', className)} testID={baseTestID} {...props}>
        <View className="items-center px-6">
          <XCircle size={32} className="text-muted-foreground mb-2" />
          <Text className="text-muted-foreground text-center text-sm">
            {noResultsData.message || 'No results found'}
          </Text>
        </View>
      </Card>
    )
  }

  // Category not found card
  if (cardType === 'category_not_found') {
    const notFoundData = data as CategoryNotFoundData

    return (
      <Card className={cn('py-4', className)} testID={baseTestID} {...props}>
        <View className="px-6">
          <View className="mb-3 flex-row items-center gap-2">
            <AlertCircle size={20} className="text-destructive" />
            <Text className="text-destructive font-semibold">Category Not Found</Text>
          </View>
          <Text className="text-muted-foreground mb-3 text-sm">
            Category <Text className="text-foreground font-semibold">"{notFoundData.category}"</Text>{' '}
            does not exist.
          </Text>
          <View className="border-t border-border pt-3">
            <Text className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
              Valid Categories
            </Text>
            <View className="flex-row flex-wrap gap-1">
              {notFoundData.valid_categories.map((cat, index) => (
                <View
                  key={index}
                  className="rounded-md bg-muted px-2 py-1"
                  testID={`${baseTestID}-valid-category-${index}`}
                >
                  <Text className="text-foreground text-xs">{cat}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Card>
    )
  }

  return null
}
