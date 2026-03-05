/**
 * Handler Exports
 *
 * Central export point for all chat-router handlers.
 * Import individual handler modules and re-export their functions.
 */

// Chat message handlers
export type { ChatSendRequest, ChatSendResponse } from './chat-send.ts'
export { handleChatSend } from './chat-send.ts'

// Conversation CRUD handlers
export type { Conversation } from './conversations.ts'
export {
  handleConversationsList,
  handleConversationsCreate,
  handleConversationsUpdate,
  handleConversationsDelete,
} from './conversations.ts'

// Deep research handlers
export type {
  StartRequest,
  StartResponse,
  IterateRequest,
  IterateResponse,
} from './deep-research.ts'
export {
  handleDeepResearchStart,
  handleDeepResearchIterate,
} from './deep-research.ts'
