import type { Root, Content } from 'mdast'

/**
 * Compute a mapping from MDAST root child index to narration segment index.
 * Skips 'code' nodes since the backend's extractParagraphs strips fenced code blocks.
 *
 * @returns Map<rootChildIndex, narrationSegmentIndex>
 */
export function computeNarrationMap(ast: Root): Map<number, number> {
  const map = new Map<number, number>()
  let narrationIndex = 0
  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'code') continue
    map.set(i, narrationIndex)
    narrationIndex++
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
