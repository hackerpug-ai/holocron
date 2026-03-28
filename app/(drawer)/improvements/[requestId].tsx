import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from '@/convex/_generated/api'
import { ImprovementDetailView } from '@/components/improvements/ImprovementDetailView'
import { ArrowLeft } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

/**
 * Improvement Request Detail Screen
 *
 * Displays the full details of an improvement request including:
 * - Status badge and timeline
 * - Description and agent summary
 * - Screenshots
 * - Agent decision with approve/reject/keep-separate actions
 *
 * Route: /improvements/[requestId]
 */
export default function ImprovementDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>()
  const router = useRouter()
  const theme = useTheme()

  const data = useQuery(api.improvements.queries.get, { id: requestId as any })

  const approve = useMutation(api.improvements.mutations.approve)
  const reject = useMutation(api.improvements.mutations.reject)
  const requestSeparate = useMutation(api.improvements.mutations.requestSeparate)

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/improvements')
    }
  }

  const handleApprove = async () => {
    if (!requestId) return
    await approve({ id: requestId as any })
  }

  const handleReject = async (feedback?: string) => {
    if (!requestId) return
    await reject({ id: requestId as any, userFeedback: feedback })
  }

  const handleRequestSeparate = async () => {
    if (!requestId) return
    await requestSeparate({ id: requestId as any })
  }

  // Loading state: data is undefined while the query is in-flight
  if (data === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: theme.spacing.sm }}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.foreground }}>
            Loading...
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text className="text-muted-foreground mt-4">Loading improvement request...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Error / not-found state: data is null when the query resolved but found nothing
  if (data === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            gap: theme.spacing.md,
          }}
        >
          <Pressable onPress={handleBack} style={{ padding: theme.spacing.sm }}>
            <ArrowLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.foreground }}>
            Error
          </Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
          <Text className="text-destructive text-center text-lg mb-4">
            Request not found
          </Text>
          <Button onPress={handleBack}>
            <Text>Go Back</Text>
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  // Extract images from the combined response and pass separately to the view
  const { images, ...request } = data

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.md,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{ padding: theme.spacing.sm }}
          testID="improvement-detail-back-button"
        >
          <ArrowLeft size={24} color={theme.colors.foreground} />
        </Pressable>
        <Text
          style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.colors.foreground }}
          numberOfLines={1}
        >
          {request.title ?? 'Improvement Request'}
        </Text>
      </View>

      <ImprovementDetailView
        request={request}
        images={images}
        onApprove={handleApprove}
        onReject={handleReject}
        onRequestSeparate={handleRequestSeparate}
        testID="improvement-detail-view"
      />
    </SafeAreaView>
  )
}
