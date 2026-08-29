/**
 * extract-fixtures — thin loader mapping documented `--fixture` names to
 * `{ schema, input }` pairs, so the Sprint-09 human-gate steps 3-4 are
 * executable exactly as written in SPRINT.md:
 *
 *   step 3: holo extract --fixture malformed-once   (bounded repair → valid object)
 *   step 4: holo extract --fixture always-malformed (explicit fail past the cap)
 *
 * The schemas/inputs are the SAME ones the RED suite validates against, imported
 * from the shared fixture module (single source of truth — never duplicated).
 */
import type { z } from 'zod';
import {
  alwaysFailingSchema,
  alwaysMalformedInput,
  goodInput,
  malformedOnceInput,
  malformedOnceSchema,
  outputTripwireInput,
  outputTripwireSchema,
  simpleSchema,
  tripwireInput,
  tripwireSchema,
} from '../../../../tests/fixtures/struct-fixtures';

export type FixtureName =
  | 'good'
  | 'malformed-once'
  | 'always-malformed'
  | 'tripwire'
  | 'output-tripwire';

export interface ExtractFixture {
  /** Real Zod schema — never z.any(). The schema is truth, not the model. */
  schema: z.ZodType;
  /** Input text fed through the same extractStructured pipeline as --input. */
  input: string;
  /** Human-readable description of what the fixture exercises. */
  description: string;
}

/**
 * Documented fixture entry points for `holo extract --fixture <name>`.
 * Schemas/inputs are imported (not duplicated) from the shared struct-fixtures.
 */
export const FIXTURES: Record<FixtureName, ExtractFixture> = {
  good: {
    schema: simpleSchema,
    input: goodInput,
    description: 'good input — returns a Zod-valid object on the first attempt',
  },
  'malformed-once': {
    // REDHAT-FIX-C2-H3: schema-side fail-once refine forces deterministic repair
    // (prompt-based simpleSchema was non-deterministic — model may succeed first try).
    schema: malformedOnceSchema,
    input: malformedOnceInput,
    description: 'bounded repair loop yields a Zod-valid object',
  },
  'always-malformed': {
    schema: alwaysFailingSchema,
    input: alwaysMalformedInput,
    description: 'fails explicitly past the repair cap with a typed terminal error',
  },
  tripwire: {
    schema: tripwireSchema,
    input: tripwireInput,
    description: 'input-side tripwire emits a typed terminal BlockedError',
  },
  // REDHAT-FIX-C2-H2: clean input + model-synthesized sensitive sample → OUTPUT-side path
  'output-tripwire': {
    schema: outputTripwireSchema,
    input: outputTripwireInput,
    description: 'clean input; model synthesizes sensitive sample → output_sensitive_data_detected',
  },
};

/** Available fixture names (for error messaging / help). */
export const FIXTURE_NAMES: string[] = Object.keys(FIXTURES);

/**
 * Resolve a fixture name to its `{ schema, input }` pair, or null if unknown.
 * Never throws — the caller decides how to report an unknown name.
 */
export function getFixture(name: string): ExtractFixture | null {
  return (FIXTURES as Record<string, ExtractFixture>)[name] ?? null;
}
