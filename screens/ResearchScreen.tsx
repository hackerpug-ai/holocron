import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import { EmptyState } from '@/components/EmptyState'
import { ProgressIndicator } from '@/components/ProgressIndicator'
import { SearchInput } from '@/components/SearchInput'
import { SectionHeader } from '@/components/SectionHeader'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Lightbulb, Play, Sparkles } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, View, type ViewProps } from 'react-native'

type ResearchType = 'quick' | 'deep' | 'factual'
type ResearchPhase = 'searching' | 'analyzing' | 'synthesizing' | 'complete'

interface ActiveResearch {
  query: string
  type: ResearchType
  phase: ResearchPhase
  progress?: number
  elapsedTime?: number
  sources?: string[]
  statusMessage?: string
}

interface RecentQuery {
  id: string
  query: string
  category: CategoryType
  timestamp: string
}

interface ResearchScreenProps extends Omit<ViewProps, 'children'> {
  /** Currently active research session */
  activeResearch?: ActiveResearch | null
  /** Recent queries for quick access */
  recentQueries?: RecentQuery[]
  /** Whether to show the input in loading state */
  loading?: boolean
  /** Callback when research is initiated */
  onStartResearch?: (query: string, type: ResearchType) => void
  /** Callback when a recent query is pressed */
  onRecentQueryPress?: (query: RecentQuery) => void
  /** Callback when active research is cancelled */
  onCancelResearch?: () => void
  /** Callback when active research completes and user wants to view results */
  onViewResults?: () => void
}

const researchTypes: { type: ResearchType; label: string; description: string }[] = [
  {
    type: 'quick',
    label: 'Quick Search',
    description: 'Fast answers from web sources',
  },
  {
    type: 'deep',
    label: 'Deep Research',
    description: 'Iterative analysis with coverage scoring',
  },
  {
    type: 'factual',
    label: 'Fact Check',
    description: 'Verify claims with citations',
  },
]

/**
 * ResearchScreen allows users to initiate and monitor research sessions.
 * Composes SearchInput, ProgressIndicator, CategoryBadge, SectionHeader, and EmptyState atoms.
 */
export function ResearchScreen({
  activeResearch,
  recentQueries = [],
  loading = false,
  onStartResearch,
  onRecentQueryPress,
  onCancelResearch,
  onViewResults,
  className,
  ...props
}: ResearchScreenProps) {
  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState<ResearchType>('quick')

  const handleStartResearch = () => {
    if (query.trim()) {
      onStartResearch?.(query.trim(), selectedType)
    }
  }

  const isResearchActive = activeResearch && activeResearch.phase !== 'complete'
  const isResearchComplete = activeResearch?.phase === 'complete'

  return (
    <ScrollView
      className={cn('flex-1 bg-background', className)}
      contentContainerClassName="pb-8"
      testID="research-screen"
      {...props}
    >
      {/* Active Research */}
      {activeResearch && (
        <View className="border-b border-border px-4 py-4">
          <SectionHeader title="Active Research" size="md" className="mb-3" />
          <Text className="text-foreground mb-3 font-medium">{activeResearch.query}</Text>
          <ProgressIndicator
            phase={activeResearch.phase}
            progress={activeResearch.progress}
            elapsedTime={activeResearch.elapsedTime}
            sources={activeResearch.sources}
            isActive={isResearchActive ?? false}
            statusMessage={activeResearch.statusMessage}
            className="mb-3"
          />
          <View className="flex-row gap-2">
            {isResearchComplete ? (
              <Button onPress={onViewResults} className="flex-1" testID="view-results-button">
                <Sparkles size={16} className="mr-2 text-primary-foreground" />
                <Text>View Results</Text>
              </Button>
            ) : (
              <Button
                variant="outline"
                onPress={onCancelResearch}
                className="flex-1"
                testID="cancel-research-button"
              >
                <Text>Cancel</Text>
              </Button>
            )}
          </View>
        </View>
      )}

      {/* New Research */}
      {!isResearchActive && (
        <View className="px-4 pt-4">
          <SectionHeader title="New Research" size="lg" className="mb-3" />

          {/* Query Input */}
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder="What would you like to research?"
            onSubmit={handleStartResearch}
            disabled={loading}
            autoFocus={!activeResearch}
          />

          {/* Research Type Selection */}
          <View className="mt-4 gap-2">
            {researchTypes.map(({ type, label, description }) => (
              <Pressable
                key={type}
                onPress={() => setSelectedType(type)}
                className={cn(
                  'rounded-lg border border-border p-3',
                  selectedType === type && 'border-primary bg-primary/5'
                )}
                testID={`research-type-${type}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      className={cn(
                        'font-medium',
                        selectedType === type ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {label}
                    </Text>
                    <Text className="text-muted-foreground text-sm">{description}</Text>
                  </View>
                  <View
                    className={cn(
                      'h-5 w-5 rounded-full border-2',
                      selectedType === type
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground'
                    )}
                  >
                    {selectedType === type && (
                      <View className="m-auto h-2 w-2 rounded-full bg-primary-foreground" />
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Start Button */}
          <Button
            onPress={handleStartResearch}
            disabled={!query.trim() || loading}
            className="mt-4"
            testID="start-research-button"
          >
            <Play size={16} className="mr-2 text-primary-foreground" />
            <Text>Start Research</Text>
          </Button>
        </View>
      )}

      {/* Recent Queries */}
      <View className="px-4 pt-6">
        <SectionHeader title="Recent Queries" size="md" className="mb-3" />
        {recentQueries.length > 0 ? (
          <View className="gap-2">
            {recentQueries.map((recent) => (
              <Pressable
                key={recent.id}
                onPress={() => onRecentQueryPress?.(recent)}
                className="flex-row items-center gap-3 rounded-lg border border-border px-4 py-3 active:bg-muted"
                testID={`recent-query-${recent.id}`}
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Lightbulb size={16} className="text-muted-foreground" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-foreground" numberOfLines={1}>
                    {recent.query}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {new Date(recent.timestamp).toLocaleDateString()}
                  </Text>
                </View>
                <CategoryBadge category={recent.category} size="sm" />
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState
            type="no-data"
            icon={Lightbulb}
            title="No recent queries"
            description="Your research history will appear here."
            size="sm"
          />
        )}
      </View>
    </ScrollView>
  )
}
