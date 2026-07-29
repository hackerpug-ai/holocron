/**
 * Mission engine public surface + D05-05 fire-drill-monthly registration helper.
 *
 * System templates are registered via ensureSystemMissionTemplates(); the monthly
 * fire-drill JSON is additionally registerable via registerFireDrillMonthlyTemplate()
 * or `holo mission template:register <path-to-fire-drill-monthly.json>`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type MissionTemplateRegistrationResult,
  registerMissionTemplateFile,
} from './repository.ts';
import { ensureSystemMissionTemplates } from './templates/ensure-system.ts';

export type { MissionTemplateDefinition } from './contract.ts';
export { MISSION_TEMPLATE_DSL_VERSION, parseMissionTemplateDefinition } from './contract.ts';
export type { MissionTemplateRegistrationResult } from './repository.ts';
export {
  registerMissionTemplateDefinition,
  registerMissionTemplateFile,
} from './repository.ts';
export {
  getMissionRunStatus,
  resumeMissionRun,
  runMissionTemplate,
} from './runtime.ts';
export { ensureSystemMissionTemplates } from './templates/ensure-system.ts';

/** Absolute path to the version-controlled fire-drill-monthly mission template JSON. */
export function fireDrillMonthlyTemplatePath(
  fromDir = dirname(fileURLToPath(import.meta.url))
): string {
  return resolve(fromDir, 'templates', 'fire-drill-monthly.json');
}

export const FIRE_DRILL_MONTHLY_TEMPLATE_KEY = 'fire-drill-monthly' as const;
export const FIRE_DRILL_MONTHLY_TEMPLATE_VERSION = '1.0.0' as const;

/**
 * Register (or re-validate) the CAP-BAK-01 monthly fire-drill mission template.
 * Idempotent for identical content; fails closed on immutable-surface drift.
 */
export async function registerFireDrillMonthlyTemplate(options?: {
  databaseUrl?: string;
  templatePath?: string;
}): Promise<MissionTemplateRegistrationResult> {
  const path = options?.templatePath ?? fireDrillMonthlyTemplatePath();
  return registerMissionTemplateFile(path, { databaseUrl: options?.databaseUrl });
}

/**
 * Ensure system pipeline templates + fire-drill-monthly are present.
 * Safe to call from CLI bootstrap / operator install scripts.
 */
export async function ensureMissionTemplatesIncludingFireDrill(options?: {
  databaseUrl?: string;
}): Promise<{
  ok: true;
  system: Awaited<ReturnType<typeof ensureSystemMissionTemplates>>;
  fireDrill: MissionTemplateRegistrationResult;
}> {
  const system = await ensureSystemMissionTemplates({ databaseUrl: options?.databaseUrl });
  const fireDrill = await registerFireDrillMonthlyTemplate({ databaseUrl: options?.databaseUrl });
  return { ok: true, system, fireDrill };
}
