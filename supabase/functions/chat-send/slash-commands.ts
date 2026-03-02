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

// ============================================================
// Supported Commands (Single Source of Truth)
// ============================================================

export const SUPPORTED_COMMANDS: SlashCommand[] = [
  { name: 'search', description: 'Search the knowledge base', syntax: '<query>' },
  { name: 'research', description: 'Start a research workflow', syntax: '<question>' },
  { name: 'deep-research', description: 'Multi-iteration deep research', syntax: '<question>' },
  { name: 'browse', description: 'Browse recent articles' },
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
