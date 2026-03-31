import { ImprovementRequestCard } from '@/components/improvements/ImprovementRequestCard'
import { ImprovementCardSkeleton } from '@/components/improvements/ImprovementCardSkeleton'
import { Lightbulb, Search } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { useColorScheme } from 'nativewind'

export interface ImprovementsScreenProps {
  requests: Array<{
    _id: string
    title?: string
    description: string
    status: 'submitted' | 'processing' | 'pending_review' | 'approved' | 'done' | 'merged'
    createdAt: number
    images?: Array<unknown>
    mergedFromIds?: string[]
  }>
  isLoading: boolean
  onRequestPress: (id: string) => void
  onRefresh?: () => void
  isRefreshing?: boolean
}

type FilterChip = 'all' | 'open' | 'pending_review' | 'done'

const FILTER_CHIPS: { value: FilterChip; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'done', label: 'Done' },
]

function matchesFilter(
  status: ImprovementsScreenProps['requests'][number]['status'],
  filter: FilterChip,
): boolean {
  if (filter === 'all') return true
  if (filter === 'open') return status === 'submitted' || status === 'processing'
  if (filter === 'pending_review') return status === 'pending_review'
  if (filter === 'done') return status === 'approved' || status === 'done'
  return false
}

export function ImprovementsScreen({
  requests,
  isLoading,
  onRequestPress,
  onRefresh,
  isRefreshing = false,
}: ImprovementsScreenProps) {
  const { colorScheme } = useColorScheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterChip>('all')

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return requests.filter((req) => {
      const matchesSearch =
        query === '' ||
        (req.title ?? '').toLowerCase().includes(query) ||
        req.description.toLowerCase().includes(query)
      return matchesSearch && matchesFilter(req.status, activeFilter)
    })
  }, [requests, searchQuery, activeFilter])

  const renderItem = ({ item }: { item: ImprovementsScreenProps['requests'][number] }) => (
    <View className="px-4 pb-3">
      <ImprovementRequestCard
        id={item._id}
        title={item.title ?? item.description.slice(0, 60)}
        description={item.description}
        status={item.status}
        imageCount={item.images?.length ?? 0}
        createdAt={item.createdAt}
        mergedCount={item.mergedFromIds?.length}
        onPress={() => onRequestPress(item._id)}
        testID={`improvements-screen-card-${item._id}`}
      />
    </View>
  )

  const ListHeader = (
    <View>
      {/* Search bar */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center bg-muted rounded-xl px-3 gap-2">
          <Search size={16} className="text-muted-foreground" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search improvements..."
            placeholderTextColor={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
            className="flex-1 py-2.5 text-sm text-foreground"
            testID="improvements-screen-search-input"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 pb-3 gap-2"
        testID="improvements-screen-filter-chips"
      >
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilter === chip.value
          return (
            <Pressable
              key={chip.value}
              onPress={() => setActiveFilter(chip.value)}
              className={cn(
                'px-3 py-1.5 rounded-full border active:opacity-70',
                isActive
                  ? 'bg-foreground border-foreground'
                  : 'bg-transparent border-border',
              )}
              testID={`improvements-screen-filter-${chip.value}`}
            >
              <Text
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-background' : 'text-muted-foreground',
                )}
              >
                {chip.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )

  if (isLoading) {
    return (
      <View className="flex-1" testID="improvements-screen-loading">
        {ListHeader}
        <View className="px-4 gap-3">
          <ImprovementCardSkeleton />
          <ImprovementCardSkeleton />
          <ImprovementCardSkeleton />
        </View>
      </View>
    )
  }

  const EmptyState = (
    <View
      className="flex-1 items-center justify-center px-8 py-16"
      testID="improvements-screen-empty"
    >
      <Lightbulb size={40} className="text-muted-foreground mb-4" />
      <Text className="text-foreground text-base font-semibold text-center mb-2">
        No improvements yet
      </Text>
      <Text className="text-muted-foreground text-sm text-center">
        Long press any element to suggest an improvement
      </Text>
    </View>
  )

  return (
    <View className="flex-1">
      <FlatList
        testID="improvements-screen-list"
        data={filteredRequests}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyState}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              testID="improvements-screen-refresh-control"
            />
          ) : undefined
        }
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

    </View>
  )
}
