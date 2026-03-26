import { ToolbeltScreen, type Tool } from '@/screens/toolbelt-screen'
import { ScreenLayout } from '@/components/ui/screen-layout'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { useRouter } from 'expo-router'

/**
 * Toolbelt route - displays searchable, filterable list of tools
 * Connected to Convex toolbeltTools table
 * Inside (drawer) group so the navigation drawer remains accessible
 */
export default function ToolbeltRoute() {
  const router = useRouter()

  // Fetch tools from Convex
  const toolsData = useQuery(api.toolbelt.queries.list, { limit: 100 })
  const isLoading = toolsData === undefined

  // Map Convex documents to Tool interface
  const tools = (toolsData ?? []).map((tool: Doc<'toolbeltTools'>) => ({
    _id: tool._id,
    title: tool.title,
    description: tool.description,
    content: tool.content,
    category: tool.category,
    status: tool.status,
    sourceUrl: tool.sourceUrl,
    sourceType: tool.sourceType,
    tags: tool.tags,
    useCases: tool.useCases,
    keywords: tool.keywords,
    language: tool.language,
    date: tool.date,
    time: tool.time,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  }))

  const handleToolPress = (tool: Tool) => {
    if (tool.sourceUrl) {
      router.push(`/webview/${encodeURIComponent(tool.sourceUrl)}`)
    }
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
        title: 'Toolbelt',
        showBack: true,
        onBack: handleBack,
      }}
      edges="bottom"
      testID="toolbelt-route-layout"
    >
      <ToolbeltScreen
        tools={tools}
        isLoading={isLoading}
        onToolPress={handleToolPress}
      />
    </ScreenLayout>
  )
}
