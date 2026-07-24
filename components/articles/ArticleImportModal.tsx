import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useCallback, useState } from 'react';
import {
  Pressable,
  Modal as RNModal,
  TextInput as RNTextInput,
  ScrollView,
  View,
} from 'react-native';
import { mutators } from '@/app/zero/mutators';
import { documentsByOwner } from '@/app/zero/queries';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';

export interface ArticleImportModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is dismissed */
  onDismiss: () => void;
  /** Callback when import is successful */
  onSuccess?: () => void;
  /** testID for testing */
  testID?: string;
}

type ZeroDocument = {
  id: string;
  title?: string | null;
  category?: string | null;
};

/**
 * ArticleImportModal - Modal for importing text from external AI platforms
 * Allows user to select an article and paste text to append
 *
 * Data plane: Zero query documentsByOwner + Zero mutator createImportDocument
 * (13-client-data-contract.yaml).
 */
export function ArticleImportModal({
  visible,
  onDismiss,
  onSuccess,
  testID = 'article-import-modal',
}: ArticleImportModalProps) {
  const { colors: themeColors, typography, spacing, radius } = useTheme();
  const zero = useZero();
  const [selectedArticleId, setSelectedArticleId] = useState<string>('');
  const [textToImport, setTextToImport] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const [rawArticles] = useZeroQuery(documentsByOwner());
  const articles = (rawArticles ?? []) as unknown as ZeroDocument[];

  const handleImport = useCallback(async () => {
    if (!selectedArticleId || !textToImport.trim()) {
      return;
    }

    setIsImporting(true);
    try {
      await zero.mutate(
        mutators.createImportDocument({
          documentId: selectedArticleId,
          source: 'manual',
          text: textToImport.trim(),
        })
      );

      setTextToImport('');
      setSelectedArticleId('');
      onSuccess?.();
      onDismiss();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  }, [selectedArticleId, textToImport, zero, onSuccess, onDismiss]);

  const canSubmit = selectedArticleId && textToImport.trim().length > 0 && !isImporting;

  if (!visible) return null;

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
          padding: spacing.xl - spacing.xs,
        }}
      >
        <View
          style={{
            backgroundColor: themeColors.background,
            borderRadius: radius.xl,
            padding: spacing.xl,
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
                  key={article.id}
                  onPress={() => setSelectedArticleId(article.id)}
                  style={{
                    padding: 12,
                    backgroundColor:
                      selectedArticleId === article.id ? themeColors.muted : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: themeColors.border,
                  }}
                  testID={`article-option-${article.id}`}
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
              <Text
                className="text-center text-base font-semibold"
                style={{ color: themeColors.foreground }}
              >
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
              testID="import-submit"
            >
              <Text
                className="text-center text-base font-semibold"
                style={{ color: themeColors.primaryForeground }}
              >
                {isImporting ? 'Importing...' : 'Import'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </RNModal>
  );
}
