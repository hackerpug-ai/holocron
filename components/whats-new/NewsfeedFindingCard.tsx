/**
 * NewsfeedFindingCard - List-row finding card with left-border accent
 *
 * Designed for the "signal intelligence briefing" aesthetic with:
 * - 3px left border colored by category
 * - Dot-based score indicator (●●●●○)
 * - Plain text category label (no pill badge)
 * - Hairline bottom separator
 *
 * @see .spec/prd/newsfeed-redesign/tasks/sprint-01-intelligence-briefing-screen/NEWSFEED-003-create-newsfeed-finding-card-component.md
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { CATEGORY_COLORS } from './categoryColors';
import { SkeletonCard } from './SkeletonCard';
import type { WhatsNewFindingCardProps } from './WhatsNewFindingCard';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffMs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getScoreTier(score: number | undefined): {
  colorClass: string;
  tierLabel: string;
} {
  if (score == null) return { colorClass: 'text-muted-foreground', tierLabel: 'not available' };
  if (score >= 80) return { colorClass: 'text-success', tierLabel: 'high quality' };
  if (score >= 50) return { colorClass: 'text-warning', tierLabel: 'medium quality' };
  return { colorClass: 'text-destructive', tierLabel: 'low quality' };
}

function ScoreDots({ score }: { score?: number }) {
  const filled = score != null ? Math.min(5, Math.max(0, Math.round((score / 10) * 5))) : 0;
  const { colorClass, tierLabel } = getScoreTier(score);
  const a11yLabel = score != null ? `Score: ${score}, ${tierLabel}` : 'Score not available';

  return (
    <View
      testID="newsfeed-finding-card-score-dots"
      accessibilityLabel={a11yLabel}
      className="flex-row items-center"
    >
      <Text className={`text-xs ${colorClass}`}>{'●'.repeat(filled)}</Text>
      <Text className="text-xs text-muted-foreground">{'○'.repeat(5 - filled)}</Text>
    </View>
  );
}

function NewsfeedFindingCardComponent({
  title,
  source,
  category,
  score,
  summary,
  publishedAt,
  engagementVelocity,
  testID = 'newsfeed-finding-card',
  onPress,
  isLoading,
}: WhatsNewFindingCardProps & { isLoading?: boolean }) {
  if (isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonCard testID="newsfeed-finding-card-skeleton" variant="finding" />
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.container, { borderLeftColor: CATEGORY_COLORS[category], borderLeftWidth: 3 }]}
    >
      <Pressable testID={`${testID}-pressable`} onPress={onPress}>
        <View className="px-4 pb-4 pt-3 gap-2">
          {/* Top row: category label + score dots + relative time */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xs" style={{ color: CATEGORY_COLORS[category] }}>
              {category}
            </Text>

            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center gap-1">
                <Text className="text-xs text-muted-foreground">Signal</Text>
                <ScoreDots score={score} />
              </View>
              {publishedAt && (
                <Text className="text-xs text-muted-foreground" testID={`${testID}-time`}>
                  {formatRelativeTime(publishedAt)}
                </Text>
              )}
            </View>
          </View>

          {/* Title */}
          <Text
            className="text-foreground text-base font-bold leading-snug"
            numberOfLines={2}
            testID={`${testID}-title`}
          >
            {title}
          </Text>

          {/* Summary */}
          {summary && (
            <Text
              className="text-muted-foreground text-sm leading-relaxed"
              numberOfLines={3}
              testID={`${testID}-summary`}
            >
              {summary}
            </Text>
          )}

          {/* Bottom row: source + engagement velocity */}
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-muted-foreground text-xs" testID={`${testID}-source`}>
              {source}
            </Text>

            {engagementVelocity !== undefined && engagementVelocity > 0 && (
              <Text className="text-xs text-muted-foreground" testID={`${testID}-velocity`}>
                {engagementVelocity}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export const NewsfeedFindingCard = React.memo(NewsfeedFindingCardComponent);

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'hsl(var(--border))',
  },
});
