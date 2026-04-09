import { useState } from 'react'
import { View, FlatList, type ViewProps } from 'react-native'
import { Text } from '@/components/ui/text'
import { ArticleCard } from '@/components/ArticleCard'
import { SearchInput } from '@/components/SearchInput'
import { EmptyState } from '@/components/EmptyState'
import { SectionHeader } from '@/components/SectionHeader'
import { cn } from '@/lib/utils'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Loader2, FileText as FileTextIcon } from '@/components/ui/icons'
import type { CategoryType } from '@/components/CategoryBadge'

interface SubscriptionDetailScreenProps extends Omit<ViewProps, 'children'> {
  /** Subscription IDs to fetch content for */
  subscriptionIds: string[]
  /** Display name for the subscription group */
  groupName: string
}

/**
 * SubscriptionDetailScreen displays all researched documents for a subscription group.
 *
 * Shows articles/documents generated from subscription content with search and filtering.
 * Reuses ArticleCard component for consistent document display.
 */
export function SubscriptionDetailScreen({
  subscriptionIds,
  groupName,
  className,
  ...props
}: SubscriptionDetailScreenProps) {
  const [searchValue, setSearchValue] = useState('')

  // Fetch content with documents for the subscriptions
  const contentWithDocuments = useQuery(api.subscriptions.queries.listContentWithDocuments, {
    subscriptionIds: subscriptionIds as Id<'subscriptionSources'>[],
    researchStatus: 'researched',
  })

  // Filter by search query
  const filteredContent = contentWithDocuments?.filter((item: any) => {
    if (!searchValue) return true
    const query = searchValue.toLowerCase()
    return (
      item.content.title?.toLowerCase().includes(query) ||
      item.document?.title?.toLowerCase().includes(query)
    )
  })

  const handleSearchChange = (query: string) => {
    setSearchValue(query)
  }

  const handleClear = () => {
    setSearchValue('')
  }

  const handleArticlePress = (_documentId: string) => {
    // TODO: Navigate to document detail view
    // router.push(`/document/${_documentId}`)
  }

  const renderEmptyState = () => {
    if (contentWithDocuments === undefined) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Loader2 size={32} className="text-muted-foreground animate-spin" />
          <Text className="mt-4 text-center text-muted-foreground">
            Loading documents...
          </Text>
        </View>
      )
    }

    if (searchValue) {
      return (
        <EmptyState
          icon={FileTextIcon}
          title="No matching documents"
          description="No documents match your search query."
        />
      )
    }

    return (
      <EmptyState
        icon={FileTextIcon}
        title="No documents yet"
        description={`No researched documents found for ${groupName}. Documents will appear here when content is researched.`}
      />
    )
  }

  return (
    <View className={cn('flex-1 bg-background', className)} {...props}>
      {/* Header */}
      <SectionHeader
        title={groupName}
        className="border-b border-border px-4 pb-4"
      />

      {/* Search */}
      <View className="px-4 pt-4">
        <SearchInput
          value={searchValue}
          onChangeText={handleSearchChange}
          onClear={handleClear}
          placeholder="Search documents..."
          testID="subscription-documents-search"
        />
      </View>

      {/* Document count */}
      {filteredContent && filteredContent.length > 0 && (
        <View className="px-4 pt-3">
          <Text className="text-sm text-muted-foreground">
            {filteredContent.length} document{filteredContent.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Document list or empty state */}
      {filteredContent && filteredContent.length > 0 ? (
        <FlatList
          data={filteredContent}
          keyExtractor={(item) => item.content._id.toString()}
          renderItem={({ item }) => {
            // Extract document data for ArticleCard
            const title = item.document?.title || item.content.title || 'Untitled'
            const date = new Date(item.content.discoveredAt)
            const category = (item.document?.category || 'general') as CategoryType
            // Use content field for snippet (first 200 chars)
            const snippet = item.document?.content
              ? `${item.document.content.slice(0, 200)}${item.document.content.length > 200 ? '...' : ''}`
              : item.content.metadataJson?.description

            return (
              <View className="mx-4 mb-3">
                <ArticleCard
                  title={title}
                  category={category}
                  date={date}
                  snippet={snippet}
                  onPress={() => handleArticlePress(item.document?._id || '')}
                  compact={false}
                />
              </View>
            )
          }}
          contentContainerClassName="pt-3 pb-4"
          testID="subscription-documents-list"
        />
      ) : (
        renderEmptyState()
      )}
    </View>
  )
}
