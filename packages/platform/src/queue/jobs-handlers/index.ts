/**
 * Handler registry — bind every MigratedJob by reference.
 * An unbound handler is a compile-time-visible hole (and a runtime HANDLER_UNBOUND).
 */
import { agentPlanTimeout } from './agent-plan-timeout.ts';
import { assimilationTimeout } from './assimilation-timeout.ts';
import { audioStuckSegmentCleanup } from './audio-stuck-segment-cleanup.ts';
import { audioTranscriptJobProcessor } from './audio-transcript-job-processor.ts';
import { cleanupAgentTelemetry } from './cleanup-agent-telemetry.ts';
import { documentEmbeddingBackfill } from './document-embedding-backfill.ts';
import { feedBuilder } from './feed-builder.ts';
import { improvementsEmbeddingBackfill } from './improvements-embedding-backfill.ts';
import { morningDigest } from './morning-digest.ts';
import { researchEmbeddingBackfill } from './research-embedding-backfill.ts';
import { subscriptionAutoResearch } from './subscription-auto-research.ts';
import { subscriptionMonitor } from './subscription-monitor.ts';
import { taskTimeoutWorker } from './task-timeout-worker.ts';
import { toolcallTimeout } from './toolcall-timeout.ts';
import type { JobHandler } from './types.ts';
import { voiceSessionTimeout } from './voice-session-timeout.ts';
import { whatsNewDaily } from './whats-new-daily.ts';

export type { JobHandler, JobHandlerContext, JobHandlerResult } from './types.ts';

/** Canonical name → handler map. All 16 jobs must appear here for a green run. */
export const JOB_HANDLERS: Readonly<Record<string, JobHandler>> = {
  'task-timeout-worker': taskTimeoutWorker,
  'audio-stuck-segment-cleanup': audioStuckSegmentCleanup,
  'toolcall-timeout': toolcallTimeout,
  'assimilation-timeout': assimilationTimeout,
  'agent-plan-timeout': agentPlanTimeout,
  'voice-session-timeout': voiceSessionTimeout,
  'cleanup-agent-telemetry': cleanupAgentTelemetry,
  'subscription-monitor': subscriptionMonitor,
  'subscription-auto-research': subscriptionAutoResearch,
  'feed-builder': feedBuilder,
  'whats-new-daily': whatsNewDaily,
  'audio-transcript-job-processor': audioTranscriptJobProcessor,
  'document-embedding-backfill': documentEmbeddingBackfill,
  'research-embedding-backfill': researchEmbeddingBackfill,
  'improvements-embedding-backfill': improvementsEmbeddingBackfill,
  'morning-digest': morningDigest,
};

export function resolveHandler(name: string): JobHandler | undefined {
  return JOB_HANDLERS[name];
}
