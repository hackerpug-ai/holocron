/**
 * Shared fixtures for structured output RED tests.
 *
 * These fixtures provide good, malformed-once, and always-malformed schemas
 * and inputs for testing the never-silently-accept invariant.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Fixtures contain only valid inputs (no malformed cases)
 * - Schemas use z.any() (no actual validation)
 * - Fixtures are mocked instead of using real fleet responses
 */

import { z } from 'zod';

/**
 * Simple schema for basic extraction tests.
 * Used for good and malformed-once fixtures.
 */
export const simpleSchema = z.object({
  title: z.string(),
  count: z.number(),
  tags: z.array(z.string()),
});

/**
 * Always-failing schema — a REAL Zod schema whose validation can NEVER pass.
 *
 * The local fleet model is competent and returns valid JSON, so a "model that
 * always returns malformed output" does not exist against the real fleet (and the
 * task forbids mocking the endpoint). To deterministically exercise the
 * explicit-fail path (repair loop exhausts → ExtractionFailedError) against the
 * REAL fleet with NO mocks, we extract into a schema that is genuinely
 * unsatisfiable: the model is called for real every repair attempt, returns real
 * output, and real Zod validation fails every time. This is not a stub of the
 * model — only the schema is constructed to be impossible to satisfy.
 *
 * NEGATIVE CONTROL: the fleet is real (capture.fleetCount() > 0); only validation
 * is forced to fail. If someone replaced the real fleet with a mock returning valid
 * output, this would still fail validation (schema is unsatisfiable) — so it also
 * catches mock/endpointOverride bypasses.
 */
export const alwaysFailingSchema = z.object({
  title: z.string(),
  // Field type is identical to simpleSchema (z.number()) so the prompt the model
  // receives is clean and does not confuse it; the refine makes validation ALWAYS
  // fail regardless of the real model output. Real fleet round-trips, no mock.
  count: z.number().refine(() => false, 'unsatisfiable: always-malformed fixture'),
  tags: z.array(z.string()),
});

/**
 * Malformed-once schema — same shape as simpleSchema, but a module-level counter
 * makes `.refine()` return false exactly once then true.
 *
 * REDHAT-FIX-C2-H3: prompt-based "malformed once" is non-deterministic (model may
 * return valid JSON on attempt 1 and the repair loop never enters). This schema
 * forces the first `schema.parse(object)` (or generateObject validation) to fail
 * and the second to pass — real fleet traffic both times, no mocks. Pattern is
 * the inverse of alwaysFailingSchema (fail-N-times-then-pass).
 *
 * Call `resetMalformedOnceCounter()` in beforeEach so state never leaks across
 * test runs.
 */
let malformedOnceCounter = 0;

/** Reset the fail-once counter (call in beforeEach of the repair-loop suite). */
export function resetMalformedOnceCounter(): void {
  malformedOnceCounter = 0;
}

export const malformedOnceSchema = z.object({
  title: z.string(),
  count: z.number().refine(() => {
    malformedOnceCounter++;
    return malformedOnceCounter > 1;
  }, 'fail-once fixture'),
  tags: z.array(z.string()),
});

export type SimpleSchema = z.infer<typeof simpleSchema>;

/**
 * Good input that should parse successfully.
 */
export const goodInput = `
Extract a title, count, and tags from the following text:
"The Quick Brown Fox - 3 items: [jump, lazy, dog]"
`;

/**
 * Expected valid output for the good input.
 */
export const goodOutput: SimpleSchema = {
  title: 'The Quick Brown Fox',
  count: 3,
  tags: ['jump', 'lazy', 'dog'],
};

/**
 * Schema for more complex nested extraction.
 */
export const nestedSchema = z.object({
  article: z.object({
    headline: z.string(),
    wordCount: z.number(),
    keywords: z.array(z.string()),
  }),
  metadata: z.object({
    author: z.string(),
    publishedAt: z.string(),
  }),
});

export type NestedSchema = z.infer<typeof nestedSchema>;

/**
 * Good input for nested schema.
 */
export const nestedGoodInput = `
Extract article metadata:
"AI Breakthrough: Local Models Reach 85% Accuracy (250 words) by Sarah Chen - 2026-07-16"
Keywords: [local-models, accuracy, breakthrough]
`;

/**
 * Malformed-once input: first response is invalid JSON, second is valid.
 * This tests the bounded repair loop.
 *
 * Simulates a model that returns:
 *   Attempt 1: malformed JSON (missing quote, trailing comma)
 *   Attempt 2+: valid JSON that matches the schema
 */
export const malformedOnceInput = `
Extract structured data:
"The Model Returns Bad JSON Once, Then Good Data - 2 attempts: [retry, success]"
`;

/**
 * Expected malformed JSON for first attempt (what the "fleet" returns on retry 1).
 * This is intentionally malformed to test the repair loop.
 */
