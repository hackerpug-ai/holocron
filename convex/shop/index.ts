/**
 * MIGRATED_TO_MISSION_ENGINE — residual shop agentic entry points disabled (pipes-3).
 *
 * Use: `holo mission run shop --query <term>`
 * RN/session read queries remain in ./queries.ts; session mutations in ./mutations.ts.
 */
'use node';

import { v } from 'convex/values';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';
import { fencedAction as action } from '../lib/migrationFence';

const HINT = "holo mission run shop --query '<term>'";

export const startShopSearch = action({
  args: {
    query: v.string(),
    conversationId: v.optional(v.id('conversations')),
    retailers: v.optional(v.array(v.string())),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    verifiedOnly: v.optional(v.boolean()),
    planId: v.optional(v.string()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('shop', HINT);
  },
});

export const executeShopSearchWithPlan = action({
  args: {
    planId: v.string(),
    query: v.optional(v.string()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('shop', HINT);
  },
});

export const getShopSessionWithListings = action({
  args: {
    sessionId: v.string(),
  },
  handler: async () => {
    throw migratedToMissionEngineError('shop', HINT);
  },
});
