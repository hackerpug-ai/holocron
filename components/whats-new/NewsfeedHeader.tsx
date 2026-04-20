/**
 * NewsfeedHeader - Editorial date-and-stats header for Intelligence Briefing
 *
 * Displays report date, color-coded freshness dot, finding count, source count,
 * and relative generation time.
 *
 * @see .spec/prd/newsfeed-redesign/tasks/sprint-01-intelligence-briefing-screen/NEWSFEED-001-create-newsfeed-header-component.md
 */

import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

const FRESHNESS_COLORS = {
  fresh: '#22C55E', // < 6 h
  aging: '#F59E0B', // < 24 h
  stale: '#EF4444', // >= 24 h
} as const;

function freshnessColor(createdAt: number): string {
  const ageHours = (Date.now() - createdAt) / 3_600_000;
  if (ageHours < 6) return FRESHNESS_COLORS.fresh;
  if (ageHours < 24) return FRESHNESS_COLORS.aging;
  return FRESHNESS_COLORS.stale;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

interface NewsfeedHeaderProps {
  report: {
    createdAt: number;
    findingsCount: number;
    summaryJson?: { sources?: unknown[] };
  } | null;
}

function NewsfeedHeaderComponent({ report }: NewsfeedHeaderProps) {
  if (!report) {
    return <View testID="newsfeed-header" />;
  }

  const sourceCount =
    (report.summaryJson as { sources?: unknown[] } | undefined)?.sources?.length ?? 0;
  const freshColor = freshnessColor(report.createdAt);
  const dateLabel = formatDate(report.createdAt);
  const relativeTime = formatRelativeTime(report.createdAt);

  return (
    <View testID="newsfeed-header" className="flex-col gap-2 px-4 pt-4 pb-2">
      {/* Date and freshness row */}
      <View className="flex-row items-center gap-2">
        {/* Freshness dot — color indicates report age */}
        <View
          testID="newsfeed-header-freshness-dot"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: freshColor }}
          accessibilityLabel={`Report freshness: ${
            freshColor === FRESHNESS_COLORS.fresh
              ? 'recent'
              : freshColor === FRESHNESS_COLORS.aging
                ? 'aging'
                : 'stale'
          }`}
        />
        {/* Date label */}
        <Text testID="newsfeed-header-date" className="text-sm font-semibold text-foreground">
          {dateLabel}
        </Text>
      </View>

      {/* Stats line */}
      <Text testID="newsfeed-header-stats" className="text-xs text-muted-foreground">
        {report.findingsCount} findings · {sourceCount} sources · Generated {relativeTime}
      </Text>
    </View>
  );
}

export const NewsfeedHeader = React.memo(NewsfeedHeaderComponent);
