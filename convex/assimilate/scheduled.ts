/**
 * MIGRATED_TO_MISSION_ENGINE — residual assimilate scheduled pipeline disabled (pipes-3).
 *
 * Use: `holo mission run assimilate --target <owner/repo>`
 * RN read/approve surfaces remain in ./queries.ts and non-agentic mutations.
 */
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = "holo mission run assimilate --target '<owner/repo>'";

export const processIteration = internalAction({
  args: {
    sessionId: v.id('assimilationSessions'),
  },
  handler: async () => {
    throw migratedToMissionEngineError('assimilate/scheduled', HINT);
  },
});

export const synthesizeAndSave = internalAction({
  args: {
    sessionId: v.id('assimilationSessions'),
  },
  handler: async () => {
    throw migratedToMissionEngineError('assimilate/scheduled', HINT);
  },
});

export const timeoutStuckSessions = internalAction({
  args: {},
  handler: async () => {
    // No-op soak: do not run legacy pipeline; log-only via throw path avoided for cron.
    return { ok: true, migrated: true, marker: 'MIGRATED_TO_MISSION_ENGINE' };
  },
});
