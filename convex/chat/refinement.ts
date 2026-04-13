/**
 * Refinement Detection Helpers
 *
 * Pure, testable helpers for detecting whether a user message is refining
 * a prior tool result. These run BEFORE triage to enable deterministic
 * specialist inheritance across multi-turn refinements.
 *
 * Design rationale: Refinement detection is deterministic — it MUST always
 * happen the same way. We do NOT rely on triage prompt rules because prompts
 * decay over long contexts. The lexicon check is pure and testable in isolation.
 */

export const REFINEMENT_LEXICON = [
  "expand",
  "also",
  "include",
  "add",
  "try",
  "instead",
  "what about",
  "refine",
  "narrow",
  "broaden",
  "more",
  "less",
  "but",
  "now",
  "actually",
] as const;

/**
 * Checks if a user message starts with a refinement phrase (case-insensitive).
 *
 * Returns true only if the message begins with one of the REFINEMENT_LEXICON
 * phrases followed by whitespace, punctuation, or end-of-string. This prevents
 * false positives like "expander" matching "expand".
 *
 * @param message - Raw user message (may have leading whitespace)
 * @returns true if the message starts with a refinement phrase
 */
export function startsWithRefinementPhrase(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  if (!trimmed) return false;

  return REFINEMENT_LEXICON.some((phrase) => {
    if (!trimmed.startsWith(phrase)) return false;
    const nextChar = trimmed.charAt(phrase.length);
    // Allow phrase at end-of-string, or followed by whitespace/punctuation
    return nextChar === "" || /[\s.,;:!?-]/.test(nextChar);
  });
}
