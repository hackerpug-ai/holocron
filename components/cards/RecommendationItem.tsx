import { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { RecommendationItemProps, RecommendationSourceEvidence } from './types/recommendation';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  expert: 'Expert',
  ratings: 'Ratings',
  editorial: 'Editorial',
  community: 'Community',
};

const openPhone = async (raw: string, fallback?: (url: string) => void) => {
  const digits = raw.replace(/\D/g, '');
  const url = `tel:${digits}`;
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    fallback?.(url);
  }
};

const openMaps = async (location: string, fallback?: (url: string) => void) => {
  const encoded = encodeURIComponent(location);
  const url = Platform.OS === 'ios' ? `maps:?q=${encoded}` : `geo:0,0?q=${encoded}`;
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    fallback?.(url);
  }
};

const openWebsite = async (url: string, fallback?: (url: string) => void) => {
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    fallback?.(url);
  }
};

function EvidenceEntry({
  entry,
  onLinkingFallback,
}: {
  entry: RecommendationSourceEvidence;
  onLinkingFallback?: (url: string) => void;
}) {
  return (
    <Pressable
      onPress={() => openWebsite(entry.url, onLinkingFallback)}
      className="py-2 border-b border-border/50 active:bg-muted/30"
    >
      <View className="flex-row items-center gap-2 mb-0.5">
        <Text className="text-xs font-semibold text-foreground">{entry.source}</Text>
        <View className="px-1.5 py-0.5 rounded bg-muted">
          <Text className="text-xs text-muted-foreground">
            {SOURCE_TYPE_LABELS[entry.sourceType] ?? entry.sourceType}
          </Text>
        </View>
        {entry.rating != null && (
          <Text className="text-xs text-muted-foreground">
            {entry.rating}★
            {entry.reviewCount != null ? ` (${entry.reviewCount.toLocaleString()})` : ''}
          </Text>
        )}
      </View>
      <Text className="text-xs text-muted-foreground leading-relaxed">{entry.excerpt}</Text>
    </Pressable>
  );
}

export function RecommendationItem({
  item,
  index = 0,
  onLongPress,
  onLinkingFallback,
}: RecommendationItemProps) {
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const contact = item.contacts?.[0];
  const hasEvidence = item.sourceEvidence && item.sourceEvidence.length > 0;

  return (
    <Pressable
      testID={`recommendation-item-${index}`}
      delayLongPress={400}
      onLongPress={() => onLongPress?.(item)}
      className="p-4 border-b border-border active:bg-muted/50"
    >
      {/* Header row: title + rank badge */}
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-base font-semibold text-foreground">{item.title}</Text>
        {item.rank != null && (
          <View className="px-2 py-0.5 rounded-full bg-primary/10">
            <Text className="text-xs font-bold text-primary">#{item.rank}</Text>
          </View>
        )}
      </View>

      {item.subtitle && (
        <Text className="text-sm text-muted-foreground mt-0.5">{item.subtitle}</Text>
      )}
      {item.description && (
        <Text className="text-sm text-muted-foreground mt-1">{item.description}</Text>
      )}

      {/* Rating row */}
      {(item.tags && item.tags.length > 0) && (
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {item.tags.map((tag) => (
            <View key={tag} className="px-2 py-0.5 rounded bg-muted">
              <Text className="text-xs text-muted-foreground">{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Source score chip */}
      {item.sourceScore != null && item.sourceScore > 0 && (
        <View className="flex-row items-center gap-1.5 mt-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <Text className="text-xs text-muted-foreground">
            Source score: {item.sourceScore}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View className="flex-row flex-wrap gap-2 mt-2">
        {contact?.phone && (
          <Pressable
            testID={`recommendation-item-${index}-phone`}
            onPress={() => openPhone(contact.phone!, onLinkingFallback)}
            className="px-2 py-1 rounded-full bg-muted"
          >
            <Text className="text-xs text-foreground">{contact.phone}</Text>
          </Pressable>
        )}
        {contact?.location && (
          <Pressable
            testID={`recommendation-item-${index}-location`}
            onPress={() => openMaps(contact.location!, onLinkingFallback)}
            className="px-2 py-1 rounded-full bg-muted"
          >
            <Text className="text-xs text-foreground">{contact.location}</Text>
          </Pressable>
        )}
        {item.url && (
          <Pressable
            testID={`recommendation-item-${index}-website`}
            onPress={() => openWebsite(item.url, onLinkingFallback)}
            className="px-2 py-1 rounded-full bg-muted"
          >
            <Text className="text-xs text-foreground">Website</Text>
          </Pressable>
        )}
      </View>

      {/* Expandable research sources */}
      {hasEvidence && (
        <View className="mt-3">
          <Pressable
            testID={`recommendation-item-${index}-evidence-toggle`}
            onPress={() => setEvidenceExpanded((v) => !v)}
            className="flex-row items-center gap-1"
          >
            <Text className="text-xs font-medium text-primary">
              {evidenceExpanded ? '▾' : '▸'} Research Sources ({item.sourceEvidence!.length})
            </Text>
          </Pressable>
          {evidenceExpanded && (
            <View className="mt-2 pl-1">
              {item.sourceEvidence!.map((entry, ei) => (
                <EvidenceEntry
                  key={`${entry.source}-${ei}`}
                  entry={entry}
                  onLinkingFallback={onLinkingFallback}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
