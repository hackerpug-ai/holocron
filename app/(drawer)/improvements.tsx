import { ImprovementsScreen } from '@/screens/improvements-screen'
import { ImprovementSubmitSheet } from '@/components/improvements/ImprovementSubmitSheet'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { Plus } from '@/components/ui/icons'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable } from 'react-native'

/**
 * Improvements route - displays searchable, filterable list of improvement requests.
 * Inside (drawer) group so the navigation drawer remains accessible.
 */
export default function ImprovementsRoute() {
  const router = useRouter()
  const [sheetVisible, setSheetVisible] = useState(false)

  const requestsData = useQuery(api.improvements.queries.list, { limit: 50 })
  const isLoading = requestsData === undefined

  const requests = (requestsData ?? []).map((req) => ({
    _id: req._id as string,
    title: req.title,
    description: req.description,
    status: req.status,
    createdAt: req.createdAt,
    // images are stored in a separate table; list query does not include them
    images: undefined,
    mergedFromIds: req.mergedFromIds as string[] | undefined,
  }))

  const handleRequestPress = (id: string) => {
    router.push(`/improvements/${id}`)
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.navigate('/chat/new')
    }
  }

  return (
    <ScreenLayout
      header={{
        title: 'Improvements',
        showBack: true,
        onBack: handleBack,
        rightContent: (
          <Pressable
            onPress={() => setSheetVisible(true)}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            testID="improvements-header-add-button"
            accessibilityRole="button"
            accessibilityLabel="Add improvement"
          >
            <Plus size={22} className="text-foreground" />
          </Pressable>
        ),
      }}
      edges="bottom"
      testID="improvements-route-layout"
    >
      <ImprovementsScreen
        requests={requests}
        isLoading={isLoading}
        onRequestPress={handleRequestPress}
      />

      <ImprovementSubmitSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        testID="improvements-screen-submit-sheet"
      />
    </ScreenLayout>
  )
}
