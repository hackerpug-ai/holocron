/**
 * Sanitize markdown content for React Native.
 *
 * In React Native, we don't have a DOM, so we can't use DOMPurify.
 * Instead, we strip potentially dangerous HTML tags since react-native-markdown-display
 * renders markdown as native components (not a WebView), making XSS attacks impossible.
 *
 * This function removes:
 * - Script tags and their content
 * - Event handlers (onclick, onerror, etc.)
 * - JavaScript: URLs
 * - iframe, object, embed tags
 *
 * @param markdown - Raw markdown content to sanitize
 * @returns Sanitized markdown safe for rendering
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return ''
  }

  let sanitized = markdown

  // Remove YAML frontmatter (must be at the start of content)
  sanitized = sanitized.replace(/^---\s*\n[\s\S]*?\n---\s*\n+/, '')

  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Remove dangerous tags (iframe, object, embed, form)
  sanitized = sanitized.replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  sanitized = sanitized.replace(/<(iframe|object|embed|form)\b[^>]*\/?>/gi, '')

  // Remove event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '')

  // Remove data: URLs (can be used for XSS)
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '')

  // Remove vbscript: URLs
  sanitized = sanitized.replace(/vbscript\s*:/gi, '')

  return sanitized
}

/**
 * Validate a URL for safe link navigation.
 *
 * This function checks if a URL is safe to open by validating:
 * - The URL can be parsed
 * - The protocol is http, https, or mailto
 *
 * @param url - URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const allowedProtocols = ['http:', 'https:', 'mailto:']
    return allowedProtocols.includes(parsed.protocol)
  } catch {
    // Invalid URL
    return false
  }
}
