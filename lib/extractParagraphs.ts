/**
 * Frontend port of the backend's extractParagraphs logic
 * (convex/audio/actions.ts) for narration index alignment.
 *
 * This MUST stay in sync with the backend extraction — any change
 * to how the backend splits markdown into TTS segments must be
 * mirrored here.
 */

export interface FrontendParagraph {
  index: number
  text: string
}

/**
 * Parse markdown into discrete paragraph segments matching the backend's
 * extractParagraphs logic. Returns each segment with its paragraph index
 * and cleaned text (no hash — that's only needed server-side).
 */
export function extractParagraphs(markdown: string): FrontendParagraph[] {
  let text = markdown

  // Strip fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, '')

  // Strip inline images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '')

  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Split on double newlines to get logical paragraphs
  const rawBlocks = text.split(/\n{2,}/)

  const segments: FrontendParagraph[] = []
  let index = 0

  for (const block of rawBlocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    // Heading lines become their own segment (for natural pacing)
    if (/^#{1,6}\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,6}\s+/, '')
      segments.push({ index, text: headingText })
      index += 1
      continue
    }

    // Regular paragraph — collapse internal newlines to spaces
    const segmentText = trimmed.replace(/\n/g, ' ')
    segments.push({ index, text: segmentText })
    index += 1
  }

  return segments
}

/**
 * Count narration segments from markdown, matching the backend's
 * extractParagraphs logic in convex/audio/actions.ts.
 */
export function extractParagraphCount(markdown: string): number {
  return extractParagraphs(markdown).length
}
