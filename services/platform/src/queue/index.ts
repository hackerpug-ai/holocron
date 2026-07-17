/**
 * Sprint 11 queue surface — leased priority queue + DLQ + backend readiness.
 */
export {
  getActiveBackend,
  getPgBossInstance,
  isProcessQueueReady,
  type JobLane,
  LANE_PRIORITY,
  probeQueueBackend,
  type QueueBackendName,
  type QueueBackendStatus,
  setProcessQueueReady,
  startQueueBackend,
  stopQueueBackend,
} from './backend.ts';

export {
  getJob,
  type JobRow,
  resetDlq,
  runUntilTerminal,
  type SeedPoisonResult,
  seedPoisonJob,
  type TerminalResult,
} from './dlq.ts';

export {
  dequeue,
  type EnqueueInput,
  enqueue,
  type PriorityJob,
  resetPriorityLanes,
} from './priority.ts';

export {
  ensureQueueSchema,
  markBackendReady,
  readBackendMeta,
  withQueueSql,
} from './schema.ts';
