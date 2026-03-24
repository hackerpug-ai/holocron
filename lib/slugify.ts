/**
 * Convert text to a URL-friendly slug for internal document linking.
 * Matches the behavior used in markdown heading anchor generation.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Recursively extract plain text from an MDAST node tree.
 * Useful for generating heading slugs from parsed markdown AST.
 */
export function extractTextFromMdast(node: { type: string; value?: string; children?: any[] }): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || ''
  if (node.children) {
    return node.children.map(extractTextFromMdast).join('')
  }
  return ''
}
