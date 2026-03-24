/**
 * DocumentContextCard - Document reference card shown in chat.
 *
 * Two variants:
 * - Full document (scope === 'full'): icon + category badge + title + optional snippet preview.
 *   ChevronRight in title row signals tappability. Tapping navigates to the document viewer.
 * - Section/excerpt (scope === 'excerpt'): keeps existing excerpt box with truncation + "Show full section"
 *   that opens SectionReaderSheet. Supports onDeleteFromChat threaded through to the sheet.
 *
 * Matches the ResultCard article pattern: Card > px-6 sections with NativeWind tokens only.
 */

import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { FileText, Scissors, ChevronRight } from '@/components/ui/icons'
import { CategoryBadge, type CategoryType } from '@/components/CategoryBadge'
import type { DocumentContextCardData } from '@/lib/types/chat'
import { SectionReaderSheet } from './SectionReaderSheet'

/** Max characters shown inline before truncation */
const EXCERPT_INLINE_LIMIT = 180

export interface DocumentContextCardProps {
  data: DocumentContextCardData
  /** Called when user wants to navigate to the full document */
  onNavigateToDocument?: (documentId: string, blockIndex?: number) => void
  /** Called when user removes this context card from the chat */
  onDeleteFromChat?: () => void
  testID?: string
}

export function DocumentContextCard({
  data,
  onNavigateToDocument,
  onDeleteFromChat,
  testID = 'document-context-card',
}: DocumentContextCardProps) {
  const [readerVisible, setReaderVisible] = useState(false)

  const isExcerpt = data.scope === 'excerpt'
  const category = data.category as CategoryType | undefined

  // --- Full document variant ---
  if (!isExcerpt) {
    const cardContent = (
      <Card testID={testID} className="border-border bg-card overflow-hidden py-4">
        {/* Top row: icon + category badge + scope label */}
        <View className="px-6 pb-2">
          <View className="mb-2 flex-row items-center gap-2">
            <FileText size={16} className="text-muted-foreground" />
            {category && <CategoryBadge category={category} size="sm" />}
            <Text className="text-muted-foreground text-xs ml-auto">Full document</Text>
          </View>

          {/* Title with ChevronRight indicating tappability */}
          <View className="flex-row items-start gap-1">
            <Text
              className="text-foreground text-base font-semibold flex-1"
              numberOfLines={2}
            >
              {data.title}
            </Text>
            <ChevronRight size={18} className="text-muted-foreground mt-0.5 shrink-0" />
          </View>
        </View>

        {/* Excerpt preview (2 lines max) */}
        {data.excerpt ? (
          <View className="px-6 pt-1">
            <Text className="text-muted-foreground text-sm" numberOfLines={2}>
              {data.excerpt}
            </Text>
          </View>
        ) : null}
      </Card>
    )

    if (onNavigateToDocument) {
      return (
        <Pressable
          onPress={() => onNavigateToDocument(data.document_id, data.blockIndex)}
          className="active:opacity-80"
          testID={`${testID}-pressable`}
          accessibilityRole="button"
          accessibilityLabel={`Open document: ${data.title}`}
        >
          {cardContent}
        </Pressable>
      )
    }

    return cardContent
  }

  // --- Section / excerpt variant ---
  const isTruncated = data.excerpt && data.excerpt.length > EXCERPT_INLINE_LIMIT
  const displayText = data.excerpt
    ? isTruncated
      ? data.excerpt.slice(0, EXCERPT_INLINE_LIMIT).trimEnd() + '...'
      : data.excerpt
    : null

  return (
    <>
      <Card testID={testID} className="border-border bg-card overflow-hidden py-4">
        {/* Top row: icon + category badge + scope label */}
        <View className="px-6 pb-2">
          <View className="mb-2 flex-row items-center gap-2">
            <Scissors size={16} className="text-muted-foreground" />
            {category && <CategoryBadge category={category} size="sm" />}
            <Text className="text-muted-foreground text-xs ml-auto">Section</Text>
          </View>

          {/* Title */}
          <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
            {data.title}
          </Text>
        </View>

        {/* Excerpt box */}
        {displayText ? (
          <View className="px-6 pb-2">
            <View className="rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5">
              <Text className="text-foreground/80 text-sm leading-relaxed">
                {displayText}
              </Text>
              {isTruncated ? (
                <Pressable
                  onPress={() => setReaderVisible(true)}
                  className="mt-2 self-start active:opacity-60"
                  testID={`${testID}-show-more`}
                  accessibilityRole="button"
                  accessibilityLabel="Show full section"
                >
                  <Text className="text-primary text-sm font-medium">
                    Show full section
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Footer */}
        <View className="px-6 flex-row items-center justify-between">
          {onNavigateToDocument ? (
            <Pressable
              onPress={() => onNavigateToDocument(data.document_id, data.blockIndex)}
              className="flex-row items-center gap-0.5 active:opacity-60"
              testID={`${testID}-navigate`}
              accessibilityRole="button"
              accessibilityLabel="View in document"
            >
              <Text className="text-muted-foreground text-xs">View</Text>
              <ChevronRight size={14} className="text-muted-foreground" />
            </Pressable>
          ) : (
            <View />
          )}
        </View>
      </Card>

      {/* Section reader sheet */}
      {data.excerpt ? (
        <SectionReaderSheet
          visible={readerVisible}
          onClose={() => setReaderVisible(false)}
          title={data.title}
          content={data.excerpt}
          category={category}
          onViewInDocument={
            onNavigateToDocument
              ? () => {
                  setReaderVisible(false)
                  setTimeout(() => {
                    onNavigateToDocument(data.document_id, data.blockIndex)
                  }, 250)
                }
              : undefined
          }
          onDeleteFromChat={onDeleteFromChat}
          testID={`${testID}-reader`}
        />
      ) : null}
    </>
  )
}
