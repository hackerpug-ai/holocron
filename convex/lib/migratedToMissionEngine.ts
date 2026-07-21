/**
 * MIGRATED_TO_MISSION_ENGINE — shared deprecation helper for residual Convex
 * agentic pipeline entry points (pipes-3 / NEVER).
 *
 * RN query/read surfaces may remain; full pipeline runners must throw this
 * message and not execute legacy agentic work.
 */

export const MIGRATED_TO_MISSION_ENGINE = 'MIGRATED_TO_MISSION_ENGINE' as const;

export function migratedToMissionEngineError(pipeline: string, cliHint: string): Error {
  return new Error(
    `${MIGRATED_TO_MISSION_ENGINE}: convex/${pipeline} agentic pipeline disabled. Use mission engine: ${cliHint}`
  );
}
