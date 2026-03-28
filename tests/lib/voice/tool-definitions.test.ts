import { describe, it, expect } from 'vitest'
import {
  getToolDefinitions,
  getToolByName,
  TOOL_NAMES,
} from '@/lib/voice/tool-definitions'

describe('toolDefinitions', () => {
  // AC-1: getToolDefinitions() returns array of 11 tool objects
  it('returns 11 tool objects each with type, name, description, and parameters fields', () => {
    const tools = getToolDefinitions()

    expect(tools).toHaveLength(11)

    for (const tool of tools) {
      expect(tool).toHaveProperty('type', 'function')
      expect(tool).toHaveProperty('name')
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(tool).toHaveProperty('description')
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool).toHaveProperty('parameters')
      expect(tool.parameters).toHaveProperty('type', 'object')
      expect(tool.parameters).toHaveProperty('properties')
    }
  })

  // AC-2: search_knowledge tool has required 'query' parameter
  it('search_knowledge has required query parameter of type string with description', () => {
    const tools = getToolDefinitions()
    const searchTool = tools.find((t) => t.name === 'search_knowledge')

    expect(searchTool).toBeDefined()
    expect(searchTool!.parameters.properties).toHaveProperty('query')

    const queryParam = searchTool!.parameters.properties.query as {
      type: string
      description: string
    }
    expect(queryParam.type).toBe('string')
    expect(typeof queryParam.description).toBe('string')
    expect(queryParam.description.length).toBeGreaterThan(0)

    expect(searchTool!.parameters.required).toContain('query')
  })

  // AC-3: Combined size of all tool definitions with instructions is under 16,384 tokens
  it('token budget: combined size of tool definitions with instructions is under 16,384 tokens', () => {
    const tools = getToolDefinitions()
    const toolsJson = JSON.stringify(tools)

    // Approximate token count: ~4 chars per token is conservative
    const CHARS_PER_TOKEN = 4
    const MAX_TOKENS = 16_384
    const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN

    // Instructions from 02-session-config.md
    const instructions =
      "You are the Holocron voice assistant. You help users search their knowledge base, manage tasks, check on research, and navigate the app. Before calling any function tool, briefly announce what you're about to do. When a function call is pending and the user asks about it, say you're still waiting on the result."

    const combined = toolsJson + instructions
    expect(combined.length).toBeLessThan(MAX_CHARS)
  })

  // AC-4: Invalid tool name lookup returns undefined or throws descriptive error
  it('unknown tool: returns undefined when looking up an invalid tool name', () => {
    const result = getToolByName('nonexistent_tool_xyz')
    expect(result).toBeUndefined()
  })

  it('all P0 tool names are present in TOOL_NAMES', () => {
    const required = [
      'search_knowledge',
      'list_recent_documents',
      'get_document',
      'get_conversations',
      'get_research_sessions',
      'get_improvements',
      'check_agent_status',
      'start_research',
      'submit_improvement',
      'create_note',
      'navigate_app',
    ]

    for (const name of required) {
      expect(TOOL_NAMES).toContain(name)
    }
  })
})
