import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState, useMemo } from 'react'
import { ActivityIndicator, ScrollView, View, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { MarkdownView } from '@/components/markdown/MarkdownView'
import { useWebView } from '@/hooks/useWebView'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { CategoryBadge } from '@/components/CategoryBadge'
import { getDocument, type DocumentCategory } from '@/lib/supabase'
import { mapDocumentCategoryToCategoryType } from '@/hooks/useDocuments'
import { useTheme } from '@/hooks/use-theme'
import { sanitizeMarkdown, isValidUrl } from '@/lib/sanitizeMarkdown'

interface DocumentData {
  id: number
  title: string
  content: string
  category: string
  date: string
  time?: string
  research_type?: string
}

/**
 * Standalone document viewer route.
 * Displays a full document without the chat interface.
 *
 * Route: /document/[id]
 */
export default function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const theme = useTheme()
  const { openUrl } = useWebView()

  const [document, setDocument] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDocument() {
      if (!id) {
        setError('No document ID provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const docId = parseInt(id, 10)
        if (isNaN(docId)) {
          setError('Invalid document ID')
          setLoading(false)
          return
        }

        const doc = await getDocument(docId)

        if (doc) {
          setDocument({
            id: doc.id,
            title: doc.title,
            content: doc.content || '',
            category: doc.category || 'general',
            date: doc.created_at || doc.date || new Date().toISOString(),
            time: doc.time,
            research_type: doc.research_type,
          })
        } else {
          setError('Document not found')
        }
      } catch (err) {
        console.error('Failed to fetch document:', err)
        setError('Failed to load document')
      } finally {
        setLoading(false)
      }
    }

    fetchDocument()
  }, [id])

  // Sanitize markdown content
  const sanitizedContent = useMemo(
    () => (document ? sanitizeMarkdown(document.content) : ''),
    [document?.content]
  )

  // Handle link press with URL validation - opens in in-app WebView
  const handleLinkPress = (url: string): boolean => {
    if (!isValidUrl(url)) {
      console.warn('[DocumentRoute] Blocked unsafe URL:', url)
      return false
    }
    openUrl(url)
    return true
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      gap: theme.spacing.md,
    },
    backButton: {
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.foreground,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing['2xl'],
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    metadataRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    researchTypeBadge: {
      backgroundColor: theme.colors.muted,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      borderRadius: theme.radius.md,
    },
  })

  // Format date/time
  const formatDateTime = () => {
    if (!document) return { date: '', time: '' }
    const dateObj = new Date(document.date)
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const formattedTime = document.time
      ? new Date(document.time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : dateObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
    return { date: formattedDate, time: formattedTime }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Loading...
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading document...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error || !document) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Error
          </Text>
        </View>
        <View style={styles.centered}>
          <Text className="text-destructive text-center text-lg">
            {error || 'Document not found'}
          </Text>
          <Button onPress={() => router.back()} className="mt-4">
            <Text>Go Back</Text>
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  const { date, time } = formatDateTime()

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} testID="document-back">
          <ArrowLeft size={24} color={theme.colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {document.title}
        </Text>
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.scrollContent} testID="document-scroll">
        {/* Title */}
        <Text className="text-foreground mb-4 text-2xl font-bold leading-tight">
          {document.title}
        </Text>

        {/* Metadata Row */}
        <View style={styles.metadataRow}>
          <CategoryBadge
            category={mapDocumentCategoryToCategoryType(document.category as DocumentCategory)}
          />
          <Text className="text-muted-foreground text-sm">
            {date} at {time}
          </Text>
          {document.research_type && (
            <View style={styles.researchTypeBadge}>
              <Text className="text-foreground text-xs">{document.research_type}</Text>
            </View>
          )}
        </View>

        {/* Markdown Content */}
        <MarkdownView
          content={sanitizedContent}
          onLinkPress={handleLinkPress}
          testID="document-markdown"
        />
      </ScrollView>
    </SafeAreaView>
  )
}
