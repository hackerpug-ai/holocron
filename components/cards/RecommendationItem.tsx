import { Pressable, Linking, Platform, View } from 'react-native'
import { Text } from '@/components/ui/text'
import type { RecommendationItemProps } from './types/recommendation'

const openPhone = async (raw: string, fallback?: (url: string) => void) => {
  const digits = raw.replace(/\D/g, '')
  const url = `tel:${digits}`
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url)
  } else {
    fallback?.(url)
  }
}

const openMaps = async (location: string, fallback?: (url: string) => void) => {
  const encoded = encodeURIComponent(location)
  const url = Platform.OS === 'ios' ? `maps:?q=${encoded}` : `geo:0,0?q=${encoded}`
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url)
  } else {
    fallback?.(url)
  }
}

const openWebsite = async (url: string, fallback?: (url: string) => void) => {
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url)
  } else {
    fallback?.(url)
  }
}

export function RecommendationItem({
  item,
  index = 0,
  onLongPress,
  onLinkingFallback,
}: RecommendationItemProps) {
  const contact = item.contacts?.[0]

  return (
    <Pressable
      testID={`recommendation-item-${index}`}
      delayLongPress={400}
      onLongPress={() => onLongPress?.(item)}
      className="p-4 border-b border-border active:bg-muted/50"
    >
      <Text className="text-base font-semibold text-foreground">{item.title}</Text>
      {item.subtitle && (
        <Text className="text-sm text-muted-foreground mt-0.5">{item.subtitle}</Text>
      )}
      {item.description && (
        <Text className="text-sm text-muted-foreground mt-1">{item.description}</Text>
      )}

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

      {item.tags && item.tags.length > 0 && (
        <View className="flex-row flex-wrap gap-1 mt-2">
          {item.tags.map((tag) => (
            <View key={tag} className="px-2 py-0.5 rounded bg-muted">
              <Text className="text-xs text-muted-foreground">{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}
