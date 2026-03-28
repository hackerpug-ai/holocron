/**
 * Tool definitions for OpenAI Realtime API session.update.
 *
 * All P0 tools for the Holocron voice assistant.
 * Format follows the OpenAI Realtime API function calling spec.
 */

export type ToolParameterSchema = {
  type: string
  description: string
  enum?: string[]
}

export type ToolParameters = {
  type: 'object'
  properties: Record<string, ToolParameterSchema>
  required?: string[]
}

export type ToolDefinition = {
  type: 'function'
  name: string
  description: string
  parameters: ToolParameters
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'search_knowledge',
    description: "Search the user's knowledge base for documents and notes.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'list_recent_documents',
    description: 'List recently created or updated documents.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max number of results (default 10)' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_document',
    description: 'Get the full content of a specific document by ID.',
    parameters: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'The document ID to retrieve' },
      },
      required: ['document_id'],
    },
  },
  {
    type: 'function',
    name: 'get_conversations',
    description: 'Get recent chat conversations.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max number of conversations (default 5)' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_research_sessions',
    description: 'Get research sessions and their status.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max number of sessions (default 5)' },
      },
    },
  },
  {
    type: 'function',
    name: 'get_improvements',
    description: 'Get improvement requests and their status.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max number of improvements (default 5)' },
      },
    },
  },
  {
    type: 'function',
    name: 'check_agent_status',
    description: 'Check the status of an async agent task or research session.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The session or task ID to check' },
      },
      required: ['session_id'],
    },
  },
  {
    type: 'function',
    name: 'start_research',
    description: 'Start a new research session on a topic. May take up to 60 seconds.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The topic to research' },
      },
      required: ['topic'],
    },
  },
  {
    type: 'function',
    name: 'submit_improvement',
    description: 'Submit an improvement request. May take up to 30 seconds.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Description of the improvement' },
      },
      required: ['description'],
    },
  },
  {
    type: 'function',
    name: 'create_note',
    description: 'Create a new note in the knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the note' },
        content: { type: 'string', description: 'Content of the note' },
      },
      required: ['title', 'content'],
    },
  },
  {
    type: 'function',
    name: 'navigate_app',
    description: 'Navigate to a screen in the app.',
    parameters: {
      type: 'object',
      properties: {
        screen: {
          type: 'string',
          description: 'The screen to navigate to',
          enum: ['home', 'documents', 'conversations', 'research', 'improvements', 'settings'],
        },
      },
      required: ['screen'],
    },
  },
]

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name) as string[]

/**
 * Returns all tool definitions for OpenAI Realtime session.update.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS
}

/**
 * Looks up a tool definition by name.
 * Returns undefined if the name is not found.
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name)
}
