/**
 * service-5-FIX-tripwire — pure-logic tripwire helpers
 *
 * UNIT_TEST_JUSTIFIED: assertNoTripwire / handleStreamChunk / assertNoTripwireInStream
 * are pure control-flow over already-shaped results/chunks (zero I/O, no network,
 * no @mastra/core mock). Production generate call site wires assertNoTripwire in
 * compat/cells/agent.ts; stream path is exercised here via AsyncIterable fixtures.
 */
import { describe, expect, it } from 'bun:test';
import {
  assertNoTripwire,
  assertNoTripwireInStream,
  getTextDelta,
  handleStreamChunk,
  TripwireError,
} from '../tripwire.ts';

describe('assertNoTripwire (generate)', () => {
  it('returns the result when clear (no tripwire, finishReason stop)', () => {
    const result = {
      text: 'compatibility spike green',
      finishReason: 'stop' as const,
    };
    expect(assertNoTripwire(result)).toBe(result);
  });

  it('throws TripwireError when result.tripwire is present', () => {
    const result = {
      text: '',
      finishReason: 'other' as const,
      tripwire: {
        reason: 'policy violation',
        processorId: 'prompt-injection-detector',
        retry: false,
      },
    };
    expect(() => assertNoTripwire(result)).toThrow(TripwireError);
    try {
      assertNoTripwire(result);
    } catch (err) {
      expect(err).toBeInstanceOf(TripwireError);
      const tw = err as TripwireError;
      expect(tw.tripwire.reason).toBe('policy violation');
      expect(tw.tripwire.processorId).toBe('prompt-injection-detector');
      expect(tw.tripwire.retry).toBe(false);
    }
  });

  it('fail-closes when finishReason is other without tripwire payload', () => {
    const result = { text: '', finishReason: 'other' as const };
    expect(() => assertNoTripwire(result)).toThrow(TripwireError);
  });
});

describe('handleStreamChunk (stream)', () => {
  it('reads the current AI SDK top-level textDelta shape and legacy payload text', () => {
    expect(getTextDelta({ type: 'text-delta', textDelta: 'current shape' })).toBe('current shape');
    expect(getTextDelta({ type: 'text-delta', payload: { text: 'legacy shape' } })).toBe(
      'legacy shape'
    );
  });

  it('continues for non-tripwire chunks', () => {
    expect(handleStreamChunk({ type: 'text-delta', payload: { text: 'hi' } })).toEqual({
      action: 'continue',
    });
    expect(handleStreamChunk({ type: 'finish' })).toEqual({ action: 'continue' });
    expect(handleStreamChunk({ type: 'tool-call' })).toEqual({ action: 'continue' });
  });

  it('detects chunk.type === "tripwire" and extracts payload', () => {
    const handled = handleStreamChunk({
      type: 'tripwire',
      runId: 'run-1',
      from: 'AGENT',
      payload: {
        reason: 'PII detected',
        processorId: 'pii-detector',
        retry: false,
        metadata: { field: 'ssn' },
      },
    });
    expect(handled.action).toBe('tripwire');
    if (handled.action === 'tripwire') {
      expect(handled.tripwire.reason).toBe('PII detected');
      expect(handled.tripwire.processorId).toBe('pii-detector');
      expect(handled.tripwire.retry).toBe(false);
      expect(handled.tripwire.metadata).toEqual({ field: 'ssn' });
    }
  });

  it('defaults missing tripwire payload fields safely', () => {
    const handled = handleStreamChunk({ type: 'tripwire' });
    expect(handled.action).toBe('tripwire');
    if (handled.action === 'tripwire') {
      expect(handled.tripwire.reason).toBe('blocked by guardrail');
      expect(handled.tripwire.processorId).toBe('unknown');
    }
  });
});

describe('assertNoTripwireInStream', () => {
  async function* chunksOf(items: Array<{ type: string; payload?: Record<string, unknown> }>) {
    for (const item of items) {
      yield item;
    }
  }

  it('resolves when stream has no tripwire chunks', async () => {
    await expect(
      assertNoTripwireInStream(
        chunksOf([{ type: 'text-delta', payload: { text: 'ok' } }, { type: 'finish' }])
      )
    ).resolves.toBeUndefined();
  });

  it('throws TripwireError on chunk.type === "tripwire"', async () => {
    await expect(
      assertNoTripwireInStream(
        chunksOf([
          { type: 'text-delta', payload: { text: 'partial' } },
          {
            type: 'tripwire',
            payload: {
              reason: 'moderation block',
              processorId: 'moderation',
            },
          },
        ])
      )
    ).rejects.toBeInstanceOf(TripwireError);
  });
});
