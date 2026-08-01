/**
 * MIGRATED_TO_MISSION_ENGINE — residual shop dispatcher pipeline disabled (pipes-3).
 *
 * Use: `holo mission run shop --query <term>`
 */
'use node';

import { v } from 'convex/values';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';
import { fencedInternalAction as internalAction } from '../lib/migrationFence';

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
