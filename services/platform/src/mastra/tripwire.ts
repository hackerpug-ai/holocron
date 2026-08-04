/**
 * Mastra 1.x tripwire handling — reusable helpers for every agent call site.
 *
 * Guardrails (processors with strategy: 'block') surface as:
 * - generate: `result.tripwire` + often `finishReason === 'other'`
 * - stream:   `chunk.type === 'tripwire'` with payload
 *             `{ reason, retry?, metadata?, processorId }`
 *
 * Call sites MUST fail closed: never treat a blocked generate/stream as success.
 *
 * @see brain/docs/mastra/agents-core.md (Generate + tripwire / Streaming)
 * @see brain/docs/mastra/processors-guardrails.md
 */

export interface TripwireInfo {
  reason: string;
  retry?: boolean;
  metadata?: unknown;
  processorId: string;
}

/** Minimal shape of an agent.generate() result needed for tripwire checks. */
export interface GenerateResultLike {
  tripwire?: (Omit<TripwireInfo, 'processorId'> & { processorId?: string }) | null;
  finishReason?: string;
  text?: string;
}

/** Minimal shape of a fullStream chunk. */
export interface StreamChunkLike {
  type: string;
  runId?: string;
  from?: string;
  textDelta?: string;
  payload?: {
    reason?: string;
    retry?: boolean;
    metadata?: unknown;
    processorId?: string;
    text?: string;
    [key: string]: unknown;
  };
}

export type StreamChunkAction =
  | { action: 'continue' }
  | { action: 'tripwire'; tripwire: TripwireInfo };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract streamed text across the current AI SDK shape and the older
 * Mastra payload shape retained by legacy fixtures.
 */
export function getTextDelta(chunk: unknown): string | undefined {
  if (!isRecord(chunk)) return undefined;
  if (typeof chunk.textDelta === 'string') return chunk.textDelta;
  const payload = chunk.payload;
  return isRecord(payload) && typeof payload.text === 'string' ? payload.text : undefined;
}

/**
 * Error thrown when a guardrail tripwire blocks an agent call.
 * Call sites can catch this to report blocked without treating it as success.
 */
export class TripwireError extends Error {
  readonly tripwire: TripwireInfo;

  constructor(tripwire: TripwireInfo) {
    super(`Agent call blocked by tripwire (${tripwire.processorId}): ${tripwire.reason}`);
    this.name = 'TripwireError';
    this.tripwire = tripwire;
  }
}

function normalizeTripwire(
  raw: Omit<TripwireInfo, 'processorId'> & { processorId?: string }
): TripwireInfo {
  return {
    reason: raw.reason,
    retry: raw.retry,
    metadata: raw.metadata,
    processorId: raw.processorId ?? 'unknown',
  };
}

/**
 * Fail-closed check after `agent.generate()`.
 *
 * Throws {@link TripwireError} when a processor blocked the call
 * (`result.tripwire` present, or `finishReason === 'other'` without a payload).
 * Returns the result unchanged when clear.
 */
export function assertNoTripwire<T extends GenerateResultLike>(result: T): T {
  if (result.tripwire) {
    throw new TripwireError(normalizeTripwire(result.tripwire));
  }
  // Defense in depth: tripwire sets finishReason === 'other' (NOT 'stop').
  // If finishReason is other but tripwire object is missing, still fail closed.
  if (result.finishReason === 'other') {
    throw new TripwireError({
      reason: 'Agent finishReason is "other" without tripwire payload (treated as blocked)',
      processorId: 'unknown',
    });
  }
  return result;
}

/**
 * Inspect a single `stream.fullStream` chunk for tripwire.
 *
 * Call sites MUST branch on the returned action — a `'tripwire'` action means
 * a guardrail halted generation mid-stream; do not keep treating text as success.
 *
 * @example
 * ```ts
 * for await (const chunk of stream.fullStream) {
 *   const handled = handleStreamChunk(chunk);
 *   if (handled.action === 'tripwire') {
 *     throw new TripwireError(handled.tripwire);
 *   }
 *   if (chunk.type === 'text-delta') process.stdout.write(chunk.payload?.text ?? '');
 * }
 * ```
 */
export function handleStreamChunk(chunk: unknown): StreamChunkAction {
  if (isRecord(chunk) && chunk.type === 'tripwire') {
    const payload = isRecord(chunk.payload) ? chunk.payload : {};
    return {
      action: 'tripwire',
      tripwire: {
        reason:
          typeof payload.reason === 'string' && payload.reason.length > 0
            ? payload.reason
            : 'blocked by guardrail',
        retry: typeof payload.retry === 'boolean' ? payload.retry : undefined,
        metadata: payload.metadata,
        processorId:
          typeof payload.processorId === 'string' && payload.processorId.length > 0
            ? payload.processorId
            : 'unknown',
      },
    };
  }
  return { action: 'continue' };
}

/**
 * Consume an agent `fullStream`, failing closed on the first tripwire chunk.
 * Throws {@link TripwireError} if any chunk has `type === 'tripwire'`.
 */
export async function assertNoTripwireInStream(fullStream: AsyncIterable<unknown>): Promise<void> {
  for await (const chunk of fullStream) {
    const handled = handleStreamChunk(chunk);
    if (handled.action === 'tripwire') {
      throw new TripwireError(handled.tripwire);
    }
  }
}
