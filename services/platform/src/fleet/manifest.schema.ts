/**
 * Fleet Role Manifest schema (CAP-INF-01 / 11-runtime-contracts.md).
 *
 * Versioned Zod schema declaring per-role: endpoint, LiteLLM model id,
 * revision, context, concurrency, timeout, structured-output, health probe,
 * degradation action — plus embed dimension + prefix policy.
 *
 * No z.any(). Incomplete manifests fail closed at load.
 */
import { z } from 'zod';

export const FLEET_ROLE_NAMES = [
  'divergent',
  'convergent',
  'judge',
  'embed',
  'rerank',
  'synthesis',
] as const;

export type FleetRoleName = (typeof FLEET_ROLE_NAMES)[number];

export const DegradationActionSchema = z.enum([
  'surface-unavailable',
  'queue-and-retry',
  'fail-closed',
]);

export const HealthProbeSchema = z.object({
  path: z.string().min(1),
  method: z.enum(['GET', 'HEAD']).default('GET'),
  timeoutMs: z.number().int().positive(),
  expectStatus: z.number().int().min(100).max(599).default(200),
});

export const EmbedPolicySchema = z.object({
  embeddingDimension: z.number().int().positive(),
  prefixPolicy: z.object({
    query: z.string(),
    document: z.string(),
  }),
});

export const FleetRoleSchema = z.object({
  role: z.enum(FLEET_ROLE_NAMES),
  /** Tailnet/base endpoint host:port (no /v1 required; may include it). */
  endpoint: z.string().url(),
  litellmModelId: z.string().min(1),
  modelRevision: z.string().min(1),
  contextLimit: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  structuredOutput: z.boolean(),
  healthProbe: HealthProbeSchema,
  degradationAction: DegradationActionSchema,
  /** Required for embed role; optional elsewhere. */
  embed: EmbedPolicySchema.optional(),
});

export const FleetRoleManifestSchema = z
  .object({
    schemaVersion: z.string().min(1),
    /** Fleet router base used when roles share LiteLLM :4545. */
    defaultEndpoint: z.string().url().optional(),
    roles: z.object({
      divergent: FleetRoleSchema,
      convergent: FleetRoleSchema,
      judge: FleetRoleSchema,
      embed: FleetRoleSchema,
      rerank: FleetRoleSchema,
      synthesis: FleetRoleSchema,
    }),
  })
  .superRefine((manifest, ctx) => {
    // Role key must match embedded role field
    for (const name of FLEET_ROLE_NAMES) {
      const entry = manifest.roles[name];
      if (entry.role !== name) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', name, 'role'],
          message: `role field must be '${name}', got '${entry.role}'`,
        });
      }
    }
    // embed role must declare dimension + prefix policy
    if (!manifest.roles.embed.embed) {
      ctx.addIssue({
        code: 'custom',
        path: ['roles', 'embed', 'embed'],
        message: 'embed role requires embed.embeddingDimension + prefixPolicy',
      });
    }
  });

export type FleetRole = z.infer<typeof FleetRoleSchema>;
export type FleetRoleManifest = z.infer<typeof FleetRoleManifestSchema>;
export type DegradationAction = z.infer<typeof DegradationActionSchema>;
