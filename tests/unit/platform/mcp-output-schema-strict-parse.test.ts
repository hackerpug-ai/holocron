/**
 * imp-mcp-schema-drift-hardening — T1/AC1 RED proof.
 *
 * The production tool audit used to assert every executed tool's result with
 * plain `outputSchema.safeParse(output)`. Zod object parsing STRIPS unknown
 * keys, so a drifted executor payload carrying extra undeclared fields passed
 * the audit silently (probe: 3 extra fields → plain passes, strict fails).
 *
 * These tests pin the exact gap, using the REAL registry output schemas:
 *   - plain safeParse accepts a drifted payload (and strips the extras)
 *   - .strict().safeParse REJECTS the same payload
 *   - every registered object output schema exposes a working .strict(), so
 *     the audit's strict flip cannot crash on a schema kind mid-sweep.
 *
 * Unit lane: no infra, no network — pure zod semantics + registry metadata.
 */
import { describe, expect, it } from 'vitest';
import { getTool, listTools, type ZodSchema } from '@/services/platform/src/tools/registry';
import { storeDocumentOutputSchema } from '@/services/platform/src/tools/schemas/documents';

/** The canonical store_document payload the executor is contracted to return. */
const CANONICAL_STORE_DOCUMENT = {
  documentId: 'd4c0ffee-0000-4000-8000-000000000001',
  title: 'contract probe',
  embeddingStatus: 'completed',
  pendingEmbeddingCount: 0,
  passageCount: 2,
  embeddingJobId: 'job-1',
};

/** Same payload drifted with 3 fields the schema never declared. */
const DRIFTED_STORE_DOCUMENT = {
  ...CANONICAL_STORE_DOCUMENT,
  embeddingDimensions: 1024,
  embeddingRegenerated: true,
  legacyField: 'stale',
};

describe('strict vs plain output-schema parsing (T1 AC1)', () => {
  it('plain safeParse ACCEPTS a drifted payload and silently strips the extras', () => {
    const parsed = storeDocumentOutputSchema.safeParse(DRIFTED_STORE_DOCUMENT);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // The unknown keys vanish from the parsed value — drift is invisible.
      expect(Object.keys(parsed.data)).not.toContain('embeddingDimensions');
      expect(Object.keys(parsed.data)).not.toContain('embeddingRegenerated');
      expect(Object.keys(parsed.data)).not.toContain('legacyField');
    }
  });

  it('strict().safeParse REJECTS the same drifted payload naming the extra key', () => {
    const parsed = storeDocumentOutputSchema.strict().safeParse(DRIFTED_STORE_DOCUMENT);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // zod 4 surfaces unknown keys as code:'unrecognized_keys' with keys[] at path [].
      const rejected = parsed.error.issues.some(
        (issue) =>
          issue.code === 'unrecognized_keys' &&
          'keys' in issue &&
          Array.isArray(issue.keys) &&
          issue.keys.includes('embeddingDimensions')
      );
      expect(rejected).toBe(true);
    }
  });

  it('the canonical payload passes strict parsing', () => {
    expect(storeDocumentOutputSchema.strict().safeParse(CANONICAL_STORE_DOCUMENT).success).toBe(
      true
    );
  });

  it('every registered object output schema exposes a working .strict()', () => {
    const objectSchemas: Array<{ id: string; strict: () => ZodSchema }> = [];
    for (const row of listTools()) {
      const candidate = row.outputSchema as { strict?: () => ZodSchema };
      if (typeof candidate.strict === 'function')
        objectSchemas.push({ id: row.id, strict: candidate.strict });
    }
    // Every tool that has an object output schema must survive strict parsing
    // of its own canonical contract (empty object at minimum parses structurally).
    expect(objectSchemas.length).toBeGreaterThan(0);
    for (const { id, strict } of objectSchemas) {
      expect(() => strict(), `${id}.strict() must construct`).not.toThrow();
    }
  });

  it('the registry resolves the audited tool id (sweep precondition)', () => {
    expect(getTool('store_document').id).toBe('store_document');
  });
});
