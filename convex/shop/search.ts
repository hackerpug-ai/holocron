/**
 * MIGRATED_TO_MISSION_ENGINE — residual shop search pipeline disabled (pipes-3).
 *
 * Use: `holo mission run shop --query <term>`
 * Pure report formatting lives in ./output.ts (kept for tests).
 */
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = "holo mission run shop --query '<term>'";

export const DEFAULT_RETAILERS = [] as const;

export type ShopSearchResult = {
  listings: unknown[];
  error?: string;
};

export async function executeParallelShopSearch(_args: unknown): Promise<ShopSearchResult> {
  throw migratedToMissionEngineError('shop/search', HINT);
}
