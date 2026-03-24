/**
 * Count narration segments from markdown, matching the backend's
 * extractParagraphs logic in convex/audio/actions.ts.
 */
export function extractParagraphCount(markdown: string): number {
  let text = markdown

  // Strip fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, '')

  // Strip inline images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '')

  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Split on double newlines
  const blocks = text.split(/\n{2,}/)

  let count = 0
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    count++
  }

  return count
}