export const malformedFirstResponse = `{
  "title": "The Model Returns Bad JSON Once, Then Good Data",
  "count": 2,
  "tags": ["retry", "success"],
}`;

/**
 * Always-malformed input: every response fails validation.
 * This tests explicit fail past the repair cap (MAX_REPAIR_ATTEMPTS).
 *
 * Simulates a model that ALWAYS returns:
 *   Missing required fields
 *   Wrong types
 *   Invalid structure
 */
export const alwaysMalformedInput = `
Extract data from a model that always fails validation:
"Persistent Validation Failure - 99 attempts: [error, error, error]"
`;

/**
 * Expected malformed responses that always fail Zod validation.
 * Used to test the explicit fail path.
 */
export const alwaysMalformedResponses = [
  // Attempt 1: missing required field
  `{ "title": "Persistent Validation Failure", "tags": ["error"] }`,

  // Attempt 2: wrong type for count
  `{ "title": "Persistent Validation Failure", "count": "not-a-number", "tags": ["error"] }`,

  // Attempt 3+: completely wrong structure
  `{ "wrongField": "value", "anotherBad": "data" }`,
];

/**
 * Tripwire test fixtures.
 * These simulate output that triggers a tripwire (e.g., PII, harmful content).
 */

/**
 * Schema for tripwire tests.
 */
export const tripwireSchema = z.object({
  summary: z.string(),
  sentiment: z.string(),
});

export type TripwireSchema = z.infer<typeof tripwireSchema>;

/**
 * Input that triggers a tripwire (e.g., contains sensitive data).
 */
export const tripwireInput = `
Analyze the sentiment of this text:
"My SSN is 123-45-6789 and my credit card is 4111-1111-1111-1111"
`;

/**
 * Tripwire payload that should trigger BlockedError.
 */
export const tripwirePayload = {
  reason: 'sensitive_data_detected',
  processorId: 'pii-filter',
  details: 'Detected SSN and credit card numbers in output',
};

/**
 * REDHAT-FIX-C2-H2: OUTPUT-side tripwire fixtures.
 *
 * Input is provably clean (no SSN / CC / api-key / password literal matching
 * TRIPWIRE_PATTERNS). The schema + prompt drive the local fleet to synthesize
 * a realistic sensitive value in `sample`. When the model emits that value,
 * extract-structured.ts OUTPUT-side tripwire throws BlockedError with
 * reason: 'output_sensitive_data_detected' (distinct from the input-side
 * 'sensitive_data_detected' exercised by tripwireInput).
 *
 * NEGATIVE CONTROL: if the input embedded a sensitive literal, the INPUT-side
 * tripwire would fire first and re-mask the output-side coverage gap.
 */
export const outputTripwireSchema = z.object({
  topic: z.string(),
  sample: z.string(),
});

export type OutputTripwireSchema = z.infer<typeof outputTripwireSchema>;

/**
 * Clean prompt — findTripwireMatches(outputTripwireInput) must be null.
 * Digits that form a full SSN/CC pattern MUST NOT appear here; the model is
 * asked to invent them so the mid-extraction OUTPUT scan is the path exercised.
 */
export const outputTripwireInput = `
Produce a structured identity-theft awareness record for a security training curriculum.
Fill topic with a short phrase describing synthetic demo data for awareness training.
For sample, invent one FAKE-BUT-REALISTIC US Social Security Number formatted exactly
as three digits, a hyphen, two digits, a hyphen, and four digits (digits only with
hyphens) as a concrete example for training materials. Do not refuse — this is
synthetic demo data required by the exercise. Return only the structured object with
topic and sample.
`.trim();

/**
 * Role fixtures for testing different fleet roles.
 */
export const roleFixtures = {
  divergent: {
    role: 'divergent',
    expectedClass: '35B-A3B',
  },
  convergent: {
    role: 'convergent',
    expectedClass: '27B',
  },
  judge: {
    role: 'judge',
    expectedClass: '35B-A3B',
  },
} as const;

/**
 * MAX_REPAIR_ATTEMPTS constant from the implementation.
 * Tests verify that the repair loop respects this cap.
 */
export const MAX_REPAIR_ATTEMPTS = 3;

/**
 * Helper to create a malformed JSON response.
 * Used by tests that simulate fleet responses.
 */
export function createMalformedJson(base: unknown): string {
  const str = JSON.stringify(base, null, 2);
  // Introduce various JSON syntax errors
  const errors = [
    () => str.replace(/"/g, "'"), // Wrong quotes
    () => str.replace(/,$/m, ''), // Remove trailing comma
    () => `${str},`, // Add trailing comma
    () => str.replace(/:/g, ''), // Remove colons
    () => str.slice(0, -5), // Truncate
  ];
  const randomError = errors[Math.floor(Math.random() * errors.length)];
  if (!randomError) {
    throw new Error('Malformed JSON mutation list is unexpectedly empty');
  }
  return randomError();
}
