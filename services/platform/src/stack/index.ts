/**
 * Stack supervisor public API (D01-03).
 */
export {
  LAUNCHD_LABELS,
  loadStackConfig,
  STACK_DOWN_TIMEOUT_MS,
  STACK_UP_TIMEOUT_MS,
  type StackConfig,
} from './config.ts';

export type { ServiceState } from './probes.ts';
export {
  probeEmbed,
  probeQueueDetail,
  probeSchedulerDetail,
  resolveEmbedHealthProbe,
} from './probes.ts';

export {
  formatStatusText,
  type QueueStatus,
  type SchedulerStatus,
  type StackCommandResult,
  type StackStatusReport,
  stackDown,
  stackStatus,
  stackUp,
} from './supervisor.ts';
