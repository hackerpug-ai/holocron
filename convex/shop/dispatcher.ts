/**
 * MIGRATED_TO_MISSION_ENGINE — residual shop dispatcher pipeline disabled (pipes-3).
 *
 * Use: `holo mission run shop --query <term>`
 */
'use node';

import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = "holo mission run shop --query '<term>'";

export const executePlanBasedShopSearch = internalAction({
  args: {
    sessionId: v.optional(v.id('shopSessions')),
    planId: v.optional(v.string()),
    query: v.optional(v.string()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('shop/dispatcher', HINT);
  },
});

export const startDispatcherSearch = internalAction({
  args: {
    query: v.string(),
  },
  handler: async () => {
    throw migratedToMissionEngineError('shop/dispatcher', HINT);
  },
});
