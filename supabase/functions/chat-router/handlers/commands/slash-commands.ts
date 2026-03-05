/**
 * Slash Command Parser
 *
 * Provides parsing and validation utilities for slash commands in chat messages.
 * This module is used by the chat-send Edge Function to detect and parse slash commands.
 *
 * @see US-019 - Build slash command parser in chat-send Edge Function
 * @see PRD SS05 UC-CI-02 - Use Slash Commands
 */

// ============================================================
// Types
// ============================================================

export interface SlashCommand {
  name: string
  description: string
  syntax?: string
}

export interface ParsedCommand {
  isCommand: boolean
  command?: string
  args?: string
}

export interface CategoryBreakdown {
  category: string
  count: number
}

export interface RecentDocument {
  id: number
  title: string
  date: string
}

export interface StatsCardData {
  card_type: 'stats'
  total_count: number
  category_breakdown: CategoryBreakdown[]
  recent_count?: number
}

export interface DeepResearchConfirmationCardData {
  card_type: 'deep_research_confirmation'
  session_id: string
  topic: string
  max_iterations: number
}

export interface ResumeSession {
  id: string
  topic: string
  status: string
  created_at: string
  updated_at: string
  max_iterations: number
  current_iteration?: number
}

export interface ResumeSessionListCardData {
  card_type: 'resume_session_list'
  sessions: ResumeSession[]
}

// ============================================================
// Supported Commands (Single Source of Truth)
// ============================================================

// Valid document categories (must match database enum)
export const VALID_CATEGORIES = [
  'architecture',
  'business',
  'competitors',
  'frameworks',
  'infrastructure',
  'libraries',
  'patterns',
  'platforms',
  'security',
  'research',
] as const

export type DocumentCategory = (typeof VALID_CATEGORIES)[number]

export const SUPPORTED_COMMANDS: SlashCommand[] = [
  { name: 'search', description: 'Search the knowledge base', syntax: '<query>' },
  { name: 'research', description: 'Start a research workflow', syntax: '<question>' },
  { name: 'deep-research', description: 'Multi-iteration deep research', syntax: '<question>' },
  { name: 'browse', description: 'Browse articles by category', syntax: '[category]' },
  { name: 'stats', description: 'View knowledge base statistics' },
  { name: 'resume', description: 'Resume a previous research session', syntax: '<id>' },
  { name: 'cancel', description: 'Cancel active deep research session' },
  { name: 'help', description: 'Show all available commands' },
]

// ============================================================
// Parser Functions
// ============================================================

/**
 * Parse a message string to detect and extract slash command components
 *
 * @param content - The message content to parse
 * @returns ParsedCommand object with isCommand flag, command name, and args
 *
 * @example
 * parseSlashCommand('/search AI transformers')
 * // => { isCommand: true, command: 'search', args: 'AI transformers' }
 *
 * @example
 * parseSlashCommand('Hello world')
 * // => { isCommand: false }
 */
export function parseSlashCommand(content: string): ParsedCommand {
  const trimmed = content.trim()
  if (!trimmed.startsWith('/')) {
    return { isCommand: false }
  }
  const [command, ...argParts] = trimmed.slice(1).split(' ')
  return {
    isCommand: true,
    command: command.toLowerCase(),
    args: argParts.join(' ').trim() || undefined,
  }
}

/**
 * Check if a command name exists in SUPPORTED_COMMANDS
 *
 * @param command - The command name to validate (should be lowercase)
 * @returns true if command is supported, false otherwise
 *
 * @example
 * isKnownCommand('search') // => true
 * isKnownCommand('unknown') // => false
 */
export function isKnownCommand(command: string): boolean {
  return SUPPORTED_COMMANDS.some((cmd) => cmd.name === command)
}

/**
 * Generate formatted help text listing all supported commands
 *
 * @returns Multi-line string with header and all commands with their descriptions
 *
 * @example
 * generateHelpResponse()
 * // => "Available commands:\n\n/search <query> - Search the knowledge base\n/research <question> - Start a research workflow\n..."
 */
export function generateHelpResponse(): string {
  const header = 'Available commands:\n\n'
  const commands = SUPPORTED_COMMANDS.map(
    (cmd) => `/${cmd.name}${cmd.syntax ? ' ' + cmd.syntax : ''} - ${cmd.description}`
  ).join('\n')
  return header + commands
}

/**
 * Generate stats card data for the /stats command
 *
 * This function queries the holocron knowledge base (external Supabase) to get:
 * - Total document count
 * - Category breakdown
 * - 5 most recent documents
 *
 * @param supabase - Supabase client instance
 * @returns StatsCardData object with stats information
 *
 * @example
 * const stats = await generateStatsResponse(supabase)
 * // => { card_type: 'stats', total_documents: 42, category_breakdown: [...], recent_documents: [...] }
 */
