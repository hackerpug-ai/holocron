/**
 * Unit tests for slash command parser
 *
 * @see US-019 - Build slash command parser in chat-send Edge Function
 */

import {
  parseSlashCommand,
  isKnownCommand,
  generateHelpResponse,
  parseDeepResearchCommand,
  SUPPORTED_COMMANDS,
} from './slash-commands.ts'

// ============================================================
// Test: parseSlashCommand
// ============================================================

Deno.test('parseSlashCommand: detects slash command with args', () => {
  const result = parseSlashCommand('/search AI transformers')
  if (!result.isCommand) throw new Error('Expected isCommand to be true')
  if (result.command !== 'search') throw new Error(`Expected command to be 'search', got ${result.command}`)
  if (result.args !== 'AI transformers') throw new Error(`Expected args to be 'AI transformers', got ${result.args}`)
})

Deno.test('parseSlashCommand: detects slash command without args', () => {
  const result = parseSlashCommand('/help')
  if (!result.isCommand) throw new Error('Expected isCommand to be true')
  if (result.command !== 'help') throw new Error(`Expected command to be 'help', got ${result.command}`)
  if (result.args !== undefined) throw new Error(`Expected args to be undefined, got ${result.args}`)
})

Deno.test('parseSlashCommand: handles command with leading/trailing spaces', () => {
  const result = parseSlashCommand('  /stats  ')
  if (!result.isCommand) throw new Error('Expected isCommand to be true')
  if (result.command !== 'stats') throw new Error(`Expected command to be 'stats', got ${result.command}`)
})

Deno.test('parseSlashCommand: converts command to lowercase', () => {
  const result = parseSlashCommand('/SEARCH test')
  if (!result.isCommand) throw new Error('Expected isCommand to be true')
  if (result.command !== 'search') throw new Error(`Expected command to be lowercase 'search', got ${result.command}`)
})

Deno.test('parseSlashCommand: detects non-command regular text', () => {
  const result = parseSlashCommand('Hello world')
  if (result.isCommand) throw new Error('Expected isCommand to be false for regular text')
  if (result.command !== undefined) throw new Error('Expected command to be undefined')
  if (result.args !== undefined) throw new Error('Expected args to be undefined')
})

Deno.test('parseSlashCommand: detects non-command text containing slash in middle', () => {
  const result = parseSlashCommand('Hello / world')
  if (result.isCommand) throw new Error('Expected isCommand to be false when slash is not at start')
})

Deno.test('parseSlashCommand: handles multiple spaces in args', () => {
  const result = parseSlashCommand('/research  what is   machine learning')
  if (!result.isCommand) throw new Error('Expected isCommand to be true')
  if (result.command !== 'research') throw new Error(`Expected command to be 'research', got ${result.command}`)
  if (result.args !== 'what is   machine learning') throw new Error(`Expected args to preserve internal spaces, got ${result.args}`)
})

// ============================================================
// Test: isKnownCommand
// ============================================================

Deno.test('isKnownCommand: returns true for search command', () => {
  if (!isKnownCommand('search')) throw new Error('Expected search to be a known command')
})

Deno.test('isKnownCommand: returns true for help command', () => {
  if (!isKnownCommand('help')) throw new Error('Expected help to be a known command')
})

Deno.test('isKnownCommand: returns true for deep-research command', () => {
  if (!isKnownCommand('deep-research')) throw new Error('Expected deep-research to be a known command')
})

Deno.test('isKnownCommand: returns false for unknown command', () => {
  if (isKnownCommand('unknown')) throw new Error('Expected unknown to not be a known command')
})

Deno.test('isKnownCommand: returns false for empty string', () => {
  if (isKnownCommand('')) throw new Error('Expected empty string to not be a known command')
})

// ============================================================
// Test: generateHelpResponse
// ============================================================

Deno.test('generateHelpResponse: includes header "Available commands:"', () => {
  const helpText = generateHelpResponse()

  if (!helpText.startsWith('Available commands:')) {
    throw new Error('Expected help text to start with "Available commands:"')
  }
})

Deno.test('generateHelpResponse: includes all supported commands', () => {
  const helpText = generateHelpResponse()

  // Check all commands are present
  for (const cmd of SUPPORTED_COMMANDS) {
    if (!helpText.includes(`/${cmd.name}`)) {
      throw new Error(`Expected help text to include /${cmd.name}`)
    }
    if (!helpText.includes(cmd.description)) {
      throw new Error(`Expected help text to include description: ${cmd.description}`)
    }
  }
})

Deno.test('generateHelpResponse: formats commands with syntax when available', () => {
  const helpText = generateHelpResponse()

  // Check that search command includes its syntax
  if (!helpText.includes('/search <query>')) {
    throw new Error('Expected help text to include /search with syntax')
  }
})

