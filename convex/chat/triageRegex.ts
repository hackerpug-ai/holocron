/**
 * Triage Regex Pre-filter
 *
 * Pure TypeScript module for deterministic classification of recommendation queries.
 * Zero Convex imports - designed for fast, unit-testable pattern matching.
 *
 * This is a HIGH-PRECISION backstop, not a full classifier.
 * Returns undefined when no pattern fires, allowing LLM to decide.
 */

export type QueryShape =
  | "factual"
  | "recommendation"
  | "comprehensive"
  | "exploratory"
  | "ambiguous";

export interface RegexResult {
  queryShape: QueryShape;
  confidence: "high" | "medium";
  matchedPattern: string;
}

/**
 * Recommendation pattern definitions.
 * Each pattern includes a regex and a label for telemetry/debugging.
 */
const REC_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\b(find me|get me|show me)\s+\d+\b/i, label: "find_me_n" },
  { regex: /\btop\s+\d+\b/i, label: "top_n" },
  { regex: /\bbest\s+\d+\b/i, label: "best_n" },
  { regex: /highly\s+rated/i, label: "highly_rated" },
  { regex: /\breferrals?\s+for\b/i, label: "referrals_for" },
  { regex: /\bwho\s+should\s+I\s+hire\b/i, label: "who_should_hire" },
  { regex: /\bwhere\s+can\s+I\s+find\b/i, label: "where_can_find" },
  { regex: /\bprovide\s+\d+(-\d+)?\b/i, label: "provide_n" },
];

/**
 * Classify user content using regex patterns.
 *
 * @param content - User message content to classify
 * @returns RegexResult if recommendation pattern matched, undefined otherwise
 *
 * Performance: Completes in under 5ms for typical user messages.
 * - Pure regex matching (no async operations)
 * - Early return on first match
 * - Case-insensitive patterns
 */
export function regexClassify(content: string): RegexResult | undefined {
  // Guard against empty input
  if (!content || content.trim().length === 0) {
    return undefined;
  }

  // Check each pattern in order
  for (const pattern of REC_PATTERNS) {
    if (pattern.regex.test(content)) {
      return {
        queryShape: "recommendation",
        confidence: "high",
        matchedPattern: pattern.label,
      };
    }
  }

  // No pattern matched - let LLM decide
  return undefined;
}
