/**
 * Recommendation card type definitions.
 *
 * Pure TypeScript types — no runtime dependencies on Paper or UI libraries.
 */

// Source types
export interface RecommendationSource {
  name: string
  type: 'article' | 'tool' | 'conversation' | 'document'
  url?: string
}

// Contact types
export interface RecommendationContact {
  name: string
  role: string
  email?: string
  avatarUrl?: string
}

// Item data - THE CORE TYPE
export interface RecommendationItemData {
  id: string
  title: string
  subtitle: string
  description: string
  confidence: number
  source: RecommendationSource
  contacts: RecommendationContact[]
  tags: string[]
  url: string
}

// Card data with LITERAL card_type
export interface RecommendationListCardData {
  card_type: 'recommendation_list'
  items: RecommendationItemData[]
  summary: string
  title?: string
  contextTag?: string
}

// Component props
export interface RecommendationListCardProps {
  data: RecommendationListCardData
  onItemPress: (item: RecommendationItemData) => void
  onDismiss?: () => void
  showSummary?: boolean
  testID?: string
}

export interface RecommendationItemProps {
  item: RecommendationItemData
  onPress: (item: RecommendationItemData) => void
  showConfidence?: boolean
  testID?: string
}

export interface RecommendationSourcesProps {
  sources: RecommendationSource[]
  onSourcePress?: (source: RecommendationSource) => void
  testID?: string
}

export interface RecommendationActionSheetProps {
  visible: boolean
  onDismiss: () => void
  item: RecommendationItemData | null
  onSave?: (item: RecommendationItemData) => void
  onShare?: (item: RecommendationItemData) => void
  onOpenInBrowser?: (item: RecommendationItemData) => void
  testID?: string
}
