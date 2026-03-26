import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from '@/components/ui/text'
import { CheckCircle2, XCircle } from 'lucide-react-native'
import { useTheme } from '@/hooks/use-theme'

type AddToolParams = {
  title: string
  description: string
  category: string
  sourceUrl: string
  sourceType: string
  language?: string
  tags?: string
  useCases?: string
}

export default function ToolbeltAddScreen() {
  const params = useLocalSearchParams<AddToolParams>()
  const router = useRouter()
  const { colors, spacing } = useTheme()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [toolTitle, setToolTitle] = useState('')

  const addTool = useMutation(api.toolbelt.mutations.addFromUrl)

  useEffect(() => {
    async function addToolFromParams() {
      try {
        // Validate required params
        if (!params.title || !params.description || !params.category ||
            !params.sourceUrl || !params.sourceType) {
          throw new Error('Missing required parameters')
        }

        const result = await addTool({
          title: params.title,
          description: params.description,
          category: params.category as any,
          sourceUrl: params.sourceUrl,
          sourceType: params.sourceType as any,
          language: params.language,
          tags: params.tags,
          useCases: params.useCases,
        })

        setToolTitle(params.title)

        if (result.success) {
          setStatus('success')
          setMessage(result.isNew
            ? 'Added to your toolbelt!'
            : 'Already in your toolbelt'
          )

          // Auto-dismiss after 2 seconds
          setTimeout(() => {
            router.back()
          }, 2000)
        }
      } catch (error) {
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Failed to add tool')
      }
    }

    addToolFromParams()
  }, [params, addTool, router])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Pressable
        onPress={() => router.back()}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}
      >
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-muted-foreground mt-4 text-center">
              Adding to your toolbelt...
            </Text>
          </>
        )}

        {status === 'success' && (
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.success + '20',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CheckCircle2 size={32} color={colors.success} />
            </View>
            <Text className="text-foreground text-center text-xl font-semibold">
              {toolTitle}
            </Text>
            <Text className="text-muted-foreground text-center">
              {message}
            </Text>
          </View>
        )}

        {status === 'error' && (
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.destructive + '20',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <XCircle size={32} color={colors.destructive} />
            </View>
            <Text className="text-destructive text-center text-lg font-semibold">
              Error
            </Text>
            <Text className="text-muted-foreground text-center">
              {message}
            </Text>
            <Text className="text-muted-foreground text-sm">
              Tap anywhere to close
            </Text>
          </View>
        )}
      </Pressable>
    </SafeAreaView>
  )
}
