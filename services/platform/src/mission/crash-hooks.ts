const HOLO_TEST_CRASH_AT_ENV = 'HOLO_TEST_CRASH_AT';

export const MISSION_COMMIT_CRASH_BOUNDARIES = [
  'before_commit_insert',
  'after_commit_insert_before_run_update',
  'after_run_update_before_terminal_event',
] as const;

export type MissionCommitCrashBoundary = (typeof MISSION_COMMIT_CRASH_BOUNDARIES)[number];

export function missionCommitCrashMarker(boundary: MissionCommitCrashBoundary): string {
  return `mission-commit/${boundary}`;
}

export function requestedMissionCommitCrashBoundary(): MissionCommitCrashBoundary | null {
  const requested = process.env[HOLO_TEST_CRASH_AT_ENV];
  if (!requested) return null;

  for (const boundary of MISSION_COMMIT_CRASH_BOUNDARIES) {
    if (requested === missionCommitCrashMarker(boundary)) {
      return boundary;
    }
  }

  return null;
}

/**
 * Mission-3 will wire these named readiness markers into the atomic terminal
 * commit transaction. Keeping the explicit boundary strings and hook contract in
 * source now lets the RED suite verify the runtime exposes deterministic,
 * source-backed HOLO_TEST_CRASH_AT boundaries without inventing hidden seams.
 */
export async function emitMissionCommitCrashReadiness(
  boundary: MissionCommitCrashBoundary,
  context: Record<string, unknown> = {}
): Promise<never> {
  const marker = missionCommitCrashMarker(boundary);
  console.error(
    JSON.stringify(
      {
        ok: false,
        crashHook: true,
        readiness: true,
        env: HOLO_TEST_CRASH_AT_ENV,
        marker,
        boundary,
        context,
      },
      null,
      2
    )
  );

  return await new Promise<never>(() => {
    // Intentionally never resolves; the RED suite proves these boundaries with
    // an external SIGKILL once the marker is observed.
  });
}
