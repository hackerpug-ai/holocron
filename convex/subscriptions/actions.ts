/**
 * MIGRATED_TO_MISSION_ENGINE — residual subscriptions check pipeline disabled (pipes-3).
 *
 * Use: `holo mission run subscriptions --claims <path> [--topic <text>]`
 * RN CRUD/list queries remain in ./queries.ts and ./mutations.ts.
 */
import { v } from 'convex/values';
import { action } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = 'holo mission run subscriptions --claims <path> [--topic <text>]';

export const check = action({
  args: {
    sourceType: v.optional(
      v.union(
        v.literal('youtube'),
        v.literal('newsletter'),
        v.literal('changelog'),
        v.literal('reddit'),
        v.literal('ebay'),
        v.literal('whats-new'),
        v.literal('creator'),
        v.literal('github')
      )
    ),
  },
  handler: async () => {
    throw migratedToMissionEngineError('subscriptions', HINT);
  },
});
