/**
 * Sprint 11 queue surface — leased priority queue + DLQ + backend readiness.
 */
export {
  getActiveBackend,
  getPgBossInstance,
  isProcessQueueReady,
  LANE_PRIORITY,
  probeQueueBackend,
  setProcessQueueReady,
  startQueueBackend,
  stopQueueBackend,
  type JobLane,
  type QueueBackendName,
  type QueueBackendStatus,
} from './backend.ts';

export {
  getJob,
  resetDlq,
  runUntilTerminal,
  seedPoisonJob,
  type JobRow,
  type SeedPoisonResult,
  type TerminalResult,
} from './dlq.ts';

export {
  dequeue,
  enqueue,
  resetPriorityLanes,
  type EnqueueInput,
  type PriorityJob,
} from './priority.ts';

export {
  ensureQueueSchema,
  markBackendReady,
  readBackendMeta,
  withQueueSql,
} from './schema.ts';
