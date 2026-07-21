import { z } from 'zod';

const BANNED_EXECUTABLE_KEYS = {
  inlineZod: 'inline Zod payloads are not allowed in mission templates',
  rawSql: 'raw SQL payloads are not allowed in mission templates',
  js: 'JavaScript executable payloads are not allowed in mission templates',
  javascript: 'JavaScript executable payloads are not allowed in mission templates',
  executable: 'executable payloads are not allowed in mission templates',
  function: 'function payloads are not allowed in mission templates',
} as const satisfies Record<string, string>;

function joinPath(path: readonly string[]): string {
  return path.length > 0 ? path.join('.') : '(root)';
}

function collectExecutablePayloadIssues(value: unknown, path: readonly string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectExecutablePayloadIssues(child, [...path, String(index)])
    );
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const issues: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = [...path, key];
    const bannedMessage = BANNED_EXECUTABLE_KEYS[key as keyof typeof BANNED_EXECUTABLE_KEYS];
    if (bannedMessage) {
      issues.push(`${bannedMessage} at ${joinPath(keyPath)}`);
    }
    issues.push(...collectExecutablePayloadIssues(child, keyPath));
  }

  return issues;
}

export const MissionSchemaRefSchema = z
  .object({
    schemaRef: z.string().min(1),
    schemaVersion: z.number().int().positive(),
  })
  .strict();

export const MissionTriggerSchema = z
  .object({
    kind: z.literal('on-demand'),
  })
  .strict();

export const MissionStageSchema = z
  .object({
    id: z.string().min(1),
    stageKind: z.string().min(1),
    executorRef: z.string().min(1),
    inputSchema: MissionSchemaRefSchema,
    outputSchema: MissionSchemaRefSchema,
    checkpointKey: z.string().min(1).optional(),
  })
  .strict();

export const MissionBudgetsSchema = z
  .object({
    wallMs: z.number().int().positive(),
    tokens: z.number().int().nonnegative(),
    cost: z.number().nonnegative(),
    maxSteps: z.number().int().positive(),
  })
  .strict();

export const MISSION_TEMPLATE_DSL_VERSION = 'mission_template_v1' as const;

/** Optional parameter surface for parameterized templates (e.g. business-report kind). */
export const MissionParameterSchemaField = z
  .object({
    type: z.enum(['enum', 'string', 'number', 'boolean']),
    values: z.array(z.string().min(1)).optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

export const MissionTemplateSchema = z
  .object({
    templateKey: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    trigger: MissionTriggerSchema,
    stageGraph: z.array(MissionStageSchema).min(1),
    toolGrants: z.array(z.never()).default([]),
    modelRoleBindings: z.record(z.string().min(1), z.string().min(1)).default({}),
    budgets: MissionBudgetsSchema,
    gateRubric: z.null(),
    humanGate: z.null(),
    outputContract: MissionSchemaRefSchema,
    /** Declared run parameters (kind enum, target, …). Stored in definition_json. */
    parameterSchema: z.record(z.string().min(1), MissionParameterSchemaField).optional(),
  })
  .strict();

export type MissionSchemaRef = z.infer<typeof MissionSchemaRefSchema>;
export type MissionStageDefinition = z.infer<typeof MissionStageSchema>;
export type MissionBudgetPolicy = z.infer<typeof MissionBudgetsSchema>;
export type MissionTemplateDefinition = z.infer<typeof MissionTemplateSchema>;

export function parseMissionTemplateDefinition(raw: unknown): MissionTemplateDefinition {
  const executableIssues = collectExecutablePayloadIssues(raw);
  if (executableIssues.length > 0) {
    throw new Error(executableIssues.join('; '));
  }

  const parsed = MissionTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new Error(`mission template contract invalid: ${issues.join('; ')}`);
  }

  return parsed.data;
}
