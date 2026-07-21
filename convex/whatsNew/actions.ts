/**
 * MIGRATED_TO_MISSION_ENGINE — residual whatsNew agentic pipeline disabled (pipes-3).
 *
 * Use: `holo mission run whatsNew --date YYYY-MM-DD`
 * RN read surfaces remain in ./queries.ts.
 */
'use node';

import { v } from 'convex/values';
import { action, internalAction } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = 'holo mission run whatsNew --date YYYY-MM-DD';

export const generate = action({
  args: {
    days: v.optional(v.number()),
    force: v.optional(v.boolean()),
    focus: v.optional(v.string()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew', HINT);
  },
});

export const generateDailyReport = internalAction({
  args: {
    days: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew', HINT);
  },
});

export const backfillQualityScores = internalAction({
  args: {
    skip: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew', HINT);
  },
});
