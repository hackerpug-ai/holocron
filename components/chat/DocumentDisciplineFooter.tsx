import { View, Pressable, ActivityIndicator } from 'react-native'
import { Text } from '@/components/ui/text'
import { useRouter } from 'expo-router'

interface Props {
  savedDocumentId: string | null
  canSave: boolean
  isSaving?: boolean
  onSaveToKB?: () => void
}

export function DocumentDisciplineFooter({ savedDocumentId, canSave, isSaving, onSaveToKB }: Props) {
  const router = useRouter()

  if (!savedDocumentId && !canSave) return null

  return (
    <View testID="document-discipline-footer" className="flex-row items-center gap-2 mt-1 px-3">
      {savedDocumentId ? (
        <Pressable
          testID="document-discipline-open"
          onPress={() => router.push(`/articles/${savedDocumentId}`)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-xs text-muted-foreground">Saved to KB</Text>
          <Text className="text-xs text-primary font-medium">Open →</Text>
        </Pressable>
      ) : (
        <Pressable
          testID="document-discipline-save"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onSaveToKB}
          className="flex-row items-center gap-1"
        >
          {isSaving && <ActivityIndicator size="small" />}
          <Text className="text-xs text-primary font-medium">Save this to KB</Text>
        </Pressable>
      )}
    </View>
  )
}
