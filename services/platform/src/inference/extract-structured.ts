/**
 * extractStructured — structured-output pipeline with bounded repair loop.
 *
 * The invariant: "Schema-valid, or an explicit typed failure — NEVER a silent
 * acceptance of invalid output."
 *
 * Re-validates every model output against the Zod schema at runtime, runs a
 * BOUNDED repair loop on failure, and fails explicitly past the cap.
 *
 * Sprint 09 struct-1: malformed→repair→valid, always-malformed→ExtractionFailedError,
 * tripwire→BlockedError.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts
 */

import { z } from 'zod';
import { createFleetChatModel, type ResolvedModel, resolveModel } from './resolve-model';

/**
 * Maximum repair attempts before failing explicitly.
 * Tests verify this cap is respected.
 */
export const MAX_REPAIR_ATTEMPTS = 3;

/**
 * Terminal error: extraction failed after MAX_REPAIR_ATTEMPTS repairs.
 * All parse errors are captured in the error for debugging.
 */
export class ExtractionFailedError extends Error {
  readonly code = 'EXTRACTION_FAILED' as const;
  constructor(
    readonly attempts: number,
    readonly lastParseError: z.ZodError,
    readonly schemaErrors: Array<{ attempt: number; error: z.ZodError }>
  ) {
    super(`extraction failed after ${attempts} attempts: ${lastParseError.message}`);
    this.name = 'ExtractionFailedError';
  }
}

/**
 * Terminal error: output tripwire blocked extraction.
 * Carries the tripwire payload for operator visibility.
 */
export class BlockedError extends Error {
  readonly code = 'BLOCKED' as const;
  constructor(
    readonly reason: string,
    readonly processorId: string,
    readonly tripwirePayload: {
      reason: string;
      processorId: string;
      details?: string;
      [key: string]: unknown;
    }
  ) {
    super(`extraction blocked: ${reason} (processor=${processorId})`);
    this.name = 'BlockedError';
  }
}

/**
 * Extract structured data from a fleet role with Zod validation.
 *
 * @param schema - Zod schema to validate output against
 * @param input - Input prompt for the model
 * @param role - Fleet role to use (e.g., 'divergent', 'convergent')
 * @returns Validated structured output matching the schema
 * @throws ExtractionFailedError when repairs are exhausted
 * @throws BlockedError when a tripwire is triggered
 * @throws UnknownFleetRoleError when role is not in manifest
 * @throws RoleUnavailableError when fleet health probe fails
 */
export async function extractStructured<T extends z.ZodType>(
  schema: T,
  input: string,
  role: string
): Promise<z.infer<T>> {
  // Tripwire detection: check for sensitive content before calling the model
  // This implements AC-3: "tripwire during extraction surfaces BlockedError"
  const tripwirePatterns = [
    // SSN patterns
    /\b\d{3}-\d{2}-\d{4}\b/g, // 123-45-6789
    /\b\d{3}\s*\d{2}\s*\d{4}\b/g, // 123 45 6789
    // Credit card patterns
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // 4111-1111-1111-1111
    // API key patterns
    /\b(sk-[a-zA-Z0-9]{20,})\b/g,
    /\b(api[_-]?key[_-]?)[\w\s]*[:=]\s*[\w-]{10,}/gi,
    // Password patterns
    /\b(password[:\s]*[\w]{6,})\b/gi,
  ];

  for (const pattern of tripwirePatterns) {
    const matches = input.match(pattern);
    if (matches) {
      throw new BlockedError('sensitive_data_detected', 'pii-filter', {
        reason: 'sensitive_data_detected',
        processorId: 'pii-filter',
        details: `Detected ${matches.length} sensitive data pattern(s) in input: ${matches.slice(0, 3).join(', ')}`,
        patterns: matches.slice(0, 5), // First 5 matches
      });
    }
  }

  // Resolve the fleet role (never bypass resolveModel)
  const resolved: ResolvedModel = await resolveModel(role);

  // Create the fleet chat model using the proper AI SDK integration
  const fleetModel = createFleetChatModel(resolved, {
    apiKey: process.env.FLEET_KEY ?? 'sk-none',
  });

  const schemaErrors: Array<{ attempt: number; error: z.ZodError }> = [];

  // Bounded repair loop
  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    try {
      // For local models, use generateText with JSON instruction
      // This is more reliable than generateObject for OpenAI-compatible local models
      const { generateText } = await import('ai');

      // Build a prompt that explicitly requests JSON output
      const jsonPrompt = `${input}\n\nRespond with a valid JSON object matching this schema:\n${JSON.stringify(schema.shape, null, 2)}\n\nOutput ONLY the JSON object, no additional text.`;

      const result = await generateText({
        model: fleetModel,
        prompt: jsonPrompt,
      });

      // Parse the JSON response
      let jsonResponse: unknown;
      try {
        // Extract JSON from the response (sometimes models add text around it)
        const text = result.text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in response');
        }
        jsonResponse = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        // If JSON parsing fails, treat it as a Zod validation error
        const zodError = new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: [],
            message: `Failed to parse JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          },
        ]);
        schemaErrors.push({ attempt, error: zodError });
        continue;
      }

      // ZOD-VALIDATE BEFORE RETURN (the invariant)
      const validated = schema.parse(jsonResponse);
      return validated;
    } catch (err) {
      // Capture Zod validation errors
      if (err instanceof z.ZodError) {
        schemaErrors.push({ attempt, error: err });
        // Continue to next repair attempt
        continue;
      }

      // Handle AI SDK tripwire (e.g., content filters)
      if (err instanceof Error && err.message.includes('tripwire')) {
        throw new BlockedError('output tripwire triggered', 'tripwire-filter', {
          reason: 'output_tripwire',
          processorId: 'tripwire-filter',
          details: err.message,
        });
      }

      // Handle other AI SDK errors (e.g., network, provider errors)
      if (err instanceof Error) {
        // If it's a retryable error, continue to next attempt
        if (err.message.includes('timeout') || err.message.includes('network')) {
          if (attempt < MAX_REPAIR_ATTEMPTS) {
            continue;
          }
        }
        // Re-throw non-retryable errors
        throw err;
      }

      // Unknown error type - re-throw
      throw err;
    }
  }

  // All repair attempts exhausted - fail explicitly
  const lastError = schemaErrors[schemaErrors.length - 1]?.error;
  if (!lastError) {
    throw new ExtractionFailedError(MAX_REPAIR_ATTEMPTS, new z.ZodError([]), schemaErrors);
  }

  throw new ExtractionFailedError(MAX_REPAIR_ATTEMPTS, lastError, schemaErrors);
}
