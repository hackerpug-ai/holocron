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
  total_documents: number
  category_breakdown: CategoryBreakdown[]
  recent_documents: RecentDocument[]
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
      .from('articles')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Error fetching total count:', countError)
      throw countError
    }

    // Query category breakdown
    const { data: categories, error: categoriesError } = await supabase
      .from('articles')
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
      .from('articles')
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
      total_documents: totalCount || 0,
      category_breakdown: categoryBreakdown,
      recent_documents: recentDocuments,
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
