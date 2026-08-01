/**
 * MIGRATED_TO_MISSION_ENGINE — residual subscriptions dedup pipeline disabled (pipes-3).
 */
import { v } from 'convex/values';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';
import { fencedInternalAction as internalAction } from '../lib/migrationFence';

const HINT = 'holo mission run subscriptions --claims <path>';

export const findSimilarDocuments = internalAction({
  args: {
    title: v.string(),
    embedding: v.optional(v.array(v.number())),
  },
  handler: async () => {
    throw migratedToMissionEngineError('subscriptions/deduplication', HINT);
  },
});

export const findSimilarContent = internalAction({
  args: {
    title: v.string(),
  },
  handler: async () => {
    throw migratedToMissionEngineError('subscriptions/deduplication', HINT);
  },
});

export const checkForDuplicates = internalAction({
  args: {
    title: v.string(),
  },
  handler: async () => {
    throw migratedToMissionEngineError('subscriptions/deduplication', HINT);
  },
});
