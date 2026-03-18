/**
 * JSON Utilities
 *
 * Helper functions for parsing JSON from AI model responses.
 */

/**
 * Strip markdown code block wrapper from JSON responses
 *
 * AI models often return JSON wrapped in ```json ... ``` blocks.
 * This extracts the raw JSON for parsing.
 *
 * @param text - The text that may contain markdown-wrapped JSON
 * @returns The extracted JSON string, or the original text if no wrapper found
 */
export function stripMarkdownCodeBlock(text: string): string {
  const trimmed = text.trim();

  // Match ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  return trimmed;
}

/**
 * Parse JSON from AI model response text
 *
 * Handles common AI response patterns:
 * - Raw JSON
 * - JSON wrapped in markdown code blocks
 *
 * @param text - The AI response text
 * @returns The parsed JSON object
 * @throws If JSON parsing fails after stripping code blocks
 */
export function parseAIJson<T>(text: string): T {
  const cleaned = stripMarkdownCodeBlock(text);
  return JSON.parse(cleaned) as T;
}
