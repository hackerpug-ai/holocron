import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { MessageSquare, Package, Sparkles, TrendingUp } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export interface NewsfeedFilterBarOption {
  key: string;
  label: string;
  count: number;
}

export interface NewsfeedFilterBarProps {
  options: NewsfeedFilterBarOption[];
  selected: string;
  onChange: (key: string) => void;
  testID?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  discovery: Sparkles,
  release: Package,
  trend: TrendingUp,
  discussion: MessageSquare,
};

export const NewsfeedFilterBar = React.memo(
  ({ options, selected, onChange, testID = 'newsfeed-filter-bar' }: NewsfeedFilterBarProps) => {
    // Compute total count for ALL pill
    const totalCount = options.reduce((sum, option) => sum + option.count, 0);

    // ALL pill is always first
    const allPill = (
      <Pressable
        testID="filter-pill-all"
        onPress={() => {
          if (selected !== 'all') {
            onChange('all');
          }
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: selected === 'all' }}
      >
        {({ pressed }) => (
          <View
            className={cn(
              'rounded-full px-3 py-1.5 flex-row items-center gap-1.5',
              selected === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
              pressed && 'opacity-70'
            )}
          >
            <Text className="text-sm font-medium">ALL</Text>
            <View testID="filter-pill-all-count">
              <Text className="text-xs font-bold">{totalCount}</Text>
            </View>
          </View>
        )}
      </Pressable>
    );

    return (
      <ScrollView
        testID={testID}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-row gap-2"
        contentContainerClassName="px-4 py-2"
      >
        {allPill}
        {options.map((option) => {
          const isActive = selected === option.key;
          const Icon = ICON_MAP[option.key];

          return (
            <Pressable
              key={option.key}
              testID={`filter-pill-${option.key}`}
              onPress={() => {
                if (option.key !== selected) {
                  onChange(option.key);
                }
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
            >
              {({ pressed }) => (
                <View
                  className={cn(
                    'rounded-full px-3 py-1.5 flex-row items-center gap-1.5',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                    pressed && 'opacity-70'
                  )}
                >
                  {Icon && (
                    <Icon
                      size={14}
                      className={isActive ? 'text-primary-foreground' : 'text-muted-foreground'}
                    />
                  )}
                  <Text className="text-sm font-medium">{option.label}</Text>
                  <View testID={`filter-pill-${option.key}-count`}>
                    <Text className="text-xs font-bold">{option.count}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }
);

NewsfeedFilterBar.displayName = 'NewsfeedFilterBar';
