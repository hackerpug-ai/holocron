/**
 * ShopListingCard - Product listing card with deal-focused design
 *
 * Aesthetic: "Deal Hunter" - premium outlet mall meets trading terminal
 * - Price-focused hierarchy with massive typography
 * - Deal score visualization (green = hot, amber = good, gray = standard)
 * - Retailer badges with brand identity
 * - Condition indicators with clear visual hierarchy
 */

import { View, Pressable, Image, Linking, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ExternalLink,
  Tag,
  TrendingDown,
  Package,
  Star,
  Flame,
  Zap,
  CheckCircle2,
  XCircle,
} from '@/components/ui/icons'
import { spacing, radius } from '@/lib/theme'
import { useTheme } from '@/hooks/use-theme'
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

export interface ShopListingCardProps {
  listingId: string
  title: string
  price: number // in cents
  originalPrice?: number // in cents
  currency: string
  condition: string
  retailer: string
  seller?: string
  sellerRating?: number
  url: string
  imageUrl?: string
  inStock: boolean
  dealScore?: number // 0-100
  testID?: string
  onPress?: () => void
}

// Retailer brand colors for distinctive badges
const RETAILER_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  amazon: { bg: '#FF9900', text: '#000000', darkBg: '#FF9900', darkText: '#000000' },
  ebay: { bg: '#E53238', text: '#FFFFFF', darkBg: '#E53238', darkText: '#FFFFFF' },
  walmart: { bg: '#0071DC', text: '#FFFFFF', darkBg: '#0071DC', darkText: '#FFFFFF' },
  target: { bg: '#CC0000', text: '#FFFFFF', darkBg: '#CC0000', darkText: '#FFFFFF' },
  bestbuy: { bg: '#0046BE', text: '#FFE000', darkBg: '#0046BE', darkText: '#FFE000' },
  newegg: { bg: '#F7941E', text: '#000000', darkBg: '#F7941E', darkText: '#000000' },
  default: { bg: '#6B7280', text: '#FFFFFF', darkBg: '#4B5563', darkText: '#FFFFFF' },
}

// Condition styling
const CONDITION_STYLES: Record<string, { label: string; className: string }> = {
  new: { label: 'NEW', className: 'bg-success/20 text-success' },
  like_new: { label: 'LIKE NEW', className: 'bg-success/20 text-success' },
  refurbished: { label: 'REFURB', className: 'bg-info/20 text-info' },
  open_box: { label: 'OPEN BOX', className: 'bg-warning/20 text-warning' },
  used: { label: 'USED', className: 'bg-muted-foreground/20 text-muted-foreground' },
  default: { label: 'UNKNOWN', className: 'bg-muted-foreground/20 text-muted-foreground' },
}

/**
 * Format price from cents to display string
 */
function formatPrice(cents: number, currency: string = 'USD'): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/**
 * Calculate discount percentage
 */
function calculateDiscount(price: number, originalPrice: number): number {
  if (!originalPrice || originalPrice <= price) return 0
  return Math.round(((originalPrice - price) / originalPrice) * 100)
}


