/**
 * MIGRATED_TO_MISSION_ENGINE — residual subscriptions AI scoring disabled (pipes-3).
 */
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = 'holo mission run subscriptions --claims <path>';

export const scoreContentRelevance = internalAction({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('subscriptions/ai_scoring', HINT);
  },
});
