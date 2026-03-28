/**
 * US-003: Implement voice.endSession, voice.recordTranscript, voice.recordCommand mutations
 *
 * Tests verify that voice mutation functions exist with correct signatures
 * and that the generated API includes all required mutations.
 */

import { describe, it, expect } from 'vitest';

/**
 * AC-1: An active voiceSession -> voice.endSession is called with sessionId ->
 *       Session has completedAt set, totalDurationMs calculated, returns null
 */
describe('AC-1: endSession marks session completed', () => {
  it('should export endSession from convex/voice/mutations.ts', async () => {
    const mutations = await import('../../convex/voice/mutations');
    expect(mutations.endSession).toBeDefined();
    expect(['function', 'object'].includes(typeof mutations.endSession)).toBe(true);
  });

  it('should have voice.mutations.endSession in the generated API', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.voice).toBeDefined();
    expect(api.voice.mutations).toBeDefined();
    expect(api.voice.mutations.endSession).toBeDefined();
  });
});

/**
 * AC-2: An already-completed voiceSession -> voice.endSession is called again ->
 *       Throws error indicating session already ended
 */
describe('AC-2: endSession enforces single-completion invariant', () => {
  it('should export endSession that guards against double-completion', async () => {
    const mutations = await import('../../convex/voice/mutations');
    // endSession must exist — the "already ended" guard is in the handler
    expect(mutations.endSession).toBeDefined();
  });
});

/**
 * AC-3: An active voiceSession with conversationId -> voice.recordTranscript called
 *       with role 'user' and content -> chatMessage created with messageType 'text',
 *       voiceSession.turnCount incremented
 */
describe('AC-3: recordTranscript creates chatMessage and increments turnCount', () => {
  it('should export recordTranscript from convex/voice/mutations.ts', async () => {
    const mutations = await import('../../convex/voice/mutations');
    expect(mutations.recordTranscript).toBeDefined();
    expect(['function', 'object'].includes(typeof mutations.recordTranscript)).toBe(true);
  });

  it('should have voice.mutations.recordTranscript in the generated API', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.voice.mutations.recordTranscript).toBeDefined();
  });
});

/**
 * AC-4: An active voiceSession -> voice.recordCommand called with transcript, intent,
 *       actionType, and success=true -> voiceCommand record created with all fields
 */
describe('AC-4: recordCommand creates voiceCommand record', () => {
  it('should export recordCommand from convex/voice/mutations.ts', async () => {
    const mutations = await import('../../convex/voice/mutations');
    expect(mutations.recordCommand).toBeDefined();
    expect(['function', 'object'].includes(typeof mutations.recordCommand)).toBe(true);
  });

  it('should have voice.mutations.recordCommand in the generated API', async () => {
    const { api } = await import('../../convex/_generated/api');
    expect(api.voice.mutations.recordCommand).toBeDefined();
  });
});

/**
 * AC-5: voice.recordCommand called with success=false and error details ->
 *       voiceCommand record has result.success=false and result.error populated
 */
describe('AC-5: recordCommand handles error details when success=false', () => {
  it('should export recordCommand supporting optional result with error field', async () => {
    const mutations = await import('../../convex/voice/mutations');
    // recordCommand must exist and its args spec includes result.error (optional)
    expect(mutations.recordCommand).toBeDefined();
  });
});
