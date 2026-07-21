/**
 * Ensure system mission templates are registered (idempotent).
 * Used by CLI/runtime so operators do not need a manual template:register step
 * for the shared evidence-research core.
 */
import { registerMissionTemplateDefinition } from '../repository.ts';
import { evidenceResearchTemplateDefinition } from './evidence-research.ts';

export type EnsureSystemTemplatesResult = {
  ok: true;
  templates: Array<{
    templateKey: string;
    version: string;
    created: boolean;
    executorRef: string;
  }>;
};

/**
 * Register immutable system templates. Safe to call repeatedly — same key/version
 * with identical content is idempotent; drift fails closed.
 */
export async function ensureSystemMissionTemplates(options?: {
  databaseUrl?: string;
}): Promise<EnsureSystemTemplatesResult> {
  const registered = await registerMissionTemplateDefinition(evidenceResearchTemplateDefinition, {
    databaseUrl: options?.databaseUrl,
  });

  return {
    ok: true,
    templates: [
      {
        templateKey: registered.templateKey,
        version: registered.version,
        created: registered.created,
        executorRef: registered.executorRef,
      },
    ],
  };
}
