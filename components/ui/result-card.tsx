import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  BarChart3,
  FileText,
  Folder,
  Search,
  XCircle,
} from '@/components/ui/icons'
import { Pressable, View, ActivityIndicator, type ViewProps } from 'react-native'
import { CategoryBadge, type CategoryType } from '../CategoryBadge'
import type {
  ArticleCardData,
  StatsCardData,
  CategoryListCardData,
  NoResultsCardData,
  CategoryNotFoundCardData,
} from '@/lib/types/chat'

export type CardType = 'article' | 'stats' | 'category_list' | 'no_results' | 'category_not_found'

// ResultCardData is the union of all card data types from the shared types
export type ResultCardData =
  | ArticleCardData
  | StatsCardData
  | CategoryListCardData
  | NoResultsCardData
  | CategoryNotFoundCardData
  | ArticleCardData[]

interface ResultCardProps extends Omit<ViewProps, 'children'> {
  /** Card type determines rendering and layout */
  cardType: CardType
  /** Data object for the card (type varies by cardType) */
  data: ResultCardData
  /** Callback when card is pressed (receives documentId for article cards) */
  onPress?: (_documentId?: string) => void
  /** Optional test ID prefix */
  testID?: string
  /** Loading state - shows skeleton when true */
  loading?: boolean
  /** Error message to display */
  error?: string
}

const typeIcons: Record<CardType, React.ReactNode> = {
  article: <FileText size={16} className="text-muted-foreground" />,
  stats: <BarChart3 size={16} className="text-primary" />,
  category_list: <Folder size={16} className="text-muted-foreground" />,
  no_results: <Search size={16} className="text-muted-foreground" />,
  category_not_found: <AlertCircle size={16} className="text-destructive" />,
}

/**
 * Strip markdown formatting to plain text for card snippets.
 * Removes frontmatter, skips the first heading (title), and extracts body content.
 */
const stripMarkdownToPlainText = (markdown: string): string => {
  if (!markdown) return ''

  let text = markdown
    // Remove YAML frontmatter
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n+/, '')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')

  // Skip the first heading (title) - find first h1/h2 and remove everything up to the next line
  text = text.replace(/^#\s+[^\n]+\n+/, '')

  // Remove remaining headings but keep their text
  text = text
    .replace(/^#{1,6}\s+([^\n]+)/gm, '$1')
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove links but keep text [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Collapse multiple newlines/spaces
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text
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
  loading = false,
  error,
  ...props
}: ResultCardProps) {
  const baseTestID = testID || `result-card-${cardType}`

  // Show loading state
  if (loading) {
    return (
      <Card
        className={cn('py-4 px-6', className)}
        testID={`${baseTestID}-loading`}
        {...props}
      >
        <View className="flex-row items-center gap-3 py-2">
          <ActivityIndicator size="small" className="text-primary" />
          <Text className="text-muted-foreground text-sm">Loading...</Text>
        </View>
      </Card>
    )
  }

  // Show error state
  if (error) {
    return (
      <Card
        className={cn('py-4 px-6', className)}
        testID={`${baseTestID}-error`}
        {...props}
      >
        <View className="flex-row items-center gap-2 py-2">
          <XCircle size={16} className="text-destructive" />
          <Text className="text-destructive text-sm">{error}</Text>
        </View>
      </Card>
    )
  }

  // Article card
  if (cardType === 'article') {
    const articleData = data as ArticleCardData
    const relevanceScore = articleData.metadata?.relevance_score
      ? Math.round(articleData.metadata.relevance_score * 100)
      : undefined

    // Map backend category string to CategoryType for CategoryBadge
    const categoryType: CategoryType = articleData.category === 'research' ? 'research' : 'general'

    const content = (
      <Card className={cn('py-4', className)} testID={baseTestID} {...props}>
        <View className="px-6 pb-2">
          <View className="mb-2 flex-row items-center gap-2">
            {typeIcons[cardType]}
            <CategoryBadge category={categoryType} size="sm" />
          </View>
          <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
            {articleData.title}
          </Text>
        </View>

        {articleData.snippet && (
          <View className="px-6 pb-2">
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {stripMarkdownToPlainText(articleData.snippet)}
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
                  ? 'text-success'
                  : relevanceScore >= 60
                  ? 'text-warning'
                  : 'text-destructive'
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
    const statsData = data as StatsCardData

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

        {statsData.recent_count !== undefined && (
          <View className="border-t border-border px-6 pt-3">
            <View className="flex-row items-center gap-1">
              <Text className="text-muted-foreground text-xs">Recent:</Text>
              <Text className="text-foreground text-sm font-semibold">
                {statsData.recent_count}
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
    const categoryData = data as CategoryListCardData

    // Map category name to CategoryType for badge display
    const mapCategoryToBadgeType = (categoryName: string): CategoryType => {
      return categoryName === 'research' ? 'research' : 'general'
    }

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
                <CategoryBadge category={mapCategoryToBadgeType(item.name)} size="sm" />
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
    const noResultsData = data as NoResultsCardData

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
    const notFoundData = data as CategoryNotFoundCardData

    return (
      <Card className={cn('py-4', className)} testID={baseTestID} {...props}>
        <View className="px-6">
          <View className="mb-3 flex-row items-center gap-2">
            <AlertCircle size={20} className="text-destructive" />
            <Text className="text-destructive font-semibold">Category Not Found</Text>
          </View>
          {notFoundData.category && (
            <Text className="text-muted-foreground mb-3 text-sm">
              Category <Text className="text-foreground font-semibold">"{notFoundData.category}"</Text>{' '}
              does not exist.
            </Text>
          )}
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
