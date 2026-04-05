import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { ImprovementDetailView } from '@/components/improvements/ImprovementDetailView'
import { ImprovementActionMenu } from '@/components/improvements/ImprovementActionMenu'
import { ImprovementEditSheet } from '@/components/improvements/ImprovementEditSheet'
import { ArrowLeft, EllipsisVertical } from '@/components/ui/icons'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { useState } from 'react'

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

  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)

  const data = useQuery(api.improvements.queries.get, { id: requestId as any })

  const setStatusMutation = useMutation(api.improvements.mutations.setStatus)
  const updateMutation = useMutation(api.improvements.mutations.update)
  const removeMutation = useMutation(api.improvements.mutations.remove)

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/improvements')
    }
  }

  const handleToggleStatus = async () => {
    if (!requestId || !data) return
    const nextStatus = data.status === 'open' ? 'closed' : 'open'
    await setStatusMutation({ id: requestId as any, status: nextStatus })
  }

  const handleSaveEdit = async (title: string, description: string) => {
    if (!requestId) return
    await updateMutation({
      id: requestId as Id<'improvementRequests'>,
      title,
      description,
    })
    setEditSheetOpen(false)
  }

  const handleDelete = async () => {
    if (!requestId) return
    await removeMutation({ id: requestId as Id<'improvementRequests'> })
    setActionMenuOpen(false)
    router.back()
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
        <Pressable
          onPress={() => setActionMenuOpen(true)}
          style={{ padding: theme.spacing.sm }}
          testID="improvement-detail-menu-button"
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <EllipsisVertical size={24} color={theme.colors.foreground} />
        </Pressable>
      </View>

      <ImprovementDetailView
        request={request}
        images={images}
        onToggleStatus={handleToggleStatus}
        testID="improvement-detail-view"
      />

      <ImprovementActionMenu
        open={actionMenuOpen}
        onClose={() => setActionMenuOpen(false)}
        onEdit={() => {
          setActionMenuOpen(false)
          setEditSheetOpen(true)
        }}
        onDelete={handleDelete}
        testID="improvement-detail-action-menu"
      />

      {editSheetOpen && (
        <ImprovementEditSheet
          visible={editSheetOpen}
          onClose={() => setEditSheetOpen(false)}
          onSave={handleSaveEdit}
          initialTitle={request.title ?? ''}
          initialDescription={request.description}
          testID="improvement-detail-edit-sheet"
        />
      )}
    </SafeAreaView>
  )
}
