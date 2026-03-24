import { ToolCard, type ToolCategory, type SourceType, type ToolStatus } from '@/components/ToolCard'
import { Text } from '@/components/ui/text'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, Filter, Wrench } from '@/components/ui/icons'
import { useMemo, useState, type ComponentProps } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type ViewProps,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Types based on Convex schema
export interface Tool {
  _id: string
  title: string
  description?: string
  content?: string
  category: ToolCategory
  status: ToolStatus
  sourceUrl?: string
  sourceType: SourceType
  tags?: string[]
  useCases?: string[]
  keywords?: string[]
  language?: string
  date?: string
  time?: string
  createdAt: number
  updatedAt: number
}

interface ToolbeltScreenProps extends Omit<ViewProps, 'children'> {
  /** Tools data from Convex query */
  tools?: Tool[]
  /** Loading state */
  isLoading?: boolean
  /** Error state */
  error?: Error | null
  /** Callback when tool is pressed */
  onToolPress?: (tool: Tool) => void
  /** Callback to retry loading */
  onRetry?: () => void
}

const categoryFilters: { value: ToolCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'libraries', label: 'Libraries' },
  { value: 'cli', label: 'CLI' },
  { value: 'framework', label: 'Frameworks' },
  { value: 'service', label: 'Services' },
  { value: 'database', label: 'Databases' },
  { value: 'tool', label: 'Tools' },
]

/**
 * ToolbeltScreen displays searchable, filterable list of tools.
 * Supports category filtering and full-text search.
 */
export function ToolbeltScreen({
  tools = [],
  isLoading = false,
  error = null,
  onToolPress,
  onRetry,
  className,
  ...props
}: ToolbeltScreenProps) {
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all')

  // Filter tools by search and category
  const filteredTools = useMemo(() => {
    let result = tools

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter((tool) => tool.category === selectedCategory)
    }

    // Search filter (title, description, tags)
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter((tool) => {
        return (
          tool.title.toLowerCase().includes(query) ||
          tool.description?.toLowerCase().includes(query) ||
          tool.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
          tool.language?.toLowerCase().includes(query) ||
          tool.keywords?.some((kw) => kw.toLowerCase().includes(query))
        )
      })
    }

    return result
  }, [tools, searchQuery, selectedCategory])

  const renderTool = ({ item }: { item: Tool }) => (
    <ToolCard
      id={item._id}
      title={item.title}
      description={item.description}
      content={item.content}
      category={item.category}
      sourceType={item.sourceType}
      sourceUrl={item.sourceUrl}
      status={item.status}
      language={item.language}
      tags={item.tags}
      onPress={() => onToolPress?.(item)}
      className="mb-2"
    />
  )

  const renderCategoryFilter = ({ value, label }: { value: ToolCategory | 'all'; label: string }) => (
    <Pressable
      key={value}
      onPress={() => setSelectedCategory(value)}
      className={cn(
        'rounded-full px-3 py-1.5',
        selectedCategory === value
          ? 'bg-primary'
          : 'bg-muted'
      )}
      testID={`category-filter-${value}`}
    >
      <Text
        className={cn(
          'text-sm',
          selectedCategory === value
            ? 'text-primary-foreground'
            : 'text-muted-foreground'
        )}
      >
        {label}
      </Text>
    </Pressable>
  )

  const renderListHeader = () => (
    <View className="mb-4">
      {/* Search bar */}
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search size={18} className="text-muted-foreground" />
        <Input
          placeholder="Search tools..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          className="flex-1 border-0 bg-transparent px-0 py-0"
          placeholderClassName="text-muted-foreground"
          testID="toolbelt-search-input"
        />
      </View>

      {/* Category filters */}
      <View className="mt-3 flex-row gap-2 overflow-x-auto">
        {categoryFilters.map(renderCategoryFilter)}
      </View>
    </View>
  )

  const renderListEmptyComponent = () => {
    if (isLoading) {
      return (
        <View className="items-center py-8" testID="toolbelt-loading">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-2 text-sm">Loading tools...</Text>
        </View>
      )
    }

    if (error) {
      return (
        <Pressable
          onPress={onRetry}
          className="items-center py-8 active:bg-muted"
          testID="toolbelt-error"
        >
          <Text className="text-destructive text-sm">Failed to load tools</Text>
          <Text className="text-muted-foreground mt-1 text-xs">Tap to retry</Text>
        </Pressable>
      )
    }

    // No results after filtering
    if (searchQuery || selectedCategory !== 'all') {
      return (
        <View className="items-center py-8" testID="toolbelt-no-results">
          <Filter size={32} className="text-muted-foreground mb-2" />
          <Text className="text-muted-foreground text-sm">No tools found</Text>
          <Text className="text-muted-foreground mt-1 text-xs">Try adjusting your filters</Text>
        </View>
      )
    }

    // Empty state
    return (
      <View className="items-center py-8" testID="toolbelt-empty">
        <Wrench size={32} className="text-muted-foreground mb-2" />
        <Text className="text-muted-foreground text-sm">No tools yet</Text>
        <Text className="text-muted-foreground mt-1 text-xs">Tools will appear here when added</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      className="flex-1"
    >
      <View
        className={cn('bg-background flex-1', className)}
        testID="toolbelt-screen"
        {...props}
      >
        {/* Header */}
        <View
          className="border-b border-border px-4 pb-3"
          style={{ paddingTop: insets.top + 12 }}
        >
          <Text className="text-2xl font-bold text-foreground">Toolbelt</Text>
          <Text className="text-muted-foreground mt-1 text-sm">
            Your curated collection of tools and libraries
          </Text>
        </View>

        {/* Tool list */}
        <FlatList
          data={filteredTools}
          renderItem={renderTool}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 16,
          }}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderListEmptyComponent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
