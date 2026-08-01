/**
 * MIGRATED_TO_MISSION_ENGINE — residual whatsNew workflow pipeline disabled (pipes-3).
 *
 * Use: `holo mission run whatsNew --date YYYY-MM-DD`
 */
import { v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';
import {
  fencedInternalAction as internalAction,
  fencedInternalMutation as internalMutation,
} from '../lib/migrationFence';

const HINT = 'holo mission run whatsNew --date YYYY-MM-DD';

export const startWorkflow = internalMutation({
  args: {
    days: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew/workflow', HINT);
  },
});

export const updatePhase = internalMutation({
  args: {
    workflowId: v.id('whatsNewWorkflows'),
    phase: v.string(),
    error: v.optional(v.string()),
    findingsJson: v.optional(v.string()),
    findingsCount: v.optional(v.number()),
  },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew/workflow', HINT);
  },
});

export const fetchPhase = internalAction({
  args: { workflowId: v.id('whatsNewWorkflows') },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew/workflow', HINT);
  },
});

export const getWorkflow = internalQuery({
  args: { workflowId: v.id('whatsNewWorkflows') },
  handler: async () => {
    throw migratedToMissionEngineError('whatsNew/workflow', HINT);
  },
});
