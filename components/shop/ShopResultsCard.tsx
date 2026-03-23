/**
 * ShopResultsCard - Results container with summary header
 *
 * Aesthetic: Trading terminal dashboard header with deal statistics
 * - Query summary with total results count
 * - Best deal highlight
 * - Search duration metrics
 * - Expandable/collapsible listing grid
 */

import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { ShopListingCard } from './ShopListingCard'
import { cn } from '@/lib/utils'
import {
  ShoppingCart,
  Clock,
  Trophy,
  Package,
  TrendingUp,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/use-theme'
import type { ShopListingCardData, ShopResultsCardData } from '@/lib/types/chat'

export interface ShopResultsCardProps {
  sessionId: string
  query: string
  totalListings: number
  bestDealId?: string
  listings: ShopListingCardData[]
  status: 'searching' | 'completed' | 'failed'
  durationMs?: number
  testID?: string
  onListingPress?: (listingId: string) => void
}

/**
 * Format duration to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Get the best deal listing
 */
function getBestDeal(listings: ShopListingCardData[], bestDealId?: string): ShopListingCardData | null {
  if (bestDealId) {
    return listings.find(l => l.listing_id === bestDealId) || null
  }
  // Fallback to highest deal score
  const sorted = [...listings].sort((a, b) => (b.deal_score || 0) - (a.deal_score || 0))
  return sorted[0] || null
}

export function ShopResultsCard({
  sessionId,
  query,
  totalListings,
  bestDealId,
  listings,
  status,
  durationMs,
  testID = 'shop-results-card',
  onListingPress,
}: ShopResultsCardProps) {
  const { colors: themeColors } = useTheme()

  const bestDeal = getBestDeal(listings, bestDealId)

  // Calculate savings summary
  const totalSavings = listings.reduce((sum, listing) => {
    if (listing.original_price && listing.original_price > listing.price) {
      return sum + (listing.original_price - listing.price)
    }
    return sum
  }, 0)

  const avgDealScore = listings.length > 0
    ? Math.round(listings.reduce((sum, l) => sum + (l.deal_score || 0), 0) / listings.length)
    : 0

  return (
    <View testID={testID} className="gap-3">
      {/* Header Card */}
      <Card className="border-border bg-card overflow-hidden">
        {/* Top accent bar */}
        <View
          className="h-1"
          style={{ backgroundColor: themeColors.primary }}
        />

        {/* Main header content */}
        <View className="p-4">
          {/* Query + Status */}
          <View className="mb-3 flex-row items-center gap-2">
            <ShoppingCart size={20} color={themeColors.primary} />
            <Text className="text-foreground flex-1 text-lg font-bold" numberOfLines={1}>
              {query}
            </Text>
            {status === 'completed' && durationMs && (
              <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
                <Clock size={12} color={themeColors.mutedForeground} />
                <Text className="text-muted-foreground text-xs">
                  {formatDuration(durationMs)}
                </Text>
              </View>
            )}
          </View>

          {/* Stats Row */}
          <View className="flex-row items-center gap-4">
            {/* Total Results */}
            <View className="flex-row items-center gap-1.5">
              <Package size={14} color={themeColors.mutedForeground} />
              <Text className="text-foreground text-sm font-semibold">
                {totalListings}
              </Text>
              <Text className="text-muted-foreground text-sm">
                {totalListings === 1 ? 'listing' : 'listings'}
              </Text>
            </View>

            {/* Average Deal Score */}
            {avgDealScore > 0 && (
              <View className="flex-row items-center gap-1.5">
                <TrendingUp size={14} color={themeColors.primary} />
                <Text className="text-foreground text-sm font-semibold">
                  {avgDealScore}
                </Text>
                <Text className="text-muted-foreground text-sm">avg score</Text>
              </View>
            )}

            {/* Total Savings */}
            {totalSavings > 0 && (
              <View className="flex-row items-center gap-1.5">
                <Trophy size={14} color="#10B981" />
                <Text className="text-sm font-semibold text-emerald-400">
                  ${(totalSavings / 100).toFixed(0)}
                </Text>
                <Text className="text-muted-foreground text-sm">in savings</Text>
              </View>
            )}
          </View>

          {/* Best Deal Highlight */}
          {bestDeal && bestDeal.deal_score && bestDeal.deal_score >= 70 && (
            <View
              className="mt-3 rounded-lg p-3"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
            >
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-emerald-500/20 p-1.5">
                  <Trophy size={14} color="#10B981" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Best Deal Found
                  </Text>
                  <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                    {bestDeal.title}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-lg font-bold text-emerald-400">
                    ${(bestDeal.price / 100).toFixed(2)}
                  </Text>
                  {bestDeal.original_price && bestDeal.original_price > bestDeal.price && (
                    <Text className="text-muted-foreground text-xs line-through">
                      ${(bestDeal.original_price / 100).toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </Card>

      {/* Listings */}
      {listings.length > 0 ? (
        <View className="gap-2">
          {listings.map((listing, index) => (
            <ShopListingCard
              key={listing.listing_id || index}
              listingId={listing.listing_id}
              title={listing.title}
              price={listing.price}
              originalPrice={listing.original_price}
              currency={listing.currency}
              condition={listing.condition}
              retailer={listing.retailer}
              seller={listing.seller}
              sellerRating={listing.seller_rating}
              url={listing.url}
              imageUrl={listing.image_url}
              inStock={listing.in_stock}
              dealScore={listing.deal_score}
              testID={`${testID}-listing-${index}`}
              onPress={onListingPress ? () => onListingPress(listing.listing_id) : undefined}
            />
          ))}
        </View>
      ) : status === 'completed' ? (
        <Card className="border-border bg-card p-6">
          <View className="items-center gap-2">
            <Package size={32} color={themeColors.mutedForeground} />
            <Text className="text-muted-foreground text-center text-sm">
              No listings found for "{query}"
            </Text>
          </View>
        </Card>
      ) : null}
    </View>
  )
}
