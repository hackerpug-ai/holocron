import { ArticleCard } from '@/components/ArticleCard'
import { type CategoryType } from '@/components/CategoryBadge'
import { EmptyState } from '@/components/EmptyState'
import { SectionHeader } from '@/components/SectionHeader'
import { StatCard } from '@/components/StatCard'
import { cn } from '@/lib/utils'
import { BookOpen, FileText, Lightbulb, Search } from 'lucide-react-native'
import { ScrollView, View, type ViewProps } from 'react-native'

interface Article {
  id: string
  title: string
  category: CategoryType
  date: string
  snippet?: string
  iterationCount?: number
}

interface Stats {
  totalArticles: number
  totalResearch: number
  recentQueries: number
  weeklyGrowth?: number
}

interface HomeScreenProps extends Omit<ViewProps, 'children'> {
  /** Stats to display */
  stats?: Stats
  /** Recent articles to display */
  recentArticles?: Article[]
  /** Whether data is loading */
  loading?: boolean
  /** Callback when an article is pressed */
  onArticlePress?: (article: Article) => void
  /** Callback when "View All" is pressed */
  onViewAllPress?: () => void
  /** Callback when start research is pressed */
  onStartResearchPress?: () => void
}

/**
 * HomeScreen is the main dashboard showing stats and recent articles.
 * Composes StatCard, ArticleCard, SectionHeader, and EmptyState atoms.
 */
export function HomeScreen({
  stats,
  recentArticles = [],
  loading = false,
  onArticlePress,
  onViewAllPress,
  onStartResearchPress,
  className,
  ...props
}: HomeScreenProps) {
  const hasArticles = recentArticles.length > 0

  return (
    <ScrollView
      className={cn('flex-1 bg-background', className)}
      contentContainerClassName="p-4 pb-8"
      testID="home-screen"
      {...props}
    >
      {/* Stats Section */}
      <SectionHeader title="Overview" size="lg" className="mb-3" />
      <View className="mb-6 flex-row flex-wrap gap-3">
        <View className="min-w-[45%] flex-1">
          <StatCard
            label="Total Articles"
            value={stats?.totalArticles ?? 0}
            icon={FileText}
            loading={loading}
          />
        </View>
        <View className="min-w-[45%] flex-1">
          <StatCard
            label="Research Sessions"
            value={stats?.totalResearch ?? 0}
            icon={Lightbulb}
            loading={loading}
          />
        </View>
        <View className="min-w-[45%] flex-1">
          <StatCard
            label="Recent Queries"
            value={stats?.recentQueries ?? 0}
            icon={Search}
            trend={stats?.weeklyGrowth}
            loading={loading}
          />
        </View>
        <View className="min-w-[45%] flex-1">
          <StatCard
            label="Knowledge Base"
            value="Active"
            icon={BookOpen}
            loading={loading}
          />
        </View>
      </View>

      {/* Recent Articles Section */}
      <SectionHeader
        title="Recent Articles"
        actionLabel={hasArticles ? 'View All' : undefined}
        onActionPress={hasArticles ? onViewAllPress : undefined}
        size="lg"
        className="mb-3"
      />

      {hasArticles ? (
        <View className="gap-3">
          {recentArticles.map((article) => (
            <ArticleCard
              key={article.id}
              title={article.title}
              category={article.category}
              date={article.date}
              snippet={article.snippet}
              iterationCount={article.iterationCount}
              onPress={() => onArticlePress?.(article)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          type="no-data"
          title="No articles yet"
          description="Start a research session to add articles to your knowledge base."
          actionLabel="Start Research"
          onActionPress={onStartResearchPress}
        />
      )}
    </ScrollView>
  )
}
