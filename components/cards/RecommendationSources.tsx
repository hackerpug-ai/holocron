import { View, Pressable, Linking } from 'react-native'
import { Text } from '@/components/ui/text'
import type { RecommendationSourcesProps } from './types/recommendation'

export function RecommendationSources({ sources, onSourcePress }: RecommendationSourcesProps) {
  if (sources.length === 0) return null

  return (
    <View testID="recommendation-list-sources" className="mt-2 border-t border-border pt-2 px-4 pb-2">
      <Text className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Sources</Text>
      <View className="flex-row flex-wrap gap-2">
        {sources.map((source, i) => {
          const handlePress = () => {
            if (onSourcePress) {
              onSourcePress(source)
            } else if (source.url) {
              Linking.openURL(source.url)
            }
          }

          return (
            <Pressable
              key={`${source.name}-${i}`}
              testID={`recommendation-source-${i}`}
              accessibilityRole="link"
              onPress={handlePress}
              disabled={!source.url && !onSourcePress}
            >
              <Text className="text-xs text-muted-foreground underline">{source.name}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
