/**
 * What's New Quality Configuration
 *
 * Configurable thresholds and penalties for content quality scoring.
 * These values can be adjusted without changing the scoring logic.
 */

// ============================================================================
// Quality Configuration
// ============================================================================

/**
 * Quality scoring configuration
 *
 * Controls how findings are filtered and scored in the What's New report.
 */
export const QUALITY_CONFIG = {
  /**
   * Minimum score to be included in report (0.0 - 1.0)
   *
   * Findings with scores below this threshold are filtered out before
   * the report is generated. Default: 0.4 (40% quality threshold)
   */
  minQualityScore: 0.4,

  /**
   * Penalty for clickbait titles
   *
   * Applied when LLM detects clickbait patterns like:
   * - "You won't believe..."
   * - "Must see!"
   * - "Shocking result..."
   */
  clickbaitPenalty: 0.3,

  /**
   * Penalty for self-promotion without substance
   *
   * Applied when content is primarily self-promotional with
   * minimal technical value or insight.
   */
  selfPromotionPenalty: 0.2,

  /**
   * Penalty for low technical depth
   *
   * Applied to content that lacks technical substance or
   * actionable insights for engineers.
   */
  lowTechnicalDepthPenalty: 0.25,

  /**
   * Bonus for technical depth
   *
   * Awarded to content with deep technical analysis, benchmarks,
   * architecture discussions, or implementation details.
   */
  technicalDepthBonus: 0.15,

  /**
   * Bonus for authoritative sources
   *
   * Awarded to content from official sources, maintainers, or
   * recognized experts in the field.
   */
  authoritativeSourceBonus: 0.1,
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type QualityConfig = typeof QUALITY_CONFIG;
