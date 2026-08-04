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
 * REDHAT-FIX-H1: file-based extraction status tracking (.tmp/extractions/<id>.json)
 * so `holo extract:status <id>` can report extraction_failed / blocked / success
 * with a `committed` flag (human gate step 5).
 * REDHAT-FIX-H2: consume the Fleet Role Manifest structuredOutput flag (carried on
 * the resolved model) to select constrained-decode vs repair mode.
 * REDHAT-FIX-H1 (redhat round 2): use generateObject (the structured-output API,
 * NOT plain-text generation) so the SDK sends response_format: json_schema on
 * the wire for constrained decode. Zod is still re-run as the source of truth.
 * REDHAT-FIX-H3 (redhat round 2): output-side tripwire — scan model-GENERATED
 * content (not just input) before acceptance.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { createFleetChatModel, type ResolvedModel, resolveModel } from './resolve-model';

/**
 * Robust ZodError detection. `instanceof z.ZodError` can miss an error thrown by a
 * schema built with a different zod instance (a classic split-zod pitfall), which
 * would let a validation failure leak past the repair cap as a raw ZodError instead
 * of the typed ExtractionFailedError. Detect by shape as well.
 */
function isZodError(err: unknown): err is z.ZodError {
  return (
    err instanceof z.ZodError ||
    (err instanceof Error && err.name === 'ZodError' && Array.isArray((err as z.ZodError).issues))
  );
}

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

// ─── REDHAT-FIX-H1: extraction status tracking ───────────────────────────

/**
 * Extraction status recorded to a file-based store for operator visibility.
 * `holo extract:status <id>` reads these records (human gate step 5).
 *
 * - `pending`           — extraction in flight (written at start).
 * - `success`           — schema-valid result committed.
 * - `extraction_failed` — repairs exhausted or resolve failed (NO committed row).
 * - `blocked`           — tripwire fired (NO committed row).
 */
export type ExtractionStatus = {
  id: string;
  status: 'pending' | 'success' | 'extraction_failed' | 'blocked';
  role: string;
  startedAt: string;
  /** ISO timestamp when the extraction reached a terminal state. */
  endedAt?: string;
  /** Validated result (present when status === 'success'). */
  result?: unknown;
  /** True when a schema-valid result was committed; false for failed/blocked. */
  committed: boolean;
  /**
   * Loop counter at the terminal state (1-based). Present on the success path
   * (how many generateObject rounds ran before a Zod-valid commit) and mirrored
   * under `error.attempts` on the failure path. REDHAT-FIX-C2-H3.
   */
  attempts?: number;
  /** Present when status === 'extraction_failed'. */
  error?: {
    code: string;
    message: string;
    attempts?: number;
    lastParseError?: string;
  };
  /** Present when status === 'blocked'. */
  blockedReason?: string;
  /** Present when status === 'blocked'. */
  processorId?: string;
};

/**
 * Directory for per-extraction status JSON files (gitignored ephemeral store).
 */
const EXTRACTIONS_DIR = join(process.cwd(), '.tmp', 'extractions');

/**
 * Write (or overwrite) the status file for an extraction id.
 * Best-effort: a file-write failure never masks the real extraction result.
 */
async function writeExtractionStatus(status: ExtractionStatus): Promise<void> {
  try {
    await mkdir(EXTRACTIONS_DIR, { recursive: true });
    await writeFile(
      join(EXTRACTIONS_DIR, `${status.id}.json`),
      JSON.stringify(status, null, 2),
      'utf-8'
    );
  } catch {
    // Status tracking is best-effort — never let a file write failure mask the
    // real extraction result/error. The operator can still inspect CLI output.
  }
}

/**
 * Read the status file for an extraction id.
 * @returns The status record, or null when no status file exists (unknown / expired id).
 */
