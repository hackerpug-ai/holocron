import { supabaseAdmin } from '@/lib/supabase'
import { useEffect, useState } from 'react'

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

export interface Conversation {
  id: string
  title: string
  lastMessage?: string
  lastMessageAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface UseConversationsReturn {
  conversations: Conversation[]
  activeConversationId: string | null
  isLoading: boolean
  error: Error | null
  createConversation: () => Promise<string>
  switchConversation: (id: string) => void
  refetch: () => Promise<void>
}

interface SupabaseConversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  messages?: Array<{ role: string; content: string; created_at: string }>
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchConversations = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch conversations with last message preview using a subquery
      const { data, error: fetchError } = await supabaseAdmin
        .from('conversations')
        .select(`
          id,
          title,
          created_at,
          updated_at,
          messages(role, content, created_at)
        `)
        .order('updated_at', { ascending: false })

      if (fetchError) {
        throw new Error(`Failed to fetch conversations: ${fetchError.message}`)
      }

      if (!data) {
        setConversations([])
        return
      }

      // Transform the data to get the last message for each conversation
      const transformedConversations: Conversation[] = (data as SupabaseConversation[]).map((conv) => {
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
      })

      // Sort by most recent activity (last_message_at or updated_at)
      const sortedConversations = transformedConversations.sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() ?? a.updatedAt.getTime()
        const bTime = b.lastMessageAt?.getTime() ?? b.updatedAt.getTime()
        return bTime - aTime
      })

      setConversations(sortedConversations)
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Unknown error occurred')
      setError(errorObj)
      setConversations([])
    } finally {
      setIsLoading(false)
    }
  }

  const createConversation = async (): Promise<string> => {
    try {
      // Insert new conversation with default title
      const { data, error: insertError } = await supabaseAdmin
        .from('conversations')
        .insert({ title: 'New Chat' })
        .select()
        .single()

      if (insertError) {
        throw new Error(`Failed to create conversation: ${insertError.message}`)
      }

      if (!data) {
        throw new Error('No data returned from insert operation')
      }

      const newConversation = data as { id: string; title: string; created_at: string; updated_at: string }

      // Refetch the list to include the new conversation
      await fetchConversations()

      return newConversation.id
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Unknown error occurred')
      setError(errorObj)
      throw errorObj
    }
  }

  const switchConversation = (id: string) => {
    setActiveConversationId(id)
  }

  useEffect(() => {
    fetchConversations()
  }, [])

  return {
    conversations,
    activeConversationId,
    isLoading,
    error,
    createConversation,
    switchConversation,
    refetch: fetchConversations,
  }
}
