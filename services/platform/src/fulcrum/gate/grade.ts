/**
 * Fulcrum evidence grading — PURE.
 *
 * Deterministic tier-by-recency products in [0,1], rounded to the contract's
 * 2-decimal grade precision. Zero I/O, zero model client, zero model roles,
 * no database imports — the reviewer greps services/platform/src/fulcrum/gate/** for all four.
 *
 * Two curves, both pinned by the task contract:
 *  - gradeEvidence        — half-life decay (04-api-design.md § Evidence Gate);
 *                           1.0 at 30 days under a 180-day half-life → 0.89
 *  - gradeByRecencyWindow — window-linear recency product used by the admission
 *                           predicate; 1.0 at 30 days under the 365-day window → 0.92
 */

const DAY_MS = 86_400_000;

/** Round to 2 decimal places — the grade precision the contract pins (0.92 / 0.89). */
function roundGrade(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * gradeEvidence(tierValue, retrievedAt, halfLifeDays, now) — 04-api-design.md § Evidence Gate.
 *
 * grade = round2(tierValue × 0.5^(ageDays / halfLifeDays)).
 * An unladdered domain (null tierValue) yields null — never a default tier.
 * Deterministic: identical inputs return byte-identical results.
 */
export function gradeEvidence(
  tierValue: number | null,
  retrievedAt: number,
  halfLifeDays: number,
  now: number
): number | null {
  if (tierValue === null || !Number.isFinite(tierValue)) return null;
  if (!Number.isFinite(retrievedAt) || !Number.isFinite(now)) return null;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return null;
  const ageDays = Math.max(0, (now - retrievedAt) / DAY_MS);
  return roundGrade(tierValue * 0.5 ** (ageDays / halfLifeDays));
}

/**
 * Recency-window product backing the admission predicate:
 * grade = round2(tierValue × max(0, 1 − ageDays / recencyWindowDays)).
 * In-window only (the caller gates on age ≤ recencyWindowDays before grading);
 * the max(0, …) clamp keeps the result inside [0,1] at the window edge.
 */
export function gradeByRecencyWindow(
  tierValue: number,
  retrievedAt: number,
  recencyWindowDays: number,
  now: number
): number {
  const ageDays = Math.max(0, (now - retrievedAt) / DAY_MS);
  return roundGrade(tierValue * Math.max(0, 1 - ageDays / recencyWindowDays));
}