export async function getExtractionStatus(id: string): Promise<ExtractionStatus | null> {
  try {
    const raw = await readFile(join(EXTRACTIONS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(raw) as ExtractionStatus;
  } catch {
    return null;
  }
}

// ─── Core extraction pipeline ─────────────────────────────────────────────

/**
 * Extract structured data from a fleet role with Zod validation.
 *
 * Tracks extraction status to `.tmp/extractions/<id>.json` for operator visibility
 * via `holo extract:status <id>`. When `extractionId` is omitted, a UUID is
 * generated internally (callers that want to query status later should pass one in).
 *
 * @param schema - Zod schema to validate output against
 * @param input - Input prompt for the model
 * @param role - Fleet role to use (e.g., 'divergent', 'convergent')
 * @param extractionId - Optional extraction id for status tracking
 * @returns Validated structured output matching the schema
 * @throws ExtractionFailedError when repairs are exhausted
 * @throws BlockedError when a tripwire is triggered
 * @throws UnknownFleetRoleError when role is not in manifest
 * @throws RoleUnavailableError when fleet health probe fails
 */
export async function extractStructured<T extends z.ZodType>(
  schema: T,
  input: string,
  role: string,
  extractionId?: string
): Promise<z.infer<T>> {
  // REDHAT-FIX-H1: write pending status so `holo extract:status <id>` can report
  // extraction_failed with committed=false even if the process crashes mid-flight.
  const id = extractionId ?? randomUUID();
  const startedAt = new Date().toISOString();
  await writeExtractionStatus({ id, status: 'pending', role, startedAt, committed: false });

  try {
    const result = await runExtraction(schema, input, role, id, startedAt);
    return result;
  } catch (err) {
    // Record terminal status for operator visibility before re-throwing.
    if (err instanceof BlockedError) {
      await writeExtractionStatus({
        id,
        status: 'blocked',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: false,
        blockedReason: err.reason,
        processorId: err.processorId,
      });
    } else if (err instanceof ExtractionFailedError) {
      await writeExtractionStatus({
        id,
        status: 'extraction_failed',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: false,
        error: {
          code: err.code,
          message: err.message,
          attempts: err.attempts,
          lastParseError: err.lastParseError.message,
        },
      });
    } else {
      // UnknownFleetRoleError, RoleUnavailableError, or any other non-retryable error
      // → record as extraction_failed with no committed row.
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'EXTRACTION_FAILED';
      await writeExtractionStatus({
        id,
        status: 'extraction_failed',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: false,
        error: {
          code,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
    throw err;
  }
}

/**
 * Tripwire patterns scanned on BOTH the input (defense-in-depth) and the model
 * output (REDHAT-FIX-H3: model-generated sensitive data must not pass through).
 * Returns the first pattern's matches, or null when clean.
 *
 * REDHAT-FIX-C2-H1: PATTERN_KINDS is parallel to TRIPWIRE_PATTERNS. Detection
 * still matches raw text internally; only SERIALIZED BlockedError payloads use
 * kind labels (never raw capture groups like "123-45-6789").
 */
const TRIPWIRE_PATTERNS: RegExp[] = [
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

/** Parallel to TRIPWIRE_PATTERNS — stable kind labels for redacted payloads. */
const PATTERN_KINDS = ['SSN', 'SSN', 'CREDIT_CARD', 'API_KEY', 'API_KEY', 'PASSWORD'] as const;
type PatternKind = (typeof PATTERN_KINDS)[number];

/**
 * Scan text for the first matching tripwire pattern.
 * Internally retains raw matches for detection correctness; callers MUST NOT
 * serialize `matches` into status/CLI payloads — use `kind` + `count` only.
 */
function findTripwireMatches(
  text: string
): { kind: PatternKind; count: number; matches: string[] } | null {
  for (let i = 0; i < TRIPWIRE_PATTERNS.length; i++) {
    const pattern = TRIPWIRE_PATTERNS[i];
    const kind = PATTERN_KINDS[i];
    if (pattern === undefined || kind === undefined) continue;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return { kind, count: matches.length, matches };
    }
  }
  return null;
}

/**
 * Build a redacted tripwire payload for BlockedError (REDHAT-FIX-C2-H1).
 * Emits count + pattern-kind labels only — never raw matched values.
 */
function redactedTripwirePayload(
  reason: string,
  surface: 'input' | 'model output',
  hit: { kind: PatternKind; count: number }
): {
  reason: string;
  processorId: string;
  details: string;
  patterns: PatternKind[];
} {
  return {
    reason,
    processorId: 'pii-filter',
    details: `Detected ${hit.count} sensitive data pattern(s) of kind ${hit.kind} in ${surface} (values redacted)`,
    patterns: [hit.kind],
  };
}

/**
 * Bound each fleet call so a stalling endpoint (the local fleet can stall on
 * rapid sequential calls) can never hang extraction: a timeout aborts the call,
 * it is counted as a failed attempt, and the bounded repair loop proceeds.
 */
const CALL_TIMEOUT_MS = 45_000;

/**
 * Strip markdown code fences (```json ... ```) from a model response so the AI
 * SDK's strict JSON parser can handle models that wrap their JSON output.
 * Used as generateObject's experimental_repairText in repair mode.
 */
function stripMarkdownFences(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenceMatch?.[1]?.trim() ?? text;
}

/**
 * Build a schema-guided prompt for repair mode. In repair mode response_format
 * is stripped from the wire (so reasoning models emit `content`), which means
 * the model receives NO schema hint from the transport. The prompt must convey
 * the expected JSON shape so the model emits parseable, schema-shaped JSON
 * (wrapped in markdown fences, which stripMarkdownFences/repairText handles).
 *
 * Uses the AI SDK's own `asSchema()` wrapper to convert the Zod schema to a JSON
 * Schema — this is INSTANCE-TOLERANT (handles the split-zod pitfall where the
 * caller's schema was built with a different zod instance than this module's
 * `z`), unlike `z.toJSONSchema()` which crashes on cross-instance schemas.
 */
async function buildSchemaGuidedPrompt(input: string, schema: z.ZodType): Promise<string> {
  const { asSchema } = await import('ai');
  const jsonSchemaObj = await asSchema(schema).jsonSchema;
  return `${input}\n\nRespond with a single valid JSON object matching this JSON schema:\n${JSON.stringify(jsonSchemaObj)}\n\nOutput ONLY the JSON object, no additional text.`;
}

/**
 * Build the model used for generateObject, mode-aware.
 *
 * - constrained: the raw fleet model. generateObject sends response_format:
 *   json_schema on the wire (true constrained decoding). Used only when the
 *   boot-time probe verified the role honors json_schema.
 * - repair: the fleet model wrapped in a middleware that strips response_format,
 *   because local reasoning models (e.g. GLM-4.7) emit structured output via the
 *   `reasoning` channel (leaving `content` empty) whenever response_format is
 *   set. Stripping it makes the model emit content normally; generateObject then
 *   parses it with experimental_repairText handling markdown fences.
 *
 * This is the v7-correct realization of the legacy `mode: 'json'` toggle (which
 * was removed in AI SDK v5+): prompt-level JSON instruction without requiring
 * backend json_schema support.
 */
async function createStructuredModel(
  fleetModel: ReturnType<typeof createFleetChatModel>,
  mode: 'constrained' | 'repair'
): Promise<ReturnType<typeof createFleetChatModel>> {
  if (mode === 'constrained') {
    return fleetModel;
  }
  const { wrapLanguageModel } = await import('ai');
  return wrapLanguageModel({
    model: fleetModel,
    middleware: {
      specificationVersion: 'v4',
      // Strip responseFormat so reasoning models emit `content` (not reasoning-only).
      transformParams: async ({ params }) => {
        const { responseFormat: _stripped, ...rest } = params;
        return rest as typeof params;
      },
    },
  });
}

/**
 * Inner extraction pipeline (excludes status tracking, which is handled by the
 * `extractStructured` wrapper). Separated so the status try/catch does not
 * interleave with the repair-loop's own try/catch.
 */
async function runExtraction<T extends z.ZodType>(
  schema: T,
  input: string,
  role: string,
  extractionId: string,
  startedAt: string
): Promise<z.infer<T>> {
  // INPUT-side tripwire (defense in depth): check for sensitive content BEFORE
  // calling the model. AC-3: "tripwire during extraction surfaces BlockedError".
  // REDHAT-FIX-C2-H1: serialize count + kind labels only — never raw matches.
  const inputTripwire = findTripwireMatches(input);
  if (inputTripwire) {
    throw new BlockedError(
      'sensitive_data_detected',
      'pii-filter',
      redactedTripwirePayload('sensitive_data_detected', 'input', inputTripwire)
    );
  }

  // Resolve the fleet role (never bypass resolveModel)
  const resolved: ResolvedModel = await resolveModel(role);

  // REDHAT-FIX-H2: Consume the Fleet Role Manifest structuredOutput flag to
  // select the INITIAL constrained-decode vs repair mode. `resolved.structuredOutput`
  // is read directly from the FleetRoleSchema.structuredOutput boolean by
  // resolveModel (see resolve-model.ts → ResolvedModel.structuredOutput), which
  // itself reads it from the Fleet Role Manifest entry.
  //   structuredOutput=true  → start 'constrained' (role advertises json_schema support)
  //   structuredOutput=false → start 'repair' (prompt-only instruction + Zod re-validation)
  //
  // G-ORACLE: the manifest flag is only the INITIAL guess — the LIVE generateObject
  // behavior is truth. If constrained mode throws NoObjectGeneratedError (common
  // for local reasoning models like GLM-4.7 that emit content=null whenever
  // response_format is set), the loop ADAPTIVELY falls back to repair mode
  // (manifest may over-advertise capability; the live probe is authoritative).
  let currentMode: 'constrained' | 'repair' = resolved.structuredOutput ? 'constrained' : 'repair';

  // Create the fleet chat model using the proper AI SDK integration
  const fleetModel = createFleetChatModel(resolved, {
    apiKey: process.env.FLEET_KEY ?? 'sk-none',
  });

  const schemaErrors: Array<{ attempt: number; error: z.ZodError }> = [];

  // Bounded repair loop
  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    try {
      // REDHAT-FIX-H1 (round 2): use generateObject (the structured-output API,
      // NOT the legacy plain-text path) so the SDK sends response_format:
      // json_schema on the wire for constrained decoding. generateObject parses
      // + (internally) validates the response; Zod is STILL re-run below as the
      // source of truth (belt-and-suspenders).
      const { generateObject } = await import('ai');

      // Mode-aware model: constrained → raw (json_schema on the wire);
      // repair → wrapped to strip response_format (prompt-level JSON), because
      // local reasoning models emit via the reasoning channel when
      // response_format is set. experimental_repairText handles markdown fences.
      const structuredModel = await createStructuredModel(fleetModel, currentMode);

      const { object } = await generateObject({
        model: structuredModel,
        schema,
        // Constrained: the schema travels on the wire (response_format json_schema),
        // so the raw input prompt suffices. Repair: response_format is stripped, so
        // the prompt must convey the expected JSON shape (buildSchemaGuidedPrompt).
        prompt: currentMode === 'repair' ? await buildSchemaGuidedPrompt(input, schema) : input,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        ...(currentMode === 'repair'
          ? {
              experimental_repairText: async ({ text }: { text: string }) =>
                stripMarkdownFences(text),
            }
          : {}),
      });

      // REDHAT-FIX-H3: OUTPUT-side tripwire — scan model-GENERATED content
      // (not just input) before acceptance. A model can synthesize sensitive
      // data (SSN, card numbers) even when the input was clean; that must NOT
      // pass through. Runs BEFORE Zod re-validation and BEFORE success status.
      // REDHAT-FIX-C2-H1: serialize count + kind labels only — never raw matches.
      const outputText = JSON.stringify(object);
      const outputTripwire = findTripwireMatches(outputText);
      if (outputTripwire) {
        throw new BlockedError(
          'output_sensitive_data_detected',
          'pii-filter',
          redactedTripwirePayload('output_sensitive_data_detected', 'model output', outputTripwire)
        );
      }

      // ZOD IS TRUTH (the invariant). generateObject's internal validation may
      // use a JSON-schema projection that cannot express arbitrary .refine()
      // predicates, so re-running schema.parse() here is what actually enforces
      // the full Zod contract. Isolate validation failures so a ZodError is
      // ALWAYS a repair-loop failure (captured + continue) and NEVER leaks raw
      // past the cap. Robust to zod instance splits via isZodError().
      let validated: z.infer<T>;
      try {
        validated = schema.parse(object);
      } catch (validationErr) {
        const ze = isZodError(validationErr)
          ? validationErr
          : new z.ZodError([
              {
                code: z.ZodIssueCode.custom,
                path: [],
                message:
                  validationErr instanceof Error ? validationErr.message : String(validationErr),
              },
            ]);
        schemaErrors.push({ attempt, error: ze });
        continue;
      }

      // REDHAT-FIX-H1: record success status with the validated result.
      // REDHAT-FIX-C2-H3: include attempts so callers can prove the repair loop
      // was entered (malformed-once → attempts >= 2) rather than first-try luck.
      await writeExtractionStatus({
        id: extractionId,
        status: 'success',
        role,
        startedAt,
        endedAt: new Date().toISOString(),
        committed: true,
        attempts: attempt,
        result: validated,
      });
      return validated;
    } catch (err) {
      // A BlockedError from the OUTPUT-side tripwire (H3) is terminal — it must
      // NOT be swallowed by the repair loop (the model regenerating sensitive
      // data is not a recoverable schema error).
      if (err instanceof BlockedError) {
        throw err;
      }

      // Capture Zod validation errors (robust to zod instance splits)
      if (isZodError(err)) {
        schemaErrors.push({ attempt, error: err });
        continue;
      }

      // generateObject throws NoObjectGeneratedError when the model output does
      // not parse as JSON or does not match the schema (e.g. reasoning models
      // that emit content=null, or an unsatisfiable schema). Treat these as
      // repair-loop failures (captured + continue), never as success.
      if (
        err instanceof Error &&
        /NoObjectGenerated|did not match schema|could not parse/i.test(err.name + err.message)
      ) {
        schemaErrors.push({
          attempt,
          error: new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: [],
              message: `generateObject rejected output (${err.name}): ${err.message.slice(0, 200)}`,
            },
          ]),
        });

        // G-ORACLE adaptive fallback: if constrained mode (json_schema on the
        // wire) produced no object, the live model does not honor
        // response_format — switch to repair mode for subsequent attempts. The
        // manifest flag may over-advertise capability; live behavior is truth.
        // This is exactly what the boot-time probe detects, applied inline so
        // extraction is self-healing without requiring a separate probe call.
        if (currentMode === 'constrained') {
          currentMode = 'repair';
        }
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

      // Retryable fleet errors (timeout / abort / network). Record and continue to
      // the next repair attempt; the for-loop bound guarantees termination, and
      // exhaustion throws the typed ExtractionFailedError (never a raw timeout).
      if (
        err instanceof Error &&
        /timeout|timed out|abort|aborted|network|econnreset|socket hangup|fetch failed/i.test(
          err.message
        )
      ) {
        schemaErrors.push({
          attempt,
          error: new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: [],
              message: `fleet call failed (${err.name}): ${err.message.slice(0, 200)}`,
            },
          ]),
        });
        continue;
      }

      // Re-throw non-retryable errors (e.g. UnknownFleetRoleError, RoleUnavailableError)
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
