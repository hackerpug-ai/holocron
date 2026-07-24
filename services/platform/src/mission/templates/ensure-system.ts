/**
 * Ensure system mission templates are registered (idempotent).
 * Used by CLI/runtime so operators do not need a manual template:register step
 * for shared Sprint 22 pipeline templates.
 */
import { registerMissionTemplateDefinition } from '../repository.ts';
import { assimilateTemplateDefinition } from './assimilate.ts';
import { businessReportTemplateDefinition } from './business-report.ts';
import { evidenceResearchTemplateDefinition } from './evidence-research.ts';
import { shopTemplateDefinition } from './shop.ts';
import { subscriptionsTemplateDefinition } from './subscriptions.ts';
import { toolbeltTemplateDefinition } from './toolbelt.ts';
import { whatsNewTemplateDefinition } from './whatsnew.ts';

export type EnsureSystemTemplatesResult = {
  ok: true;
  templates: Array<{
    templateKey: string;
    version: string;
    created: boolean;
    executorRef: string;
  }>;
};

const SYSTEM_TEMPLATES = [
  evidenceResearchTemplateDefinition,
  businessReportTemplateDefinition,
  whatsNewTemplateDefinition,
  assimilateTemplateDefinition,
  shopTemplateDefinition,
  subscriptionsTemplateDefinition,
  toolbeltTemplateDefinition,
] as const;

/**
 * Register immutable system templates. Safe to call repeatedly — same key/version
 * with identical content is idempotent; drift fails closed.
 */
export async function ensureSystemMissionTemplates(options?: {
  databaseUrl?: string;
}): Promise<EnsureSystemTemplatesResult> {
  const templates: EnsureSystemTemplatesResult['templates'] = [];

  for (const definition of SYSTEM_TEMPLATES) {
    const registered = await registerMissionTemplateDefinition(definition, {
      databaseUrl: options?.databaseUrl,
    });
    templates.push({
      templateKey: registered.templateKey,
      version: registered.version,
      created: registered.created,
      executorRef: registered.executorRef,
    });
  }

  return { ok: true, templates };
}
