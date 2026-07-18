import { canonicalJsonValue } from './canonical-json.ts';

export const HOLO_TEST_CHECKPOINT_BARRIER_ENV = 'HOLO_TEST_CHECKPOINT_BARRIER';
export const MISSION_CHECKPOINT_BARRIER_MARKER = 'mission-checkpoint/barrier';

function requestedCheckpointBarrierValue(): string | null {
  const raw = process.env[HOLO_TEST_CHECKPOINT_BARRIER_ENV];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function shouldWaitAtCheckpointBarrier(checkpointKey: string | null | undefined): boolean {
  const requested = requestedCheckpointBarrierValue();
  if (!requested) return false;
  if (/^(1|true|yes|on|\*)$/i.test(requested)) return true;
  if (!checkpointKey) return false;

  return requested
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .includes(checkpointKey);
}

/**
 * Explicitly test-only kill seam for mission-2 RED cases.
 * Outside HOLO_TEST_CHECKPOINT_BARRIER, this path is inert and normal runs never hang.
 */
export async function waitAtCheckpointBarrierIfRequested(context: {
  runId: string;
  stageIndex: number;
  checkpointKey: string;
  leaseToken: string;
  leaseOwner: string;
}): Promise<never | undefined> {
  if (!shouldWaitAtCheckpointBarrier(context.checkpointKey)) {
    return;
  }

  const payload = canonicalJsonValue({
    ok: true,
    testOnly: true,
    checkpointBarrier: true,
    readiness: true,
    marker: MISSION_CHECKPOINT_BARRIER_MARKER,
    env: HOLO_TEST_CHECKPOINT_BARRIER_ENV,
    runId: context.runId,
    stageIndex: context.stageIndex,
    checkpointKey: context.checkpointKey,
    leaseToken: context.leaseToken,
    leaseOwner: context.leaseOwner,
  });

  process.stdout.write(`${JSON.stringify(payload)}\n`);

  return await new Promise<never>(() => {
    // Intentionally never resolves. The RED suite proves the committed checkpoint
    // and lease window with an external SIGKILL after the readiness marker.
  });
}
