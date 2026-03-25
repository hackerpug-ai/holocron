import { ToolCard, type ToolCategory, type SourceType, type ToolStatus } from '@/components/ToolCard'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Filter, Package, Search, Terminal, Wrench } from '@/components/ui/icons'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ViewProps,
} from 'react-native'

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
  tools?: Tool[]
  isLoading?: boolean
  error?: Error | null
  onToolPress?: (tool: Tool) => void
  onRetry?: () => void
}

const categoryFilters: { value: ToolCategory | 'all'; label: string; icon?: typeof Package }[] = [
  { value: 'all', label: 'All' },
  { value: 'libraries', label: 'Libraries', icon: Package },
  { value: 'cli', label: 'CLI', icon: Terminal },
  { value: 'framework', label: 'Frameworks' },
  { value: 'service', label: 'Services' },
  { value: 'database', label: 'Databases' },
  { value: 'tool', label: 'Tools', icon: Wrench },
]

/**
 * ToolbeltScreen displays a searchable, filterable collection of tools.
 * The header is handled by ScreenLayout in the route — this is the content area only.
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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all')

  const filteredTools = useMemo(() => {
    let result = tools

    if (selectedCategory !== 'all') {
      result = result.filter((tool) => tool.category === selectedCategory)
    }

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

  const toolCount = filteredTools.length
  const totalCount = tools.length

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
      className="mb-3"
    />
  )

  const renderSearchAndFilters = () => (
    <View className="mb-4">
      {/* Search bar */}
      <View className="flex-row items-center gap-2.5 rounded-xl border border-border bg-card px-3.5">
        <Search size={16} className="text-muted-foreground" />
        <Input
          placeholder="Search tools, libraries, frameworks..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          className="flex-1 border-0 bg-transparent px-0 shadow-none"
          testID="toolbelt-search-input"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} testID="toolbelt-search-clear">
            <Text className="text-xs text-muted-foreground">Clear</Text>
          </Pressable>
        )}
      </View>

      {/* Category filter pills - horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
      >
        {categoryFilters.map(({ value, label }) => {
          const isSelected = selectedCategory === value
          return (
            <Pressable
              key={value}
              onPress={() => setSelectedCategory(value)}
              className={cn(
                'rounded-full px-4 py-1.5',
                isSelected
                  ? 'bg-primary'
                  : 'border border-border bg-card'
              )}
              testID={`category-filter-${value}`}
            >
              <Text
                className={cn(
                  'text-sm font-medium',
                  isSelected
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Result count when filtering */}
      {(searchQuery || selectedCategory !== 'all') && totalCount > 0 && (
        <Text className="mb-1 text-xs text-muted-foreground">
          {toolCount} of {totalCount} tools
        </Text>
      )}
    </View>
  )

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View className="flex-1 items-center justify-center py-20" testID="toolbelt-loading">
          <ActivityIndicator size="large" />
          <Text className="mt-3 text-sm text-muted-foreground">Loading tools...</Text>
        </View>
      )
    }

    if (error) {
      return (
        <Pressable
          onPress={onRetry}
          className="items-center py-16 active:opacity-70"
          testID="toolbelt-error"
        >
          <Text className="text-sm text-destructive">Failed to load tools</Text>
          <Text className="mt-1 text-xs text-muted-foreground">Tap to retry</Text>
        </Pressable>
      )
    }

    // Filtered but no results
    if (searchQuery || selectedCategory !== 'all') {
      return (
        <View className="items-center py-16" testID="toolbelt-no-results">
          <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Filter size={24} className="text-muted-foreground" />
          </View>
          <Text className="text-base font-medium text-foreground">No matches</Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Try adjusting your search or filters
          </Text>
        </View>
      )
    }

    // Empty collection - the main empty state
    return (
      <View className="items-center px-6 py-16" testID="toolbelt-empty">
        <View className="mb-5 h-20 w-20 items-center justify-center rounded-3xl bg-muted">
          <Wrench size={36} className="text-muted-foreground" />
        </View>
        <Text className="text-lg font-semibold text-foreground">Your toolbelt is empty</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
          Tools you save via Claude Code will appear here.{'\n'}
          Use <Text className="font-mono text-xs text-primary">/toolbelt</Text> to save libraries, CLIs, and frameworks.
        </Text>

        {/* Visual hint cards */}
        <View className="mt-8 w-full gap-3">
          <HintCard
            icon={<Package size={16} className="text-blue-400" />}
            title="Libraries & Packages"
            subtitle="npm, PyPI, Cargo, Go modules"
          />
          <HintCard
            icon={<Terminal size={16} className="text-green-400" />}
            title="CLI Tools"
            subtitle="Command-line utilities and scripts"
          />
          <HintCard
            icon={<Wrench size={16} className="text-cyan-400" />}
            title="Dev Tools & Services"
            subtitle="APIs, databases, frameworks"
          />
        </View>
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
        className={cn('flex-1 bg-background', className)}
        testID="toolbelt-screen"
        {...props}
      >
        <FlatList
          data={filteredTools}
          renderItem={renderTool}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          ListHeaderComponent={renderSearchAndFilters}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </KeyboardAvoidingView>
  )
}

/** Small hint card for the empty state */
function HintCard({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-4 py-3">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-muted">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
    </View>
  )
}
