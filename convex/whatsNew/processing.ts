/**
 * MIGRATED_TO_MISSION_ENGINE — residual whatsNew processing pipeline disabled (pipes-3).
 */

import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = 'holo mission run whatsNew --date YYYY-MM-DD';

export async function processFindings(_findings: unknown[]): Promise<unknown[]> {
  throw migratedToMissionEngineError('whatsNew/processing', HINT);
}

export function rankFindings(_findings: unknown[]): unknown[] {
  throw migratedToMissionEngineError('whatsNew/processing', HINT);
}
