/**
 * Unit tests for resume session handler
 *
 * @see US-056 - Resume Session Slash Command Handler
 */

import {
  parseResumeCommand,
  ResumeCommandOptions,
} from './resume-handler.ts'

// ============================================================
// Test: parseResumeCommand
// ============================================================

Deno.test('parseResumeCommand: handles empty args', () => {
  const result = parseResumeCommand('')
  if (result.sessionId !== undefined) {
    throw new Error(`Expected sessionId to be undefined, got ${result.sessionId}`)
  }
  if (result.restart !== false) {
    throw new Error(`Expected restart to be false, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: handles whitespace only', () => {
  const result = parseResumeCommand('   ')
  if (result.sessionId !== undefined) {
    throw new Error(`Expected sessionId to be undefined, got ${result.sessionId}`)
  }
  if (result.restart !== false) {
    throw new Error(`Expected restart to be false, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: extracts session ID', () => {
  const result = parseResumeCommand('abc-123')
  if (result.sessionId !== 'abc-123') {
    throw new Error(`Expected sessionId to be 'abc-123', got ${result.sessionId}`)
  }
  if (result.restart !== false) {
    throw new Error(`Expected restart to be false, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: extracts session ID with UUID format', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000'
  const result = parseResumeCommand(sessionId)
  if (result.sessionId !== sessionId) {
    throw new Error(`Expected sessionId to be '${sessionId}', got ${result.sessionId}`)
  }
  if (result.restart !== false) {
    throw new Error(`Expected restart to be false, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: detects --restart flag', () => {
  const result = parseResumeCommand('abc-123 --restart')
  if (result.sessionId !== 'abc-123') {
    throw new Error(`Expected sessionId to be 'abc-123', got ${result.sessionId}`)
  }
  if (result.restart !== true) {
    throw new Error(`Expected restart to be true, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: detects --restart flag before session ID', () => {
  const result = parseResumeCommand('--restart abc-123')
  if (result.sessionId !== 'abc-123') {
    throw new Error(`Expected sessionId to be 'abc-123', got ${result.sessionId}`)
  }
  if (result.restart !== true) {
    throw new Error(`Expected restart to be true, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: handles --restart flag only (no session ID)', () => {
  const result = parseResumeCommand('--restart')
  if (result.sessionId !== undefined) {
    throw new Error(`Expected sessionId to be undefined, got ${result.sessionId}`)
  }
  if (result.restart !== true) {
    throw new Error(`Expected restart to be true, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: handles multiple spaces', () => {
  const result = parseResumeCommand('  abc-123   --restart  ')
  if (result.sessionId !== 'abc-123') {
    throw new Error(`Expected sessionId to be 'abc-123', got ${result.sessionId}`)
  }
  if (result.restart !== true) {
    throw new Error(`Expected restart to be true, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: handles session ID with dashes', () => {
  const result = parseResumeCommand('my-session-id-123')
  if (result.sessionId !== 'my-session-id-123') {
    throw new Error(`Expected sessionId to be 'my-session-id-123', got ${result.sessionId}`)
  }
  if (result.restart !== false) {
    throw new Error(`Expected restart to be false, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: ignores extra parts after session ID', () => {
  const result = parseResumeCommand('abc-123 extra stuff here')
  if (result.sessionId !== 'abc-123') {
    throw new Error(`Expected sessionId to be 'abc-123', got ${result.sessionId}`)
  }
  if (result.restart !== false) {
    throw new Error(`Expected restart to be false, got ${result.restart}`)
  }
})

Deno.test('parseResumeCommand: handles extra parts with --restart flag', () => {
  const result = parseResumeCommand('abc-123 --restart extra stuff')
  if (result.sessionId !== 'abc-123') {
    throw new Error(`Expected sessionId to be 'abc-123', got ${result.sessionId}`)
  }
  if (result.restart !== true) {
    throw new Error(`Expected restart to be true, got ${result.restart}`)
  }
})

// ============================================================
// Test: ResumeCommandOptions type validation
// ============================================================

Deno.test('ResumeCommandOptions: has correct structure', () => {
  const options: ResumeCommandOptions = {
    sessionId: 'test-id',
    restart: false,
  }

  if (typeof options.sessionId !== 'string' && options.sessionId !== undefined) {
    throw new Error('sessionId must be string or undefined')
  }
  if (typeof options.restart !== 'boolean') {
    throw new Error('restart must be boolean')
  }
})

Deno.test('ResumeCommandOptions: allows undefined sessionId', () => {
  const options: ResumeCommandOptions = {
    sessionId: undefined,
    restart: false,
  }

  if (options.sessionId !== undefined) {
    throw new Error('sessionId should be undefined')
  }
})

Deno.test('ResumeCommandOptions: allows restart to be true', () => {
  const options: ResumeCommandOptions = {
    sessionId: 'test-id',
    restart: true,
  }

  if (options.restart !== true) {
    throw new Error('restart should be true')
  }
})
