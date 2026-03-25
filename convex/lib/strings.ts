/**
 * Convert a snake_case string to Title Case.
 * e.g. "web_search" → "Web Search"
 */
export const toTitleCase = (value: string): string =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
