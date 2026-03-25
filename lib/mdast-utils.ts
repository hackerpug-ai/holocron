import type { Root, Content } from 'mdast'
import type { FrontendParagraph } from './extractParagraphs'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize text for fuzzy comparison: collapse whitespace, lowercase,
 * strip common markdown inline formatting characters.
 */
function normalizeText(text: string): string {
  return text
    .replace(/[*_`~[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Check whether two normalized text strings match by comparing their
 * first N characters (prefix match). This handles minor formatting
 * differences between MDAST text extraction and backend regex extraction.
 */
function textsMatch(mdastText: string, backendText: string): boolean {
  const a = normalizeText(mdastText)
  const b = normalizeText(backendText)
  if (!a || !b) return false

  // Use the shorter string's length, capped at 40 chars for efficiency
  const compareLen = Math.min(a.length, b.length, 40)
  if (compareLen === 0) return false

  return a.substring(0, compareLen) === b.substring(0, compareLen)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a mapping from MDAST root child index to backend audio segment index.
 *
 * Uses text-matching between MDAST node text and the backend's extracted
 * paragraphs to ensure the narration indices align with the actual audio
 * segments. This prevents desync when documents contain images, HTML blocks,
 * or other non-text content that the backend strips.
 *
 * @param ast - Parsed MDAST root node
 * @param backendParagraphs - Paragraphs from extractParagraphs() (frontend port of backend logic)
 * @returns Map<rootChildIndex, backendParagraphIndex>
 */
export function computeNarrationMap(
  ast: Root,
  backendParagraphs: FrontendParagraph[]
): Map<number, number> {
  const map = new Map<number, number>()
  let backendPointer = 0

  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]

    // Skip code blocks — backend strips them entirely
    if (child.type === 'code') continue

    // Extract plain text from this MDAST node
    const nodeText = extractTextFromNode(child)
    if (!nodeText.trim()) continue

    // Try to match against the current backend paragraph
    if (backendPointer < backendParagraphs.length) {
      const backendPara = backendParagraphs[backendPointer]

      if (textsMatch(nodeText, backendPara.text)) {
        map.set(i, backendPara.index)
        backendPointer++
      } else {
        // Try scanning ahead up to 2 backend paragraphs in case of split mismatch
        let matched = false
        for (let scan = 1; scan <= 2 && backendPointer + scan < backendParagraphs.length; scan++) {
          const candidate = backendParagraphs[backendPointer + scan]
          if (textsMatch(nodeText, candidate.text)) {
            // Skip the unmatched backend paragraphs (they may map to sub-parts
            // of a previous MDAST node, e.g., list items)
            map.set(i, candidate.index)
            backendPointer = backendPointer + scan + 1
            matched = true
            break
          }
        }
        // If no match found, this MDAST node has no audio (e.g., image-only paragraph)
        // Don't advance backendPointer — the next MDAST node may match it
        if (!matched) {
          // Safety: if the backend paragraph also can't match anything ahead,
          // force-advance to prevent getting permanently stuck
          const nextNodeText = i + 1 < ast.children.length
            ? extractTextFromNode(ast.children[i + 1])
            : ''
          if (nextNodeText.trim() && !textsMatch(nextNodeText, backendPara.text)) {
            // Neither current nor next MDAST node matches — skip this backend paragraph
            backendPointer++
          }
        }
      }
    }
  }

  return map
}

/**
 * Extract plain text content from an MDAST node tree.
 * Recursively walks children to collect all text values.
 */
export function extractTextFromNode(node: Content | Root): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value
  }
  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as Content[]).map(extractTextFromNode).join('')
  }
  return ''
}

/**
 * Find the nearest layout offset for a paragraph index that may not have
 * a direct entry in the offsets map (e.g., when a backend paragraph maps
 * to a sub-part of an MDAST node like a list item).
 *
 * Returns the offset of the largest key <= target, or undefined if none.
 */
export function findNearestOffset(
  offsets: Map<number, number>,
  target: number
): number | undefined {
  let bestKey = -1
  let bestValue: number | undefined
  for (const [key, value] of offsets) {
    if (key <= target && key > bestKey) {
      bestKey = key
      bestValue = value
    }
  }
  return bestValue
}