Deno.test('generateHelpResponse: formats commands without syntax when unavailable', () => {
  const helpText = generateHelpResponse()

  // Check that browse command doesn't have extra syntax
  if (!helpText.includes('/browse -')) {
    throw new Error('Expected help text to include /browse without syntax placeholder')
  }
})

// ============================================================
// Test: SUPPORTED_COMMANDS
// ============================================================

Deno.test('SUPPORTED_COMMANDS: contains exactly 7 commands', () => {
  if (SUPPORTED_COMMANDS.length !== 7) {
    throw new Error(`Expected 7 commands, got ${SUPPORTED_COMMANDS.length}`)
  }
})

Deno.test('SUPPORTED_COMMANDS: includes required commands', () => {
  const requiredCommands = ['search', 'research', 'deep-research', 'browse', 'stats', 'resume', 'help']
  const actualCommands = SUPPORTED_COMMANDS.map(cmd => cmd.name)

  for (const required of requiredCommands) {
    if (!actualCommands.includes(required)) {
      throw new Error(`Expected SUPPORTED_COMMANDS to include ${required}`)
    }
  }
})

// ============================================================
// Test: parseDeepResearchCommand
// ============================================================

Deno.test('parseDeepResearchCommand: extracts topic with default max_iterations', () => {
  const result = parseDeepResearchCommand('quantum computing')
  if (!result.success) throw new Error('Expected success to be true')
  if (result.topic !== 'quantum computing') throw new Error(`Expected topic to be 'quantum computing', got ${result.topic}`)
  if (result.maxIterations !== 5) throw new Error(`Expected maxIterations to be 5, got ${result.maxIterations}`)
})

Deno.test('parseDeepResearchCommand: parses --max flag with topic', () => {
  const result = parseDeepResearchCommand('--max 3 topic')
  if (!result.success) throw new Error('Expected success to be true')
  if (result.topic !== 'topic') throw new Error(`Expected topic to be 'topic', got ${result.topic}`)
  if (result.maxIterations !== 3) throw new Error(`Expected maxIterations to be 3, got ${result.maxIterations}`)
})

Deno.test('parseDeepResearchCommand: parses --max flag with multi-word topic', () => {
  const result = parseDeepResearchCommand('--max 7 artificial intelligence in healthcare')
  if (!result.success) throw new Error('Expected success to be true')
  if (result.topic !== 'artificial intelligence in healthcare') {
    throw new Error(`Expected topic to be 'artificial intelligence in healthcare', got ${result.topic}`)
  }
  if (result.maxIterations !== 7) throw new Error(`Expected maxIterations to be 7, got ${result.maxIterations}`)
})

Deno.test('parseDeepResearchCommand: returns error for empty args', () => {
  const result = parseDeepResearchCommand('')
  if (result.success) throw new Error('Expected success to be false for empty args')
  if (!result.error.includes('Please provide a topic')) {
    throw new Error(`Expected error message about topic, got ${result.error}`)
  }
})

Deno.test('parseDeepResearchCommand: returns error for undefined args', () => {
  const result = parseDeepResearchCommand(undefined)
  if (result.success) throw new Error('Expected success to be false for undefined args')
  if (!result.error.includes('Please provide a topic')) {
    throw new Error(`Expected error message about topic, got ${result.error}`)
  }
})

Deno.test('parseDeepResearchCommand: returns error when only --max flag provided', () => {
  const result = parseDeepResearchCommand('--max 5')
  if (result.success) throw new Error('Expected success to be false when only flag provided')
  if (!result.error.includes('Please provide a topic')) {
    throw new Error(`Expected error message about topic, got ${result.error}`)
  }
})

Deno.test('parseDeepResearchCommand: validates max_iterations minimum', () => {
  const result = parseDeepResearchCommand('--max 0 topic')
  if (result.success) throw new Error('Expected success to be false for max=0')
  if (!result.error.includes('Max iterations must be between 1 and 10')) {
    throw new Error(`Expected error about valid range, got ${result.error}`)
  }
})

Deno.test('parseDeepResearchCommand: validates max_iterations maximum', () => {
  const result = parseDeepResearchCommand('--max 11 topic')
  if (result.success) throw new Error('Expected success to be false for max=11')
  if (!result.error.includes('Max iterations must be between 1 and 10')) {
    throw new Error(`Expected error about valid range, got ${result.error}`)
  }
})

Deno.test('parseDeepResearchCommand: handles topic with leading/trailing spaces', () => {
  const result = parseDeepResearchCommand('  quantum computing  ')
  if (!result.success) throw new Error('Expected success to be true')
  if (result.topic !== 'quantum computing') throw new Error(`Expected trimmed topic, got ${result.topic}`)
})

Deno.test('parseDeepResearchCommand: handles case-insensitive --max flag', () => {
  const result = parseDeepResearchCommand('--MAX 4 topic')
  if (!result.success) throw new Error('Expected success to be true')
  if (result.maxIterations !== 4) throw new Error(`Expected maxIterations to be 4, got ${result.maxIterations}`)
})
