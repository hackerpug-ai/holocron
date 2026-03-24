import { ToolbeltScreen } from '@/screens/toolbelt-screen'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { useRouter } from 'expo-router'
import { log } from '@/lib/logger-client'
import * as Linking from 'expo-linking'

/**
 * Toolbelt route - displays searchable, filterable list of tools
 * Connected to Convex toolbeltTools table
 * Inside (drawer) group so the navigation drawer remains accessible
 */
export default function ToolbeltRoute() {
  const _router = useRouter()

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

  const handleToolPress = (tool: typeof tools[0]) => {
    if (tool.sourceUrl) {
      Linking.openURL(tool.sourceUrl).catch((err) => {
        log('ToolbeltRoute').error('Failed to open URL', err, { url: tool.sourceUrl })
      })
    }
  }

  return (
    <ToolbeltScreen
      tools={tools}
      isLoading={isLoading}
      onToolPress={handleToolPress}
    />
  )
}