export function ShopListingCard({
  listingId,
  title,
  price,
  originalPrice,
  currency = 'USD',
  condition,
  retailer,
  seller,
  sellerRating,
  url,
  imageUrl,
  inStock,
  dealScore,
  testID = 'shop-listing-card',
  onPress,
}: ShopListingCardProps) {
  const { colors: themeColors, isDark } = useTheme()

  // Build theme-aware deal score styles
  const getDealScoreStyleThemed = (score: number | undefined) => {
    if (!score || score < 50) {
      return { color: themeColors.mutedForeground, bgColor: `${themeColors.mutedForeground}33`, icon: 'tag' as const, label: 'Standard' }
    }
    if (score < 75) {
      return { color: themeColors.warning, bgColor: `${themeColors.warning}33`, icon: 'zap' as const, label: 'Good Deal' }
    }
    return { color: themeColors.success, bgColor: `${themeColors.success}33`, icon: 'flame' as const, label: 'Hot Deal' }
  }

  // Animation for press feedback
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 })
  }

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 })
  }

  const handlePress = () => {
    if (onPress) {
      onPress()
    } else if (url) {
      Linking.openURL(url)
    }
  }

  // Get retailer colors
  const retailerKey = retailer.toLowerCase().replace(/[^a-z]/g, '')
  const retailerStyle = RETAILER_COLORS[retailerKey] || RETAILER_COLORS.default
  const retailerBg = isDark ? retailerStyle.darkBg : retailerStyle.bg
  const retailerText = isDark ? retailerStyle.darkText : retailerStyle.text

  // Get condition styling
  const conditionKey = condition.toLowerCase().replace(/[^a-z_]/g, '')
  const conditionStyle = CONDITION_STYLES[conditionKey] || CONDITION_STYLES.default

  // Calculate discount
  const discount = originalPrice ? calculateDiscount(price, originalPrice) : 0

  // Get deal score styling (theme-aware)
  const dealStyle = getDealScoreStyleThemed(dealScore)
  const DealIcon = dealStyle.icon === 'flame' ? Flame : dealStyle.icon === 'zap' ? Zap : Tag

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        testID={testID}
      >
        <Card className="overflow-hidden border-border bg-card">
          {/* Top Row: Image + Main Info */}
          <View className="flex-row p-3">
            {/* Product Image */}
            {imageUrl ? (
              <View
                className="mr-3 overflow-hidden rounded-lg bg-muted"
                style={styles.imageContainer}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  resizeMode="cover"
                />
                {/* Condition Badge - overlaid on image */}
                <View
                  className={cn(
                    'absolute bottom-1 left-1 rounded px-1.5 py-0.5',
                    conditionStyle.className
                  )}
                >
                  <Text className="text-[10px] font-bold tracking-wider">
                    {conditionStyle.label}
                  </Text>
                </View>
              </View>
            ) : (
              <View
                className="mr-3 items-center justify-center rounded-lg bg-muted"
                style={styles.imageContainer}
              >
                <Package size={32} color={themeColors.mutedForeground} />
                {/* Condition Badge */}
                <View
                  className={cn(
                    'absolute bottom-1 left-1 rounded px-1.5 py-0.5',
                    conditionStyle.className
                  )}
                >
                  <Text className="text-[10px] font-bold tracking-wider">
                    {conditionStyle.label}
                  </Text>
                </View>
              </View>
            )}

            {/* Main Info */}
            <View className="flex-1 justify-between">
              {/* Title */}
              <Text
                className="text-foreground text-sm font-medium leading-tight"
                numberOfLines={2}
              >
                {title}
              </Text>

              {/* Price Section */}
              <View className="mt-2">
                <View className="flex-row items-baseline gap-2">
                  {/* Main Price - Large and Bold */}
                  <Text
                    className="text-foreground text-2xl font-bold tracking-tight"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {formatPrice(price, currency)}
                  </Text>

                  {/* Original Price + Discount */}
                  {discount > 0 && originalPrice && (
                    <View className="flex-row items-center gap-1">
                      <Text
                        className="text-muted-foreground text-sm line-through"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {formatPrice(originalPrice, currency)}
                      </Text>
                      <View className="flex-row items-center rounded bg-destructive/20 px-1.5 py-0.5">
                        <TrendingDown size={10} color={themeColors.danger} />
                        <Text className="ml-0.5 text-xs font-bold text-destructive">
                          {discount}%
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Bottom Row: Retailer, Deal Score, Stock Status */}
          <View
            className="flex-row items-center justify-between border-t border-border px-3 py-2 bg-foreground/[0.02]"
          >
            {/* Left: Retailer Badge + Seller */}
            <View className="flex-row items-center gap-2">
              <View
                className="rounded px-2 py-1"
                style={{ backgroundColor: retailerBg }}
              >
                <Text
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: retailerText }}
                >
                  {retailer}
                </Text>
              </View>
              {seller && (
                <View className="flex-row items-center gap-1">
                  <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                    {seller}
                  </Text>
                  {sellerRating && sellerRating > 0 && (
                    <View className="flex-row items-center gap-0.5">
                      <Star size={10} color={themeColors.starRating} fill={themeColors.starRating} />
                      <Text className="text-star-rating text-xs font-medium">
                        {sellerRating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Right: Deal Score + Stock + Link */}
            <View className="flex-row items-center gap-2">
              {/* Deal Score Badge */}
              {dealScore !== undefined && dealScore > 0 && (
                <View
                  className="flex-row items-center gap-1 rounded-full px-2 py-1"
                  style={{ backgroundColor: dealStyle.bgColor }}
                >
                  <DealIcon size={12} color={dealStyle.color} />
                  <Text
                    className="text-xs font-bold"
                    style={{ color: dealStyle.color }}
                  >
                    {dealScore}
                  </Text>
                </View>
              )}

              {/* Stock Status */}
              {inStock ? (
                <View className="flex-row items-center gap-0.5">
                  <CheckCircle2 size={12} color={themeColors.success} />
                  <Text className="text-xs font-medium text-success">In Stock</Text>
                </View>
              ) : (
                <View className="flex-row items-center gap-0.5">
                  <XCircle size={12} color={themeColors.danger} />
                  <Text className="text-xs font-medium text-destructive">Out of Stock</Text>
                </View>
              )}

              {/* External Link Icon */}
              <ExternalLink size={14} color={themeColors.mutedForeground} />
            </View>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  imageContainer: {
    width: 80,
    height: 80,
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
