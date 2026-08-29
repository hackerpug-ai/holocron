import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { useCallback, useState } from 'react';
import {
  Pressable,
  Modal as RNModal,
  TextInput as RNTextInput,
  ScrollView,
  View,
} from 'react-native';
import { createImportedArticle } from '@/app/zero/articles';
import { appendDocumentImport } from '@/app/zero/platform';
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

const NEW_ARTICLE_OPTION = '__new_article__';

function titleFromMarkdown(markdown: string): string {
  const heading = markdown.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 160);
  const firstText = markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*>`#]+\s*/, '').trim())
    .find(Boolean);
  return (firstText || 'Imported article').slice(0, 160);
}

/**
 * ArticleImportModal - Modal for importing text from external AI platforms
 * Allows user to create a new article from Markdown or append to an existing one.
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
  const [selectedArticleId, setSelectedArticleId] = useState<string>(NEW_ARTICLE_OPTION);
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
      const content = textToImport.trim();
      if (selectedArticleId === NEW_ARTICLE_OPTION) {
        await createImportedArticle(titleFromMarkdown(content), content);
      } else {
        await appendDocumentImport(selectedArticleId, content);
      }

      setTextToImport('');
      setSelectedArticleId(NEW_ARTICLE_OPTION);
      onSuccess?.();
      onDismiss();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  }, [selectedArticleId, textToImport, onSuccess, onDismiss]);

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
              Paste Markdown to create a new article or append to an existing one.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold mb-2" style={{ color: themeColors.foreground }}>
              Import Destination
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
              <Pressable
                onPress={() => setSelectedArticleId(NEW_ARTICLE_OPTION)}
                style={{
                  padding: 12,
                  backgroundColor:
                    selectedArticleId === NEW_ARTICLE_OPTION ? themeColors.muted : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: themeColors.border,
                }}
                testID="article-option-new"
              >
                <Text className="text-base" style={{ color: themeColors.foreground }}>
                  Create new article
                </Text>
                <Text className="text-xs" style={{ color: themeColors.mutedForeground }}>
                  Uses the first Markdown heading as its title
                </Text>
              </Pressable>
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
