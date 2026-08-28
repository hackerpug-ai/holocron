/**
 * imp-mcp-schema-drift-hardening — T3 unit coverage.
 *
 * verify-production.ts's mcpDiscovery proof compares each DEPLOYED MCP tool's
 * advertised outputSchema against z.toJSONSchema(<declared registry schema>).
 * These tests pin the comparison logic with plain fixtures:
 *   - advertised schema missing a declared property must FAIL
 *   - identical schemas must PASS
 *   - extra advertised properties / required drift / additionalProperties
 *     drift must FAIL; absent ≡ true extras must PASS.
 *   - canonicalization strips $schema and sorts keys.
 *
 * Unit lane: pure functions, no network, no Postgres.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  canonicalizeJsonSchema,
  compareAdvertisedOutputSchema,
} from '@/services/platform/src/deploy/verify-production';

const DECLARED = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    documentId: { type: 'string' },
    title: { type: 'string' },
    embeddingJobId: { type: 'string', nullable: true },
  },
  required: ['documentId', 'title'],
  additionalProperties: false,
};

function clone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe('compareAdvertisedOutputSchema (T3 contract proof)', () => {
  it('identical schemas pass with no diffs', () => {
    expect(compareAdvertisedOutputSchema(clone(DECLARED), clone(DECLARED))).toEqual([]);
  });

  it('advertised schema MISSING a declared property fails naming the property', () => {
    const advertised = clone(DECLARED);
    delete (advertised.properties as Record<string, unknown>).title;
    const diffs = compareAdvertisedOutputSchema(advertised, clone(DECLARED));
    expect(diffs).toContain('missing_property:title');
    expect(diffs.length).toBeGreaterThan(0);
  });

  it('advertised schema with an UNDECLARED property fails naming the property', () => {
    const advertised = clone(DECLARED);
    (advertised.properties as Record<string, unknown>).embeddingDimensions = { type: 'integer' };
    const diffs = compareAdvertisedOutputSchema(advertised, clone(DECLARED));
    expect(diffs).toContain('unexpected_property:embeddingDimensions');
  });

  it('required drift fails in both directions', () => {
    const missingRequired = clone(DECLARED);
    missingRequired.required = ['documentId'];
    expect(compareAdvertisedOutputSchema(missingRequired, clone(DECLARED))).toContain(
      'missing_required:title'
    );

    const extraRequired = clone(DECLARED);
    extraRequired.required = ['documentId', 'title', 'embeddingJobId'];
    expect(compareAdvertisedOutputSchema(extraRequired, clone(DECLARED))).toContain(
      'unexpected_required:embeddingJobId'
    );

    // Order must not matter (required is a set).
    const reordered = clone(DECLARED);
    reordered.required = ['title', 'documentId'];
    expect(compareAdvertisedOutputSchema(reordered, clone(DECLARED))).toEqual([]);
  });

  it('additionalProperties false vs absent fails; absent vs true passes', () => {
    const extrasBlocked = clone(DECLARED);
    delete extrasBlocked.additionalProperties;
    expect(compareAdvertisedOutputSchema(extrasBlocked, clone(DECLARED))).toContain(
      'additionalProperties_mismatch:advertised=absent,declared=false'
    );

    const extrasAllowedAdvertised = clone(DECLARED);
    extrasAllowedAdvertised.additionalProperties = true;
    const declaredExplicitTrue = clone(DECLARED);
    declaredExplicitTrue.additionalProperties = true;
    expect(
      compareAdvertisedOutputSchema(extrasAllowedAdvertised, declaredExplicitTrue)
    ).toEqual([]);
  });

  it('non-object inputs fail closed', () => {
    expect(compareAdvertisedOutputSchema(null, clone(DECLARED))).toEqual([
      'advertised_output_schema_not_an_object',
    ]);
    expect(compareAdvertisedOutputSchema(clone(DECLARED), 'string')).toEqual([
      'declared_output_schema_not_an_object',
    ]);
  });

  it('accepts the real registry contract round-trip (store_document)', () => {
    const declaredJson = z.toJSONSchema(
      z.object({
        documentId: z.string(),
        title: z.string(),
        embeddingStatus: z.string().optional(),
        pendingEmbeddingCount: z.number().int().nonnegative().optional(),
        passageCount: z.number().int().nonnegative().optional(),
        embeddingJobId: z.string().nullable().optional(),
      }),
      { io: 'output' }
    );
    expect(compareAdvertisedOutputSchema(clone(declaredJson), declaredJson)).toEqual([]);
  });
});

describe('canonicalizeJsonSchema', () => {
  it('strips $schema and sorts keys deeply', () => {
    const canonical = canonicalizeJsonSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { zeta: { type: 'string' }, alpha: { type: 'number' } },
      required: ['alpha'],
    });
    expect(Object.keys(canonical)).toEqual(['properties', 'required', 'type']);
    expect(Object.keys(canonical.properties as Record<string, unknown>)).toEqual(['alpha', 'zeta']);
    expect('$schema' in canonical).toBe(false);
  });

  it('non-object input canonicalizes to an empty object', () => {
    expect(canonicalizeJsonSchema('nope')).toEqual({});
  });
});
