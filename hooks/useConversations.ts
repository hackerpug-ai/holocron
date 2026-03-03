import { supabase } from '@/lib/supabase'
import type { Conversation } from '@/lib/types/conversations'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Supabase conversations table schema:
 *
 * CREATE TABLE conversations (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   title TEXT NOT NULL DEFAULT 'New Chat',
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   updated_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE TABLE messages (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
 *   role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
 *   content TEXT NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 */

// Re-export Conversation type for consumers
export type { Conversation }

export interface UseConversationsReturn {
  conversations: Conversation[]
  activeConversationId: string | null
  isLoading: boolean
  isCreating: boolean
  isRenaming: boolean
  isDeleting: boolean
  error: Error | null
  createConversation: () => Promise<string>
  switchConversation: (_id: string) => void
  renameConversation: (_id: string, _newTitle: string) => Promise<void>
  deleteConversation: (_id: string) => Promise<string | null>
  refetch: () => void
}

interface SupabaseConversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  messages?: Array<{ role: string; content: string; created_at: string }>
}

// Query key factory for conversations
const conversationsKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationsKeys.all, 'list'] as const,
  list: () => [...conversationsKeys.lists()] as const,
}

// Fetcher function for React Query
async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      messages(role, content, created_at)
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`)
  }

  if (!data) {
    return []
  }

  // Transform the data to get the last message for each conversation
  const transformedConversations: Conversation[] = (data as SupabaseConversation[]).map(
    (conv) => {
      const messages = conv.messages
      const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : undefined

      return {
        id: conv.id,
        title: conv.title,
        lastMessage: lastMessage?.content,
        lastMessageAt: lastMessage ? new Date(lastMessage.created_at) : undefined,
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at),
      }
    }
  )

  // Sort by most recent activity (last_message_at or updated_at)
  return transformedConversations.sort((a, b) => {
    const aTime = a.lastMessageAt?.getTime() ?? a.updatedAt.getTime()
    const bTime = b.lastMessageAt?.getTime() ?? b.updatedAt.getTime()
    return bTime - aTime
  })
}

export function useConversations(): UseConversationsReturn {
  const queryClient = useQueryClient()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Query for fetching conversations
  const {
    data: conversations = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: conversationsKeys.list(),
    queryFn: fetchConversations,
    staleTime: 0, // Always refetch on mount/window focus
  })

  // Mutation for creating a conversation
  const createMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ title: 'New Chat' })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create conversation: ${error.message}`)
      }

      if (!data) {
        throw new Error('No data returned from insert operation')
      }

      const newConversation = data as { id: string; title: string; created_at: string; updated_at: string }
      return newConversation.id
    },
    onMutate: async () => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: conversationsKeys.lists() })

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData<Conversation[]>(
        conversationsKeys.list()
      )

      // Create a temporary optimistic conversation with a placeholder ID
      const optimisticConversation: Conversation = {
        id: `temp-${Date.now()}`,
        title: 'New Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Optimistically add the new conversation at the top
      queryClient.setQueryData<Conversation[]>(conversationsKeys.list(), (old = []) => [
        optimisticConversation,
        ...old,
      ])

      return { previousConversations, optimisticId: optimisticConversation.id }
    },
    onError: (_err, _vars, context) => {
      // Rollback to previous value on error
      if (context?.previousConversations) {
        queryClient.setQueryData(conversationsKeys.list(), context.previousConversations)
      }
    },
    onSuccess: (newId, _vars, context) => {
      // Replace the optimistic conversation with the real one
      if (context?.optimisticId) {
        queryClient.setQueryData<Conversation[]>(conversationsKeys.list(), (old = []) =>
          old.map((c) =>
            c.id === context.optimisticId ? { ...c, id: newId } : c
          )
        )
      }
      // Invalidate to ensure we have the correct server state
      queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
    },
  })

  // Mutation for renaming a conversation
  const renameMutation = useMutation({
    mutationFn: async ({ id, newTitle }: { id: string; newTitle: string }): Promise<void> => {
      const trimmed = newTitle.trim()
      if (!trimmed) {
        throw new Error('Title cannot be empty')
      }

      const { error } = await supabase
        .from('conversations')
        .update({ title: trimmed, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        throw new Error(`Failed to rename conversation: ${error.message}`)
      }
    },
    onMutate: async ({ id, newTitle }) => {
      const trimmed = newTitle.trim()

      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: conversationsKeys.lists() })

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData<Conversation[]>(
        conversationsKeys.list()
      )

      // Optimistically update the conversation title
      queryClient.setQueryData<Conversation[]>(conversationsKeys.list(), (old = []) =>
        old.map((c) =>
          c.id === id ? { ...c, title: trimmed, updatedAt: new Date() } : c
        )
      )

      return { previousConversations }
    },
    onError: (_err, _vars, context) => {
      // Rollback to previous value on error
      if (context?.previousConversations) {
        queryClient.setQueryData(conversationsKeys.list(), context.previousConversations)
      }
    },
    onSuccess: () => {
      // Invalidate to ensure we have the correct server state
      queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
    },
  })

  // Mutation for deleting a conversation
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('conversations').delete().eq('id', id)

      if (error) {
        throw new Error(`Failed to delete conversation: ${error.message}`)
      }
    },
    onMutate: async (id) => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: conversationsKeys.lists() })

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData<Conversation[]>(
        conversationsKeys.list()
      )

      // Optimistically update to the new value
      queryClient.setQueryData<Conversation[]>(conversationsKeys.list(), (old = []) =>
        old.filter((c) => c.id !== id)
      )

      // Return context with previous value and conversations
      return { previousConversations, oldConversations: previousConversations ?? [] }
    },
    onError: (_err, _id, context) => {
      // Rollback to previous value on error
      if (context?.previousConversations) {
        queryClient.setQueryData(conversationsKeys.list(), context.previousConversations)
      }
    },
    onSuccess: () => {
      // Refetch to ensure server state
      queryClient.invalidateQueries({ queryKey: conversationsKeys.lists() })
    },
  })

  const createConversation = async (): Promise<string> => {
    return createMutation.mutateAsync()
  }

  const switchConversation = (id: string) => {
    setActiveConversationId(id)
  }

  const renameConversation = async (id: string, newTitle: string): Promise<void> => {
    await renameMutation.mutateAsync({ id, newTitle })
  }

  const deleteConversation = async (id: string): Promise<string | null> => {
    const isDeletingActive = id === activeConversationId

    // Get remaining conversations before deletion
    const remaining = conversations.filter((c) => c.id !== id)

    if (isDeletingActive) {
      if (remaining.length === 0) {
        // Create new conversation if last one deleted
        await deleteMutation.mutateAsync(id)
        const newId = await createConversation()
        setActiveConversationId(newId)
        return newId
      }
      // Switch to most recent remaining conversation
      const next = remaining[0]
      setActiveConversationId(next.id)
      await deleteMutation.mutateAsync(id)
      return next.id
    }

    await deleteMutation.mutateAsync(id)
    return null
  }

  return {
    conversations,
    activeConversationId,
    isLoading,
    isCreating: createMutation.isPending,
    isRenaming: renameMutation.isPending,
    isDeleting: deleteMutation.isPending,
    error: error ?? null,
    createConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    refetch: () => refetch(),
  }
}
