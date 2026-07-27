/**
 * Pre-flight gate for the chat deterministic emitter.
 *
 * Extracted (F1) into its own module so the truth-table unit test can drive the
 * predicate WITHOUT transitively loading drizzle-orm (chat-runs.ts pulls the
 * Postgres client at module load). Keep this module side-effect free.
 *
 * Behaviour (post-F1):
 *   - HOLO_CHAT_DETERMINISTIC_STREAM=1 → TRUE (offline / local-iter safety net)
 *   - HOLO_E2E=1                       → TRUE (Sprint-25 e2e marker env)
 *   - [[e2e-stream]] / [[e2e_stream]] marker in message → TRUE
 *   - otherwise                        → FALSE (real fleet path is default)
 *
 * Removed: the nonprod silent-default (`isHolocronNonprodDatabaseUrl(db) &&
 * HOLO_CHAT_FLEET_ONLY!=='1'`) which previously routed every nonprod test
 * through canned 'Rivers mountains valleys...' tokens (the F1 smoking gun).
 *
 * KNOWN CEILING (intentionally NOT flipped here): the fail-soft catch-block
 * (~chat-runs.ts:343) and the empty-stream fail-soft (~:354) STILL use the
 * pre-F1 compound predicate — they are the S-REACTIVE-04 degraded-no-hang
 * safety net. See `shouldMaskFleetFailureOnNonprod` below. Flipping them is
 * tracked as an F1 follow-up (touches the degraded-mode contract).
 */
import { isHolocronNonprodDatabaseUrl } from '../db/connection.ts';

export function shouldUseDeterministicChatStream(databaseUrl: string, message: string): boolean {
  void databaseUrl; // unused after F1 flip — kept for call-site stability + tests
  if (process.env.HOLO_CHAT_DETERMINISTIC_STREAM === '1') return true;
  if (process.env.HOLO_E2E === '1') return true;
  if (/\[\[e2e[_-]?stream\]\]/i.test(message)) return true;
  return false;
}

/**
 * Whether the fail-soft mask (catch-block + empty-stream) applies. This is the
 * compound predicate retained from pre-F1 `shouldUseDeterministicChatStream`
 * and is the known ceiling: the FAILURE path still masks fleet-down on nonprod
 * to preserve the S-REACTIVE-04 degraded-no-hang contract. AC-11 NEVER-CUT.
 */
export function shouldMaskFleetFailureOnNonprod(databaseUrl: string): boolean {
  return isHolocronNonprodDatabaseUrl(databaseUrl) && process.env.HOLO_CHAT_FLEET_ONLY !== '1';
}
