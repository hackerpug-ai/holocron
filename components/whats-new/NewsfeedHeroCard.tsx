/**
 * NewsfeedHeroCard - Elevated presentation for the highest-scored finding
 *
 * Visually distinguishes the top finding with:
 * - 4px left border (vs 3px on regular cards)
 * - Extra-bold enlarged title (3-line cap)
 * - "TOP SIGNAL" eyebrow label
 * - Extended summary (4-line cap)
 * - Required onPress (cannot render without interaction)
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { Zap } from '@/components/ui/icons';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { CATEGORY_COLORS } from './categoryColors';
import type { WhatsNewFindingCardProps } from './WhatsNewFindingCard';

// onPress is required on HeroCard (override the optional from base props)
export type NewsfeedHeroCardProps = Omit<WhatsNewFindingCardProps, 'onPress'> & {
  onPress: () => void;
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NewsfeedHeroCardComponent({
  title,
  source,
  category,
  score,
  summary,
  publishedAt,
  author,
  engagementVelocity,
  testID = 'newsfeed-hero-card',
  onPress,
}: NewsfeedHeroCardProps) {
  return (
    <Card
      testID={testID}
      className="px-5 py-5"
      style={{ borderLeftColor: CATEGORY_COLORS[category], borderLeftWidth: 4 }}
    >
      <Pressable testID={`${testID}-pressable`} onPress={onPress}>
        {/* TOP SIGNAL Eyebrow */}
        <Text testID={`${testID}-eyebrow`} className="text-xs uppercase text-muted-foreground">
          TOP SIGNAL
        </Text>

        {/* Title - extrabold, xl, 3-line cap */}
        <Text
          testID={`${testID}-title`}
          className="font-extrabold text-xl text-foreground"
          numberOfLines={3}
        >
          {title}
        </Text>

        {/* Summary - 4-line cap */}
        {summary && (
          <Text
            testID={`${testID}-summary`}
            className="text-muted-foreground text-sm leading-relaxed"
            numberOfLines={4}
          >
            {summary}
          </Text>
        )}

        {/* Bottom meta row: velocity, source, time */}
        <View testID={`${testID}-meta-row`} className="flex-row justify-between items-center">
          {/* Source */}
          <Text testID={`${testID}-source`} className="text-muted-foreground text-xs">
            {source}
          </Text>

          {/* Velocity */}
          {engagementVelocity !== undefined && engagementVelocity > 0 && (
            <View className="flex-row items-center gap-0.5">
              <Zap size={10} className="text-warning" />
              <Text testID={`${testID}-velocity`} className="text-xs text-muted-foreground">
                {engagementVelocity}
              </Text>
            </View>
          )}

          {/* Relative time */}
          {publishedAt && (
            <Text testID={`${testID}-time`} className="text-xs text-muted-foreground">
              {formatRelativeTime(publishedAt)}
            </Text>
          )}
        </View>
      </Pressable>
    </Card>
  );
}

export const NewsfeedHeroCard = React.memo(NewsfeedHeroCardComponent);
