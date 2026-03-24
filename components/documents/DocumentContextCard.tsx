/**
 * DocumentContextCard - Document reference card shown in chat.
 *
 * Two variants:
 * - Full document: compact card with doc icon, title, category. Tappable to navigate.
 * - Excerpt: shows truncated text (3 lines) with "Show more" that opens ExcerptReaderSheet.
 *
 * Follows the same Card + px-6 pattern as ResultCard and DocumentSavedCard.
 */

import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { FileText, Scissors, ChevronRight } from '@/components/ui/icons'
import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import type { DocumentContextCardData } from '@/lib/types/chat'
import { ExcerptReaderSheet } from './ExcerptReaderSheet'

/** Max characters shown inline before truncation */
const EXCERPT_INLINE_LIMIT = 180

export interface DocumentContextCardProps {
  data: DocumentContextCardData
  /** Called when user wants to navigate to the full document */
  onNavigateToDocument?: (documentId: string, blockIndex?: number) => void
  testID?: string
}

export function DocumentContextCard({
  data,
  onNavigateToDocument,
  testID = 'document-context-card',
}: DocumentContextCardProps) {
  const [readerVisible, setReaderVisible] = useState(false)
  const isExcerpt = data.scope === 'excerpt'
  const isTruncated = isExcerpt && data.excerpt && data.excerpt.length > EXCERPT_INLINE_LIMIT
  const displayText = isExcerpt && data.excerpt
    ? (isTruncated ? data.excerpt.slice(0, EXCERPT_INLINE_LIMIT).trimEnd() + '...' : data.excerpt)
    : null

  const category = data.category as CategoryType | undefined

  return (
    <>
      <Card testID={testID} className="border-border bg-card overflow-hidden py-4">
        <View className="px-6 pb-2">
          {/* Type + category row */}
          <View className="mb-2 flex-row items-center gap-2">
            {isExcerpt ? (
              <Scissors size={16} className="text-muted-foreground" />
            ) : (
              <FileText size={16} className="text-muted-foreground" />
            )}
            {category && <CategoryBadge category={category} size="sm" />}
          </View>

          {/* Title */}
          <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
            {data.title}
          </Text>
        </View>

        {/* Excerpt body */}
        {displayText && (
          <View className="px-6 pb-2">
            <View className="rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5">
              <Text className="text-foreground/80 text-sm leading-relaxed">
                {displayText}
              </Text>
              {isTruncated && (
                <Pressable
                  onPress={() => setReaderVisible(true)}
                  className="mt-2 self-start active:opacity-60"
                  testID={`${testID}-show-more`}
                >
                  <Text className="text-primary text-sm font-medium">
                    Show more
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Footer with navigation hint */}
        <View className="px-6 flex-row items-center justify-between">
          <Text className="text-muted-foreground text-xs">
            {isExcerpt ? 'Excerpt' : 'Full document'}
          </Text>
          <View className="flex-row items-center gap-0.5">
            <Text className="text-muted-foreground text-xs">
              View
            </Text>
            <ChevronRight size={14} className="text-muted-foreground" />
          </View>
        </View>
      </Card>

      {/* Excerpt reader sheet */}
      {isExcerpt && data.excerpt && (
        <ExcerptReaderSheet
          visible={readerVisible}
          onClose={() => setReaderVisible(false)}
          title={data.title}
          excerpt={data.excerpt}
          category={category}
          onViewInDocument={() => {
            setReaderVisible(false)
            setTimeout(() => {
              onNavigateToDocument?.(data.document_id, data.blockIndex)
            }, 250)
          }}
          testID={`${testID}-reader`}
        />
      )}
    </>
  )
}