export async function generateStatsResponse(
  supabase: any
): Promise<{ content: string; message_type: string; card_data?: StatsCardData }> {
  try {
    // Query total count
    const { count: totalCount, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Error fetching total count:', countError)
      throw countError
    }

    // Query category breakdown
    const { data: categories, error: categoriesError } = await supabase
      .from('documents')
      .select('category')

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError)
      throw categoriesError
    }

    // Calculate category breakdown
    const categoryMap = new Map<string, number>()
    for (const article of categories || []) {
      const cat = article.category || 'uncategorized'
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1)
    }

    const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)

    // Query 5 most recent documents
    const { data: recentDocs, error: recentError } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    if (recentError) {
      console.error('Error fetching recent documents:', recentError)
      throw recentError
    }

    const recentDocuments: RecentDocument[] = (recentDocs || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      date: doc.created_at,
    }))

    const cardData: StatsCardData = {
      card_type: 'stats',
      total_count: totalCount || 0,
      category_breakdown: categoryBreakdown,
      recent_count: recentDocuments.length,
    }

    return {
      content: 'Here are your knowledge base statistics:',
      message_type: 'result_card',
      card_data: cardData,
    }
  } catch (error) {
    console.error('Error generating stats response:', error)
    return {
      content: 'Sorry, I couldn\'t retrieve your knowledge base statistics. Please try again later.',
      message_type: 'error',
    }
  }
}

// ============================================================
// Deep Research Command Types
// ============================================================

export interface DeepResearchCommandArgs {
  topic: string
  maxIterations: number
}

export interface DeepResearchParseError {
  success: false
  error: string
}

export interface DeepResearchParseSuccess {
  success: true
  topic: string
  maxIterations: number
}

export type DeepResearchParseResult = DeepResearchParseSuccess | DeepResearchParseError

// ============================================================
// Deep Research Command Parser
// ============================================================

/**
 * Parse /deep-research command arguments
 *
 * Extracts topic and optional flags:
 * - --max N: Set max iterations (default: 5)
 *
 * @param args - The arguments string after the command
 * @returns DeepResearchParseResult with parsed values or error
 *
 * @example
 * parseDeepResearchCommand('quantum computing')
 * // => { success: true, topic: 'quantum computing', maxIterations: 5 }
 *
 * @example
 * parseDeepResearchCommand('--max 3 topic')
 * // => { success: true, topic: 'topic', maxIterations: 3 }
 *
 * @example
 * parseDeepResearchCommand('')
 * // => { success: false, error: 'Please provide a topic' }
 */
export function parseDeepResearchCommand(args: string | undefined): DeepResearchParseResult {
  if (!args || args.trim() === '') {
    return { success: false, error: 'Please provide a topic' }
  }

  let maxIterations = 5 // Default value
  let topic = args.trim()

  // Parse --max flag
  const maxFlagMatch = topic.match(/--max\s+(\d+)/i)
  if (maxFlagMatch) {
    const parsedMax = parseInt(maxFlagMatch[1], 10)
    if (isNaN(parsedMax) || parsedMax < 1 || parsedMax > 10) {
      return { success: false, error: 'Max iterations must be between 1 and 10' }
    }
    maxIterations = parsedMax

    // Remove the --max flag from the topic
    topic = topic.replace(/--max\s+\d+\s*/i, '').trim()
  }

  // After removing flags, topic must not be empty
  if (topic === '') {
    return { success: false, error: 'Please provide a topic' }
  }

  return { success: true, topic, maxIterations }
}

/**
 * Handle /deep-research command
 *
 * Creates a deep research session in the database and returns a confirmation card.
 *
 * @param args - The arguments string after the command
 * @param supabase - Supabase client instance
 * @param conversationId - The conversation ID to associate with the session
 * @returns Agent response with confirmation card or error message
 *
 * @example
 * const response = await handleDeepResearchCommand('quantum computing', supabase, 'conv-123')
 * // => { content: '...', message_type: 'result_card', card_data: { card_type: 'deep_research_confirmation', ... } }
 */
export async function handleDeepResearchCommand(
  args: string | undefined,
  supabase: any,
  conversationId: string
): Promise<{
  content: string
  message_type: 'text' | 'result_card' | 'error'
  card_data?: DeepResearchConfirmationCardData
}> {
  // Parse the command
  const parseResult = parseDeepResearchCommand(args)

  if (!parseResult.success) {
    return {
      content: parseResult.error,
      message_type: 'error',
    }
  }

  const { topic, maxIterations } = parseResult

  try {
    // Invoke the deep-research-start Edge Function
    // It will create the research_session AND the long_running_task
    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/deep-research-start`
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!functionUrl || !supabaseKey) {
      console.error('Missing environment variables for deep-research-start')
      throw new Error('Missing environment configuration')
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        topic,
        max_iterations: maxIterations,
        conversation_id: conversationId,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('deep-research-start returned error:', errorText)
      throw new Error(`Failed to start deep research: ${errorText}`)
    }

    const result = await response.json()
    console.log('deep-research-start response:', result)

    const cardData: DeepResearchConfirmationCardData = {
      card_type: 'deep_research_confirmation',
      session_id: result.session_id,
      topic: topic,
      max_iterations: maxIterations,
    }

    return {
      content: `Deep research started for "${topic}"`,
      message_type: 'result_card',
      card_data: cardData,
    }
  } catch (error) {
    console.error('Error handling deep research command:', error)
    return {
      content: 'Sorry, I couldn\'t start the deep research session. Please try again later.',
      message_type: 'error',
    }
  }
}

// ============================================================
// Resume Command Handler
// ============================================================

// Re-export resume handler function for convenience
export {
  parseResumeCommand,
  getIncompleteSessions,
  getSessionById,
  restartSession,
  handleResumeCommand,
} from './resume-handler.ts'
// Note: ResumeSession, ResumeSessionListCardData types are already defined above

// ============================================================
// Cancel Command Handler
// ============================================================

// Re-export cancel handler types and function for convenience
export {
  getActiveSession,
  cancelSession,
  handleCancelCommand,
} from './cancel-handler.ts'
export type {
  CancelSession,
  CancelResponse,
} from './cancel-handler.ts'
