import { useState, useCallback } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  TextInput as RNTextInput,
  Modal as RNModal,
} from 'react-native'
import { Text } from '@/components/ui/text'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useTheme } from '@/hooks/use-theme'

export interface ArticleImportModalProps {
  /** Whether the modal is visible */
  visible: boolean
  /** Callback when modal is dismissed */
  onDismiss: () => void
  /** Callback when import is successful */
  onSuccess?: () => void
  /** testID for testing */
  testID?: string
}

/**
 * ArticleImportModal - Modal for importing text from external AI platforms
 * Allows user to select an article and paste text to append
 */
export function ArticleImportModal({
  visible,
  onDismiss,
  onSuccess,
  testID = 'article-import-modal',
}: ArticleImportModalProps) {
  const { colors: themeColors, typography } = useTheme()
  const [selectedArticleId, setSelectedArticleId] = useState<string>('')
  const [textToImport, setTextToImport] = useState<string>('')
  const [isImporting, setIsImporting] = useState(false)

  // Fetch all articles for the selector
  const listResult = useQuery(api.documents.queries.list, {})
  const articles = listResult?.documents ?? []
  const createImport = useMutation(api.imports.mutations.createImport)

  const handleImport = useCallback(async () => {
    if (!selectedArticleId || !textToImport.trim()) {
      return
    }

    setIsImporting(true)
    try {
      await createImport({
        documentId: selectedArticleId as any,
        source: 'manual', // User manually imported via modal
        text: textToImport.trim(),
      })

      // Reset form
      setTextToImport('')
      setSelectedArticleId('')

      // Notify success
      onSuccess?.()
      onDismiss()
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }, [selectedArticleId, textToImport, createImport, onSuccess, onDismiss])

  const canSubmit = selectedArticleId && textToImport.trim().length > 0 && !isImporting

  if (!visible) return null

  return (
    <RNModal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDismiss}
      testID={testID}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: themeColors.background,
            borderRadius: 12,
            padding: 24,
            width: '100%',
            maxHeight: '80%',
          }}
        >
          <View className="mb-4">
            <Text className="text-xl font-bold mb-2" style={{ color: themeColors.foreground }}>
              Import Text
            </Text>
            <Text className="text-sm" style={{ color: themeColors.mutedForeground }}>
              Paste text from ChatGPT, Claude, or any other source to add to an article.
            </Text>
          </View>

          {/* Article Selector */}
          <View className="mb-4">
            <Text className="text-sm font-semibold mb-2" style={{ color: themeColors.foreground }}>
              Select Article
            </Text>
            <ScrollView
              style={{
                maxHeight: 150,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: themeColors.border,
                borderRadius: 8,
              }}
            >
              {articles?.map((article) => (
                <Pressable
                  key={article._id}
                  onPress={() => setSelectedArticleId(article._id)}
                  style={{
                    padding: 12,
                    backgroundColor:
                      selectedArticleId === article._id ? themeColors.muted : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: themeColors.border,
                  }}
                  testID={`article-option-${article._id}`}
                >
                  <Text className="text-base" style={{ color: themeColors.foreground }}>
                    {article.title}
                  </Text>
                  <Text className="text-xs" style={{ color: themeColors.mutedForeground }}>
                    {article.category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Text Input */}
          <View className="mb-4">
            <Text className="text-sm font-semibold mb-2" style={{ color: themeColors.foreground }}>
              Text to Import
            </Text>
            <RNTextInput
              style={{
                borderWidth: 1,
                borderColor: themeColors.border,
                borderRadius: 8,
                padding: 12,
                minHeight: 150,
                textAlignVertical: 'top',
                fontSize: typography.body.fontSize,
                color: themeColors.foreground,
                backgroundColor: themeColors.background,
              }}
              placeholder="Paste your text here... Markdown formatting is preserved."
              placeholderTextColor={themeColors.mutedForeground}
              value={textToImport}
              onChangeText={setTextToImport}
              multiline
              testID="import-text-input"
            />
          </View>

          {/* Actions */}
          <View className="flex-row gap-2">
            <Pressable
              onPress={onDismiss}
              disabled={isImporting}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: themeColors.border,
                backgroundColor: 'transparent',
                opacity: isImporting ? 0.5 : 1,
              }}
            >
              <Text className="text-center text-base font-semibold" style={{ color: themeColors.foreground }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleImport}
              disabled={!canSubmit}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                backgroundColor: canSubmit ? themeColors.primary : themeColors.muted,
                opacity: canSubmit ? 1 : 0.5,
              }}
            >
              <Text className="text-center text-base font-semibold" style={{ color: themeColors.primaryForeground }}>
                {isImporting ? 'Importing...' : 'Import'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </RNModal>
  )
}
